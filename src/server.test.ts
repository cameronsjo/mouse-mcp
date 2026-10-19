/**
 * DisneyMcpServer HTTP session tests.
 *
 * Regression: HTTP mode used to reuse one MCP Server for every session, so the
 * second transport's connect() threw "Already connected to a transport". A
 * stateless gateway that opens a new session per request then saw only the first
 * one succeed. These tests drive real StreamableHTTP sessions over a loopback
 * socket; the Disney clients, DB, and event wiring are mocked (no network).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
