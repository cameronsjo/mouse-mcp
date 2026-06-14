/**
 * HTTP Transport Server Tests
 *
 * Covers the pure response builders, the request router (driven with fake
 * IncomingMessage/ServerResponse objects — no real socket), the OAuth auth
 * gate on /mcp, and JSON body parsing.
 *
 * The StreamableHTTP MCP session lifecycle is integration-tier and out of scope.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";

// Mock the DB barrel so /api/widget is deterministic (no real SQLite/temp files).
vi.mock("../db/index.js", () => ({
  getLastEntityUpdate: vi.fn(),
  getParkCount: vi.fn(),
}));

import {
  HttpTransportServer,
  buildHealthResponse,
  buildDiscoveryDocument,
  buildWidgetResponse,
} from "./http-server.js";
import { getLastEntityUpdate, getParkCount } from "../db/index.js";
import { getConfig, resetConfig, type Config } from "../config/index.js";
import { BearerAuthenticator } from "../auth/index.js";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const OAUTH_ENV_KEYS = [
  "MOUSE_MCP_OAUTH_ENABLED",
  "MOUSE_MCP_OAUTH_ISSUER",
  "MOUSE_MCP_OAUTH_AUDIENCE",
  "MOUSE_MCP_OAUTH_ALLOW_UNAUTHENTICATED",
] as const;

function snapshotOAuthEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const key of OAUTH_ENV_KEYS) {
    snap[key] = process.env[key];
  }
  return snap;
}

function clearOAuthEnv(): void {
  for (const key of OAUTH_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreOAuthEnv(snap: Record<string, string | undefined>): void {
  for (const key of OAUTH_ENV_KEYS) {
    const value = snap[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  writeHead: (status: number, headers?: Record<string, string>) => FakeResponse;
  end: (chunk?: string) => FakeResponse;
}

/** Capturing fake ServerResponse: records writeHead status/headers and end body. */
function createFakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 0,
    headers: {},
    body: "",
    ended: false,
    writeHead(status, headers) {
      res.statusCode = status;
      if (headers) {
        Object.assign(res.headers, headers);
      }
      return res;
    },
    end(chunk) {
      if (chunk !== undefined) {
        res.body = chunk;
      }
      res.ended = true;
      return res;
    },
  };
  return res;
}

/** Minimal fake IncomingMessage for routing (no body stream). */
function createRequest(method: string, url: string): IncomingMessage {
  return { method, url, headers: { host: "localhost" } } as unknown as IncomingMessage;
}

/** Fake IncomingMessage that streams a body payload as Buffer chunks. */
function createBodyRequest(payload: string): IncomingMessage {
  const req = new Readable({ read() {} });
  req.push(Buffer.from(payload));
  req.push(null);
  return req as unknown as IncomingMessage;
}

/** Access to the server's private auth fields, set as start() would (no socket). */
interface ServerInternals {
  authenticator: BearerAuthenticator | null;
  resourceUrl: string;
}
function internals(server: HttpTransportServer): ServerInternals {
  return server as unknown as ServerInternals;
}

describe("buildHealthResponse", () => {
  it("builds an ok health payload reflecting session count and uptime", () => {
    const response = buildHealthResponse(3, 120);

    expect(response).toEqual({
      status: "ok",
      service: "mouse-mcp",
      version: "1.0.0",
      timestamp: expect.any(String),
      uptime: 120,
      checks: {
        database: true,
        sessions: 3,
      },
    });
  });

  it("stamps an ISO-8601 timestamp", () => {
    const response = buildHealthResponse(0, 0);

    expect(response.timestamp).toMatch(ISO_8601);
  });
});

describe("buildDiscoveryDocument", () => {
  it("builds the base document without an authentication block when OAuth is disabled", () => {
    const config = { oauth: { enabled: false } } as unknown as Config;

    const discovery = buildDiscoveryDocument(config, "http://127.0.0.1:3000");

    expect(discovery).toEqual({
      name: "mouse-mcp",
      version: "1.0.0",
      protocol_version: "2025-11-25",
      capabilities: { tools: true, resources: false, prompts: false },
      endpoints: { mcp: "/mcp" },
    });
  });

  it("omits the authentication block when OAuth is disabled", () => {
    const config = { oauth: { enabled: false } } as unknown as Config;

    const discovery = buildDiscoveryDocument(config, "http://127.0.0.1:3000");

    expect(discovery).not.toHaveProperty("authentication");
  });

  it("includes the authentication block pointing at the resource metadata when OAuth is enabled", () => {
    const config = { oauth: { enabled: true } } as unknown as Config;

    const discovery = buildDiscoveryDocument(config, "https://srv.example.com:3000");

    expect(discovery.authentication).toEqual({
      type: "oauth2",
      protected_resource_metadata:
        "https://srv.example.com:3000/.well-known/oauth-protected-resource",
    });
  });
});

describe("buildWidgetResponse", () => {
  it("builds a flat widget payload preserving a null last_data_refresh", () => {
    const response = buildWidgetResponse(42, 5, null, 99);

    expect(response).toEqual({
      queries_total: 42,
      parks_available: 5,
      last_data_refresh: null,
      uptime_seconds: 99,
    });
  });

  it("passes through a non-null last_data_refresh value", () => {
    const response = buildWidgetResponse(0, 0, "2026-06-14T00:00:00.000Z", 0);

    expect(response.last_data_refresh).toBe("2026-06-14T00:00:00.000Z");
  });
});

