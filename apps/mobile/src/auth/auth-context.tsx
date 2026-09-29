import type { AuthError, Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { userRoleSchema, type UserRole } from '@eldercare/shared';

import { getSupabase, supabaseConfigError } from '@/supabase/client';

/**
 * Session handling for the Supabase-backed app.
 *
 * Routing never trusts auth metadata: the role comes from the caller's own
 * `profiles` row (RLS-scoped), and an account with no usable profile fails
 * closed instead of rendering a shell. See docs/specs/sprint-1b.md contract 2.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type Outcome = { ok: true; user: SessionUser } | { ok: false; message: string };

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export type ReauthResult = { ok: true } | { ok: false; message: string };

interface AuthValue {
  /** False until the stored session has been checked once. */
  ready: boolean;
  /** Non-null when startup failed; screens show it instead of pretending everything is fine. */
  startupError: string | null;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<Outcome>;
  signUp: (input: SignUpInput) => Promise<Outcome>;
  signOut: () => Promise<void>;
  /** Re-runs the stored-session check after a startup error. */
  retryStartup: () => void;
  /**
   * Fresh password sign-in for the current account, used immediately before a
   * sensitive RPC (consent, revoke, deactivate). No client value asserts this;
   * the server checks the access token's `amr` timestamp itself.
   */
  reauthenticate: (password: string) => Promise<ReauthResult>;
}

const AuthContext = createContext<AuthValue | null>(null);

const OFFLINE_MESSAGE = 'Could not reach the server. Check your connection and try again.';
const SIGN_IN_FAILED = 'Incorrect email or password. Please try again.';
const SIGN_IN_ERROR = 'Something went wrong while signing in. Please try again.';

const PROFILE_COLUMNS = 'id, role, full_name, deactivated_at';

interface ProfileRow {
  id: string;
  role: string;
  full_name: string;
  deactivated_at: string | null;
}

/** The account exists (or existed) but has no usable profile; fail closed. */
class InactiveProfileError extends Error {}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isNetworkError(error: AuthError): boolean {
  return (
    error.status === 0 ||
    error.name === 'AuthRetryableFetchError' ||
    /fetch|network|timed? ?out|too long/i.test(error.message)
  );
}

async function fetchProfile(session: Session): Promise<SessionUser> {
  const client = getSupabase();
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', session.user.id)
    .maybeSingle<ProfileRow>();

  if (error) throw new Error(error.message);
  if (!data) throw new InactiveProfileError('This account has no active profile.');
  if (data.deactivated_at) throw new InactiveProfileError('This account has been deactivated.');

  const role = userRoleSchema.safeParse(data.role);
  if (!role.success) throw new InactiveProfileError('This account has an unrecognised role.');

  return {
    id: data.id,
    name: data.full_name,
    email: session.user.email ?? '',
    role: role.data,
    createdAt: session.user.created_at,
  };
}

function signInErrorMessage(error: AuthError): string {
  if (isNetworkError(error)) return OFFLINE_MESSAGE;
  if (
    error.status === 400 ||
    error.code === 'invalid_credentials' ||
    error.code === 'email_not_confirmed'
  ) {
    // Deliberate collapse: unknown email, wrong password and an unconfirmed
    // account share one message (no account enumeration; sprint-1b criterion 3).
    return SIGN_IN_FAILED;
  }
  return SIGN_IN_ERROR;
}

function signUpErrorMessage(error: AuthError): string {
  if (isNetworkError(error)) return OFFLINE_MESSAGE;
  if (
    error.code === 'user_already_exists' ||
    /already registered|already exists/i.test(error.message)
  ) {
    return 'That email is already registered. Sign in instead.';
  }
  if (error.code === 'weak_password') return 'Use a password of at least 8 characters.';
  return 'Could not create the account. Please try again.';
}

