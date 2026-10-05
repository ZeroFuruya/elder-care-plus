-- Sprint 4b: restore future doses when a deactivated medicine is reactivated.
--
-- Latent defect fixed here (found 2026-10-06 while building Sprint 7):
--
--   * `set_medication_active(p_id, false)` cancels future un-taken occurrences with
--     `cancel_reason = 'plan_deactivated'` (Sprint 5 step 1).
--   * Reactivating the medicine flips `is_active` back, which re-runs
--     `reconcile_dose_events_for_medication`. But that function only ever reopened
--     `batch_invalid` rows (Sprint 5 step 0); `plan_deactivated` rows were left
--     cancelled, and `generate_dose_events_for` keeps `(schedule_id, scheduled_at)`
--     as its idempotency anchor and never reopens a cancelled row. Net result: a
--     reactivated medicine produced **no** future doses.
--
-- The fix is one bounded `UPDATE` in the non-suppressed branch of step 0: reopen the
-- future `plan_deactivated` occurrences that still match the current active plan and
-- schedule, using the same predicate step 1 already uses to decide a row survives.
-- A stale occurrence (schedule time/day changed while inactive) stays cancelled and
-- reconciliation's existing generation step creates its replacement. Suppression
-- still wins: when `medicine_suppresses_doses()` is true this branch does not run, so
-- a reactivated medicine with no valid batch stays suppressed (Sprint 5 rule).
--
-- No new table, column, policy, grant, RPC or screen. No row is hard-deleted.
-- See docs/specs/sprint-4b-dose-reactivation.md.

create or replace function public.reconcile_dose_events_for_medication(p_medication_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_elder uuid;
  v_created integer := 0;
begin
  select elder_id into v_elder from public.medications where id = p_medication_id;
  if v_elder is null then
    return 0;
  end if;

  -- 0. Batch validity and plan reactivation. Suppress future occurrences while no
  --    valid active batch remains; otherwise reopen the occurrences a transient
  --    reason cancelled once the cause is gone. Two reasons are reopenable:
  --      * `batch_invalid`  - a valid batch is back (Sprint 5);
  --      * `plan_deactivated` - the plan AND schedule are active again and the
  --        occurrence still matches the current schedule (Sprint 4b).
  --    Anything not matching that test stays cancelled; a taken/missed row is
  --    never reopened, and a `schedule_changed` cancellation is never reopened.
  if public.medicine_suppresses_doses(p_medication_id) then
    update public.dose_events
       set cancelled_at = now(), cancel_reason = 'batch_invalid'
     where medication_id = p_medication_id
       and taken_at is null
       and missed_at is null
       and cancelled_at is null
       and scheduled_at > now();
  else
    update public.dose_events
       set cancelled_at = null, cancel_reason = null
     where medication_id = p_medication_id
       and cancelled_at is not null
       and cancel_reason = 'batch_invalid'
       and taken_at is null
       and missed_at is null
       and scheduled_at > now();

    -- Sprint 4b: reopen the future occurrences a deactivation cancelled, once the
    -- plan and its schedule are active again and the occurrence still matches.
    update public.dose_events d
       set cancelled_at = null, cancel_reason = null
      from public.medications m, public.medication_schedules s
     where d.medication_id = p_medication_id
       and m.id = d.medication_id
       and s.id = d.schedule_id
       and d.cancelled_at is not null
       and d.cancel_reason = 'plan_deactivated'
       and d.taken_at is null
       and d.missed_at is null
       and d.scheduled_at > now()
       and m.is_active
       and s.is_active
       and extract(dow from d.scheduled_local_date)::smallint = any (s.days_of_week)
       and d.scheduled_at = public.local_dose_timestamp(d.scheduled_local_date, s.time_of_day, s.timezone);
  end if;

  -- 1. Cancel future occurrences that the current plan no longer produces.
  update public.dose_events d
     set cancelled_at = now(),
         cancel_reason = case
           when not s.is_active
             or not exists (
               select 1 from public.medications m
               where m.id = p_medication_id and m.is_active
             )
             then 'plan_deactivated'
           else 'schedule_changed'
         end
    from public.medication_schedules s
   where d.schedule_id = s.id
     and s.medication_id = p_medication_id
     and d.taken_at is null
     and d.missed_at is null
     and d.cancelled_at is null
     and d.scheduled_at > now()
     and (
       not s.is_active
       or not exists (
         select 1 from public.medications m
         where m.id = p_medication_id and m.is_active
       )
       or not (
         extract(dow from d.scheduled_local_date)::smallint = any (s.days_of_week)
         and d.scheduled_at = public.local_dose_timestamp(d.scheduled_local_date, s.time_of_day, s.timezone)
       )
     );

  -- 2. Refresh the plan fields on the future occurrences that survive.
  update public.dose_events d
     set dose_quantity = m.dose_quantity,
         dose_unit = m.dose_unit,
         grace_minutes = s.grace_minutes,
         timezone = s.timezone
    from public.medications m, public.medication_schedules s
   where d.medication_id = p_medication_id
     and m.id = d.medication_id
     and s.id = d.schedule_id
     and d.taken_at is null
     and d.missed_at is null
     and d.cancelled_at is null
     and d.scheduled_at > now();

  -- 3. Regenerate, but only for an active plan that is not suppressed.
  if exists (select 1 from public.medications where id = p_medication_id and is_active)
     and not public.medicine_suppresses_doses(p_medication_id) then
    v_created := public.generate_dose_events_for(v_elder, current_date, current_date + 3);
  end if;

  return v_created;
end;
$$;

comment on function public.reconcile_dose_events_for_medication(uuid) is
  'Reconciles one medicine''s open window after a plan, schedule or batch change: suppress/resume by batch validity, reopen a transient plan deactivation (Sprint 4b), cancel what no longer matches, refresh survivors, regenerate what is missing. Internal; called from the reconcile triggers.';
