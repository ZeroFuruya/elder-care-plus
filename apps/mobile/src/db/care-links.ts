import { getSupabase } from '@/supabase/client';

/**
 * Care-circle reads for the Supabase-backed app.
 *
 * Every function is a plain RLS-scoped select: the server decides which rows the
 * signed-in account may see, and no query trusts a caller-supplied role. Writes
 * live in `linking.ts`, because every one of them is a guarded RPC.
 */

const LINK_COLUMNS =
  'id, elder_id, member_id, member_role, status, created_at, activated_at' as const;

// Sprint 1b contract 4: name the columns. code_hash and consumed_link_id are
// deliberately not selectable, and `select('*')` is rejected by the database.
const INVITE_COLUMNS =
  'id, created_by, elder_id, grants_member_role, invitee_email, expires_at, consumed_at, consumed_by, created_at' as const;

export type MemberRole = 'caregiver' | 'family_member';
export type LinkStatus = 'invited' | 'active' | 'revoked';

interface LinkRow {
  id: string;
  elder_id: string;
  member_id: string;
  member_role: MemberRole;
  status: LinkStatus;
  created_at: string;
  activated_at: string | null;
}

interface InviteRow {
  id: string;
  created_by: string;
  elder_id: string | null;
  grants_member_role: MemberRole;
  invitee_email: string | null;
  expires_at: string;
  consumed_at: string | null;
  consumed_by: string | null;
  created_at: string;
}

interface NameRow {
  id: string;
  full_name: string;
}

export interface MyLink {
  linkId: string;
  elderId: string;
  /** Only readable once the link is active; RLS hides a pending elder's profile. */
  elderName: string | null;
  memberRole: MemberRole;
  status: LinkStatus;
  createdAt: string;
  activatedAt: string | null;
}

export interface ElderCircleLink {
  linkId: string;
  memberId: string;
  memberRole: MemberRole;
  status: 'invited' | 'active';
  memberLabel: string;
  createdAt: string;
}

export interface MyInvite {
  id: string;
  inviteeEmail: string | null;
  grantsMemberRole: MemberRole;
  expiresAt: string;
  consumedAt: string | null;
  consumedBy: string | null;
  createdAt: string;
  expired: boolean;
}

async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, full_name')
    .in('id', unique)
    .returns<NameRow[]>();

  // A pending member's name is hidden by RLS on purpose; fall back to a label.
  if (error) return new Map();
  return new Map(data.map((row) => [row.id, row.full_name]));
}

/** Every link this account belongs to as the caregiver or family member. */
export async function listMyLinks(memberId: string): Promise<MyLink[]> {
  const { data, error } = await getSupabase()
    .from('care_links')
    .select(LINK_COLUMNS)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .returns<LinkRow[]>();

  if (error) throw new Error('Could not load your care links.');

  const names = await fetchNames(
    data.filter((row) => row.status === 'active').map((row) => row.elder_id),
  );

  return data.map((row) => ({
    linkId: row.id,
    elderId: row.elder_id,
    elderName: row.status === 'active' ? (names.get(row.elder_id) ?? null) : null,
    memberRole: row.member_role,
    status: row.status,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
  }));
}

/** The elder this member is actively linked to, if any. */
export async function getLinkedElder(memberId: string): Promise<MyLink | null> {
  const links = await listMyLinks(memberId);
  return links.find((link) => link.status === 'active') ?? null;
}

async function listConsumedInvitesForElder(elderId: string): Promise<InviteRow[]> {
  const { data, error } = await getSupabase()
    .from('care_link_invites')
    .select(INVITE_COLUMNS)
    .eq('elder_id', elderId)
    .not('consumed_at', 'is', null)
    .returns<InviteRow[]>();

  if (error) return [];
  return data;
}

/** The elder's live care circle: the manager plus family members, consent pending or active. */
export async function listElderCircle(elderId: string): Promise<ElderCircleLink[]> {
  const { data: links, error } = await getSupabase()
    .from('care_links')
    .select(LINK_COLUMNS)
    .eq('elder_id', elderId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: true })
    .returns<LinkRow[]>();

  if (error) throw new Error('Could not load your care circle.');

  const [names, invites] = await Promise.all([
    fetchNames(links.filter((row) => row.status === 'active').map((row) => row.member_id)),
    listConsumedInvitesForElder(elderId),
  ]);

  const emailByMember = new Map(
    invites
      .filter((invite) => invite.consumed_by !== null)
      .map((invite) => [invite.consumed_by!, invite.invitee_email]),
  );

  return links
    .filter((row) => row.status === 'invited' || row.status === 'active')
    .map((row) => ({
      linkId: row.id,
      memberId: row.member_id,
      memberRole: row.member_role,
      status: row.status === 'invited' ? 'invited' : 'active',
      memberLabel:
        names.get(row.member_id) ??
        emailByMember.get(row.member_id) ??
        (row.member_role === 'caregiver' ? 'Your caregiver' : 'A family member'),
      createdAt: row.created_at,
    }));
}

/** Invites this account created, newest first, with their expiry state. */
export async function listMyInvites(creatorId: string): Promise<MyInvite[]> {
  const { data, error } = await getSupabase()
    .from('care_link_invites')
    .select(INVITE_COLUMNS)
    .eq('created_by', creatorId)
    .order('created_at', { ascending: false })
    .returns<InviteRow[]>();

  if (error) throw new Error('Could not load your invites.');

  const now = Date.now();
  return data.map((row) => ({
    id: row.id,
    inviteeEmail: row.invitee_email,
    grantsMemberRole: row.grants_member_role,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    consumedBy: row.consumed_by,
    createdAt: row.created_at,
    expired: row.consumed_at === null && new Date(row.expires_at).getTime() <= now,
  }));
}
