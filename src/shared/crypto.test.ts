/**
 * Cryptography Utilities Tests
 *
 * Adversarial test suite for AES-256-GCM authenticated encryption.
 * Focus: round-trip integrity, tamper detection (ciphertext + auth tag),
 * key handling, output shape, and the isEncrypted structural guard.
 *
 * Test Plan for src/shared/crypto.ts
 *
 * encrypt (Classification: pure logic / crypto)
 *   [x] Unhappy: key length 16 bytes -> throws "32 bytes"
 *   [x] Unhappy: key length 64 bytes -> throws "32 bytes"
 *   [x] Unhappy: empty plaintext -> throws "Plaintext cannot be empty"
 *   [x] Boundary: IV decodes to exactly 12 bytes
 *   [x] Boundary: auth tag decodes to exactly 16 bytes
 *   [x] Invariant: ciphertext/iv/authTag are valid base64
 *   [x] Security: same plaintext twice -> different IV (random IV per op)
 *   [x] Security: same plaintext twice -> different ciphertext
 *
 * decrypt (Classification: pure logic / crypto)
 *   [x] Happy: round-trip ASCII / unicode / long / whitespace (table)
 *   [x] Security: tampered ciphertext -> throws "Decryption failed"
 *   [x] Security: tampered auth tag -> throws "Decryption failed"
 *   [x] Security: wrong (but valid-length) key -> throws "Decryption failed"
 *   [x] Unhappy: wrong key length -> throws "32 bytes"
 *   [x] Unhappy: empty ciphertext / iv / authTag -> throws "required"
 *   [x] Boundary: bad IV length -> throws "Invalid IV length"
 *   [x] Boundary: bad auth tag length -> throws "Invalid auth tag length"
 *
 * isEncrypted (Classification: input parser / structural guard)
 *   [x] true/false matrix (table): valid JSON, partial, wrong types, non-JSON,
 *       null, number, array, empty string
 *
 * Property
 *   [x] decrypt(encrypt(p)) === p for arbitrary non-empty strings (table)
 */

import { describe, it, expect } from "vitest";
import { encrypt, decrypt, isEncrypted } from "./crypto.js";

// Fixed 32-byte keys for determinism (per test strategy).
const KEY = Buffer.alloc(32, 1);
const OTHER_KEY = Buffer.alloc(32, 2);

/** Flip the first byte of a base64-encoded buffer, returning re-encoded base64 of identical length. */
function tamperBase64(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  buf[0] = ((buf[0] ?? 0) ^ 0xff) & 0xff;
  return buf.toString("base64");
}

