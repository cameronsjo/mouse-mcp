/**
 * Authentication Module
 *
 * Exports OAuth 2.1 authentication components for MCP HTTP transport.
 */

// Types
export type {
  DisneyScope,
  JWTClaims,
  ValidatedToken,
  TokenErrorType,
  AuthServerConfig,
  OAuthConfig,
  ProtectedResourceMetadata,
  JWKSResponse,
  JSONWebKey,
} from "./types.js";

export { TokenValidationError, SUPPORTED_SCOPES, TOOL_SCOPES } from "./types.js";

// JWKS client
export { JWKSClient, getJWKSClient, clearAllJWKSCaches } from "./jwks.js";

// JWT validation
export { JWTValidator, hasRequiredScopes, hasAnyScope } from "./jwt-validator.js";

// Bearer authentication
export type { AuthResult } from "./bearer-auth.js";
export { BearerAuthenticator } from "./bearer-auth.js";
