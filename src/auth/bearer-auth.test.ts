/**
 * Bearer Authentication Tests (Cluster C — Auth flow)
 *
 * Covers the authenticate matrix (disabled / allowUnauthenticated / missing /
 * malformed / valid / TokenValidationError / generic error / no-validator),
 * tool-scope authorization, and the 401/403 challenge construction
 * (WWW-Authenticate contents + JSON-RPC body shape). The JWTValidator is mocked
 * so token validation outcomes are scripted; `hasRequiredScopes` stays real.
 *
 * Test Plan
 *   authenticate (Classification: API handler + authorization)
 *     [x] OAuth disabled -> authenticated, no token
 *     [x] enabled + no header + allowUnauthenticated -> authenticated
 *     [x] enabled + no header (strict) -> missing_token
 *     [x] malformed header (no "Bearer ") -> invalid_format
 *     [x] valid token -> authenticated + token
 *     [x] validator throws TokenValidationError -> {authenticated:false, errorType}
 *     [x] validator throws generic error -> invalid_format / "Authentication failed"
 *     [x] enabled but no validator configured -> error
 *   checkToolScopes (Classification: authorization)
 *     [x] disabled -> true; allowUnauth + no token -> true; strict no token -> false
 *     [x] known tool via TOOL_SCOPES (granted / denied)
 *     [x] unknown tool -> defaults to disney:read (granted / denied)
 *   sendUnauthorized / sendForbidden / getProtectedResourceMetadata
 *     [x] 401 header construction (realm, resource_metadata, scope, error)
 *     [x] 403 insufficient_scope; JSON-RPC body shape
 *     [x] metadata fields
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type OAuthConfig,
  type AuthServerConfig,
  type ValidatedToken,
  type DisneyScope,
  TokenValidationError,
  SUPPORTED_SCOPES,
} from "./types.js";

vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Replace JWTValidator with a scripted validate(); keep hasRequiredScopes real.
const { mockValidate } = vi.hoisted(() => ({ mockValidate: vi.fn() }));
vi.mock("./jwt-validator.js", async (importActual) => {
  const actual = await importActual<typeof import("./jwt-validator.js")>();
  return {
    ...actual,
    JWTValidator: vi.fn(() => ({ validate: mockValidate })),
  };
});

import { BearerAuthenticator } from "./bearer-auth.js";

const ISSUER = "https://auth.example.com";
const AUDIENCE = "https://mcp.example.com";
const RESOURCE_URL = "https://mcp.example.com";

const authServer: AuthServerConfig = {
  issuer: ISSUER,
  jwksUri: "https://auth.example.com/.well-known/jwks.json",
  audience: AUDIENCE,
};

const disabledConfig: OAuthConfig = { enabled: false, allowUnauthenticated: true };
const devConfig: OAuthConfig = { enabled: true, authServer, allowUnauthenticated: true };
const strictConfig: OAuthConfig = { enabled: true, authServer, allowUnauthenticated: false };
const noValidatorConfig: OAuthConfig = { enabled: true, allowUnauthenticated: false };

function makeRequest(authorization?: string): IncomingMessage {
  return { headers: authorization ? { authorization } : {} } as unknown as IncomingMessage;
}

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string | undefined;
  writeHead: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function makeResponse(): CapturedResponse {
  const captured: CapturedResponse = {
    statusCode: 0,
    headers: {},
    body: undefined,
    writeHead: vi.fn(),
    end: vi.fn(),
  };
  captured.writeHead.mockImplementation((status: number, headers: Record<string, string>) => {
    captured.statusCode = status;
    captured.headers = headers;
    return captured;
  });
  captured.end.mockImplementation((body?: string) => {
    captured.body = body;
    return captured;
  });
  return captured;
}

/** Cast a captured response to the ServerResponse the source expects. */
function asResponse(res: CapturedResponse): ServerResponse {
  return res as unknown as ServerResponse;
}

