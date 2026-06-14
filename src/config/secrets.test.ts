/**
 * Secrets Management Tests
 *
 * Test suite for PBKDF2 key derivation and encryption-key lifecycle.
 * Determinism: env var saved/restored and the cached key reset around every test.
 *
 * Test Plan for src/config/secrets.ts
 *
 * getEncryptionKey (Classification: configuration + crypto)
 *   [x] Happy: env set -> returns a 32-byte Buffer
 *   [x] Invariant: PBKDF2 of same env input is deterministic across calls
 *   [x] Behavioral: result is cached (second call === first reference)
 *   [x] Fallback: no env -> still returns a 32-byte Buffer (ephemeral)
 *   [x] Security: ephemeral key differs from an env-derived key
 *   [x] Invariant: different env values derive different keys
 *
 * isEncryptionKeyConfigured (Classification: configuration)
 *   [x] env set -> true
 *   [x] env unset -> false
 *   [x] env set to empty string -> true (documents the !== undefined contract)
 *
 * generateEncryptionKey (Classification: data transformer)
 *   [x] returns a 64-char lowercase-hex string (32 bytes)
 *   [x] unique across calls
 *
 * Integration with crypto
 *   [x] decrypt(encrypt(p, key), key) round-trips with a getEncryptionKey() key
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getEncryptionKey,
  resetEncryptionKey,
  isEncryptionKeyConfigured,
  generateEncryptionKey,
} from "./secrets.js";
import { encrypt, decrypt } from "../shared/crypto.js";

const ENV_VAR = "MOUSE_MCP_ENCRYPTION_KEY";

let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env[ENV_VAR];
  resetEncryptionKey();
});

afterEach(() => {
  if (savedKey === undefined) {
    delete process.env[ENV_VAR];
  } else {
    process.env[ENV_VAR] = savedKey;
  }
  resetEncryptionKey();
});

describe("getEncryptionKey", () => {
  it("should return a 32-byte buffer when the env key is set", () => {
    process.env[ENV_VAR] = "a-persistent-secret-key";
    expect(getEncryptionKey().length).toBe(32);
  });

  it("should derive the same key deterministically from the same env input", () => {
    process.env[ENV_VAR] = "a-persistent-secret-key";
    const first = getEncryptionKey();
    resetEncryptionKey();
    const second = getEncryptionKey();
    expect(first.equals(second)).toBe(true);
  });

  it("should cache the derived key and return the same reference within a session", () => {
    process.env[ENV_VAR] = "a-persistent-secret-key";
    const first = getEncryptionKey();
    const second = getEncryptionKey();
    expect(second).toBe(first);
  });

  it("should return a 32-byte buffer on the ephemeral path when no env key is set", () => {
    delete process.env[ENV_VAR];
    expect(getEncryptionKey().length).toBe(32);
  });

  it("should derive an ephemeral key that differs from an env-derived key", () => {
    delete process.env[ENV_VAR];
    const ephemeral = getEncryptionKey();
    resetEncryptionKey();
    process.env[ENV_VAR] = "a-persistent-secret-key";
    const derived = getEncryptionKey();
    expect(ephemeral.equals(derived)).toBe(false);
  });

  it("should derive different keys from different env values", () => {
    process.env[ENV_VAR] = "secret-one";
    const keyOne = getEncryptionKey();
    resetEncryptionKey();
    process.env[ENV_VAR] = "secret-two";
    const keyTwo = getEncryptionKey();
    expect(keyOne.equals(keyTwo)).toBe(false);
  });
});

describe("isEncryptionKeyConfigured", () => {
  it("should return true when the env key is set", () => {
    process.env[ENV_VAR] = "some-key";
    expect(isEncryptionKeyConfigured()).toBe(true);
  });

  it("should return false when the env key is unset", () => {
    delete process.env[ENV_VAR];
    expect(isEncryptionKeyConfigured()).toBe(false);
  });

  it("should return true when the env key is set to an empty string", () => {
    process.env[ENV_VAR] = "";
    expect(isEncryptionKeyConfigured()).toBe(true);
  });
});

describe("generateEncryptionKey", () => {
  it("should return a 64-character lowercase-hex string (32 bytes)", () => {
    expect(generateEncryptionKey()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should produce a unique value on each call", () => {
    expect(generateEncryptionKey()).not.toBe(generateEncryptionKey());
  });
});

describe("integration with crypto", () => {
  it("should round-trip an encrypted payload using a getEncryptionKey() key", () => {
    process.env[ENV_VAR] = "integration-secret-key";
    const key = getEncryptionKey();
    const plaintext = "session-token: mickey-🏰-12345";

    const enc = encrypt(plaintext, key);
    const recovered = decrypt(enc.ciphertext, enc.iv, enc.authTag, key);

    expect(recovered).toBe(plaintext);
  });
});
