-- Validation hardening: logical constraints and input bounds.
--
-- The owner asked (2026-09-30) for the forms' logical rules to be enforced for
-- real, and for the elder profile to stop accepting an invalid age. Everything
-- here is defence in depth behind the client validators: the RPCs are the only
-- write path (RLS is default deny and select-only), so a wrong value must be
-- rejected here too, never only in the app.
--
-- Rules:
--   * `elder_profiles.date_of_birth` is a real, plausible birth date: not in the
--     future, not before 1900-01-01, and at least 18 years ago (owner decision
--     2026-09-30 - the older adult is an adult). The moving part of that rule
--     lives in `upsert_elder_profile`, because `current_date` is not immutable
--     and a column check cannot carry it.
--   * Free text is bounded. The columns already reject a blank value; these
--     checks add a generous ceiling so nothing unbounded is stored.
--   * `numeric(10, 3)` quantities cannot exceed 9999999.999. The column type
--     would reject it anyway, but the RPCs now say so in words instead of
--     leaking a raw numeric-overflow error.
--   * An emergency contact is capped at an 80-character label and a priority of
--     999, matching `emergencyNumberInputSchema` and `MAX_CONTACT_PRIORITY`.
--
-- The `elder_profiles` bounds are added `not valid`: they enforce every new
-- insert and update, but a pre-existing demo row that predates the rule is
-- grandfathered rather than blocking the migration. Correcting such a row
-- through the form (which now validates) satisfies the check.

-- ---------------------------------------------------------------------------
-- Table checks: the immovable bounds
-- ---------------------------------------------------------------------------

alter table public.elder_profiles
  add constraint elder_profiles_date_of_birth_from_1900
    check (date_of_birth is null or date_of_birth >= date '1900-01-01') not valid,
  add constraint elder_profiles_address_line1_length
    check (address_line1 is null or length(address_line1) <= 200) not valid,
  add constraint elder_profiles_address_line2_length
    check (address_line2 is null or length(address_line2) <= 200) not valid,
  add constraint elder_profiles_city_length
    check (city is null or length(city) <= 200) not valid,
  add constraint elder_profiles_region_length
    check (region is null or length(region) <= 200) not valid,
  add constraint elder_profiles_postal_code_length
    check (postal_code is null or length(postal_code) <= 32) not valid,
  add constraint elder_profiles_country_code_length
    check (country_code is null or length(country_code) <= 100) not valid,
  add constraint elder_profiles_allergies_length
    check (allergies is null or length(allergies) <= 2000) not valid,
  add constraint elder_profiles_conditions_length
    check (conditions is null or length(conditions) <= 2000) not valid,
  add constraint elder_profiles_care_instructions_length
    check (care_instructions is null or length(care_instructions) <= 2000) not valid,
  add constraint elder_profiles_doctor_name_length
    check (doctor_name is null or length(doctor_name) <= 200) not valid,
  add constraint elder_profiles_doctor_phone_length
    check (doctor_phone is null or length(doctor_phone) <= 32) not valid;

alter table public.medications
  add constraint medications_name_length check (length(name) <= 200),
  add constraint medications_strength_length check (length(strength) <= 200),
  add constraint medications_dose_unit_length check (length(dose_unit) <= 100),
  add constraint medications_instructions_length check (length(instructions) <= 2000),
  add constraint medications_dose_quantity_max check (dose_quantity <= 9999999.999);

alter table public.medicine_batches
  add constraint medicine_batches_quantity_max check (quantity <= 9999999.999),
  add constraint medicine_batches_low_stock_max
    check (low_stock_threshold is null or low_stock_threshold <= 9999999.999),
  add constraint medicine_batches_unit_length check (length(unit) <= 100),
  add constraint medicine_batches_lot_number_length
    check (lot_number is null or length(lot_number) <= 100),
  add constraint medicine_batches_refill_contact_length
    check (refill_contact is null or length(refill_contact) <= 200);

alter table public.emergency_numbers
  add constraint emergency_numbers_label_length check (length(label) <= 80),
  add constraint emergency_numbers_priority_max check (priority <= 999);

-- ---------------------------------------------------------------------------
-- `upsert_elder_profile`: the age rule, the birth-date floor on the RPC path,
-- and the same phone rule the emergency contacts use
-- ---------------------------------------------------------------------------

