/**
 * Supabase-compatible storage for size-limited key/value backends.
 *
 * `expo-secure-store` rejects values over roughly 2 KB, while a Supabase session
 * (access token + refresh token + user metadata) can exceed that. This factory
 * splits a value into numbered chunks and commits them with a manifest written
 * last, so an interrupted write never destroys the previously stored value:
 *
 *   <prefix><key>.manifest      {"version":1,"generation":3,"chunks":2}
 *   <prefix><key>.3.0           first chunk
 *   <prefix><key>.3.1           second chunk
 *
 * `generation` changes on every write; a reader only trusts the chunks that the
 * committed manifest names. The backend is injected so this stays a pure,
 * unit-testable module — the mobile app passes `expo-secure-store`.
 */

export interface StorageBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export interface ChunkedStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ChunkedStorageOptions {
  /** Every backend key this storage touches starts with this prefix. */
  keyPrefix: string;
  /** Maximum characters per chunk. SecureStore's limit is about 2048 bytes. */
  chunkSize?: number;
  /** Values larger than `chunkSize * maxChunks` are refused. */
  maxChunks?: number;
}

interface Manifest {
  version: 1;
  generation: number;
  chunks: number;
}

const MANIFEST_VERSION = 1;
const DEFAULT_CHUNK_SIZE = 1800;
const DEFAULT_MAX_CHUNKS = 8;

export function createChunkedStorage(
  backend: StorageBackend,
  options: ChunkedStorageOptions,
): ChunkedStorage {
  const { keyPrefix } = options;
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;

  const manifestKey = (key: string) => `${keyPrefix}${key}.manifest`;
  const chunkKey = (key: string, generation: number, index: number) =>
    `${keyPrefix}${key}.${generation}.${index}`;

  function parseManifest(raw: string | null): Manifest | null {
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { version, generation, chunks } = parsed as Record<string, unknown>;
    if (version !== MANIFEST_VERSION) return null;
    if (typeof generation !== 'number' || !Number.isInteger(generation) || generation < 0) {
      return null;
    }
    if (
      typeof chunks !== 'number' ||
      !Number.isInteger(chunks) ||
      chunks < 1 ||
      chunks > maxChunks
    ) {
      return null;
    }
    return { version: MANIFEST_VERSION, generation, chunks };
  }

  async function deleteChunks(key: string, manifest: Manifest): Promise<void> {
    for (let index = 0; index < manifest.chunks; index += 1) {
      await backend.deleteItem(chunkKey(key, manifest.generation, index));
    }
  }

  /**
   * Drops the manifest first: once it is gone the value can never be read
   * again, so an interruption here fails closed. Chunk deletion is cleanup.
   */
  async function clear(key: string, manifest: Manifest | null): Promise<void> {
    await backend.deleteItem(manifestKey(key));
    if (!manifest) return;
    try {
      await deleteChunks(key, manifest);
    } catch {
      // The manifest is gone; orphaned chunks are unreadable garbage.
    }
  }

  // Supabase Auth can overlap writes (token refresh vs re-auth vs sign-in).
  // Serializing every operation per key keeps two writers from computing the
  // same generation and mixing their chunks (review finding).
  const queues = new Map<string, Promise<void>>();

  function withKeyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    const guard = next.then(
      () => undefined,
      () => undefined,
    );
    queues.set(key, guard);
    void guard.then(() => {
      if (queues.get(key) === guard) queues.delete(key);
    });
    return next;
  }

  return {
    getItem(key) {
      return withKeyLock(key, async () => {
        const rawManifest = await backend.getItem(manifestKey(key));
        const manifest = parseManifest(rawManifest);
        if (!manifest) {
          // A manifest we cannot trust means no session, never a half-session.
          // (Chunks of an unparseable manifest cannot be enumerated; the next
          // write overwrites the manifest and new generations ignore them.)
          if (rawManifest !== null) await clear(key, null);
          return null;
        }

        const parts: string[] = [];
        for (let index = 0; index < manifest.chunks; index += 1) {
          const part = await backend.getItem(chunkKey(key, manifest.generation, index));
          if (part === null) {
            await clear(key, manifest);
            return null;
          }
          parts.push(part);
        }
        return parts.join('');
      });
    },

    setItem(key, value) {
      return withKeyLock(key, async () => {
        const previous = parseManifest(await backend.getItem(manifestKey(key)));
        const generation = (previous?.generation ?? 0) + 1;

        const chunks: string[] = [];
        for (let start = 0; start < Math.max(value.length, 1); start += chunkSize) {
          chunks.push(value.slice(start, start + chunkSize));
        }
        if (chunks.length > maxChunks) {
          throw new Error(
            `Value for "${key}" needs ${chunks.length} chunks; the limit is ${maxChunks}.`,
          );
        }

        // Chunks first, manifest last: if this throws midway, the previous
        // generation's manifest and chunks are still intact.
        for (let index = 0; index < chunks.length; index += 1) {
          await backend.setItem(chunkKey(key, generation, index), chunks[index]!);
        }
        await backend.setItem(
          manifestKey(key),
          JSON.stringify({
            version: MANIFEST_VERSION,
            generation,
            chunks: chunks.length,
          }),
        );

        // Commit point passed; the old generation is unreachable garbage.
        // Deleting it is cleanup and must not fail the write.
        if (previous) {
          try {
            await deleteChunks(key, previous);
          } catch {
            // Orphaned chunks are retried on the next write; the value is safe.
          }
        }
      });
    },

    removeItem(key) {
      return withKeyLock(key, async () => {
        await clear(key, parseManifest(await backend.getItem(manifestKey(key))));
      });
    },
  };
}