/** Encrypt then decrypt with the same key, returning the recovered plaintext. */
function roundTrip(plaintext: string, key: Buffer = KEY): string {
  const enc = encrypt(plaintext, key);
  return decrypt(enc.ciphertext, enc.iv, enc.authTag, key);
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

describe("encrypt", () => {
  it("should throw when the key is shorter than 32 bytes", () => {
    expect(() => encrypt("secret", Buffer.alloc(16))).toThrow("32 bytes");
  });

  it("should throw when the key is longer than 32 bytes", () => {
    expect(() => encrypt("secret", Buffer.alloc(64))).toThrow("32 bytes");
  });

  it("should throw on empty plaintext", () => {
    expect(() => encrypt("", KEY)).toThrow("Plaintext cannot be empty");
  });

  it("should produce an IV that decodes to exactly 12 bytes", () => {
    const enc = encrypt("secret", KEY);
    expect(Buffer.from(enc.iv, "base64").length).toBe(12);
  });

  it("should produce an auth tag that decodes to exactly 16 bytes", () => {
    const enc = encrypt("secret", KEY);
    expect(Buffer.from(enc.authTag, "base64").length).toBe(16);
  });

  it("should emit base64-encoded fields", () => {
    const enc = encrypt("secret", KEY);
    expect(BASE64_RE.test(enc.ciphertext)).toBe(true);
    expect(BASE64_RE.test(enc.iv)).toBe(true);
    expect(BASE64_RE.test(enc.authTag)).toBe(true);
  });

  it("should use a fresh random IV for each encryption of the same plaintext", () => {
    const a = encrypt("identical-plaintext", KEY);
    const b = encrypt("identical-plaintext", KEY);
    expect(a.iv).not.toBe(b.iv);
  });

  it("should produce different ciphertext for the same plaintext across encryptions", () => {
    const a = encrypt("identical-plaintext", KEY);
    const b = encrypt("identical-plaintext", KEY);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
});

describe("decrypt round-trip", () => {
  const cases: Array<{ name: string; plaintext: string }> = [
    { name: "ASCII", plaintext: "Space Mountain" },
    { name: "unicode and emoji", plaintext: "Cinderella Castle 🏰✨🎢" },
    { name: "long string", plaintext: "x".repeat(10_000) },
    { name: "whitespace only", plaintext: "   " },
    { name: "newlines and tabs", plaintext: "line1\nline2\tend" },
    { name: "json-like payload", plaintext: '{"token":"abc","exp":123}' },
  ];

  for (const { name, plaintext } of cases) {
    it(`should recover the original plaintext for ${name}`, () => {
      expect(roundTrip(plaintext)).toBe(plaintext);
    });
  }
});

describe("decrypt tamper detection", () => {
  it("should reject ciphertext whose body was modified", () => {
    const enc = encrypt("authentic-data", KEY);
    expect(() => decrypt(tamperBase64(enc.ciphertext), enc.iv, enc.authTag, KEY)).toThrow(
      "Decryption failed"
    );
  });

  it("should reject a modified authentication tag", () => {
    const enc = encrypt("authentic-data", KEY);
    expect(() => decrypt(enc.ciphertext, enc.iv, tamperBase64(enc.authTag), KEY)).toThrow(
      "Decryption failed"
    );
  });

  it("should reject decryption with the wrong key", () => {
    const enc = encrypt("authentic-data", KEY);
    expect(() => decrypt(enc.ciphertext, enc.iv, enc.authTag, OTHER_KEY)).toThrow(
      "Decryption failed"
    );
  });
});

describe("decrypt input validation", () => {
  it("should throw when the key is not 32 bytes", () => {
    const enc = encrypt("data", KEY);
    expect(() => decrypt(enc.ciphertext, enc.iv, enc.authTag, Buffer.alloc(16))).toThrow(
      "32 bytes"
    );
  });

  it("should throw when ciphertext is empty", () => {
    const enc = encrypt("data", KEY);
    expect(() => decrypt("", enc.iv, enc.authTag, KEY)).toThrow("required");
  });

  it("should throw when iv is empty", () => {
    const enc = encrypt("data", KEY);
    expect(() => decrypt(enc.ciphertext, "", enc.authTag, KEY)).toThrow("required");
  });

  it("should throw when authTag is empty", () => {
    const enc = encrypt("data", KEY);
    expect(() => decrypt(enc.ciphertext, enc.iv, "", KEY)).toThrow("required");
  });

  it("should reject an IV of the wrong length", () => {
    const enc = encrypt("data", KEY);
    const shortIv = Buffer.alloc(8).toString("base64");
    expect(() => decrypt(enc.ciphertext, shortIv, enc.authTag, KEY)).toThrow("Invalid IV length");
  });

  it("should reject an auth tag of the wrong length", () => {
    const enc = encrypt("data", KEY);
    const shortTag = Buffer.alloc(8).toString("base64");
    expect(() => decrypt(enc.ciphertext, enc.iv, shortTag, KEY)).toThrow("Invalid auth tag length");
  });
});

describe("isEncrypted", () => {
  const cases: Array<{ name: string; input: string; expected: boolean }> = [
    {
      name: "hand-built EncryptedData JSON",
      input: JSON.stringify({ ciphertext: "a", iv: "b", authTag: "c" }),
      expected: true,
    },
    { name: "plain string", input: "hello", expected: false },
    { name: "missing authTag field", input: '{"ciphertext":"a","iv":"b"}', expected: false },
    {
      name: "non-string field types",
      input: '{"ciphertext":123,"iv":"b","authTag":"c"}',
      expected: false,
    },
    { name: "non-JSON garbage", input: "not json {", expected: false },
    { name: "JSON null", input: "null", expected: false },
    { name: "JSON number", input: "42", expected: false },
    { name: "JSON array", input: "[]", expected: false },
    { name: "empty string", input: "", expected: false },
  ];

  for (const { name, input, expected } of cases) {
    it(`should return ${String(expected)} for ${name}`, () => {
      expect(isEncrypted(input)).toBe(expected);
    });
  }

  it("should return true for the output of encrypt serialized as JSON", () => {
    const serialized = JSON.stringify(encrypt("real-payload", KEY));
    expect(isEncrypted(serialized)).toBe(true);
  });
});

describe("property: encrypt/decrypt round-trip", () => {
  const samples = [
    "a",
    "Mickey",
    "🏰",
    " leading and trailing ",
    "mixed 123 ABC !@#$%^&*()",
    "λ-calculus ∑∏√",
    "z".repeat(5_000),
  ];

  for (const sample of samples) {
    it(`should hold for sample: ${JSON.stringify(sample.slice(0, 24))}`, () => {
      expect(roundTrip(sample)).toBe(sample);
    });
  }
});
