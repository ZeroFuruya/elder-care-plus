import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { UserRole } from '@eldercare/shared';

import {
  authenticate,
  createUser,
  emailExists,
  ensureDemoData,
  ensureDemoSchedule,
  linkCaregiverToElder,
  normaliseEmail,
  type PublicUser,
} from '@/db';

export type SessionUser = PublicUser;

export type Outcome = { ok: true; user: SessionUser } | { ok: false; message: string };

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface AuthValue {
  /** False until the local database has been created and seeded. */
  ready: boolean;
  /** Non-null if startup failed; screens show it instead of pretending everything is fine. */
  startupError: string | null;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<Outcome>;
  signUp: (input: SignUpInput) => Promise<Outcome>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;

    ensureDemoData()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStartupError(
          error instanceof Error
            ? `Could not open the local database: ${error.message}`
            : 'Could not open the local database.',
        );
        setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<Outcome> => {
    const result = await authenticate(email, password);

    if (!result.ok) {
      return {
        ok: false,
        message:
          result.reason === 'not_found'
            ? 'Account does not exist. Check the email address, or create an account.'
            : 'Incorrect username or password. Please try again.',
      };
    }

    setUser(result.user);
    return { ok: true, user: result.user };
  }, []);

  const signUp = useCallback(async (input: SignUpInput): Promise<Outcome> => {
    const email = normaliseEmail(input.email);

    if (await emailExists(email)) {
      return { ok: false, message: 'That email is already registered. Sign in instead.' };
    }

    const created = await createUser({
      name: input.name,
      email,
      password: input.password,
      role: input.role,
    });

    // A brand-new elder needs a day to look at; a brand-new caregiver needs somebody to care for.
    if (created.role === 'elder') {
      await ensureDemoSchedule(created.id);
    } else {
      const { elderId } = await ensureDemoData();
      await linkCaregiverToElder(created.id, elderId);
    }

    setUser(created);
    return { ok: true, user: created };
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ ready, startupError, user, signIn, signUp, signOut }),
    [ready, startupError, user, signIn, signUp, signOut],
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
