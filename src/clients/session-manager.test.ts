/**
 * Session Manager Tests
 *
 * Covers DB-backed reads and the refresh dedup/error paths using an injected
 * fake BrowserBackend. No real browser, no network. Each test runs against an
 * isolated temp DB.
 *
 * SKIPPED: the full happy-path browser scrape (navigation + consent + cookie
 * polling against a real page) is exercised indirectly by the dedup test's fake,
 * but the live Playwright surface is intentionally not reproduced end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright";
import { SessionManager, resetSessionManager } from "./session-manager.js";
import type { BrowserBackend } from "./browser-backends/index.js";
import { saveSession, loadSession } from "../db/index.js";
import { setupTempDb, teardownTempDb } from "../db/__test-helpers__/temp-db.js";
import type { DisneySession, SessionCookie } from "../types/index.js";

beforeEach(() => {
  setupTempDb();
  resetSessionManager();
});

afterEach(() => {
  teardownTempDb();
});

/** Build a persistable DisneySession with overridable fields. */
function makeSession(overrides: Partial<DisneySession> = {}): DisneySession {
  const now = new Date().toISOString();
  return {
    destination: "wdw",
    state: "active",
    cookies: [],
    tokens: {},
    createdAt: now,
    refreshedAt: now,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    errorCount: 0,
    ...overrides,
  };
}

/** Build a SessionCookie with defaults overridden per-test. */
function makeCookie(overrides: Partial<SessionCookie> & { name: string }): SessionCookie {
  return {
    value: "",
    domain: ".disney.go.com",
    path: "/",
    expires: -1,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    ...overrides,
  };
}

/** A __d JWT whose payload carries iat + expires_in so extraction succeeds. */
function makeAuthCookie(): SessionCookie {
  const body = Buffer.from(JSON.stringify({ iat: 1_700_000_000, expires_in: "28800" })).toString(
    "base64"
  );
  return makeCookie({ name: "__d", value: `header.${body}.sig` });
}

interface FakeState {
  cookies: SessionCookie[];
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

function makeFakePage(): Page {
  return {
    goto: vi.fn(async () => null),
    waitForTimeout: vi.fn(async () => undefined),
    $: vi.fn(async () => null),
  } as unknown as Page;
}

function makeFakeContext(state: FakeState): BrowserContext {
  return {
    newPage: vi.fn(async () => makeFakePage()),
    cookies: vi.fn(async () => state.cookies),
    storageState: vi.fn(async () => state),
    close: vi.fn(async () => undefined),
  } as unknown as BrowserContext;
}

function makeFakeBrowser(state: FakeState): Browser {
  return {
    newContext: vi.fn(async () => makeFakeContext(state)),
  } as unknown as Browser;
}

/** Build a fake backend plus a handle on its launch spy. */
function makeFakeBackend(launchImpl: () => Promise<Browser>): {
  backend: BrowserBackend;
  launch: ReturnType<typeof vi.fn>;
} {
  const launch = vi.fn(launchImpl);
  const backend: BrowserBackend = {
    name: "fake",
    launch,
    close: vi.fn(async () => undefined),
    isAvailable: vi.fn(async () => true),
  };
  return { backend, launch };
}

describe("SessionManager.getSessionStatus", () => {
  it("reports no session when none is stored", async () => {
    const status = await new SessionManager().getSessionStatus("wdw");

    expect(status.hasSession).toBe(false);
  });

  it("reports a far-future session as valid", async () => {
    await saveSession(makeSession({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() }));

    const status = await new SessionManager().getSessionStatus("wdw");

    expect(status.isValid).toBe(true);
  });

  it("reports a past-expiry session as invalid", async () => {
    await saveSession(makeSession({ expiresAt: new Date(Date.now() - 3_600_000).toISOString() }));

    const status = await new SessionManager().getSessionStatus("wdw");

    expect(status.isValid).toBe(false);
  });
});

describe("SessionManager.getAuthHeaders", () => {
  it("builds the Cookie header from session cookies", async () => {
    await saveSession(
      makeSession({
        cookies: [
          makeCookie({ name: "SWID", value: "abc" }),
          makeCookie({ name: "__d", value: "xyz" }),
        ],
      })
    );

    const headers = await new SessionManager().getAuthHeaders("wdw");

    expect(headers.Cookie).toBe("SWID=abc; __d=xyz");
  });

  it("adds X-CSRF-Token when the session carries a csrfToken", async () => {
    await saveSession(makeSession({ tokens: { csrfToken: "csrf-123" } }));

    const headers = await new SessionManager().getAuthHeaders("wdw");

    expect(headers["X-CSRF-Token"]).toBe("csrf-123");
  });

  it("returns an empty object when no usable session exists", async () => {
    const { backend } = makeFakeBackend(async () => {
      throw new Error("launch failed");
    });

    const headers = await new SessionManager(backend).getAuthHeaders("wdw");

    expect(headers).toEqual({});
  });
});

describe("SessionManager.reportSuccess / reportError", () => {
  it("reportError increments the stored error count", async () => {
    await saveSession(makeSession({ errorCount: 0 }));

    await new SessionManager().reportError("wdw", new Error("boom"));

    const after = await loadSession("wdw");
    expect(after?.errorCount).toBe(1);
  });

  it("reportSuccess clears the stored error count", async () => {
    await saveSession(makeSession({ errorCount: 2, state: "error" }));

    await new SessionManager().reportSuccess("wdw");

    const after = await loadSession("wdw");
    expect(after?.errorCount).toBe(0);
  });
});

describe("SessionManager.refreshSession", () => {
  it("deduplicates concurrent refreshes into a single backend launch", async () => {
    await saveSession(makeSession({ expiresAt: new Date(Date.now() - 3_600_000).toISOString() }));
    const state: FakeState = { cookies: [makeAuthCookie()], origins: [] };
    const { backend, launch } = makeFakeBackend(async () => makeFakeBrowser(state));
    const manager = new SessionManager(backend);

    await Promise.all([manager.getSession("wdw"), manager.getSession("wdw")]);

    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("records a session error when the refresh fails", async () => {
    await saveSession(
      makeSession({ expiresAt: new Date(Date.now() - 3_600_000).toISOString(), errorCount: 0 })
    );
    const { backend } = makeFakeBackend(async () => {
      throw new Error("launch failed");
    });

    await new SessionManager(backend).getSession("wdw");

    const after = await loadSession("wdw");
    expect(after?.errorCount).toBe(1);
  });
});
