/**
 * Bearer Token Authentication
 *
 * Extracts and validates bearer tokens from HTTP requests.
 * Implements RFC 6750 bearer token usage.
 *
 * WHY: MCP OAuth 2.1 spec requires bearer token authentication for HTTP transport.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger, type LogContext } from "../shared/logger.js";
import { JWTValidator, hasRequiredScopes } from "./jwt-validator.js";
import {
  type OAuthConfig,
  type ValidatedToken,
  type DisneyScope,
  type ProtectedResourceMetadata,
  TokenValidationError,
  TOOL_SCOPES,
  SUPPORTED_SCOPES,
} from "./types.js";

const logger = createLogger("BearerAuth");

/**
 * Bearer authentication result.
 */
export interface AuthResult {
  /** Whether authentication was successful */
  readonly authenticated: boolean;
  /** Validated token (if authenticated) */
  readonly token?: ValidatedToken;
  /** Error message (if not authenticated) */
  readonly error?: string;
  /** Error type (if not authenticated) */
  readonly errorType?: string;
}

/**
 * Bearer token authenticator.
 *
 * Extracts bearer tokens from Authorization header and validates them.
 */
export class BearerAuthenticator {
  private readonly config: OAuthConfig;
  private readonly validator: JWTValidator | null;
  private readonly resourceUrl: string;

  constructor(config: OAuthConfig, resourceUrl: string) {
    this.config = config;
    this.resourceUrl = resourceUrl;

    if (config.enabled && config.authServer) {
      this.validator = new JWTValidator(config.authServer);
    } else {
      this.validator = null;
    }
  }

  /**
   * Authenticate an HTTP request.
   *
   * Extracts bearer token from Authorization header and validates it.
   * If OAuth is disabled or allowUnauthenticated is true, returns success.
   */
  async authenticate(req: IncomingMessage): Promise<AuthResult> {
    // If OAuth is disabled, allow all requests
    if (!this.config.enabled) {
      logger.debug("OAuth disabled, allowing unauthenticated request");
      return { authenticated: true };
    }

    // Extract bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      if (this.config.allowUnauthenticated) {
        logger.debug("No auth header, but unauthenticated allowed");
        return { authenticated: true };
      }
      return {
        authenticated: false,
        error: "Missing authorization header",
        errorType: "missing_token",
      };
    }

    // Validate bearer token format
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!match?.[1]) {
      return {
        authenticated: false,
        error: "Invalid authorization header format",
        errorType: "invalid_format",
      };
    }

    const token = match[1];

    // Validate the token
    if (!this.validator) {
      logger.warn("OAuth enabled but no validator configured");
      return {
        authenticated: false,
        error: "Authentication not configured",
        errorType: "invalid_format",
      };
    }

    try {
      const validatedToken = await this.validator.validate(token);
      logger.debug("Token validated", { sub: validatedToken.subject } as LogContext);
      return {
        authenticated: true,
        token: validatedToken,
      };
    } catch (error) {
      if (error instanceof TokenValidationError) {
        logger.warn("Token validation failed", {
          type: error.type,
          message: error.message,
        } as LogContext);
        return {
          authenticated: false,
          error: error.message,
          errorType: error.type,
        };
      }
      logger.error("Unexpected auth error", error);
      return {
        authenticated: false,
        error: "Authentication failed",
        errorType: "invalid_format",
      };
    }
  }

  /**
   * Check if a request has sufficient scopes for a tool.
   */
  checkToolScopes(token: ValidatedToken | undefined, toolName: string): boolean {
    // If no token required, allow
    if (!this.config.enabled) {
      return true;
    }

    // If unauthenticated allowed and no token, allow
    if (this.config.allowUnauthenticated && !token) {
      return true;
    }

    // No token = no access
    if (!token) {
      return false;
    }

    // Get required scopes for tool
    const requiredScopes = TOOL_SCOPES[toolName];
    if (!requiredScopes) {
      // Unknown tool - default to require disney:read
      return hasRequiredScopes(token.scopes, ["disney:read"]);
    }

    return hasRequiredScopes(token.scopes, requiredScopes);
  }

  /**
   * Get protected resource metadata (RFC 9728).
   */
  getProtectedResourceMetadata(): ProtectedResourceMetadata {
    const authServers: string[] = [];
    if (this.config.authServer) {
      authServers.push(this.config.authServer.issuer);
    }

    return {
      resource: this.resourceUrl,
      authorization_servers: authServers,
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ["header"],
    };
  }

  /**
   * Send 401 Unauthorized response with WWW-Authenticate header.
   */
  sendUnauthorized(
    res: ServerResponse,
    error: string,
    errorDescription?: string,
    requiredScopes?: readonly DisneyScope[]
  ): void {
    const parts = [`Bearer realm="${this.resourceUrl}"`];

    if (this.config.authServer) {
      // Include resource_metadata URL per MCP spec
      parts.push(`resource_metadata="${this.resourceUrl}/.well-known/oauth-protected-resource"`);
    }

    if (requiredScopes && requiredScopes.length > 0) {
      parts.push(`scope="${requiredScopes.join(" ")}"`);
    }

    parts.push(`error="${error}"`);

    if (errorDescription) {
      parts.push(`error_description="${errorDescription}"`);
    }

    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": parts.join(", "),
    });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: errorDescription ?? error,
        },
        id: null,
      })
    );
  }

  /**
   * Send 403 Forbidden response for insufficient scope.
   */
  sendForbidden(
    res: ServerResponse,
    requiredScopes: readonly DisneyScope[],
    errorDescription?: string
  ): void {
    const parts = [
      `Bearer realm="${this.resourceUrl}"`,
      `scope="${requiredScopes.join(" ")}"`,
      'error="insufficient_scope"',
    ];

    if (errorDescription) {
      parts.push(`error_description="${errorDescription}"`);
    }

    res.writeHead(403, {
      "Content-Type": "application/json",
      "WWW-Authenticate": parts.join(", "),
    });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: errorDescription ?? `Insufficient scope. Required: ${requiredScopes.join(", ")}`,
        },
        id: null,
      })
    );
  }
}
