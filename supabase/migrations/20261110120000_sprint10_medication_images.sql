-- Sprint 10: prescription photos for a medicine (photo storage only; no OCR).
--
-- The owner cut Sprint 6 (prescriptions / evidence / OCR) on 2026-10-05 and then re-added
-- **photo storage without any OCR** on 2026-10-25: a caregiver attaches a picture of a paper
-- prescription to a medicine under the Medicines module, and the care circle may look at it.
-- Nothing here reads or interprets the image. The reference-only guardrail from AGENTS.md is
-- untouched, because no field is ever derived from a photo.
--
-- What this migration adds:
--
--   * `public.medication_images` — one metadata row per stored photo (the bytes live in Storage).
--   * A **private** `prescription-images` bucket whose objects are readable by the whole care
--     circle and writable only by the linked manager, through `storage.objects` policies that
--     parse the object name: `<medication_id>/<file>.<ext>`.
--   * Two guarded RPCs (`register_medication_image`, `archive_medication_image`). The client
--     uploads bytes directly to Storage, then registers the row; direct table writes stay denied.
--
-- Decisions worth recording:
--
--   * **No delete policy on the bucket.** Removal in the app is a soft archive
--     (never hard-delete medical history): `is_archived = true`, the object stays. A manager
--     therefore cannot delete a stored photo through the API at all. A side effect is that a
--     failed registration can leave an unreferenced object in the bucket; such an object is
--     invisible to the app (nothing lists it) and is never surfaced, which is preferred over
--     handing the client a delete capability.
--   * **The elder and family read-only.** Visibility follows the rest of the medication record
--     (`can_view_profile`); only the manager writes. This keeps the AGENTS.md rule about
--     elder-submitted evidence out of scope, because the elder never submits one.
--   * **Signed URLs only.** The bucket is private and the client mints a short-lived signed URL
--     per view; a photo URL is never logged or persisted.
--   * Authorization failures are indistinguishable from a not-found id, as in Sprint 3.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.medication_images (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete restrict,
  storage_path text not null check (length(btrim(storage_path)) > 0),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  is_archived boolean not null default false,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete restrict,
  constraint medication_images_storage_path_key unique (storage_path),
  -- Archived and its stamp move together; an un-archived row carries neither.
  constraint medication_images_archive_state check (
    (is_archived = false and archived_at is null and archived_by is null)
    or (is_archived = true and archived_at is not null and archived_by is not null)
  )
);

comment on table public.medication_images is
  'One stored prescription photo per row, attached to a medicine. The bytes live in the private prescription-images bucket; this row is the metadata. Archived, never deleted.';

create index medication_images_medication_idx
  on public.medication_images (medication_id);

-- ---------------------------------------------------------------------------
-- Internal helper: the medication owner of a storage object name.
-- `storage.objects` policies run as the querying role, so this is granted to authenticated.
-- ---------------------------------------------------------------------------

create or replace function public.medication_image_elder_from_path(p_object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_medication uuid;
begin
  if p_object_name is null then
    return null;
  end if;

  -- `<medication_id>/<file>.<ext>`; anything else is not a path this app writes.
  begin
    v_medication := (storage.foldername(p_object_name))[1]::uuid;
  exception when others then
    return null;
  end;

  if v_medication is null then
    return null;
  end if;
  return public.medication_elder_id(v_medication);
end;
$$;

comment on function public.medication_image_elder_from_path(text) is
  'The elder who owns the medicine named by the first path segment of a storage object, or null when the name is not <medication_id>/<file>.<ext>.';

-- ---------------------------------------------------------------------------
-- Storage: a private bucket + object policies scoped to the care circle.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prescription-images',
  'prescription-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy medication_images_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'prescription-images'
    and public.can_view_profile(public.medication_image_elder_from_path(name))
  );

create policy medication_images_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'prescription-images'
    and public.is_manager_of(public.medication_image_elder_from_path(name))
  );

-- ---------------------------------------------------------------------------
-- RLS: select-only, scoped to the care circle. No write policy, so the RPCs below
-- are the only path that creates or archives a row.
-- ---------------------------------------------------------------------------

alter table public.medication_images enable row level security;

create policy medication_images_select on public.medication_images
  for select to authenticated
  using (public.can_view_profile(public.medication_elder_id(medication_id)));

-- ---------------------------------------------------------------------------
-- RPCs. As in Sprint 3: resolve the medicine -> derive its elder -> is_manager_of
-- -> validate -> scoped lock -> insert/update + exactly one audit row.
-- ---------------------------------------------------------------------------

create or replace function public.register_medication_image(
  p_medication_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_mime text;
  v_path text;
  v_row public.medication_images;
begin
  v_elder := public.medication_elder_id(p_medication_id);
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  v_mime := lower(btrim(p_mime_type));
  if v_mime is null or v_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'unsupported image type "%"', p_mime_type using errcode = 'check_violation';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'the image must be between 1 byte and 10 MB' using errcode = 'check_violation';
  end if;

  v_path := btrim(p_storage_path);
  -- The path must sit directly under this medicine's folder, with no traversal.
  if v_path is null or length(v_path) = 0
     or v_path not like p_medication_id::text || '/%'
     or v_path like '%..%'
     or v_path like '%//%' then
    raise exception 'the stored image path is invalid' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medication_images:' || p_medication_id::text, 0)
  );

  insert into public.medication_images (
    medication_id, storage_path, mime_type, size_bytes, uploaded_by
  ) values (
    p_medication_id, v_path, v_mime, p_size_bytes, auth.uid()
  )
  returning * into v_row;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, after_summary
  ) values (
    auth.uid(), v_elder, 'medication_image.added', 'medication_images', v_row.id,
    jsonb_build_object('mime_type', v_row.mime_type, 'size_bytes', v_row.size_bytes)
  );

  return v_row.id;
end;
$$;

create or replace function public.archive_medication_image(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.medication_images;
  v_elder uuid;
begin
  select * into v_row from public.medication_images where id = p_id for update;
  if not found then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  v_elder := public.medication_elder_id(v_row.medication_id);
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.is_archived then
    return;
  end if;

  update public.medication_images
    set is_archived = true, archived_at = now(), archived_by = auth.uid()
    where id = p_id
    returning * into v_row;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_elder, 'medication_image.archived', 'medication_images', p_id,
    jsonb_build_object('mime_type', v_row.mime_type),
    jsonb_build_object('is_archived', v_row.is_archived)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: read-only for the client; the RPCs are the only write path.
-- ---------------------------------------------------------------------------

revoke all on public.medication_images from public, anon;
revoke insert, update, delete on public.medication_images from authenticated;
grant select on public.medication_images to authenticated;

revoke execute on function
  public.medication_image_elder_from_path(text),
  public.register_medication_image(uuid, text, text, bigint),
  public.archive_medication_image(uuid)
  from public, anon, authenticated;

-- `medication_image_elder_from_path` is called by the storage policy as the querying role.
grant execute on function
  public.medication_image_elder_from_path(text),
  public.register_medication_image(uuid, text, text, bigint),
  public.archive_medication_image(uuid)
  to authenticated;