function tokenWith(scopes: DisneyScope[]): ValidatedToken {
  return {
    claims: { iss: ISSUER, sub: "user-1", aud: AUDIENCE, exp: 0, iat: 0 },
    scopes,
    subject: "user-1",
  };
}

beforeEach(() => {
  mockValidate.mockReset();
});

describe("BearerAuthenticator.authenticate", () => {
  it("allows the request without a token when OAuth is disabled", async () => {
    const auth = new BearerAuthenticator(disabledConfig, RESOURCE_URL);

    const result = await auth.authenticate(makeRequest());

    expect(result).toEqual({ authenticated: true });
  });

  it("allows a request with no auth header when allowUnauthenticated is set", async () => {
    const auth = new BearerAuthenticator(devConfig, RESOURCE_URL);

    const result = await auth.authenticate(makeRequest());

    expect(result.authenticated).toBe(true);
  });

  it("rejects a missing auth header with missing_token under strict config", async () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    const result = await auth.authenticate(makeRequest());

    expect(result).toMatchObject({ authenticated: false, errorType: "missing_token" });
  });

  it("rejects a non-Bearer authorization header with invalid_format", async () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    const result = await auth.authenticate(makeRequest("Basic dXNlcjpwYXNz"));

    expect(result).toMatchObject({ authenticated: false, errorType: "invalid_format" });
  });

  it("returns the validated token for a valid Bearer token", async () => {
    const validated = tokenWith(["disney:read"]);
    mockValidate.mockResolvedValue(validated);
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    const result = await auth.authenticate(makeRequest("Bearer good-token"));

    expect(result).toEqual({ authenticated: true, token: validated });
  });

  it("forwards the extracted token to the validator", async () => {
    mockValidate.mockResolvedValue(tokenWith(["disney:read"]));
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    await auth.authenticate(makeRequest("Bearer my-token-value"));

    expect(mockValidate).toHaveBeenCalledWith("my-token-value");
  });

  it("surfaces the error type when the validator throws a TokenValidationError", async () => {
    mockValidate.mockRejectedValue(new TokenValidationError("expired", "Token has expired"));
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    const result = await auth.authenticate(makeRequest("Bearer expired-token"));

    expect(result).toMatchObject({ authenticated: false, errorType: "expired" });
  });

  it("maps an unexpected validator error to invalid_format with a generic message", async () => {
    mockValidate.mockRejectedValue(new Error("network exploded"));
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    const result = await auth.authenticate(makeRequest("Bearer some-token"));

    expect(result).toMatchObject({
      authenticated: false,
      errorType: "invalid_format",
      error: "Authentication failed",
    });
  });

  it("rejects a Bearer token when OAuth is enabled but no validator is configured", async () => {
    const auth = new BearerAuthenticator(noValidatorConfig, RESOURCE_URL);

    const result = await auth.authenticate(makeRequest("Bearer some-token"));

    expect(result).toMatchObject({ authenticated: false, errorType: "invalid_format" });
  });
});

describe("BearerAuthenticator.checkToolScopes", () => {
  it("allows any tool when OAuth is disabled", () => {
    const auth = new BearerAuthenticator(disabledConfig, RESOURCE_URL);

    expect(auth.checkToolScopes(undefined, "disney_sync")).toBe(true);
  });

  it("allows access without a token when allowUnauthenticated is set", () => {
    const auth = new BearerAuthenticator(devConfig, RESOURCE_URL);

    expect(auth.checkToolScopes(undefined, "disney_sync")).toBe(true);
  });

  it("denies access without a token under strict config", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    expect(auth.checkToolScopes(undefined, "disney_entity")).toBe(false);
  });

  it("grants a known tool when the token carries its required scope", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    expect(auth.checkToolScopes(tokenWith(["disney:sync"]), "disney_sync")).toBe(true);
  });

  it("denies a known tool when the token lacks its required scope", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    expect(auth.checkToolScopes(tokenWith(["disney:read"]), "disney_sync")).toBe(false);
  });

  it("defaults an unknown tool to requiring disney:read and grants it when present", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    expect(auth.checkToolScopes(tokenWith(["disney:read"]), "mystery_tool")).toBe(true);
  });

  it("defaults an unknown tool to requiring disney:read and denies it when absent", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    expect(auth.checkToolScopes(tokenWith(["disney:sync"]), "mystery_tool")).toBe(false);
  });
});

