/**
 * Session Token Extraction
 *
 * Pure helpers for deriving Disney session tokens, expiration, and timezone
 * from browser cookies / localStorage. Extracted from SessionManager so the
 * logic is unit-testable without a browser backend. Behavior is identical to
 * the original private methods.
 */

import { createLogger } from "../shared/index.js";
import { DEFAULT_SESSION_HOURS, MS_PER_HOUR, MS_PER_SECOND } from "../shared/constants.js";
import type { DisneySession, DestinationId, SessionCookie } from "../types/index.js";

const logger = createLogger("SessionTokens");

/**
 * Extract Disney auth tokens from session cookies and localStorage.
 */
export function extractTokens(
  cookies: SessionCookie[],
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>
): DisneySession["tokens"] {
  let sessionId: string | undefined;
  let authToken: string | undefined;

  // Look for Disney auth cookies
  for (const cookie of cookies) {
    if (cookie.name === "SWID") {
      sessionId = cookie.value;
    }
    // The __d cookie is a JWT containing the bearer token
    if (cookie.name === "__d") {
      authToken = cookie.value;
      // Decode JWT to get actual access token (for logging/debugging)
      try {
        const payload = JSON.parse(
          Buffer.from(cookie.value.split(".")[1] ?? "", "base64").toString()
          // eslint-disable-next-line @typescript-eslint/naming-convention -- JWT payload uses snake_case
        ) as { expires_in?: string; token_type?: string };
        logger.debug("Disney auth token extracted", {
          expiresIn: payload.expires_in,
          tokenType: payload.token_type,
        });
      } catch {
        logger.debug("Could not decode __d JWT payload");
      }
    }
  }

  // Check localStorage for tokens (fallback)
  if (!authToken) {
    for (const origin of origins) {
      for (const item of origin.localStorage) {
        if (item.name.includes("token") || item.name.includes("auth")) {
          authToken = item.value;
          break;
        }
      }
    }
  }

  return { sessionId, authToken };
}

/**
 * Calculate session expiration (ISO 8601 UTC) from cookies.
 */
export function calculateExpiration(cookies: SessionCookie[]): string {
  // Primary: Check __d JWT for expiration info
  const authCookie = cookies.find((c) => c.name === "__d");
  if (authCookie) {
    try {
      const payload = JSON.parse(
        Buffer.from(authCookie.value.split(".")[1] ?? "", "base64").toString()
        // eslint-disable-next-line @typescript-eslint/naming-convention
      ) as { iat?: number; expires_in?: string };
      // payload.iat is when token was issued, expires_in is seconds
      if (payload.iat !== undefined && payload.expires_in) {
        const expiresAtMs = (payload.iat + parseInt(payload.expires_in, 10)) * MS_PER_SECOND;
        return new Date(expiresAtMs).toISOString();
      }
    } catch {
      // Fall through to other methods
    }
  }

  // Fallback: Check finderPublicTokenExpireTime cookie
  const finderExpire = cookies.find((c) => c.name === "finderPublicTokenExpireTime");
  if (finderExpire) {
    const expireMs = parseInt(finderExpire.value, 10);
    if (expireMs > Date.now()) {
      return new Date(expireMs).toISOString();
    }
  }

  // Last resort: Look for any session cookie expiration
  const sessionCookies = cookies.filter(
    (c) =>
      c.name === "__d" ||
      c.name.includes("session") ||
      c.name.includes("auth") ||
      c.name.includes("SWID")
  );

  const validExpirations = sessionCookies
    .filter((c) => c.expires > 0)
    .map((c) => c.expires * MS_PER_SECOND);

  if (validExpirations.length > 0) {
    const earliestExpiry = Math.min(...validExpirations);
    if (earliestExpiry > Date.now()) {
      return new Date(earliestExpiry).toISOString();
    }
  }

  // Default expiration (8 hours, matching Disney's token TTL)
  return new Date(Date.now() + DEFAULT_SESSION_HOURS * MS_PER_HOUR).toISOString();
}

/**
 * Get the IANA timezone for a destination.
 */
export function getTimezone(destination: DestinationId): string {
  switch (destination) {
    case "wdw":
      return "America/New_York";
    case "dlr":
      return "America/Los_Angeles";
    default:
      return "America/New_York";
  }
}
