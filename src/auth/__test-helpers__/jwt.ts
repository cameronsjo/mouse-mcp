/**
 * JWT Test Helpers (Cluster C — Auth flow)
 *
 * Generates RSA key material and signs compact JWTs for auth tests using only
 * `node:crypto` — no new dependencies. Supports producing adversarial tokens
 * (tampered signatures, `alg:"none"`, malformed segments) for negative tests.
 *
 * This is the ONLY non-`*.test.ts` file created for the auth test cluster.
 */

import { generateKeyPairSync, createSign, type KeyObject, type JsonWebKey } from "node:crypto";

/** RSA key material plus its public JWK (with `kid`/`alg`/`use`). */
export interface TestKeyMaterial {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
  readonly kid: string;
  readonly jwk: JsonWebKey & { readonly kid: string; readonly alg: string; readonly use: string };
}

/**
 * Generate a 2048-bit RSA keypair and export the public half as a signing JWK.
 */
export function generateTestKey(kid = "test-key-1"): TestKeyMaterial {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  // publicKey is already a public KeyObject; export it directly as a JWK.
  const baseJwk = publicKey.export({ format: "jwk" });
  return {
    publicKey,
    privateKey,
    kid,
    jwk: { ...baseJwk, kid, alg: "RS256", use: "sig" },
  };
}

/**
 * Generate a P-256 EC keypair and export the public half as an ES256 signing JWK.
 * Used to exercise the EC verification branch (regression cover for the IEEE-P1363
 * dsaEncoding fix).
 */
export function generateTestKeyEc(kid = "test-ec-key-1"): TestKeyMaterial {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const baseJwk = publicKey.export({ format: "jwk" });
  return {
    publicKey,
    privateKey,
    kid,
    jwk: { ...baseJwk, kid, alg: "ES256", use: "sig" },
  };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** Options controlling how a compact JWT is assembled. */
export interface MakeTokenOptions {
  /** `kid` placed in the JWT header (omitted entirely when undefined). */
  readonly kid?: string;
  /** Private key used to sign. Omit (and omit `signatureOverride`) for an unsigned token. */
  readonly privateKey?: KeyObject;
  /** Algorithm placed in the header. Defaults to RS256. Signing always uses RSA-SHA256. */
  readonly alg?: string;
  /** Extra/override header fields (merged last). */
  readonly header?: Record<string, unknown>;
  /** Replace the signature segment verbatim — used to forge tampered/garbage signatures. */
  readonly signatureOverride?: string;
  /** Replace the encoded header segment verbatim — used for malformed-header tests. */
  readonly rawHeaderB64?: string;
  /** Replace the encoded payload segment verbatim — used for malformed-payload tests. */
  readonly rawPayloadB64?: string;
}

/**
 * Build a compact JWT (`header.payload.signature`).
 *
 * - With a `privateKey`, signs `base64url(header).base64url(payload)` via RSA-SHA256.
 * - With `signatureOverride`, emits that exact signature segment (tampered token).
 * - With neither, emits an empty signature segment (unsigned token).
 */
export function makeToken(claims: Record<string, unknown>, options: MakeTokenOptions = {}): string {
  const {
    kid,
    privateKey,
    alg = "RS256",
    header,
    signatureOverride,
    rawHeaderB64,
    rawPayloadB64,
  } = options;

  const headerObj = {
    alg,
    typ: "JWT",
    ...(kid !== undefined ? { kid } : {}),
    ...header,
  };

  const headerB64 = rawHeaderB64 ?? base64url(JSON.stringify(headerObj));
  const payloadB64 = rawPayloadB64 ?? base64url(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  if (signatureOverride !== undefined) {
    return `${signingInput}.${signatureOverride}`;
  }

  if (!privateKey) {
    // Unsigned token (empty signature segment).
    return `${signingInput}.`;
  }

  // EC algorithms hash with plain SHA-* and must emit IEEE-P1363 (r‖s) signatures to
  // match JWS; RSA algorithms use RSA-SHA256.
  const ecHashByAlg: Record<string, string> = {
    ES256: "SHA256",
    ES384: "SHA384",
    ES512: "SHA512",
  };
  const isEc = alg.startsWith("ES");
  const signer = createSign(isEc ? (ecHashByAlg[alg] ?? "SHA256") : "RSA-SHA256");
  signer.update(signingInput);
  const signature = isEc
    ? signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
    : signer.sign(privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

/**
 * Produce a structurally valid token whose payload was swapped after signing,
 * so the signature no longer matches (signature-skip / tamper detection test).
 */
export function tamperPayload(token: string, newClaims: Record<string, unknown>): string {
  const [headerB64, , signatureB64] = token.split(".");
  const swapped = base64url(JSON.stringify(newClaims));
  return `${headerB64 ?? ""}.${swapped}.${signatureB64 ?? ""}`;
}

/** Encode an arbitrary string as a base64url segment (for malformed-segment tests). */
export function encodeSegment(raw: string): string {
  return base64url(raw);
}