describe("BearerAuthenticator.sendUnauthorized", () => {
  it("writes a 401 status", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendUnauthorized(asResponse(res), "invalid_token");

    expect(res.statusCode).toBe(401);
  });

  it("includes a Bearer realm in the WWW-Authenticate header", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendUnauthorized(asResponse(res), "invalid_token");

    expect(res.headers["WWW-Authenticate"]).toContain(`Bearer realm="${RESOURCE_URL}"`);
  });

  it("advertises resource_metadata when an authorization server is configured", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendUnauthorized(asResponse(res), "invalid_token");

    expect(res.headers["WWW-Authenticate"]).toContain(
      `resource_metadata="${RESOURCE_URL}/.well-known/oauth-protected-resource"`
    );
  });

  it("omits resource_metadata when no authorization server is configured", () => {
    const auth = new BearerAuthenticator(disabledConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendUnauthorized(asResponse(res), "invalid_token");

    expect(res.headers["WWW-Authenticate"]).not.toContain("resource_metadata");
  });

  it("includes the required scope list when provided", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendUnauthorized(asResponse(res), "insufficient_scope", undefined, [
      "disney:read",
      "disney:sync",
    ]);

    expect(res.headers["WWW-Authenticate"]).toContain('scope="disney:read disney:sync"');
  });

  it("includes the error code in the WWW-Authenticate header", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendUnauthorized(asResponse(res), "invalid_token");

    expect(res.headers["WWW-Authenticate"]).toContain('error="invalid_token"');
  });

  it("emits a JSON-RPC error body using the description as the message", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendUnauthorized(asResponse(res), "invalid_token", "Token has expired");

    expect(JSON.parse(res.body ?? "")).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Token has expired" },
      id: null,
    });
  });
});

describe("BearerAuthenticator.sendForbidden", () => {
  it("writes a 403 status", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendForbidden(asResponse(res), ["disney:sync"]);

    expect(res.statusCode).toBe(403);
  });

  it("declares insufficient_scope in the WWW-Authenticate header", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendForbidden(asResponse(res), ["disney:sync"]);

    expect(res.headers["WWW-Authenticate"]).toContain('error="insufficient_scope"');
  });

  it("lists the required scopes in the WWW-Authenticate header", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendForbidden(asResponse(res), ["disney:sync", "disney:admin"]);

    expect(res.headers["WWW-Authenticate"]).toContain('scope="disney:sync disney:admin"');
  });

  it("emits a JSON-RPC body naming the required scopes by default", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);
    const res = makeResponse();

    auth.sendForbidden(asResponse(res), ["disney:sync"]);

    expect(JSON.parse(res.body ?? "")).toEqual({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Insufficient scope. Required: disney:sync" },
      id: null,
    });
  });
});

describe("BearerAuthenticator.getProtectedResourceMetadata", () => {
  it("lists the issuer as the authorization server when configured", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    const metadata = auth.getProtectedResourceMetadata();

    expect(metadata.authorization_servers).toEqual([ISSUER]);
  });

  it("returns an empty authorization server list when none is configured", () => {
    const auth = new BearerAuthenticator(disabledConfig, RESOURCE_URL);

    const metadata = auth.getProtectedResourceMetadata();

    expect(metadata.authorization_servers).toEqual([]);
  });

  it("reports the resource URL and supported scopes and bearer methods", () => {
    const auth = new BearerAuthenticator(strictConfig, RESOURCE_URL);

    const metadata = auth.getProtectedResourceMetadata();

    expect(metadata).toEqual({
      resource: RESOURCE_URL,
      authorization_servers: [ISSUER],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ["header"],
    });
  });
});
