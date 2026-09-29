import type { PostgrestError } from '@supabase/supabase-js';

import { getSupabase } from '@/supabase/client';

/**
 * The only write path for identity/links: the Sprint 1 security-definer RPCs.
 *
 * The table grants are read-only, so a direct `.insert()`/`.update()` would be
 * rejected anyway — and that is the point. Re-authentication is never a client
 * parameter: consent, revoke and deactivate raise server-side until the access
 * token itself carries a recent password entry (`amr`).
 */

export type LinkingErrorKind = 'reauth' | 'conflict' | 'not_found' | 'network' | 'unknown';

export class LinkingError extends Error {
  readonly kind: LinkingErrorKind;

  constructor(message: string, kind: LinkingErrorKind) {
    super(message);
    this.name = 'LinkingError';
    this.kind = kind;
  }
}

export function isLinkingError(value: unknown): value is LinkingError {
  return value instanceof LinkingError;
}

export type RedeemOutcome =
  | { status: 'active' | 'invited' | 'revoked'; linkId: string }
  | { status: 'invalid' }
  | { status: 'rate_limited'; retryAfterSeconds: number };

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';
const GENERIC_MESSAGE = 'The action could not be completed. Please try again.';

function networkError(cause: unknown): LinkingError {
  return new LinkingError(
    cause instanceof Error && /network|fetch|timed? ?out|too long/i.test(cause.message)
      ? OFFLINE_MESSAGE
      : GENERIC_MESSAGE,
    'network',
  );
}

function mapPostgrestError(error: PostgrestError): LinkingError {
  const message = error.message ?? '';
  const code = error.code ?? '';

  if (/fetch|network|timed? ?out|too long/i.test(message)) {
    return new LinkingError(OFFLINE_MESSAGE, 'network');
  }

  // The SC-2 guard raises exactly this; any other 42501 is a plain permission denial.
  if (code === '42501' && /re-?authentication required/i.test(message)) {
    return new LinkingError(
      'Your last password check has expired. Enter your password again.',
      'reauth',
    );
  }

  if (code === '23505') {
    return new LinkingError(
      'That link already exists. Refresh to see the latest state.',
      'conflict',
    );
  }

  if (code === 'P0002' || /not found/i.test(message)) {
    return new LinkingError('That link no longer exists.', 'not_found');
  }

  return new LinkingError(GENERIC_MESSAGE, 'unknown');
}

interface RpcResponse<T> {
  data: T | null;
  error: PostgrestError | null;
}

async function call<T>(run: () => PromiseLike<RpcResponse<T>>): Promise<T | null> {
  let response: RpcResponse<T>;
  try {
    response = await run();
  } catch (cause) {
    throw networkError(cause);
  }
  if (response.error) throw mapPostgrestError(response.error);
  return response.data;
}

function parseInviteCode(code: unknown): string {
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) {
    throw new LinkingError('The server did not return a usable code. Please try again.', 'unknown');
  }
  return code;
}

export function parseRedeemPayload(payload: unknown): RedeemOutcome {
  if (typeof payload !== 'object' || payload === null) {
    throw new LinkingError(GENERIC_MESSAGE, 'unknown');
  }

  const record = payload as Record<string, unknown>;
  switch (record.status) {
    case 'invalid':
      return { status: 'invalid' };
    case 'rate_limited': {
      const seconds =
        typeof record.retry_after_seconds === 'number' &&
        Number.isFinite(record.retry_after_seconds)
          ? Math.max(1, Math.round(record.retry_after_seconds))
          : 900;
      return { status: 'rate_limited', retryAfterSeconds: seconds };
    }
    case 'active':
    case 'invited':
    case 'revoked': {
      if (typeof record.link_id !== 'string') {
        throw new LinkingError(GENERIC_MESSAGE, 'unknown');
      }
      return { status: record.status, linkId: record.link_id };
    }
    default:
      throw new LinkingError(GENERIC_MESSAGE, 'unknown');
  }
}

/** A caregiver with no linked elder issues a code an older adult can redeem. */
export async function createElderLinkInvite(inviteeEmail?: string): Promise<string> {
  const client = getSupabase();
  const code = await call<string>(() =>
    client.rpc('create_elder_link_invite', { p_invitee_email: inviteeEmail?.trim() || null }),
  );
  return parseInviteCode(code);
}

/** The linked caregiver invites a family member into the circle by email. */
export async function inviteFamilyMember(inviteeEmail: string): Promise<string> {
  const client = getSupabase();
  const code = await call<string>(() =>
    client.rpc('invite_family_member', { p_invitee_email: inviteeEmail.trim() || null }),
  );
  return parseInviteCode(code);
}

/** Redeem a six-digit code. Invalid codes return a status, they never throw. */
export async function redeemCareLinkCode(code: string): Promise<RedeemOutcome> {
  const client = getSupabase();
  const payload = await call<unknown>(() =>
    client.rpc('redeem_care_link_code', { p_code: code.trim() }),
  );
  return parseRedeemPayload(payload);
}

/** The elder approves a family member's link. Requires a recent password entry. */
export async function consentToCareLink(linkId: string): Promise<void> {
  const client = getSupabase();
  await call(() => client.rpc('consent_to_care_link', { p_link_id: linkId }));
}

/** The elder or their manager removes a link. History is kept. */
export async function revokeCareLink(linkId: string, reason?: string): Promise<void> {
  const client = getSupabase();
  await call(() =>
    client.rpc('revoke_care_link', { p_link_id: linkId, p_reason: reason?.trim() || null }),
  );
}

/** Deactivate the caller's own account (soft delete) and revoke its links. */
export async function deactivateAccount(reason?: string): Promise<void> {
  const client = getSupabase();
  await call(() => client.rpc('deactivate_account', { p_reason: reason?.trim() || null }));
}