describe("HttpTransportServer routing", () => {
  let server: HttpTransportServer;
  let envSnap: Record<string, string | undefined>;

  beforeEach(() => {
    envSnap = snapshotOAuthEnv();
    clearOAuthEnv();
    resetConfig();
    vi.clearAllMocks();
    server = new HttpTransportServer();
  });

  afterEach(() => {
    restoreOAuthEnv(envSnap);
    resetConfig();
  });

  it("routes /health to a 200 health payload", async () => {
    const res = createFakeResponse();

    await server.handleRequest(createRequest("GET", "/health"), res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
  });

  it("routes /.well-known/mcp to a 200 discovery document", async () => {
    const res = createFakeResponse();

    await server.handleRequest(
      createRequest("GET", "/.well-known/mcp"),
      res as unknown as ServerResponse
    );

    expect(res.statusCode).toBe(200);
  });

  it("returns 200 for /.well-known/oauth-protected-resource when an authenticator is configured", async () => {
    internals(server).authenticator = new BearerAuthenticator(
      { enabled: false, allowUnauthenticated: true },
      "http://localhost:3000"
    );
    const res = createFakeResponse();

    await server.handleRequest(
      createRequest("GET", "/.well-known/oauth-protected-resource"),
      res as unknown as ServerResponse
    );

    expect(res.statusCode).toBe(200);
  });

  it("returns 500 for /.well-known/oauth-protected-resource when no authenticator is configured", async () => {
    const res = createFakeResponse();

    await server.handleRequest(
      createRequest("GET", "/.well-known/oauth-protected-resource"),
      res as unknown as ServerResponse
    );

    expect(res.statusCode).toBe(500);
  });

  it("returns 404 for an unknown path", async () => {
    const res = createFakeResponse();

    await server.handleRequest(
      createRequest("GET", "/does-not-exist"),
      res as unknown as ServerResponse
    );

    expect(res.statusCode).toBe(404);
  });

  it("routes /api/widget to a 200 response", async () => {
    vi.mocked(getLastEntityUpdate).mockResolvedValue(null);
    vi.mocked(getParkCount).mockResolvedValue(7);
    const res = createFakeResponse();

    await server.handleRequest(
      createRequest("GET", "/api/widget"),
      res as unknown as ServerResponse
    );

    expect(res.statusCode).toBe(200);
  });

  it("serves a null last_data_refresh from /api/widget when no entities exist", async () => {
    vi.mocked(getLastEntityUpdate).mockResolvedValue(null);
    vi.mocked(getParkCount).mockResolvedValue(0);
    const res = createFakeResponse();

    await server.handleRequest(
      createRequest("GET", "/api/widget"),
      res as unknown as ServerResponse
    );

    expect(JSON.parse(res.body).last_data_refresh).toBeNull();
  });

  it("returns 500 when a route handler throws", async () => {
    vi.mocked(getLastEntityUpdate).mockResolvedValue(null);
    vi.mocked(getParkCount).mockRejectedValue(new Error("database unavailable"));
    const res = createFakeResponse();

    await server.handleRequest(
      createRequest("GET", "/api/widget"),
      res as unknown as ServerResponse
    );

    expect(res.statusCode).toBe(500);
  });
});

describe("HttpTransportServer auth gate", () => {
  let server: HttpTransportServer;
  let envSnap: Record<string, string | undefined>;

  beforeEach(() => {
    envSnap = snapshotOAuthEnv();
    process.env.MOUSE_MCP_OAUTH_ENABLED = "true";
    process.env.MOUSE_MCP_OAUTH_ISSUER = "https://auth.example.com";
    process.env.MOUSE_MCP_OAUTH_AUDIENCE = "http://127.0.0.1:3000";
    delete process.env.MOUSE_MCP_OAUTH_ALLOW_UNAUTHENTICATED;
    resetConfig();
    server = new HttpTransportServer();
    // Wire the authenticator/resourceUrl exactly as start() would, but bind no socket.
    const config = getConfig();
    internals(server).resourceUrl = "http://127.0.0.1:3000";
    internals(server).authenticator = new BearerAuthenticator(
      config.oauth,
      "http://127.0.0.1:3000"
    );
  });

  afterEach(() => {
    restoreOAuthEnv(envSnap);
    resetConfig();
  });

  it("rejects an unauthenticated /mcp request with 401", async () => {
    const res = createFakeResponse();

    await server.handleRequest(createRequest("POST", "/mcp"), res as unknown as ServerResponse);

    expect(res.statusCode).toBe(401);
  });

  it("includes a WWW-Authenticate challenge on the 401", async () => {
    const res = createFakeResponse();

    await server.handleRequest(createRequest("POST", "/mcp"), res as unknown as ServerResponse);

    expect(res.headers["WWW-Authenticate"]).toContain('Bearer realm="http://127.0.0.1:3000"');
  });
});

describe("HttpTransportServer.parseJsonBody", () => {
  let server: HttpTransportServer;

  beforeEach(() => {
    server = new HttpTransportServer();
  });

  it("parses a valid JSON body into an object", async () => {
    const result = await server.parseJsonBody(createBodyRequest('{"jsonrpc":"2.0","id":1}'));

    expect(result).toEqual({ jsonrpc: "2.0", id: 1 });
  });

  it("returns null for a malformed JSON body", async () => {
    const result = await server.parseJsonBody(createBodyRequest("{not valid json"));

    expect(result).toBeNull();
  });

  it("returns null when the request stream emits an error", async () => {
    const req = new EventEmitter() as unknown as IncomingMessage;

    const promise = server.parseJsonBody(req);
    (req as unknown as EventEmitter).emit("error", new Error("stream failure"));
    const result = await promise;

    expect(result).toBeNull();
  });
});
