/**
 * DisneyMcpServer HTTP session tests.
 *
 * Regression: HTTP mode used to reuse one MCP Server for every session, so the
 * second transport's connect() threw "Already connected to a transport". A
 * stateless gateway that opens a new session per request then saw only the first
 * one succeed. These tests drive real StreamableHTTP sessions over a loopback
 * socket; the Disney clients, DB, and event wiring are mocked (no network).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";

vi.mock("./clients/index.js", () => ({
  getSessionManager: vi.fn(() => ({
    initialize: vi.fn(),
    shutdown: vi.fn(),
  })),
}));

vi.mock("./db/index.js", () => ({
  closeDatabase: vi.fn(),
  cachePurgeExpired: vi.fn(),
  getLastEntityUpdate: vi.fn(),
  getParkCount: vi.fn(),
}));

vi.mock("./events/index.js", () => ({
  registerEmbeddingHandlers: vi.fn(() => vi.fn()),
  removeAllEventListeners: vi.fn(),
}));

import { DisneyMcpServer } from "./server.js";
import { resetConfig } from "./config/index.js";
import { getToolDefinitions } from "./tools/index.js";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

interface RpcResult {
  status: number;
  sessionId: string | null;
  body: { result?: { tools?: Array<{ name: string }> }; error?: unknown };
}

/** POST a JSON-RPC message; parses either a JSON or a single-event SSE reply. */
async function rpc(
  baseUrl: string,
  message: Record<string, unknown>,
  sessionId?: string
): Promise<RpcResult> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { ...MCP_HEADERS, ...(sessionId ? { "mcp-session-id": sessionId } : {}) },
    body: JSON.stringify(message),
  });
  const text = await res.text();
  const payload =
    text.startsWith("event:") || text.startsWith("data:")
      ? (text.split("\n").find((l) => l.startsWith("data:")) ?? "data: {}").slice(5)
      : text || "{}";
  return {
    status: res.status,
    sessionId: res.headers.get("mcp-session-id"),
    body: JSON.parse(payload) as RpcResult["body"],
  };
}

async function openSessionAndListTools(baseUrl: string): Promise<string[]> {
  const init = await rpc(baseUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.0.0" },
    },
  });
  expect(init.status).toBe(200);
  expect(init.sessionId).toBeTruthy();
  const sessionId = init.sessionId!;

  await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { ...MCP_HEADERS, "mcp-session-id": sessionId },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  const list = await rpc(baseUrl, { jsonrpc: "2.0", id: 2, method: "tools/list" }, sessionId);
  expect(list.status).toBe(200);
  expect(list.body.error).toBeUndefined();
  return (list.body.result?.tools ?? []).map((t) => t.name).sort();
}

describe("DisneyMcpServer HTTP sessions", () => {
  let server: DisneyMcpServer;
  let baseUrl: string;
  let httpServer: {
    getActiveSessionCount(): number;
    server: { address(): AddressInfo };
  };

  beforeAll(async () => {
    server = new DisneyMcpServer();
    // runHttp is private; call it directly with an ephemeral loopback port.
    await (server as unknown as { runHttp(p: number, h: string): Promise<void> }).runHttp(
      0,
      "127.0.0.1"
    );
    httpServer = (server as unknown as { httpServer: typeof httpServer }).httpServer;
    baseUrl = `http://127.0.0.1:${httpServer.server.address().port}`;
  });

  afterAll(async () => {
    await (server as unknown as { httpServer: { stop(): Promise<void> } }).httpServer.stop();
  });

  it("serves two independent sessions (initialize + tools/list) with the same tools", async () => {
    const first = await openSessionAndListTools(baseUrl);
    const second = await openSessionAndListTools(baseUrl);

    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(
      getToolDefinitions()
        .map((t) => t.name)
        .sort()
    );
    expect(second).toEqual(first);
    expect(httpServer.getActiveSessionCount()).toBe(2);
  });

  it("handles two sessions whose initialize requests are in flight together", async () => {
    const [first, second] = await Promise.all([
      openSessionAndListTools(baseUrl),
      openSessionAndListTools(baseUrl),
    ]);

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("releases the per-session MCP server when the session ends", async () => {
    const before = httpServer.getActiveSessionCount();
    const init = await rpc(baseUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test-client", version: "0.0.0" },
      },
    });
    const sessionId = init.sessionId!;
    const active = (server as unknown as { activeServers: Set<unknown> }).activeServers;
    expect(httpServer.getActiveSessionCount()).toBe(before + 1);
    const serversWhileOpen = active.size;

    const del = await fetch(`${baseUrl}/mcp`, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId },
    });
    expect(del.status).toBe(200);

    expect(httpServer.getActiveSessionCount()).toBe(before);
    expect(active.size).toBe(serversWhileOpen - 1);
  });
});

