/**
 * Configuration Validation Tests
 *
 * Adversarial test suite for OpenAI API key validation and masking.
 * Security focus: rejection messages must NEVER leak the raw key, and
 * maskApiKey must never echo the full secret.
 *
 * Test Plan for src/config/validation.ts
 *
 * validateOpenAIKey (Classification: input parser + PII)
 *   [x] Happy: valid "sk-" key (>=20 chars) -> no throw
 *   [x] Happy: valid "sk-proj-" key (>=20 chars) -> no throw
 *   [x] Unhappy: empty string -> throws "empty"
 *   [x] Unhappy: whitespace-only -> throws "empty"
 *   [x] Security: wrong prefix -> throws AND message excludes the raw key (masked)
 *   [x] Unhappy: correct prefix but < 20 chars -> throws "too short"
 *   [x] Security: too-short message does not leak the raw key
 *   [x] Boundary: exactly 20 chars -> accepted; 19 chars -> rejected
 *
 * maskApiKey (Classification: data transformer + PII)
 *   [x] Happy: long key -> "<first3>...<last4>"
 *   [x] Boundary: < 8 chars -> "***"
 *   [x] Boundary: exactly 8 chars -> masked, not "***"
 *   [x] Unhappy: empty string -> "***"
 *   [x] Security: never returns the full key (raw not a substring of output)
 *
 * validateOpenAIKeyIfProvided (Classification: input parser)
 *   [x] undefined -> no throw
 *   [x] empty string -> no throw (treated as not provided)
 *   [x] valid provided -> no throw
 *   [x] invalid provided -> throws
 */

import { describe, it, expect } from "vitest";
import { validateOpenAIKey, maskApiKey, validateOpenAIKeyIfProvided } from "./validation.js";

describe("validateOpenAIKey", () => {
  it("should accept a valid standard sk- key", () => {
    expect(() => {
      validateOpenAIKey("sk-" + "a".repeat(20));
    }).not.toThrow();
  });

  it("should accept a valid project-scoped sk-proj- key", () => {
    expect(() => {
      validateOpenAIKey("sk-proj-" + "b".repeat(20));
    }).not.toThrow();
  });

  it("should reject an empty key", () => {
    expect(() => {
      validateOpenAIKey("");
    }).toThrow("empty");
  });

  it("should reject a whitespace-only key", () => {
    expect(() => {
      validateOpenAIKey("    ");
    }).toThrow("empty");
  });

  it("should reject a key with the wrong prefix", () => {
    expect(() => {
      validateOpenAIKey("pk-1234567890abcdefghij");
    }).toThrow('must start with "sk-"');
  });

  it("should mask the raw key in the wrong-prefix error message", () => {
    const rawKey = "invalid-key-1234567890abcdef";
    let message = "";
    try {
      validateOpenAIKey(rawKey);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(rawKey);
  });

  it("should not leak the secret middle of the key in the wrong-prefix message", () => {
    let message = "";
    try {
      validateOpenAIKey("invalid-key-1234567890abcdef");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("1234567890");
  });

  it("should reject a correctly-prefixed key that is too short", () => {
    expect(() => {
      validateOpenAIKey("sk-short");
    }).toThrow("too short");
  });

  it("should not leak the raw key in the too-short error message", () => {
    const rawKey = "sk-secretvalue";
    let message = "";
    try {
      validateOpenAIKey(rawKey);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(rawKey);
  });

  it("should accept a key of exactly the minimum length (20 chars)", () => {
    const key = "sk-" + "c".repeat(17); // 3 + 17 = 20
    expect(key.length).toBe(20);
    expect(() => {
      validateOpenAIKey(key);
    }).not.toThrow();
  });

  it("should reject a key one character below the minimum length (19 chars)", () => {
    const key = "sk-" + "c".repeat(16); // 3 + 16 = 19
    expect(key.length).toBe(19);
    expect(() => {
      validateOpenAIKey(key);
    }).toThrow("too short");
  });
});

describe("maskApiKey", () => {
  it("should mask a long key as first-3 + ellipsis + last-4", () => {
    expect(maskApiKey("sk-proj-abcdefghij1234")).toBe("sk-...1234");
  });

  it("should return *** for a key shorter than 8 characters", () => {
    expect(maskApiKey("sk-1234")).toBe("***");
  });

  it("should mask (not fully redact) a key of exactly 8 characters", () => {
    expect(maskApiKey("sk-12345")).toBe("sk-...2345");
  });

  it("should return *** for an empty string", () => {
    expect(maskApiKey("")).toBe("***");
  });

  it("should never echo the full key in the masked output", () => {
    const rawKey = "sk-proj-supersecretkeyvalue1234567890";
    const masked = maskApiKey(rawKey);
    expect(masked).not.toContain(rawKey);
  });

  it("should not leak the secret interior of the key", () => {
    const masked = maskApiKey("sk-proj-supersecretkeyvalue1234567890");
    expect(masked).not.toContain("supersecret");
  });
});

describe("validateOpenAIKeyIfProvided", () => {
  it("should not throw when the key is undefined", () => {
    expect(() => {
      validateOpenAIKeyIfProvided(undefined);
    }).not.toThrow();
  });

  it("should not throw for an empty string (treated as not provided)", () => {
    expect(() => {
      validateOpenAIKeyIfProvided("");
    }).not.toThrow();
  });

  it("should not throw for a valid provided key", () => {
    expect(() => {
      validateOpenAIKeyIfProvided("sk-" + "d".repeat(20));
    }).not.toThrow();
  });

  it("should throw for a provided but invalid key", () => {
    expect(() => {
      validateOpenAIKeyIfProvided("not-a-valid-key");
    }).toThrow();
  });
});
