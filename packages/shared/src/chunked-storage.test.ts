import { describe, expect, it } from 'vitest';

import { createChunkedStorage, type StorageBackend } from './chunked-storage';

class MemoryBackend implements StorageBackend {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

/** Fails writes after `allowedWrites`, simulating an app killed mid-write. */
class InterruptingBackend implements StorageBackend {
  private writes = 0;

  constructor(
    private readonly inner: MemoryBackend,
    private readonly allowedWrites: number,
  ) {}

  async getItem(key: string): Promise<string | null> {
    return this.inner.getItem(key);
  }

  async deleteItem(key: string): Promise<void> {
    await this.inner.deleteItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes += 1;
    if (this.writes > this.allowedWrites) throw new Error('simulated interruption');
    await this.inner.setItem(key, value);
  }
}

function keys(backend: MemoryBackend, prefix: string): string[] {
  return [...backend.values.keys()].filter((key) => key.startsWith(prefix)).sort();
}

/** Yields to the microtask queue so overlapping calls interleave unless serialized. */
const tick = () => Promise.resolve();

/** Every operation yields, so overlapping calls interleave unless serialized. */
class DelayedBackend implements StorageBackend {
  constructor(private readonly inner: MemoryBackend) {}

  async getItem(key: string): Promise<string | null> {
    await tick();
    return this.inner.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await tick();
    await this.inner.setItem(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    await tick();
    await this.inner.deleteItem(key);
  }
}

const PREFIX = 'demo.auth.';
const options = { keyPrefix: PREFIX, chunkSize: 100, maxChunks: 64 };

describe('createChunkedStorage', () => {
  it('round-trips a value that fits in one chunk', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);

    await storage.setItem('session', 'small value');
    expect(await storage.getItem('session')).toBe('small value');
  });

  it('round-trips a value larger than one chunk without oversized writes', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);
    const value = 'x'.repeat(950);

    await storage.setItem('session', value);

    expect(await storage.getItem('session')).toBe(value);
    const chunkValues = keys(backend, PREFIX)
      .filter((key) => !key.endsWith('.manifest'))
      .map((key) => backend.values.get(key)!);
    expect(chunkValues).toHaveLength(10);
    for (const chunk of chunkValues) expect(chunk.length).toBeLessThanOrEqual(100);
  });

  it('round-trips an empty value', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);

    await storage.setItem('session', '');
    expect(await storage.getItem('session')).toBe('');
  });

  it('cleans up the previous chunks when a shorter value is written', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);

    await storage.setItem('session', 'x'.repeat(950));
    await storage.setItem('session', 'short');

    expect(await storage.getItem('session')).toBe('short');
    const chunks = keys(backend, PREFIX).filter((key) => !key.endsWith('.manifest'));
    expect(chunks).toHaveLength(1);
  });

  it('reports no value when the manifest is missing or corrupt', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);

    expect(await storage.getItem('session')).toBeNull();

    await backend.setItem(`${PREFIX}session.manifest`, '{not json');
    expect(await storage.getItem('session')).toBeNull();
    expect(keys(backend, PREFIX)).toHaveLength(0);
  });

  it('treats an unknown manifest version as corrupt', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);

    await backend.setItem(
      `${PREFIX}session.manifest`,
      JSON.stringify({ version: 99, generation: 0, chunks: 1 }),
    );
    expect(await storage.getItem('session')).toBeNull();
    expect(keys(backend, PREFIX)).toHaveLength(0);
  });

  it('treats a missing chunk as corrupt and cleans up', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);

    await storage.setItem('session', 'x'.repeat(250));
    await backend.deleteItem(`${PREFIX}session.1.1`);

    expect(await storage.getItem('session')).toBeNull();
    expect(keys(backend, PREFIX)).toHaveLength(0);
  });

  it('keeps the previous value readable when a write is interrupted', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);
    await storage.setItem('session', 'value one');

    // The next write may create its first chunk but never commit: simulate
    // failing on the manifest write.
    const interrupted = createChunkedStorage(new InterruptingBackend(backend, 1), options);
    await expect(interrupted.setItem('session', 'x'.repeat(300))).rejects.toThrow(
      'simulated interruption',
    );

    const reader = createChunkedStorage(backend, options);
    expect(await reader.getItem('session')).toBe('value one');
  });

  it('refuses values larger than the configured maximum', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, { ...options, maxChunks: 2 });

    await expect(storage.setItem('session', 'x'.repeat(201))).rejects.toThrow('the limit is 2');
  });

  it('serializes overlapping writes so the last value wins intact', async () => {
    const inner = new MemoryBackend();
    const storage = createChunkedStorage(new DelayedBackend(inner), options);
    const first = 'a'.repeat(250);
    const second = 'b'.repeat(350);

    // Supabase Auth overlaps writes (token refresh vs re-auth). Both start
    // before either finishes; the storage must run them one at a time.
    await Promise.all([storage.setItem('session', first), storage.setItem('session', second)]);

    expect(await storage.getItem('session')).toBe(second);
    const manifest = JSON.parse(inner.values.get(`${PREFIX}session.manifest`)!) as {
      generation: number;
      chunks: number;
    };
    expect(manifest.generation).toBe(2);
    expect(manifest.chunks).toBe(4);
    expect(keys(inner, PREFIX)).toHaveLength(1 + 4);
  });

  it('removes the manifest and every chunk', async () => {
    const backend = new MemoryBackend();
    const storage = createChunkedStorage(backend, options);

    await storage.setItem('session', 'x'.repeat(250));
    await storage.removeItem('session');

    expect(await storage.getItem('session')).toBeNull();
    expect(keys(backend, PREFIX)).toHaveLength(0);
  });
});
