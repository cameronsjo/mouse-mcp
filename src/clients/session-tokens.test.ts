/**
 * Session Token Extraction Tests
 *
 * Pure-logic coverage for token extraction, expiration calculation, and
 * timezone mapping. No browser, no network, deterministic clock.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { extractTokens, calculateExpiration, getTimezone } from "./session-tokens.js";
import type { DestinationId, SessionCookie } from "../types/index.js";

/** Build a SessionCookie with sensible defaults overridden per-test. */
function makeCookie(overrides: Partial<SessionCookie> & { name: string }): SessionCookie {
  return {
    value: "",
    domain: ".disney.go.com",
    path: "/",
    expires: 0,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
    ...overrides,
  };
}

/** Encode a JWT-shaped string whose payload base64-decodes to the given object. */
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `${header}.${body}.signature`;
}

describe("extractTokens", () => {
  it("maps a SWID cookie to sessionId", () => {
    const cookies = [makeCookie({ name: "SWID", value: "{ABC-123}" })];

    const result = extractTokens(cookies, []);

    expect(result.sessionId).toBe("{ABC-123}");
  });

  it("uses the __d cookie value as authToken", () => {
    const jwt = makeJwt({ expires_in: "28800", token_type: "Bearer" });
    const cookies = [makeCookie({ name: "__d", value: jwt })];

    const result = extractTokens(cookies, []);

    expect(result.authToken).toBe(jwt);
  });

  it("falls back to a localStorage token when no __d cookie is present", () => {
    const origins = [
      {
        origin: "https://disneyworld.disney.go.com",
        localStorage: [{ name: "pep_auth_token", value: "ls-token-value" }],
      },
    ];

    const result = extractTokens([], origins);

    expect(result.authToken).toBe("ls-token-value");
  });

  it("returns both tokens undefined when nothing matches", () => {
    const result = extractTokens([], []);

    expect(result).toEqual({ sessionId: undefined, authToken: undefined });
  });
});

describe("calculateExpiration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives expiration from the __d JWT iat + expires_in", () => {
    const iat = 1_700_000_000;
    const expiresIn = 3600;
    const cookies = [makeCookie({ name: "__d", value: makeJwt({ iat, expires_in: "3600" }) })];

    const result = calculateExpiration(cookies);

    expect(result).toBe(new Date((iat + expiresIn) * 1000).toISOString());
  });

  it("falls back to a future finderPublicTokenExpireTime cookie", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
    const futureMs = Date.now() + 60 * 60 * 1000;
    const cookies = [makeCookie({ name: "finderPublicTokenExpireTime", value: String(futureMs) })];

    const result = calculateExpiration(cookies);

    expect(result).toBe(new Date(futureMs).toISOString());
  });

  it("falls back to the earliest valid future session-cookie expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
    const nowSec = Math.floor(Date.now() / 1000);
    const earliestSec = nowSec + 3600;
    const cookies = [
      makeCookie({ name: "SWID", value: "{guid}", expires: nowSec + 7200 }),
      makeCookie({ name: "my_session", value: "x", expires: earliestSec }),
    ];

    const result = calculateExpiration(cookies);

    expect(result).toBe(new Date(earliestSec * 1000).toISOString());
  });

  it("defaults to now + 8 hours when no expiry information is usable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));

    const result = calculateExpiration([]);

    expect(result).toBe(new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString());
  });
});

describe("getTimezone", () => {
  it("maps wdw to America/New_York", () => {
    expect(getTimezone("wdw")).toBe("America/New_York");
  });

  it("maps dlr to America/Los_Angeles", () => {
    expect(getTimezone("dlr")).toBe("America/Los_Angeles");
  });

  it("defaults unknown destinations to America/New_York", () => {
    expect(getTimezone("unknown" as DestinationId)).toBe("America/New_York");
  });
});
