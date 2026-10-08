#!/usr/bin/env node
/**
 * Pre-provision the synthetic hosted care circle for the 2026-10-15/16 checking.
 *
 * The checking runbook assumes a linked care circle, but the three demo accounts start
 * unlinked. This script establishes ONLY the identity and circle scaffolding:
 *
 *   1. caregiver <-> elder care link (active — the elder's redemption is their consent)
 *   2. the elder_profile row the `C-01` dashboard needs to render at all
 *   3. family_member <-> elder care link (active, with the elder's consent)
 *
 * It creates NO medications, schedules, batches or dose_events, so the checking run still
 * produces the first plan and the first confirmation.
 *
 * Reads only the public client values (`EXPO_PUBLIC_SUPABASE_URL`,
 * `EXPO_PUBLIC_SUPABASE_ANON_KEY`) from `apps/mobile/.env` and the synthetic credentials
 * from `apps/mobile/.env.demo-accounts`. The service-role key is never used or asked for.
 *
 * All mutations go through the current guarded RPCs (`create_elder_link_invite`,
 * `redeem_care_link_code`, `invite_family_member`, `consent_to_care_link`,
 * `upsert_elder_profile`) — never a direct table write, which RLS would refuse anyway.
 *
 * Re-running is safe: an existing active link and an existing active family link are
 * reused rather than duplicated.
 *
 * Prerequisites: all migrations applied to the hosted project and the three demo accounts
 * provisioned (`scripts/provision-demo-accounts.mjs`).
 *
 * Usage:
 *   node scripts/provision-demo-circle.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'apps', 'mobile', '.env');
const credentialsPath = join(root, 'apps', 'mobile', '.env.demo-accounts');

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

if (!existsSync(envPath)) throw new Error(`Missing ${envPath}`);
const env = parseEnv(readFileSync(envPath, 'utf8'));
const baseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const credentials = existsSync(credentialsPath)
  ? parseEnv(readFileSync(credentialsPath, 'utf8'))
  : {};

function message(payload) {
  if (!payload) return 'no response body';
  return (
    payload.msg ??
    payload.message ??
    payload.error_description ??
    payload.error ??
    JSON.stringify(payload)
  );
}

async function request(pathname, { method = 'GET', token, body } = {}) {
  const headers = { apikey: anonKey };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { ok: response.ok, status: response.status, payload };
}

async function signIn(email, password) {
  const result = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  if (!result.ok || !result.payload?.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${message(result.payload)}`);
  }
  return { token: result.payload.access_token, userId: result.payload.user?.id };
}

async function rpc(token, name, args = {}) {
  const result = await request(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args });
  if (!result.ok) throw new Error(`${name} failed (${result.status}): ${message(result.payload)}`);
  return result.payload;
}

async function select(token, query) {
  const result = await request(`/rest/v1/${query}`, { token });
  if (!result.ok) throw new Error(`read failed (${result.status}): ${message(result.payload)}`);
  return Array.isArray(result.payload) ? result.payload : [];
}

async function main() {
  if (!baseUrl || !anonKey) {
    throw new Error(
      `Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in ${envPath}`,
    );
  }

  const accounts = {
    caregiver: {
      email: credentials.DEMO_CAREGIVER_EMAIL,
      password: credentials.DEMO_CAREGIVER_PASSWORD,
    },
    elder: { email: credentials.DEMO_ELDER_EMAIL, password: credentials.DEMO_ELDER_PASSWORD },
    family: { email: credentials.DEMO_FAMILY_EMAIL, password: credentials.DEMO_FAMILY_PASSWORD },
  };
  for (const [role, account] of Object.entries(accounts)) {
    if (!account.email || !account.password) {
      throw new Error(`Missing DEMO_${role.toUpperCase()}_EMAIL / _PASSWORD in ${credentialsPath}`);
    }
  }

  const caregiver = await signIn(accounts.caregiver.email, accounts.caregiver.password);
  const elder = await signIn(accounts.elder.email, accounts.elder.password);
  const family = await signIn(accounts.family.email, accounts.family.password);

  // --- 1. caregiver <-> elder link -----------------------------------------
  const caregiverLinks = await select(
    caregiver.token,
    `care_links?select=id,elder_id,member_role,status&member_id=eq.${caregiver.userId}`,
  );
  const caregiverElderLink = caregiverLinks.find(
    (link) => link.member_role === 'caregiver' && link.status === 'active',
  );

  if (caregiverElderLink) {
    console.log('caregiver <-> elder link: already active, reusing');
  } else {
    const code = await rpc(caregiver.token, 'create_elder_link_invite', { p_invitee_email: null });
    if (!/^[0-9]{6}$/.test(String(code))) throw new Error(`Unexpected invite code: ${code}`);
    const redeem = await rpc(elder.token, 'redeem_care_link_code', { p_code: String(code) });
    if (redeem?.status !== 'active') {
      throw new Error(`Elder redemption did not activate: ${JSON.stringify(redeem)}`);
    }
    console.log('caregiver <-> elder link: created and active (elder redemption = consent)');
  }

  // --- 2. elder profile (required for the C-01 dashboard to render) --------
  await rpc(caregiver.token, 'upsert_elder_profile', {
    p_elder_id: elder.userId,
    p_date_of_birth: '1948-03-12',
    p_blood_type: 'O+',
    p_address_line1: '12 Synthetic Lane',
    p_address_line2: null,
    p_city: 'Demo City',
    p_region: null,
    p_postal_code: '54321',
    p_country_code: 'SG',
    p_allergies: 'Penicillin (synthetic demo data)',
    p_conditions: 'Hypertension (synthetic demo data)',
    p_care_instructions: 'Synthetic demo record - not a real person.',
    p_doctor_name: 'Dr Demo',
    p_doctor_phone: '+65 6000 0000',
  });
  console.log('elder profile: present (upserted)');

  // --- 3. family_member <-> elder link, with the elder's consent -----------
  const familyLinks = await select(
    family.token,
    `care_links?select=id,elder_id,member_role,status&member_id=eq.${family.userId}`,
  );
  const familyActive = familyLinks.find(
    (link) => link.member_role === 'family_member' && link.status === 'active',
  );

  if (familyActive) {
    console.log('family <-> elder link: already active, reusing');
  } else {
    const pending = (
      await select(
        elder.token,
        `care_links?select=id,member_role,status&elder_id=eq.${elder.userId}&member_role=eq.family_member&status=eq.invited`,
      )
    )[0];

    let linkId = pending?.id ?? null;
    if (!linkId) {
      const code = await rpc(caregiver.token, 'invite_family_member', {
        p_invitee_email: accounts.family.email,
      });
      if (!/^[0-9]{6}$/.test(String(code))) throw new Error(`Unexpected invite code: ${code}`);
      const redeem = await rpc(family.token, 'redeem_care_link_code', { p_code: String(code) });
      if (redeem?.status !== 'invited' || !redeem.link_id) {
        throw new Error(
          `Family redemption did not create an invited link: ${JSON.stringify(redeem)}`,
        );
      }
      linkId = redeem.link_id;
      console.log('family <-> elder link: invited (awaiting elder consent)');
    } else {
      console.log('family <-> elder link: reusing an existing pending invite');
    }

    // Consent requires a server-verifiable recent password entry, so re-sign the elder in
    // first and let the fresh access token carry an up-to-date `amr` timestamp.
    const elderFresh = await signIn(accounts.elder.email, accounts.elder.password);
    await rpc(elderFresh.token, 'consent_to_care_link', { p_link_id: linkId });
    console.log('family <-> elder link: consented and active');
  }

  // --- verification --------------------------------------------------------
  const finalFamilyLinks = await select(
    family.token,
    `care_links?select=id,member_role,status&member_id=eq.${family.userId}`,
  );
  const finalElderLinks = await select(
    elder.token,
    `care_links?select=id,member_role,status&elder_id=eq.${elder.userId}`,
  );
  const profile = await select(
    elder.token,
    `elder_profiles?select=elder_id&elder_id=eq.${elder.userId}`,
  );

  const active = (links) => links.filter((link) => link.status === 'active').length;
  const familyHasActive = finalFamilyLinks.some(
    (link) => link.member_role === 'family_member' && link.status === 'active',
  );
  const caregiverHasActive = finalElderLinks.some(
    (link) => link.member_role === 'caregiver' && link.status === 'active',
  );

  console.log('\n=== verification ===');
  console.log('caregiver active link:', caregiverHasActive ? 'yes' : 'NO');
  console.log('family active link:', familyHasActive ? 'yes' : 'NO');
  console.log('elder profile rows:', profile.length);

  if (!caregiverHasActive || !familyHasActive || profile.length !== 1) {
    throw new Error('Unexpected circle state - inspect the hosted project before the checking.');
  }

  console.log('\nCare circle pre-provisioned. No medications or dose events were created.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
