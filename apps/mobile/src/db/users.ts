import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';

import type { UserRole } from '@eldercare/shared';

import { getDatabase } from './database';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

export type PublicUser = Omit<StoredUser, 'passwordHash'>;

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

function toStoredUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/**
 * Demo-grade password handling: a random per-user salt plus a SHA-256 digest.
 *
 * This is deliberately *not* claimed to be a production password hash. Pocket-class
 * hashing (scrypt/argon2/bcrypt) needs a native module or a server, so the real build
 * delegates this to Supabase Auth. What matters for this deliverable is that no plaintext
 * password is ever written to the database.
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<UserRow>(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    normaliseEmail(email),
  );
  return row ? toStoredUser(row) : null;
}

export async function emailExists(email: string): Promise<boolean> {
  return (await findUserByEmail(email)) !== null;
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<PublicUser> {
  const database = await getDatabase();
  const salt = randomUUID();
  const id = randomUUID();

  await database.runAsync(
    `INSERT INTO users (id, name, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    input.name.trim(),
    normaliseEmail(input.email),
    `${salt}$${await hashPassword(input.password, salt)}`,
    input.role,
    new Date().toISOString(),
  );

  return {
    id,
    name: input.name.trim(),
    email: normaliseEmail(input.email),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
}

export type SignInFailure = 'not_found' | 'wrong_password';

export type SignInResult = { ok: true; user: PublicUser } | { ok: false; reason: SignInFailure };

export async function authenticate(email: string, password: string): Promise<SignInResult> {
  const stored = await findUserByEmail(email);
  if (!stored) return { ok: false, reason: 'not_found' };

  const [salt] = stored.passwordHash.split('$');
  const attempt = await hashPassword(password, salt);
  if (attempt !== stored.passwordHash.split('$').slice(1).join('$')) {
    return { ok: false, reason: 'wrong_password' };
  }

  return { ok: true, user: toPublicUser(stored) };
}

export async function countUsers(): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM users',
  );
  return row?.total ?? 0;
}