// ---------------------------------------------------------------------------
// Idle expiry and session cap
// ---------------------------------------------------------------------------

const INIT_MESSAGE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0.0.0" },
  },
};

interface Harness {
  server: DisneyMcpServer;
  baseUrl: string;
  activeServers: Set<unknown>;
  sessionCount(): number;
  inFlightCount(): number;
  stop(): Promise<void>;
}

/** Start an HTTP server with the given env; only interval timers and Date are faked. */
async function startHarness(env: Record<string, string>): Promise<Harness> {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  resetConfig();

  const server = new DisneyMcpServer();
  const internals = server as unknown as {
    runHttp(p: number, h: string): Promise<void>;
    httpServer: {
      getActiveSessionCount(): number;
      server: { address(): AddressInfo };
      stop(): Promise<void>;
      transports: Map<string, { inFlight: number }>;
    };
    activeServers: Set<unknown>;
  };
  await internals.runHttp(0, "127.0.0.1");
  return {
    server,
    baseUrl: `http://127.0.0.1:${internals.httpServer.server.address().port}`,
    activeServers: internals.activeServers,
    sessionCount: () => internals.httpServer.getActiveSessionCount(),
    inFlightCount: () =>
      [...internals.httpServer.transports.values()].reduce((sum, t) => sum + t.inFlight, 0),
    stop: () => internals.httpServer.stop(),
  };
}

async function openSession(baseUrl: string): Promise<string> {
  const init = await rpc(baseUrl, INIT_MESSAGE);
  expect(init.status).toBe(200);
  return init.sessionId!;
}

async function listTools(baseUrl: string, sessionId: string): Promise<number> {
  const res = await rpc(baseUrl, { jsonrpc: "2.0", id: 2, method: "tools/list" }, sessionId);
  return res.status;
}

