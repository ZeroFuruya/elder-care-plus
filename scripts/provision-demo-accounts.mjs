#!/usr/bin/env node
/**
 * Provision the three synthetic hosted demo accounts (docs/specs/sprint-1b.md, runbook).
 *
 * - Reads only the public client values (`EXPO_PUBLIC_SUPABASE_URL`,
 *   `EXPO_PUBLIC_SUPABASE_ANON_KEY`) from `apps/mobile/.env`. The service-role key is never
 *   used or asked for.
 * - Creates each account through the same public sign-up endpoint the app uses, so the
 *   database trigger that stamps `role` and `full_name` from sign-up metadata is exercised
 *   exactly as it is in production.
 * - Signs each account in and verifies its role by reading the caller's own `public.profiles`
 *   row under RLS — the same check the app performs at startup.
 * - Writes the resolved credentials to `apps/mobile/.env.demo-accounts`, which is git-ignored
 *   (`.env.*`). These are throwaway synthetic accounts: never use real personal data here.
 *
 * Re-running is safe: existing accounts are signed in and re-verified instead of duplicated.
 * Edit the emails/passwords in `apps/mobile/.env.demo-accounts` to provision fresh addresses.
 *
 * Usage:
 *   node scripts/provision-demo-accounts.mjs
 *
 * Prerequisites: all six migrations applied to the hosted project and "Confirm email" OFF
 * (docs/specs/sprint-1b.md, "Hosted release checklist").
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'apps', 'mobile', '.env');
const credentialsPath = join(root, 'apps', 'mobile', '.env.demo-accounts');

const accounts = [
  {
    key: 'CAREGIVER',
    role: 'caregiver',
    email: 'demo.caregiver@example.com',
    fullName: 'Demo Caregiver',
  },
  { key: 'ELDER', role: 'elder', email: 'demo.elder@example.com', fullName: 'Demo Elder' },
  {
    key: 'FAMILY',
    role: 'family_member',
    email: 'demo.family@example.com',
    fullName: 'Demo Family Member',
  },
];

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

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

const env = parseEnv(readFileSync(envPath, 'utf8'));
const baseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const credentials = existsSync(credentialsPath)
  ? parseEnv(readFileSync(credentialsPath, 'utf8'))
  : {};

async function call(pathname, { method = 'GET', token, body } = {}) {
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

async function main() {
  if (!baseUrl || !anonKey) {
    console.error(`Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in ${envPath}`);
    process.exitCode = 1;
    return;
  }

  const settings = await call('/auth/v1/settings');
  if (!settings.ok) {
    console.error('Could not read hosted auth settings:', message(settings.payload));
    process.exitCode = 1;
    return;
  }
  if (settings.payload?.mailer_autoconfirm !== true) {
    console.error(
      'Hosted Auth still has "Confirm email" ON, so new accounts could not sign in.\n' +
        'Turn it off in the dashboard (Authentication -> Sign In / Up -> Email -> Confirm email)\n' +
        'and re-run this script.',
    );
    process.exitCode = 1;
    return;
  }

  const resolved = [];
  for (const account of accounts) {
    const email = credentials[`DEMO_${account.key}_EMAIL`] ?? account.email;
    const password =
      process.env[`DEMO_${account.key}_PASSWORD`] ??
      credentials[`DEMO_${account.key}_PASSWORD`] ??
      randomBytes(18).toString('base64url');

    const signup = await call('/auth/v1/signup', {
      method: 'POST',
      body: { email, password, data: { role: account.role, full_name: account.fullName } },
    });

    let created = false;
    let accessToken = signup.payload?.session?.access_token;
    let userId = signup.payload?.user?.id;

    if (signup.ok && signup.payload?.session === null) {
      console.error(`Sign-up for ${email} returned no session (Confirm email is ON?).`);
      process.exitCode = 1;
      continue;
    }

    if (!accessToken) {
      // Most likely "already registered": sign in with the same password instead.
      const signin = await call('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: { email, password },
      });
      if (signin.ok && signin.payload?.access_token) {
        accessToken = signin.payload.access_token;
        userId = signin.payload.user?.id;
      } else {
        console.error(
          `Could not create or sign in ${email}: ${message(signin.payload) || message(signup.payload)}`,
        );
        process.exitCode = 1;
        continue;
      }
    } else {
      created = true;
    }

    const profile = await call('/rest/v1/profiles?select=id,role,full_name', {
      token: accessToken,
    });
    const rows = Array.isArray(profile.payload) ? profile.payload : [];
    const own = rows.find((row) => row.id === userId) ?? null;
    if (!profile.ok || !own || own.role !== account.role) {
      console.error(
        `Profile check failed for ${email}: expected role "${account.role}". ${message(profile.payload)}`,
      );
      process.exitCode = 1;
      continue;
    }

    resolved.push({ account, email, password, created });
    console.log(`${created ? 'created ' : 'existing'}  ${account.role.padEnd(13)}  ${email}`);
  }

  if (resolved.length === accounts.length) {
    const lines = [
      '# Synthetic hosted demo accounts - generated by scripts/provision-demo-accounts.mjs',
      '# Git-ignored (.env.*). Throwaway demo data only; never put real personal data here.',
      '',
    ];
    for (const { account, email, password } of resolved) {
      lines.push(
        `DEMO_${account.key}_EMAIL=${email}`,
        `DEMO_${account.key}_PASSWORD=${password}`,
        '',
      );
    }
    writeFileSync(credentialsPath, lines.join('\n'), 'utf8');
    console.log(`\nAll three roles verified against hosted. Credentials: ${credentialsPath}`);
  }
}

await main();
