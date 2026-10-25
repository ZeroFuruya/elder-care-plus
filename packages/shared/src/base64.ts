/**
 * A dependency-free base64 decoder.
 *
 * React Native builds do not reliably expose `atob`, so the photo upload path decodes the
 * picker's `base64` string here instead of trusting a global. Pure and synchronous, which keeps
 * it identical on every platform and easy to test.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let index = 0; index < ALPHABET.length; index += 1) {
    table[ALPHABET.charAt(index)] = index;
  }
  return table;
})();

/**
 * Decodes a standard (not URL-safe) base64 string to bytes. Whitespace is ignored and missing
 * padding is tolerated. Throws on any character outside the alphabet so a corrupt payload fails
 * loudly rather than uploading garbage.
 */
export function base64ToBytes(value: string): Uint8Array {
  const cleaned = value.replace(/\s+/g, '');
  const unpadded = cleaned.replace(/=+$/, '');

  const byteLength = Math.floor((unpadded.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let accumulator = 0;
  let accumulatedBits = 0;
  let offset = 0;

  for (let index = 0; index < unpadded.length; index += 1) {
    const char = unpadded.charAt(index);
    const digit = LOOKUP[char];
    if (digit === undefined) {
      throw new Error('Invalid base64 input.');
    }
    accumulator = (accumulator << 6) | digit;
    accumulatedBits += 6;
    if (accumulatedBits >= 8) {
      accumulatedBits -= 8;
      bytes[offset] = (accumulator >> accumulatedBits) & 0xff;
      offset += 1;
    }
  }

  return bytes;
}
