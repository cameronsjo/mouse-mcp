/**
 * JWT Validator Tests (Cluster C — Auth flow, CRITICAL)
 *
 * Adversarial coverage of the server's signature trust boundary. The JWKS
 * client is mocked so `getKey(kid)` returns a real RSA public JWK; the validator
 * builds the verification key from that JWK and verifies signatures we produce
 * with the matching private key. Negative tests cover alg-confusion, signature
 * skip/tamper, issuer/audience confusion, and expiry/nbf with clock tolerance.
 *
 * Test Plan
 *   JWTValidator.validate (Classification: input parser + signature verify)
 *     [x] Happy: well-formed RS256 token -> {claims, scopes, subject, clientId}
 *     [x] Structure: not 3 parts / empty segment / >3 parts -> invalid_format
 *     [x] Structure: non-base64url JSON header / payload -> invalid_format
 *     [x] Structure: header decodes to non-object -> invalid_format
 *     [x] Algorithm: alg:"none" -> rejected; unsupported (HS256) -> rejected
 *     [x] Algorithm: missing kid -> invalid_format
 *     [x] Key: kid not in JWKS -> invalid_signature
 *     [x] Signature: tampered payload / forged signature -> invalid_signature
 *     [x] Claims: wrong issuer -> invalid_issuer
 *     [x] Claims: audience mismatch (string & array aud) -> invalid_audience
 *     [x] Claims: expired beyond tolerance -> expired; within tolerance -> passes
 *     [x] Claims: nbf in future beyond tolerance -> expired; within -> passes
 *     [x] parseScopes: filters to SUPPORTED_SCOPES; unknown dropped; empty -> []
 *   hasRequiredScopes / hasAnyScope (Classification: pure logic)
 *     [x] every / any semantics, empty-required, superset, disjoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateTestKey,
  generateTestKeyEc,
  makeToken,
  tamperPayload,
  encodeSegment,
} from "./__test-helpers__/jwt.js";
import { type AuthServerConfig } from "./types.js";

// Silence the structured logger (file + stderr writes) during tests.
vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Inject a controllable JWKS key lookup.
const { mockGetKey } = vi.hoisted(() => ({ mockGetKey: vi.fn() }));
vi.mock("./jwks.js", () => ({
  getJWKSClient: () => ({ getKey: mockGetKey }),
  clearAllJWKSCaches: vi.fn(),
}));

import { JWTValidator, hasRequiredScopes, hasAnyScope } from "./jwt-validator.js";

const ISSUER = "https://auth.example.com";
const AUDIENCE = "https://mcp.example.com";
const JWKS_URI = "https://auth.example.com/.well-known/jwks.json";
const KID = "test-key-1";

const config: AuthServerConfig = {
  issuer: ISSUER,
  jwksUri: JWKS_URI,
  audience: AUDIENCE,
};

// Fixed clock so exp/iat/nbf math is deterministic.
const FIXED_NOW = new Date("2026-01-01T00:00:00Z");
const NOW_SEC = Math.floor(FIXED_NOW.getTime() / 1000);

const keyMaterial = generateTestKey(KID);

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: ISSUER,
    sub: "user-123",
    aud: AUDIENCE,
    exp: NOW_SEC + 3600,
    iat: NOW_SEC - 10,
    ...overrides,
  };
}

function signValid(claims: Record<string, unknown>): string {
  return makeToken(claims, { kid: KID, privateKey: keyMaterial.privateKey });
}

describe("JWTValidator.validate", () => {
  let validator: JWTValidator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockGetKey.mockReset();
    mockGetKey.mockResolvedValue(keyMaterial.jwk);
    validator = new JWTValidator(config);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("happy path", () => {
    it("returns claims, scopes, subject, and clientId for a well-formed RS256 token", async () => {
      const token = signValid(
        validClaims({ scope: "disney:read disney:sync", client_id: "cli-9" })
      );

      const result = await validator.validate(token);

      expect(result).toEqual({
        claims: expect.objectContaining({ iss: ISSUER, sub: "user-123", aud: AUDIENCE }),
        scopes: ["disney:read", "disney:sync"],
        subject: "user-123",
        clientId: "cli-9",
      });
    });

    it("passes the kid from the header to the JWKS client", async () => {
      const token = signValid(validClaims());

      await validator.validate(token);

      expect(mockGetKey).toHaveBeenCalledWith(KID);
    });
  });

  describe("structure", () => {
    it("rejects a token without three parts as invalid_format", async () => {
      await expect(validator.validate("only.two")).rejects.toMatchObject({
        type: "invalid_format",
      });
    });

    it("rejects a token with more than three parts as invalid_format", async () => {
      await expect(validator.validate("a.b.c.d")).rejects.toMatchObject({
        type: "invalid_format",
      });
    });

    it("rejects a token with an empty signature segment as invalid_format", async () => {
      const token = makeToken(validClaims(), { kid: KID }); // unsigned -> empty 3rd segment

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_format" });
    });

    it("rejects a header that is not valid base64url JSON as invalid_format", async () => {
      const token = makeToken(validClaims(), {
        rawHeaderB64: encodeSegment("{not json"),
        signatureOverride: "x",
      });

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_format" });
    });

    it("rejects a header that decodes to a non-object as invalid_format", async () => {
      const token = makeToken(validClaims(), {
        rawHeaderB64: encodeSegment("123"),
        signatureOverride: "x",
      });

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_format" });
    });

    it("rejects a payload that is not valid base64url JSON as invalid_format", async () => {
      // Signed over the bad payload so signature verification passes and decode fails.
      const token = makeToken(validClaims(), {
        kid: KID,
        privateKey: keyMaterial.privateKey,
        rawPayloadB64: encodeSegment("not json"),
      });

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_format" });
    });
  });

  describe("algorithm", () => {
    it('rejects an alg:"none" token (signature-stripping attack)', async () => {
      const token = makeToken(validClaims(), {
        alg: "none",
        kid: KID,
        signatureOverride: "c2lnbmF0dXJl",
      });

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_format" });
    });

    it("rejects an unsupported symmetric algorithm (HS256, alg-confusion attack)", async () => {
      const token = makeToken(validClaims(), {
        alg: "HS256",
        kid: KID,
        signatureOverride: "c2lnbmF0dXJl",
      });

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_format" });
    });

    it("rejects a token whose header omits kid as invalid_format", async () => {
      const token = makeToken(validClaims(), { privateKey: keyMaterial.privateKey }); // no kid

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_format" });
    });

    it("does not consult the JWKS when the algorithm is rejected", async () => {
      const token = makeToken(validClaims(), {
        alg: "none",
        kid: KID,
        signatureOverride: "x",
      });

      await validator.validate(token).catch(() => undefined);

      expect(mockGetKey).not.toHaveBeenCalled();
    });
  });

  describe("signing key", () => {
    it("rejects a kid that is absent from the JWKS as invalid_signature", async () => {
      mockGetKey.mockResolvedValue(null);
      const token = signValid(validClaims());

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_signature" });
    });
  });

  describe("signature verification", () => {
    it("rejects a token whose payload was tampered after signing as invalid_signature", async () => {
      const token = tamperPayload(signValid(validClaims()), validClaims({ sub: "attacker" }));

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_signature" });
    });

    it("rejects a token with a forged signature as invalid_signature", async () => {
      const token = makeToken(validClaims(), {
        kid: KID,
        signatureOverride: encodeSegment("forged-signature-bytes"),
      });

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_signature" });
    });

    it("rejects a token signed by a different key as invalid_signature", async () => {
      const attackerKey = generateTestKey(KID);
      const token = makeToken(validClaims(), { kid: KID, privateKey: attackerKey.privateKey });

      // JWKS still returns the legitimate public key.
      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_signature" });
    });
  });

  describe("claims", () => {
    it("rejects a token with the wrong issuer as invalid_issuer", async () => {
      const token = signValid(validClaims({ iss: "https://evil.example.com" }));

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_issuer" });
    });

    it("rejects a token whose string audience does not match as invalid_audience", async () => {
      const token = signValid(validClaims({ aud: "https://other-resource.example.com" }));

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_audience" });
    });

    it("rejects a token whose array audience excludes this resource as invalid_audience", async () => {
      const token = signValid(
        validClaims({ aud: ["https://a.example.com", "https://b.example.com"] })
      );

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_audience" });
    });

    it("accepts a token whose array audience includes this resource", async () => {
      const token = signValid(validClaims({ aud: ["https://other.example.com", AUDIENCE] }));

      const result = await validator.validate(token);

      expect(result.subject).toBe("user-123");
    });

    it("rejects a token expired beyond the clock tolerance as expired", async () => {
      const token = signValid(validClaims({ exp: NOW_SEC - 120 }));

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "expired" });
    });

    it("accepts a token expired within the clock tolerance window", async () => {
      // Expired 30s ago, default tolerance is 60s -> still valid.
      const token = signValid(validClaims({ exp: NOW_SEC - 30 }));

      const result = await validator.validate(token);

      expect(result.subject).toBe("user-123");
    });

    it("rejects a token whose nbf is in the future beyond tolerance as expired", async () => {
      const token = signValid(validClaims({ nbf: NOW_SEC + 120 }));

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "expired" });
    });

    it("accepts a token whose nbf is within the clock tolerance window", async () => {
      const token = signValid(validClaims({ nbf: NOW_SEC + 30 }));

      const result = await validator.validate(token);

      expect(result.subject).toBe("user-123");
    });
  });

  describe("scope parsing", () => {
    it("filters the scope claim down to supported scopes and drops unknown ones", async () => {
      const token = signValid(validClaims({ scope: "disney:read unknown:scope disney:admin" }));

      const result = await validator.validate(token);

      expect(result.scopes).toEqual(["disney:read", "disney:admin"]);
    });

    it("returns an empty scope list when the scope claim is absent", async () => {
      const token = signValid(validClaims());

      const result = await validator.validate(token);

      expect(result.scopes).toEqual([]);
    });
  });

  describe("EC algorithm (ES256)", () => {
    // Regression cover: JWS EC signatures are raw IEEE-P1363 (r‖s), not DER. A valid
    // ES256 token must verify — previously every EC token was rejected.
    it("accepts a well-formed ES256 token signed with a P-256 key", async () => {
      const ecKey = generateTestKeyEc(KID);
      mockGetKey.mockResolvedValue(ecKey.jwk);
      const token = makeToken(validClaims({ scope: "disney:read" }), {
        kid: KID,
        privateKey: ecKey.privateKey,
        alg: "ES256",
      });

      const result = await validator.validate(token);

      expect(result.subject).toBe("user-123");
      expect(result.scopes).toEqual(["disney:read"]);
    });

    it("rejects an ES256 token whose payload was tampered after signing", async () => {
      const ecKey = generateTestKeyEc(KID);
      mockGetKey.mockResolvedValue(ecKey.jwk);
      const valid = makeToken(validClaims(), {
        kid: KID,
        privateKey: ecKey.privateKey,
        alg: "ES256",
      });
      const token = tamperPayload(valid, validClaims({ sub: "attacker" }));

      await expect(validator.validate(token)).rejects.toMatchObject({ type: "invalid_signature" });
    });
  });
});

describe("hasRequiredScopes", () => {
  it("returns true when every required scope is present", () => {
    expect(hasRequiredScopes(["disney:read", "disney:sync"], ["disney:read", "disney:sync"])).toBe(
      true
    );
  });

  it("returns true for a strict superset of the required scopes", () => {
    expect(hasRequiredScopes(["disney:read", "disney:sync", "disney:admin"], ["disney:read"])).toBe(
      true
    );
  });

  it("returns false when a required scope is missing", () => {
    expect(hasRequiredScopes(["disney:read"], ["disney:read", "disney:sync"])).toBe(false);
  });

  it("returns true when no scopes are required", () => {
    expect(hasRequiredScopes([], [])).toBe(true);
  });
});

describe("hasAnyScope", () => {
  it("returns true when at least one required scope overlaps", () => {
    expect(hasAnyScope(["disney:read"], ["disney:read", "disney:sync"])).toBe(true);
  });

  it("returns false when the required scopes are disjoint", () => {
    expect(hasAnyScope(["disney:read"], ["disney:sync", "disney:admin"])).toBe(false);
  });

  it("returns false when no scopes are required", () => {
    expect(hasAnyScope(["disney:read"], [])).toBe(false);
  });
});
