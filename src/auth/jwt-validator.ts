/**
 * JWT Validator
 *
 * Validates JWT access tokens per MCP OAuth 2.1 spec.
 * Uses local signature validation with JWKS for performance.
 *
 * WHY: Local JWT validation is faster than token introspection.
 * Short token lifetimes (30 min) mitigate revocation delay concerns.
 */

import { createVerify, createPublicKey, type KeyObject } from "node:crypto";
import { createLogger, type LogContext } from "../shared/logger.js";
import { getJWKSClient, type JWKSClient } from "./jwks.js";
import {
  type JWTClaims,
  type ValidatedToken,
  type AuthServerConfig,
  type DisneyScope,
  type JSONWebKey,
  TokenValidationError,
  SUPPORTED_SCOPES,
} from "./types.js";

const logger = createLogger("JWTValidator");

/** Default clock tolerance: 60 seconds */
const DEFAULT_CLOCK_TOLERANCE_SEC = 60;

/**
 * JWT Validator with JWKS-based signature verification.
 */
export class JWTValidator {
  private readonly config: AuthServerConfig;
  private readonly jwksClient: JWKSClient;
  private readonly clockTolerance: number;

  constructor(config: AuthServerConfig) {
    this.config = config;
    this.jwksClient = getJWKSClient(config.jwksUri);
    this.clockTolerance = config.options?.clockTolerance ?? DEFAULT_CLOCK_TOLERANCE_SEC;
  }

  /**
   * Validate an access token.
   *
   * Verifies:
   * 1. Token structure (3 parts, base64url encoded)
   * 2. Signature using JWKS
   * 3. Issuer matches expected authorization server
   * 4. Audience includes this resource server (RFC 8707)
   * 5. Token is not expired (with clock tolerance)
   */
  async validate(token: string): Promise<ValidatedToken> {
    // Parse token structure
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new TokenValidationError("invalid_format", "Invalid JWT format: expected 3 parts");
    }

    const headerB64 = parts[0];
    const payloadB64 = parts[1];
    const signatureB64 = parts[2];

    // Ensure all parts exist (TypeScript narrowing)
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new TokenValidationError("invalid_format", "Invalid JWT format: missing parts");
    }

    // Decode header
    const header = this.decodeJsonPart(headerB64, "header");
    if (typeof header !== "object" || header === null) {
      throw new TokenValidationError("invalid_format", "Invalid JWT header");
    }

    const { alg, kid } = header as { alg?: string; kid?: string };

    // Validate algorithm
    if (!alg || !["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"].includes(alg)) {
      throw new TokenValidationError("invalid_format", `Unsupported algorithm: ${alg ?? "none"}`);
    }

    // Get signing key from JWKS
    if (!kid) {
      throw new TokenValidationError("invalid_format", "Missing kid in JWT header");
    }

    const jwk = await this.jwksClient.getKey(kid);
    if (!jwk) {
      logger.warn("Key not found in JWKS", { kid } as LogContext);
      throw new TokenValidationError("invalid_signature", `Key not found: ${kid}`);
    }

    // Verify signature
    const publicKey = this.jwkToPublicKey(jwk, alg);
    const signedData = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, "base64url");

    const verifyAlg = this.algToNodeAlg(alg);
    const verifier = createVerify(verifyAlg);
    verifier.update(signedData);

    if (!verifier.verify(publicKey, signature)) {
      throw new TokenValidationError("invalid_signature", "Invalid token signature");
    }

    // Decode payload
    const payload = this.decodeJsonPart(payloadB64, "payload") as JWTClaims;

    // Validate claims
    this.validateClaims(payload);

    // Parse scopes
    const scopes = this.parseScopes(payload.scope);

    logger.debug("Token validated", {
      sub: payload.sub,
      scopes: scopes.join(" "),
    } as LogContext);

    return {
      claims: payload,
      scopes,
      subject: payload.sub,
      clientId: payload.client_id,
    };
  }

  /**
   * Decode a base64url JSON part.
   */
  private decodeJsonPart(part: string, name: string): unknown {
    try {
      const json = Buffer.from(part, "base64url").toString("utf-8");
      return JSON.parse(json);
    } catch {
      throw new TokenValidationError("invalid_format", `Invalid ${name}: not valid base64url JSON`);
    }
  }

  /**
   * Convert JWK to Node.js public key.
   */
  private jwkToPublicKey(jwk: JSONWebKey, alg: string): KeyObject {
    try {
      // For RSA keys
      if (jwk.kty === "RSA" && jwk.n && jwk.e) {
        return createPublicKey({
          key: {
            kty: "RSA",
            n: jwk.n,
            e: jwk.e,
          },
          format: "jwk",
        });
      }

      // For EC keys
      if (jwk.kty === "EC" && jwk.crv && jwk.x && jwk.y) {
        return createPublicKey({
          key: {
            kty: "EC",
            crv: jwk.crv,
            x: jwk.x,
            y: jwk.y,
          },
          format: "jwk",
        });
      }

      throw new Error(`Unsupported key type: ${jwk.kty}`);
    } catch (error) {
      logger.error("Failed to convert JWK to public key", error, { alg } as LogContext);
      throw new TokenValidationError("jwks_error", "Failed to process signing key");
    }
  }

  /**
   * Map JWT algorithm to Node.js algorithm name.
   */
  private algToNodeAlg(alg: string): string {
    const mapping: Record<string, string> = {
      RS256: "RSA-SHA256",
      RS384: "RSA-SHA384",
      RS512: "RSA-SHA512",
      ES256: "SHA256",
      ES384: "SHA384",
      ES512: "SHA512",
    };
    return mapping[alg] ?? "RSA-SHA256";
  }

  /**
   * Validate JWT claims.
   */
  private validateClaims(claims: JWTClaims): void {
    const now = Math.floor(Date.now() / 1000);

    // Check issuer
    if (claims.iss !== this.config.issuer) {
      throw new TokenValidationError(
        "invalid_issuer",
        `Invalid issuer: expected ${this.config.issuer}, got ${claims.iss}`
      );
    }

    // Check audience (RFC 8707)
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(this.config.audience)) {
      throw new TokenValidationError(
        "invalid_audience",
        `Invalid audience: expected ${this.config.audience}`
      );
    }

    // Check expiration
    if (claims.exp <= now - this.clockTolerance) {
      throw new TokenValidationError("expired", "Token has expired");
    }

    // Check not-before (if present)
    if (claims.nbf !== undefined && claims.nbf > now + this.clockTolerance) {
      throw new TokenValidationError("expired", "Token not yet valid");
    }
  }

  /**
   * Parse scope claim into DisneyScope array.
   */
  private parseScopes(scopeStr: string | undefined): readonly DisneyScope[] {
    if (!scopeStr) {
      return [];
    }

    const requestedScopes = scopeStr.split(" ");
    const validScopes: DisneyScope[] = [];

    for (const scope of requestedScopes) {
      if (SUPPORTED_SCOPES.includes(scope as DisneyScope)) {
        validScopes.push(scope as DisneyScope);
      }
    }

    return validScopes;
  }
}

/**
 * Check if a token has the required scopes.
 */
export function hasRequiredScopes(
  tokenScopes: readonly DisneyScope[],
  requiredScopes: readonly DisneyScope[]
): boolean {
  return requiredScopes.every((scope) => tokenScopes.includes(scope));
}

/**
 * Check if a token has any of the required scopes.
 */
export function hasAnyScope(
  tokenScopes: readonly DisneyScope[],
  requiredScopes: readonly DisneyScope[]
): boolean {
  return requiredScopes.some((scope) => tokenScopes.includes(scope));
}
