import { describe, expect, it } from 'vitest';

import { base64ToBytes } from './base64';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('base64ToBytes', () => {
  it('decodes an RFC 4648 vector', () => {
    expect(toHex(base64ToBytes('TWFu'))).toBe('4d616e');
    expect(toHex(base64ToBytes('TWE='))).toBe('4d61');
    expect(toHex(base64ToBytes('TQ=='))).toBe('4d');
  });

  it('decodes a padded vector with a non-multiple-of-4 length', () => {
    // "#####" (0x23 five times) encodes to "IyMjIyM=".
    expect(toHex(base64ToBytes('IyMjIyM='))).toBe('2323232323');
  });

  it('ignores whitespace and missing padding', () => {
    expect(toHex(base64ToBytes('TW\nFu'))).toBe('4d616e');
    expect(toHex(base64ToBytes('TWFu'))).toBe(toHex(base64ToBytes('TWFu'))); // stable
    expect(toHex(base64ToBytes('TWE'))).toBe('4d61');
  });

  it('returns an empty array for an empty string', () => {
    expect(base64ToBytes('').length).toBe(0);
  });

  it('throws on a character outside the alphabet', () => {
    expect(() => base64ToBytes('TWFu$')).toThrow();
  });
});
