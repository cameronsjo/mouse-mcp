/**
 * OAuth 2.1 Type Definitions
 *
 * Types for MCP OAuth 2.1 authentication per the 2025-11-25 spec.
 *
 * WHY: Provides type safety for JWT claims, scopes, and auth configuration.
 */

/**
 * Disney MCP scopes per research decision.
 *
 * Scope hierarchy:
 * - disney:read - Default read-only access to entities
 * - disney:sync - Refresh data from external APIs
 * - disney:status - Health and status checks
 * - disney:admin - Administrative operations (reserved)
 */
export type DisneyScope = "disney:read" | "disney:sync" | "disney:status" | "disney:admin";

/**
 * All supported scopes.
 */
export const SUPPORTED_SCOPES: readonly DisneyScope[] = [
  "disney:read",
  "disney:sync",
  "disney:status",
  "disney:admin",
] as const;

/**
 * Scope to tool mapping.
 * Defines which scopes are required for each tool.
 */
export const TOOL_SCOPES: Readonly<Record<string, readonly DisneyScope[]>> = {
  disney_entity: ["disney:read"],
  disney_attractions: ["disney:read"],
  disney_dining: ["disney:read"],
  disney_destinations: ["disney:read"],
  disney_sync: ["disney:sync"],
  disney_status: ["disney:status"],
} as const;

/**
 * JWT claims from access token.
 * Per RFC 7519 and MCP OAuth 2.1 spec.
 */
export interface JWTClaims {
  /** Issuer - authorization server URL */
  readonly iss: string;
  /** Subject - user or client identifier */
  readonly sub: string;
  /** Audience - resource server identifier (RFC 8707) */
  readonly aud: string | readonly string[];
  /** Expiration time (Unix timestamp) */
  readonly exp: number;
  /** Issued at time (Unix timestamp) */
  readonly iat: number;
  /** Not before time (Unix timestamp, optional) */
  readonly nbf?: number;
  /** JWT ID (optional) */
  readonly jti?: string;
  /** Space-separated scope string */
  readonly scope?: string;
  /** Client ID (optional, for machine-to-machine) */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- RFC 7519 claim name
  readonly client_id?: string;
}

/**
 * Validated token result.
 */
export interface ValidatedToken {
  /** Original JWT claims */
  readonly claims: JWTClaims;
  /** Parsed scopes from the scope claim */
  readonly scopes: readonly DisneyScope[];
  /** Subject identifier */
  readonly subject: string;
  /** Client ID if present */
  readonly clientId?: string;
}

/**
 * Token validation error types.
 */
export type TokenErrorType =
  | "missing_token"
  | "invalid_format"
  | "expired"
  | "invalid_signature"
  | "invalid_issuer"
  | "invalid_audience"
  | "insufficient_scope"
  | "jwks_error";

/**
 * Token validation error.
 */
export class TokenValidationError extends Error {
  readonly type: TokenErrorType;
  readonly requiredScopes?: readonly DisneyScope[];

  constructor(type: TokenErrorType, message: string, requiredScopes?: readonly DisneyScope[]) {
    super(message);
    this.name = "TokenValidationError";
    this.type = type;
    this.requiredScopes = requiredScopes;
  }
}

/**
 * Authorization server configuration.
 */
export interface AuthServerConfig {
  /** Authorization server issuer URL */
  readonly issuer: string;
  /** JWKS endpoint URL */
  readonly jwksUri: string;
  /** Expected audience (this server's resource identifier) */
  readonly audience: string;
  /** Token validation options */
  readonly options?: {
    /** Clock skew tolerance in seconds (default: 60) */
    readonly clockTolerance?: number;
    /** Enable strict audience checking */
    readonly strictAudience?: boolean;
  };
}

/**
 * OAuth configuration for the MCP server.
 */
export interface OAuthConfig {
  /** Enable OAuth authentication */
  readonly enabled: boolean;
  /** Authorization server configuration */
  readonly authServer?: AuthServerConfig;
  /** Allow unauthenticated requests (for development) */
  readonly allowUnauthenticated?: boolean;
}

/**
 * Protected resource metadata (RFC 9728).
 * Exposed at /.well-known/oauth-protected-resource
 */
// RFC 9728 field names use snake_case per OAuth/OIDC conventions
/* eslint-disable @typescript-eslint/naming-convention */
export interface ProtectedResourceMetadata {
  /** Resource identifier (this server's URL) */
  readonly resource: string;
  /** List of authorization server URLs */
  readonly authorization_servers: readonly string[];
  /** Supported OAuth scopes */
  readonly scopes_supported: readonly string[];
  /** Supported bearer token methods */
  readonly bearer_methods_supported: readonly string[];
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * JWKS (JSON Web Key Set) response.
 */
export interface JWKSResponse {
  readonly keys: readonly JSONWebKey[];
}

/**
 * JSON Web Key per RFC 7517.
 */
export interface JSONWebKey {
  /** Key type (e.g., RSA, EC) */
  readonly kty: string;
  /** Key ID */
  readonly kid?: string;
  /** Algorithm */
  readonly alg?: string;
  /** Public key use (e.g., sig, enc) */
  readonly use?: string;
  /** RSA modulus (for RSA keys) */
  readonly n?: string;
  /** RSA exponent (for RSA keys) */
  readonly e?: string;
  /** EC curve (for EC keys) */
  readonly crv?: string;
  /** EC x coordinate (for EC keys) */
  readonly x?: string;
  /** EC y coordinate (for EC keys) */
  readonly y?: string;
}