describe("DisneyMcpServer HTTP session expiry", () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.stop();
    harness = undefined;
    delete process.env.MOUSE_MCP_HTTP_SESSION_TTL_SECONDS;
    delete process.env.MOUSE_MCP_HTTP_MAX_SESSIONS;
    resetConfig();
    vi.useRealTimers();
  });

  it("closes an idle session after the TTL and releases its server, but keeps an active one", async () => {
    harness = await startHarness({
      MOUSE_MCP_HTTP_SESSION_TTL_SECONDS: "60",
      MOUSE_MCP_HTTP_MAX_SESSIONS: "0",
    });
    const { baseUrl } = harness;

    const idle = await openSession(baseUrl);
    const active = await openSession(baseUrl);
    expect(harness.sessionCount()).toBe(2);
    expect(harness.activeServers.size).toBe(2);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(await listTools(baseUrl, active)).toBe(200); // refreshes `active` at t=30s

    await vi.advanceTimersByTimeAsync(40_000); // t=70s: `idle` is 70s old, `active` 40s
    expect(harness.sessionCount()).toBe(1);
    expect(harness.activeServers.size).toBe(1);
    expect(await listTools(baseUrl, idle)).toBe(404);
    expect(await listTools(baseUrl, active)).toBe(200);

    await vi.advanceTimersByTimeAsync(120_000); // `active` now idle past the TTL too
    expect(harness.sessionCount()).toBe(0);
    expect(harness.activeServers.size).toBe(0);
  });

  it("evicts the least recently used session when the cap is exceeded", async () => {
    harness = await startHarness({
      MOUSE_MCP_HTTP_SESSION_TTL_SECONDS: "0",
      MOUSE_MCP_HTTP_MAX_SESSIONS: "3",
    });
    const { baseUrl } = harness;

    const s1 = await openSession(baseUrl);
    await vi.advanceTimersByTimeAsync(1_000);
    const s2 = await openSession(baseUrl);
    await vi.advanceTimersByTimeAsync(1_000);
    const s3 = await openSession(baseUrl);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await listTools(baseUrl, s1)).toBe(200); // s2 is now the least recently used
    await vi.advanceTimersByTimeAsync(1_000);

    const s4 = await openSession(baseUrl);

    expect(harness.sessionCount()).toBe(3);
    expect(harness.activeServers.size).toBe(3);
    expect(await listTools(baseUrl, s2)).toBe(404);
    expect(await listTools(baseUrl, s1)).toBe(200);
    expect(await listTools(baseUrl, s3)).toBe(200);
    expect(await listTools(baseUrl, s4)).toBe(200);
  });

  /** Open the standalone GET stream; the server counts it as an in-flight request until aborted. */
  async function holdStreamOpen(baseUrl: string, sessionId: string): Promise<AbortController> {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "GET",
      headers: { Accept: "text/event-stream", "mcp-session-id": sessionId },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    return controller;
  }

  /** Real-time poll (setTimeout is not faked) until the server sees the session as idle. */
  async function waitUntilIdle(h: Harness): Promise<void> {
    for (let i = 0; i < 100; i++) {
      if (h.inFlightCount() === 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("session never became idle");
  }

  it("does not expire a session with a request in flight, even past the TTL", async () => {
    harness = await startHarness({
      MOUSE_MCP_HTTP_SESSION_TTL_SECONDS: "60",
      MOUSE_MCP_HTTP_MAX_SESSIONS: "0",
    });
    const { baseUrl } = harness;
    const held = await openSession(baseUrl);
    const stream = await holdStreamOpen(baseUrl, held);
    expect(harness.inFlightCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(harness.sessionCount()).toBe(1);
    expect(harness.activeServers.size).toBe(1);

    // Once the stream ends the session is idle again and the next sweep expires it.
    stream.abort();
    await waitUntilIdle(harness);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(harness.sessionCount()).toBe(0);
  });

  it("refuses a new session with 503 when the cap is reached and every session is busy", async () => {
    harness = await startHarness({
      MOUSE_MCP_HTTP_SESSION_TTL_SECONDS: "0",
      MOUSE_MCP_HTTP_MAX_SESSIONS: "1",
    });
    const { baseUrl } = harness;
    const held = await openSession(baseUrl);
    const stream = await holdStreamOpen(baseUrl, held);

    const refused = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify(INIT_MESSAGE),
    });
    expect(refused.status).toBe(503);
    expect(refused.headers.get("retry-after")).toBe("5");
    const body = (await refused.json()) as { jsonrpc: string; error: { code: number } };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error.code).toBe(-32000);
    expect(harness.sessionCount()).toBe(1);
    expect(harness.activeServers.size).toBe(1);

    // The held session was left alone and still serves requests.
    expect(await listTools(baseUrl, held)).toBe(200);

    // Once it is idle, a new session evicts it.
    stream.abort();
    await waitUntilIdle(harness);
    const next = await openSession(baseUrl);
    expect(harness.sessionCount()).toBe(1);
    expect(await listTools(baseUrl, held)).toBe(404);
    expect(await listTools(baseUrl, next)).toBe(200);
  });
});