function profileErrorMessage(error: unknown): string {
  if (error instanceof InactiveProfileError) return error.message;
  return 'Your profile could not be loaded. Check your connection and try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // A build without server configuration fails immediately and loudly: there is
  // nothing to retry, and pretending to be signed out would hide the mistake.
  const [ready, setReady] = useState(() => supabaseConfigError !== null);
  const [startupError, setStartupError] = useState<string | null>(() => supabaseConfigError);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [attempt, setAttempt] = useState(0);

  const loadedUserIdRef = useRef<string | null>(null);
  const userRef = useRef<SessionUser | null>(null);
  /**
   * Monotonic guard for auth mutations: a profile fetch that started before a
   * newer sign-in or sign-out must never write state over the newer result.
   */
  const generationRef = useRef(0);

  const setSessionUser = useCallback((next: SessionUser | null) => {
    userRef.current = next;
    setUser(next);
  }, []);

  const clearSession = useCallback(() => {
    loadedUserIdRef.current = null;
    setSessionUser(null);
    setStartupError(null);
    setReady(true);
  }, [setSessionUser]);

  useEffect(() => {
    if (supabaseConfigError) return;

    const client = getSupabase();
    let active = true;
    let queue: Promise<void> = Promise.resolve();

    // Auth events arrive faster than profiles load; run them one at a time and
    // never await inside the callback itself (Supabase's React Native guidance).
    const enqueue = (job: () => Promise<void>) => {
      queue = queue.then(job).catch(() => undefined);
    };

    const applySession = async (session: Session | null) => {
      if (!active) return;

      if (!session) {
        clearSession();
        return;
      }

      const generation = generationRef.current;
      if (loadedUserIdRef.current === session.user.id) {
        setReady(true);
        return;
      }

      try {
        const profile = await fetchProfile(session);
        if (!active || generation !== generationRef.current) return;
        loadedUserIdRef.current = profile.id;
        setSessionUser(profile);
        setStartupError(null);
        setReady(true);
      } catch (cause) {
        if (!active || generation !== generationRef.current) return;
        loadedUserIdRef.current = null;
        setSessionUser(null);
        setStartupError(profileErrorMessage(cause));
        setReady(true);
        if (cause instanceof InactiveProfileError) {
          await client.auth.signOut();
        }
      }
    };

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === 'SIGNED_OUT') {
        enqueue(async () => clearSession());
        return;
      }

      const forceReload = event === 'USER_UPDATED';
      enqueue(async () => {
        if (forceReload) loadedUserIdRef.current = null;
        await applySession(session);
      });
    });
    const subscription = data.subscription;

    void (async () => {
      try {
        const { data: restored } = await client.auth.getSession();
        enqueue(() => applySession(restored.session));
      } catch {
        enqueue(async () => {
          setStartupError(OFFLINE_MESSAGE);
          setReady(true);
        });
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [attempt, clearSession, setSessionUser]);

  // Supabase's React Native guidance: pause token refresh while backgrounded.
  useEffect(() => {
    if (supabaseConfigError) return;
    const client = getSupabase();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<Outcome> => {
      const generation = (generationRef.current += 1);
      const client = getSupabase();
      const { data, error } = await client.auth.signInWithPassword({
        email: normaliseEmail(email),
        password,
      });

      // A newer sign-in/sign-out started while this request was in flight.
      if (generation !== generationRef.current) return { ok: false, message: SIGN_IN_ERROR };
      if (error) return { ok: false, message: signInErrorMessage(error) };
      if (!data.session) return { ok: false, message: SIGN_IN_ERROR };

      try {
        const profile = await fetchProfile(data.session);
        if (generation !== generationRef.current) return { ok: false, message: SIGN_IN_ERROR };
        loadedUserIdRef.current = profile.id;
        setSessionUser(profile);
        setStartupError(null);
        setReady(true);
        return { ok: true, user: profile };
      } catch (cause) {
        if (generation === generationRef.current) await client.auth.signOut();
        return { ok: false, message: profileErrorMessage(cause) };
      }
    },
    [setSessionUser],
  );

  const signUp = useCallback(
    async (input: SignUpInput): Promise<Outcome> => {
      const generation = (generationRef.current += 1);
      const client = getSupabase();
      const role = userRoleSchema.safeParse(input.role);
      if (!role.success) return { ok: false, message: 'Choose who will use this account.' };

      const { data, error } = await client.auth.signUp({
        email: normaliseEmail(input.email),
        password: input.password,
        options: {
          // The database trigger reads role and full_name from this metadata.
          data: { role: role.data, full_name: input.name.trim() },
        },
      });

      if (generation !== generationRef.current) return { ok: false, message: SIGN_IN_ERROR };
      if (error) return { ok: false, message: signUpErrorMessage(error) };
      if (!data.session) {
        return {
          ok: false,
          message:
            'Account created, but this project still asks for email confirmation. Sign in once confirmation is switched off.',
        };
      }

      try {
        const profile = await fetchProfile(data.session);
        if (generation !== generationRef.current) return { ok: false, message: SIGN_IN_ERROR };
        loadedUserIdRef.current = profile.id;
        setSessionUser(profile);
        setStartupError(null);
        setReady(true);
        return { ok: true, user: profile };
      } catch (cause) {
        if (generation === generationRef.current) await client.auth.signOut();
        return { ok: false, message: profileErrorMessage(cause) };
      }
    },
    [setSessionUser],
  );

  const signOut = useCallback(async () => {
    // Bump first: a profile fetch already in flight sees a stale generation and
    // must not put the old user back (review finding).
    generationRef.current += 1;
    loadedUserIdRef.current = null;
    setSessionUser(null);
    setStartupError(null);
    if (supabaseConfigError) return;

    const client = getSupabase();
    try {
      await client.auth.signOut();
    } catch {
      // Offline or timed out; the local clear below is the guarantee that matters.
    }
    // Local-first guarantee (contract 4): never leave a restorable session on
    // this device when the network revoke failed or timed out.
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // Nothing more the client can do; React state was already cleared.
    }
  }, [setSessionUser]);

  const retryStartup = useCallback(() => {
    // A configuration error cannot be fixed by retrying; only runtime failures.
    if (supabaseConfigError) return;
    setStartupError(null);
    setAttempt((current) => current + 1);
  }, []);

  const reauthenticate = useCallback(
    async (password: string): Promise<ReauthResult> => {
      const current = userRef.current;
      if (!current) return { ok: false, message: 'Your session has ended. Sign in again.' };

      const generation = generationRef.current;
      const client = getSupabase();
      const { data, error } = await client.auth.signInWithPassword({
        email: current.email,
        password,
      });

      if (generation !== generationRef.current) {
        // A sign-out (or another sign-in) superseded this password check while
        // it was in flight. Its session must not come back to life.
        await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
        return { ok: false, message: 'Your session has ended. Sign in again.' };
      }

      if (error) {
        if (isNetworkError(error)) return { ok: false, message: OFFLINE_MESSAGE };
        if (error.status === 400 || error.code === 'invalid_credentials') {
          return { ok: false, message: 'That password is not correct.' };
        }
        return {
          ok: false,
          message: 'The password could not be checked just now. Please try again.',
        };
      }

      if (!data.session || data.user?.id !== current.id) {
        // The password belonged to a different account. Fail closed: end the
        // session rather than let a guarded RPC run as the wrong user.
        await signOut();
        return { ok: false, message: 'That password is not correct.' };
      }

      return { ok: true };
    },
    [signOut],
  );

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      startupError,
      user,
      signIn,
      signUp,
      signOut,
      retryStartup,
      reauthenticate,
    }),
    [ready, startupError, user, signIn, signUp, signOut, retryStartup, reauthenticate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/** The signed-in user, for screens that are only reachable once a role is known. */
export function useSessionUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('This screen requires a signed-in user.');
  return user;
}
