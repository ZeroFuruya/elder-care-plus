import type { HelpRequestCategory, HelpRequestState } from '@eldercare/shared';

import { getSupabase } from '@/supabase/client';

/**
 * Help requests and availability (docs/specs/sprint-8.md, Flow F).
 *
 * Reads are RLS-scoped selects: the elder and every active care-circle member see the same rows.
 * Writes are the five guarded RPCs only — the client has no insert/update/delete grant on either
 * table, so a direct write is refused by the database. A request is never hard-deleted; it moves
 * through `open → accepted → completed` (or the elder cancels it).
 */

const REQUEST_COLUMNS =
  'id, elder_id, created_by, category, note, state, accepted_by, accepted_at, closed_by, closed_at, created_at, updated_at' as const;

const AVAILABILITY_COLUMNS = 'elder_id, member_id, is_available, note, updated_at' as const;

interface HelpRequestRow {
  id: string;
  elder_id: string;
  created_by: string;
  category: HelpRequestCategory;
  note: string | null;
  state: HelpRequestState;
  accepted_by: string | null;
  accepted_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AvailabilityRow {
  elder_id: string;
  member_id: string;
  is_available: boolean;
  note: string | null;
  updated_at: string;
}

export interface HelpRequest {
  id: string;
  elderId: string;
  createdBy: string;
  category: HelpRequestCategory;
  note: string | null;
  state: HelpRequestState;
  acceptedBy: string | null;
  acceptedAt: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** The accepter's display name, when readable. */
  acceptedByName: string | null;
}

export interface MemberAvailability {
  elderId: string;
  memberId: string;
  memberLabel: string;
  isAvailable: boolean;
  note: string | null;
  updatedAt: string;
}

function toRequest(row: HelpRequestRow, names: Map<string, string>): HelpRequest {
  return {
    id: row.id,
    elderId: row.elder_id,
    createdBy: row.created_by,
    category: row.category,
    note: row.note,
    state: row.state,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedByName: row.accepted_by ? (names.get(row.accepted_by) ?? null) : null,
  };
}

async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, full_name')
    .in('id', unique)
    .returns<{ id: string; full_name: string }[]>();

  // A pending member's name is hidden by RLS on purpose; fall back to a label.
  if (error) return new Map();
  return new Map(data.map((row) => [row.id, row.full_name]));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every help request for the elder, newest first. */
export async function listHelpRequests(elderId: string): Promise<HelpRequest[]> {
  const { data, error } = await getSupabase()
    .from('help_requests')
    .select(REQUEST_COLUMNS)
    .eq('elder_id', elderId)
    .order('created_at', { ascending: false })
    .returns<HelpRequestRow[]>();

  if (error) throw new Error('Could not load the help requests.');

  const names = await fetchNames(
    data.map((row) => row.accepted_by).filter((id): id is string => id !== null),
  );
  return data.map((row) => toRequest(row, names));
}

/** One help request, or `null` when RLS hides it or it no longer exists. */
export async function getHelpRequest(id: string): Promise<HelpRequest | null> {
  const { data, error } = await getSupabase()
    .from('help_requests')
    .select(REQUEST_COLUMNS)
    .eq('id', id)
    .maybeSingle<HelpRequestRow>();

  if (error) throw new Error('Could not load the help request.');
  if (!data) return null;

  const names = await fetchNames(data.accepted_by ? [data.accepted_by] : []);
  return toRequest(data, names);
}

/** The availability every member has set for one elder. */
export async function listAvailability(elderId: string): Promise<MemberAvailability[]> {
  const { data, error } = await getSupabase()
    .from('member_availability')
    .select(AVAILABILITY_COLUMNS)
    .eq('elder_id', elderId)
    .order('updated_at', { ascending: false })
    .returns<AvailabilityRow[]>();

  if (error) throw new Error('Could not load the availability.');

  const names = await fetchNames(data.map((row) => row.member_id));
  return data.map((row) => ({
    elderId: row.elder_id,
    memberId: row.member_id,
    memberLabel: names.get(row.member_id) ?? 'Care-circle member',
    isAvailable: row.is_available,
    note: row.note,
    updatedAt: row.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Writes (guarded RPCs only)
// ---------------------------------------------------------------------------

interface PostgrestError {
  code?: string;
  message: string;
}

/**
 * Turns a PostgREST error into something safe to show. The server's raised strings are
 * developer-facing, so they are never rendered.
 */
export function helpRequestWriteError(error: PostgrestError, fallback: string): Error {
  if (error.code === '42501') {
    return new Error('Only the older adult and their linked circle can do that.');
  }
  if (error.code === '23514') {
    return new Error('This request has already been answered or closed. Refresh and try again.');
  }
  if (error.code === 'P0002') {
    return new Error('That help request no longer exists. Refresh and try again.');
  }
  return new Error(fallback);
}

/** The elder raises a request; every active member is notified by the database. */
export async function createHelpRequest(
  category: HelpRequestCategory,
  note: string | null,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_help_request', {
    p_category: category,
    p_note: note,
  });

  if (error) throw new Error('Could not send your request. Try again.');
  return data as string;
}

export async function acceptHelpRequest(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('accept_help_request', { p_id: id });
  if (error) throw helpRequestWriteError(error, 'Could not accept this request.');
}

export async function completeHelpRequest(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('complete_help_request', { p_id: id });
  if (error) throw helpRequestWriteError(error, 'Could not complete this request.');
}

export async function cancelHelpRequest(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_help_request', { p_id: id });
  if (error) throw helpRequestWriteError(error, 'Could not cancel this request.');
}

/** A member sets their own availability for one elder. */
export async function setMemberAvailability(
  elderId: string,
  isAvailable: boolean,
  note: string | null,
): Promise<void> {
  const { error } = await getSupabase().rpc('set_member_availability', {
    p_elder_id: elderId,
    p_is_available: isAvailable,
    p_note: note,
  });

  if (error) throw helpRequestWriteError(error, 'Could not save your availability.');
}
