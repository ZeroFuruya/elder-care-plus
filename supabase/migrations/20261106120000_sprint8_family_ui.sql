-- Sprint 8 (Increment A): let an active care-circle member read the elder's active circle.
--
-- F-14 ("Family Care Circle") must show a connected family member the caregiver and the
-- other connected relatives. The Sprint 1 `care_links_select` policy only ever exposed a
-- row to the elder it names or to the member it belongs to, so a family member could see
-- their own row and nothing else.
--
-- This adds a *second*, additive select policy: an active member of the elder (caregiver
-- or family) may read that elder's **active** links. Pending (`invited`) rows stay hidden
-- from co-members and remain visible only to the elder and the invited member, so a
-- consent that is still pending is never leaked. `care_links_select` is unchanged, no
-- grant or column changes, and revoked links keep the existing restriction.
--
-- Reads only: writes remain guarded RPCs (Sprint 1). See docs/specs/sprint-8.md.

create policy care_links_select_active_circle on public.care_links
  for select to authenticated
  using (
    status = 'active'
    and public.is_active_member_of(elder_id)
  );