create or replace function public.upsert_elder_profile(
  p_elder_id uuid,
  p_date_of_birth date,
  p_blood_type text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country_code text,
  p_allergies text,
  p_conditions text,
  p_care_instructions text,
  p_doctor_name text,
  p_doctor_phone text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.elder_profiles;
  v_after public.elder_profiles;
  v_doctor_phone text := nullif(btrim(p_doctor_phone), '');
  v_latest_birth_date date := (current_date - interval '18 years')::date;
begin
  if p_elder_id is null then
    raise exception 'elder id is required' using errcode = 'check_violation';
  end if;
  if not public.is_manager_of(p_elder_id) then
    raise exception 'only the linked manager can edit this profile'
      using errcode = 'insufficient_privilege';
  end if;

  -- The moving half of the birth-date rule. The immovable floor (1900) is a
  -- column check; this names it in words and adds the age requirement.
  if p_date_of_birth is not null then
    if p_date_of_birth > current_date then
      raise exception 'a birth date cannot be in the future' using errcode = 'check_violation';
    end if;
    if p_date_of_birth < date '1900-01-01' then
      raise exception 'a birth date cannot be before 1900' using errcode = 'check_violation';
    end if;
    if p_date_of_birth > v_latest_birth_date then
      raise exception 'the older adult must be at least 18 years old'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_doctor_phone is not null
    and length(regexp_replace(v_doctor_phone, '[^0-9]', '', 'g')) < 3
  then
    raise exception 'a valid phone number is required' using errcode = 'check_violation';
  end if;

  select * into v_before from public.elder_profiles where elder_id = p_elder_id;

  insert into public.elder_profiles as ep (
    elder_id, date_of_birth, blood_type, address_line1, address_line2, city, region,
    postal_code, country_code, allergies, conditions, care_instructions,
    doctor_name, doctor_phone, created_by
  ) values (
    p_elder_id,
    p_date_of_birth,
    case
      when p_blood_type is null or length(btrim(p_blood_type)) = 0 then 'unknown'
      when lower(btrim(p_blood_type)) = 'unknown' then 'unknown'
      else upper(btrim(p_blood_type))
    end,
    nullif(btrim(p_address_line1), ''),
    nullif(btrim(p_address_line2), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_region), ''),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_country_code), ''),
    nullif(btrim(p_allergies), ''),
    nullif(btrim(p_conditions), ''),
    nullif(btrim(p_care_instructions), ''),
    nullif(btrim(p_doctor_name), ''),
    v_doctor_phone,
    auth.uid()
  )
  on conflict (elder_id) do update set
    date_of_birth = excluded.date_of_birth,
    blood_type = excluded.blood_type,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country_code = excluded.country_code,
    allergies = excluded.allergies,
    conditions = excluded.conditions,
    care_instructions = excluded.care_instructions,
    doctor_name = excluded.doctor_name,
    doctor_phone = excluded.doctor_phone
  returning * into v_after;

  -- No-op: the stored state is unchanged, so write no audit row (it never
  -- carries phone/address/allergy/condition text either way).
  if v_before.elder_id is not null
    and to_jsonb(v_before) - 'updated_at' = to_jsonb(v_after) - 'updated_at'
  then
    return;
  end if;

  insert into public.audit_events (actor_id, elder_id, action, target_table, target_id, before_summary, after_summary)
  values (
    auth.uid(), p_elder_id, 'elder_profile.updated', 'elder_profiles', p_elder_id,
    case when v_before.elder_id is null then null else jsonb_build_object(
      'blood_type', v_before.blood_type,
      'has_allergies', v_before.allergies is not null,
      'has_conditions', v_before.conditions is not null,
      'has_care_instructions', v_before.care_instructions is not null
    ) end,
    jsonb_build_object(
      'blood_type', v_after.blood_type,
      'has_allergies', v_after.allergies is not null,
      'has_conditions', v_after.conditions is not null,
      'has_care_instructions', v_after.care_instructions is not null
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Medication and batch RPCs: say the quantity ceiling in words
-- ---------------------------------------------------------------------------

create or replace function public.assert_medication_fields(
  p_name text,
  p_strength text,
  p_form text,
  p_dose_quantity numeric,
  p_dose_unit text,
  p_instructions text,
  p_start_date date,
  p_end_date date
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_form text;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'a medicine name is required' using errcode = 'check_violation';
  end if;
  if p_strength is null or length(btrim(p_strength)) = 0 then
    raise exception 'a strength or form is required' using errcode = 'check_violation';
  end if;
  if p_dose_quantity is null or p_dose_quantity <= 0 then
    raise exception 'dose quantity must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_dose_quantity > 9999999.999 then
    raise exception 'dose quantity is too large' using errcode = 'check_violation';
  end if;
  if p_dose_unit is null or length(btrim(p_dose_unit)) = 0 then
    raise exception 'a dose unit is required' using errcode = 'check_violation';
  end if;
  if p_instructions is null or length(btrim(p_instructions)) = 0 then
    raise exception 'instructions are required' using errcode = 'check_violation';
  end if;
  if p_start_date is null then
    raise exception 'a start date is required' using errcode = 'check_violation';
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'the end date cannot be before the start date' using errcode = 'check_violation';
  end if;

  v_form := nullif(lower(btrim(p_form)), '');
  if v_form is not null and v_form not in ('tablet', 'capsule', 'liquid', 'other') then
    raise exception 'unknown dose form "%"', p_form using errcode = 'check_violation';
  end if;

  return v_form;
end;
$$;

create or replace function public.assert_batch_fields(p_quantity numeric, p_unit text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_quantity is null or p_quantity < 0 then
    raise exception 'batch quantity cannot be negative' using errcode = 'check_violation';
  end if;
  if p_quantity > 9999999.999 then
    raise exception 'batch quantity is too large' using errcode = 'check_violation';
  end if;
  if p_unit is null or length(btrim(p_unit)) = 0 then
    raise exception 'a batch unit is required' using errcode = 'check_violation';
  end if;
end;
$$;

-- The low-stock threshold has no assert helper, so the ceiling is stated here.
-- Without it the `numeric(10,3)` column raises a raw `22003 numeric field
-- overflow`, which the app could only show as a generic failure.

create or replace function public.create_batch(
  p_medication_id uuid,
  p_quantity numeric,
  p_unit text,
  p_lot_number text,
  p_expiry_date date,
  p_low_stock_threshold numeric,
  p_refill_contact text,
  p_make_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_active boolean := coalesce(p_make_active, false);
  v_row public.medicine_batches;
begin
  select public.medication_elder_id(p_medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.assert_batch_fields(p_quantity, p_unit);

  if p_expiry_date is null then
    raise exception 'an expiry date is required' using errcode = 'check_violation';
  end if;
  if p_expiry_date < current_date then
    raise exception 'a batch cannot be entered with an expiry date in the past'
      using errcode = 'check_violation';
  end if;
  if p_low_stock_threshold is not null and p_low_stock_threshold < 0 then
    raise exception 'the low-stock threshold cannot be negative' using errcode = 'check_violation';
  end if;
  if p_low_stock_threshold is not null and p_low_stock_threshold > 9999999.999 then
    raise exception 'the low-stock threshold is too large' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('medicine_batches:' || p_medication_id::text, 0)
  );

  -- Creating a batch never steals the active slot; `set_active_batch` moves it.
  if v_active and exists (
    select 1 from public.medicine_batches
    where medication_id = p_medication_id and is_active
  ) then
    raise exception 'this medicine already has an active batch'
      using errcode = 'unique_violation';
  end if;

  insert into public.medicine_batches (
    medication_id, quantity, unit, lot_number, expiry_date, low_stock_threshold,
    refill_contact, is_active
  ) values (
    p_medication_id, p_quantity, btrim(p_unit), nullif(btrim(p_lot_number), ''),
    p_expiry_date, p_low_stock_threshold, nullif(btrim(p_refill_contact), ''), v_active
  )
  returning * into v_row;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, after_summary
  ) values (
    auth.uid(), v_elder, 'batch.created', 'medicine_batches', v_row.id,
    public.batch_audit_summary(v_row)
  );

  return v_row.id;
end;
$$;

create or replace function public.update_batch(
  p_id uuid,
  p_quantity numeric,
  p_unit text,
  p_lot_number text,
  p_expiry_date date,
  p_low_stock_threshold numeric,
  p_refill_contact text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.medicine_batches;
  v_after public.medicine_batches;
  v_elder uuid;
begin
  select * into v_before from public.medicine_batches where id = p_id for update;
  if not found then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  select public.medication_elder_id(v_before.medication_id) into v_elder;
  if v_elder is null or not public.is_manager_of(v_elder) then
    raise exception 'only the linked manager can change this medication plan'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.assert_batch_fields(p_quantity, p_unit);

  if p_expiry_date is null then
    raise exception 'an expiry date is required' using errcode = 'check_violation';
  end if;
  if p_low_stock_threshold is not null and p_low_stock_threshold < 0 then
    raise exception 'the low-stock threshold cannot be negative' using errcode = 'check_violation';
  end if;
  if p_low_stock_threshold is not null and p_low_stock_threshold > 9999999.999 then
    raise exception 'the low-stock threshold is too large' using errcode = 'check_violation';
  end if;
  -- An expired batch can never remain active.
  if v_before.is_active and p_expiry_date < current_date then
    raise exception 'the active batch cannot expire; deactivate it first'
      using errcode = 'check_violation';
  end if;

  update public.medicine_batches set
    quantity = p_quantity,
    unit = btrim(p_unit),
    lot_number = nullif(btrim(p_lot_number), ''),
    expiry_date = p_expiry_date,
    low_stock_threshold = p_low_stock_threshold,
    refill_contact = nullif(btrim(p_refill_contact), '')
  where id = p_id
  returning * into v_after;

  if to_jsonb(v_before) - 'updated_at' = to_jsonb(v_after) - 'updated_at' then
    return;
  end if;

  insert into public.audit_events (
    actor_id, elder_id, action, target_table, target_id, before_summary, after_summary
  ) values (
    auth.uid(), v_elder, 'batch.updated', 'medicine_batches', p_id,
    public.batch_audit_summary(v_before), public.batch_audit_summary(v_after)
  );
end;
$$;
