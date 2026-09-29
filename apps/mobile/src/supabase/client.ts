import { createChunkedStorage } from '@eldercare/shared';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/**
 * The Supabase client for the mobile app.
 *
 * Only `EXPO_PUBLIC_` values are read here; they are public by definition
 * (`docs/01-dev-environment.md` section 8.1). The service-role key never leaves
 * the server and must never appear in this app.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function findConfigError(url: string, anonKey: string): string | null {
  if (!url || !anonKey) {
    return 'This build is not connected to a server. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then rebuild.';
  }
  if (!/^https?:\/\//.test(url)) {
    return 'EXPO_PUBLIC_SUPABASE_URL must be an http(s) address.';
  }
  return null;
}

/**
 * Non-null when the build has no usable server configuration. The auth provider
 * shows this instead of letting every request fail later.
 */
export const supabaseConfigError: string | null = findConfigError(SUPABASE_URL, SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseConfigError) throw new Error(supabaseConfigError);

  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // A session can exceed SecureStore's ~2 KB value limit, so it is chunked.
      storage: createChunkedStorage(
        {
          getItem: (key) => SecureStore.getItemAsync(key),
          setItem: (key, value) => SecureStore.setItemAsync(key, value),
          deleteItem: (key) => SecureStore.deleteItemAsync(key),
        },
        { keyPrefix: 'eldercare.auth.' },
      ),
      storageKey: 'session',
      persistSession: true,
      autoRefreshToken: true,
      // Native apps have no auth redirect URL to detect (docs, contract 2).
      detectSessionInUrl: false,
    },
  });

  return client;
}
