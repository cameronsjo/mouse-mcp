/**
 * Session Persistence Integration Tests
 *
 * Test Plan:
 *
 * saveSession / loadSession (Classification: I/O boundary — round-trip)
 *   [x] Happy: save then load returns the same session (cookies + tokens JSON)
 *   [x] Unhappy: load for missing destination returns null
 *   [x] Unhappy: corrupt stored cookies JSON returns null
 *
 * loadAllSessions (Classification: I/O boundary — batch)
 *   [x] Returns all saved sessions
 *   [x] Skips corrupt rows, returns the rest
 *
 * deleteSession (Classification: I/O boundary — mutation)
 *   [x] Returns true and removes an existing session
 *   [x] Returns false for a missing destination
 *
 * updateSessionError (Classification: State machine)
 *   [x] Increments error_count and records last_error
 *   [x] Flips state to 'error' when existing error_count >= 2
 *
 * resetSessionErrors (Classification: State machine)
 *   [x] Clears error_count, last_error, and resets state to 'active'
 *
 * isSessionExpired (Classification: Pure function)
 *   [x] Returns true when expiresAt is in the past
 *   [x] Returns true when session expires within the buffer window
 *   [x] Returns false when session is far in the future
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupTempDb, teardownTempDb } from "./__test-helpers__/temp-db.js";
import {
  saveSession,
  loadSession,
  loadAllSessions,
  deleteSession,
  updateSessionError,
  resetSessionErrors,
  isSessionExpired,
} from "./sessions.js";
import { getDatabase } from "./database.js";
import type { DisneySession } from "../types/index.js";

// ---------------------------------------------------------------------------
// Session factory
// ---------------------------------------------------------------------------

function makeSession(
  destination: "wdw" | "dlr" = "wdw",
  overrides: Partial<DisneySession> = {}
): DisneySession {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    destination,
    state: "active",
    cookies: [
      {
        name: "session_id",
        value: "abc123",
        domain: ".disney.com",
        path: "/",
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ],
    tokens: { authToken: "token-abc", sessionId: "sess-xyz" },
    createdAt: new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
    expiresAt: future,
    errorCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  setupTempDb();
});

afterEach(() => {
  vi.useRealTimers();
  teardownTempDb();
});

// ---------------------------------------------------------------------------
// saveSession / loadSession
// ---------------------------------------------------------------------------

describe("saveSession / loadSession", () => {
  it("round-trips cookies and tokens as JSON", async () => {
    const session = makeSession("wdw");
    await saveSession(session);

    const loaded = await loadSession("wdw");

    expect(loaded).not.toBeNull();
    expect(loaded?.destination).toBe("wdw");
    expect(loaded?.state).toBe("active");
    expect(loaded?.cookies).toEqual(session.cookies);
    expect(loaded?.tokens).toEqual(session.tokens);
  });

  it("returns null for a destination that has no saved session", async () => {
    const result = await loadSession("dlr");

    expect(result).toBeNull();
  });

  it("returns null when the stored cookies JSON is corrupt", async () => {
    await saveSession(makeSession("wdw"));
    const db = await getDatabase();
    db.run("UPDATE sessions SET cookies = ? WHERE destination = ?", ["{bad{json}", "wdw"]);

    const result = await loadSession("wdw");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadAllSessions
// ---------------------------------------------------------------------------

describe("loadAllSessions", () => {
  it("returns all saved sessions", async () => {
    await saveSession(makeSession("wdw"));
    await saveSession(makeSession("dlr"));

    const sessions = await loadAllSessions();

    expect(sessions).toHaveLength(2);
    const destinations = sessions.map((s) => s.destination).sort();
    expect(destinations).toEqual(["dlr", "wdw"]);
  });

  it("skips corrupt rows and returns the healthy ones", async () => {
    await saveSession(makeSession("wdw"));
    await saveSession(makeSession("dlr"));
    const db = await getDatabase();
    // Corrupt DLR's tokens field
    db.run("UPDATE sessions SET tokens = ? WHERE destination = ?", ["{bad}", "dlr"]);

    const sessions = await loadAllSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.destination).toBe("wdw");
  });
});

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------

describe("deleteSession", () => {
  it("returns true and removes an existing session", async () => {
    await saveSession(makeSession("wdw"));

    const result = await deleteSession("wdw");

    expect(result).toBe(true);
    expect(await loadSession("wdw")).toBeNull();
  });

  it("returns false for a destination with no session", async () => {
    const result = await deleteSession("wdw");

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateSessionError
// ---------------------------------------------------------------------------

describe("updateSessionError", () => {
  it("increments error_count and records last_error", async () => {
    await saveSession(makeSession("wdw", { errorCount: 0 }));

    await updateSessionError("wdw", "network timeout");

    const loaded = await loadSession("wdw");

    expect(loaded?.errorCount).toBe(1);
    expect(loaded?.lastError).toBe("network timeout");
  });

  it("flips state to error when existing error_count is 2 or more", async () => {
    // Seed with error_count = 2; the CASE checks original value before increment
    await saveSession(makeSession("wdw", { errorCount: 2, state: "active" }));

    await updateSessionError("wdw", "third error");

    const loaded = await loadSession("wdw");

    expect(loaded?.state).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// resetSessionErrors
// ---------------------------------------------------------------------------

describe("resetSessionErrors", () => {
  it("clears error_count, last_error and sets state to active", async () => {
    await saveSession(
      makeSession("wdw", { errorCount: 3, lastError: "old error", state: "error" })
    );

    await resetSessionErrors("wdw");

    const loaded = await loadSession("wdw");

    expect(loaded?.errorCount).toBe(0);
    expect(loaded?.lastError).toBeUndefined();
    expect(loaded?.state).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// isSessionExpired (pure function — use fake timers for determinism)
// ---------------------------------------------------------------------------

describe("isSessionExpired", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when expiresAt is in the past", () => {
    const session = makeSession("wdw", { expiresAt: "2026-01-01T10:00:00Z" });

    expect(isSessionExpired(session)).toBe(true);
  });

  it("returns true when session expires within the buffer window", () => {
    // Default buffer = 60 min; expires in 30 min from "now"
    const session = makeSession("wdw", { expiresAt: "2026-01-01T12:30:00Z" });

    expect(isSessionExpired(session, 60)).toBe(true);
  });

  it("returns false when session is far from expiry", () => {
    // Expires in 24 hours — well outside the default buffer
    const session = makeSession("wdw", { expiresAt: "2026-01-02T12:00:00Z" });

    expect(isSessionExpired(session)).toBe(false);
  });

  it("respects a custom bufferMinutes of 0 — only truly past sessions expire", () => {
    // Expires in 1 minute — still valid with buffer=0
    const session = makeSession("wdw", { expiresAt: "2026-01-01T12:01:00Z" });

    expect(isSessionExpired(session, 0)).toBe(false);
  });
});
