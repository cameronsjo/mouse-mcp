/**
 * Session Manager
 *
 * Handles Disney API authentication via Playwright.
 * Manages session lifecycle with daily refresh.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createLogger } from "../shared/index.js";
import { getConfig } from "../config/index.js";
import {
  loadSession,
  loadAllSessions,
  saveSession,
  isSessionExpired,
  updateSessionError,
  resetSessionErrors,
} from "../db/index.js";
import type { DisneySession, DestinationId, SessionCookie } from "../types/index.js";

const logger = createLogger("SessionManager");

/** Disney website URLs by destination - use attractions pages to trigger API auth */
const DISNEY_URLS: Record<DestinationId, string> = {
  wdw: "https://disneyworld.disney.go.com/attractions/",
  dlr: "https://disneyland.disney.go.com/attractions/",
};

/** Cookie consent selectors (Disney uses OneTrust) */
const CONSENT_SELECTORS = [
  "#onetrust-accept-btn-handler",
  '[data-testid="cookie-accept"]',
  'button[aria-label*="Accept"]',
];

/** Default session duration in hours (8 hours matches Disney token TTL) */
const DEFAULT_SESSION_HOURS = 8;

/**
 * Session manager for Disney API authentication.
 *
 * Uses Playwright to establish browser sessions and extract cookies
 * needed for API requests. Sessions are persisted and refreshed daily.
 */
export class SessionManager {
  private browser: Browser | null = null;
  private refreshPromises = new Map<DestinationId, Promise<DisneySession | null>>();
  private initialized = false;

  /**
   * Initialize the session manager.
   * Loads persisted sessions and schedules refreshes if needed.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info("Initializing session manager");

    const sessions = await loadAllSessions();
    const config = getConfig();

    for (const session of sessions) {
      if (isSessionExpired(session, config.refreshBufferMinutes)) {
        logger.info("Session needs refresh", {
          destination: session.destination,
          expiresAt: session.expiresAt,
        });
      } else {
        logger.debug("Session is valid", {
          destination: session.destination,
          expiresAt: session.expiresAt,
        });
      }
    }

    this.initialized = true;
    logger.info("Session manager initialized", { sessionCount: sessions.length });
  }

  /**
   * Get a valid session for the destination.
   * Establishes a new session if none exists or current is expired.
   *
   * Returns null if session establishment fails (fallback to ThemeParks.wiki).
   */
  async getSession(destination: DestinationId): Promise<DisneySession | null> {
    const config = getConfig();
    const session = await loadSession(destination);

    // Check if session exists and is valid
    if (session && !isSessionExpired(session, config.refreshBufferMinutes)) {
      return session;
    }

    // Need to establish/refresh session
    return this.refreshSession(destination);
  }

  /**
   * Refresh a session using Playwright.
   * Deduplicates concurrent refresh requests for the same destination.
   */
  private async refreshSession(destination: DestinationId): Promise<DisneySession | null> {
    // Deduplicate concurrent refresh requests
    const existing = this.refreshPromises.get(destination);
    if (existing) {
      logger.debug("Reusing existing refresh promise", { destination });
      return existing;
    }

    const promise = this.doRefreshSession(destination);
    this.refreshPromises.set(destination, promise);

    try {
      return await promise;
    } finally {
      this.refreshPromises.delete(destination);
    }
  }

  private async doRefreshSession(destination: DestinationId): Promise<DisneySession | null> {
    logger.info("Establishing session", { destination });

    try {
      const browser = await this.getBrowser();
      const config = getConfig();

      const context = await browser.newContext({
        userAgent: this.getUserAgent(),
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
        timezoneId: this.getTimezone(destination),
      });

      try {
        const page = await context.newPage();
        const url = DISNEY_URLS[destination];

        // Navigate to Disney homepage
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: config.timeoutMs,
        });

        // Handle cookie consent
        await this.handleCookieConsent(page);

        // Wait for session cookies to be set
        await this.waitForSessionCookies(context);

        // Extract session data
        const session = await this.extractSession(context, destination);

        // Save to database
        await saveSession(session);

        logger.info("Session established", {
          destination,
          expiresAt: session.expiresAt,
        });

        return session;
      } finally {
        await context.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to establish session", error, { destination });
      await updateSessionError(destination, message);
      return null;
    }
  }

  /**
   * Get authentication headers for API requests.
   */
  async getAuthHeaders(destination: DestinationId): Promise<Record<string, string>> {
    const session = await this.getSession(destination);

    if (!session) {
      return {};
    }

    // Build cookie header from session cookies
    const cookieHeader = session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const headers: Record<string, string> = {
      Cookie: cookieHeader,
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    };

    // Add CSRF token if available
    if (session.tokens.csrfToken) {
      headers["X-CSRF-Token"] = session.tokens.csrfToken;
    }

    return headers;
  }

  /**
   * Report a successful API call to reset error tracking.
   */
  async reportSuccess(destination: DestinationId): Promise<void> {
    await resetSessionErrors(destination);
  }

  /**
   * Report an API error for session health tracking.
   */
  async reportError(destination: DestinationId, error: Error): Promise<void> {
    await updateSessionError(destination, error.message);
  }

  /**
   * Get session status for health reporting.
   */
  async getSessionStatus(destination: DestinationId): Promise<{
    hasSession: boolean;
    isValid: boolean;
    expiresAt: string | null;
    errorCount: number;
  }> {
    const config = getConfig();
    const session = await loadSession(destination);

    if (!session) {
      return {
        hasSession: false,
        isValid: false,
        expiresAt: null,
        errorCount: 0,
      };
    }

    return {
      hasSession: true,
      isValid: !isSessionExpired(session, config.refreshBufferMinutes),
      expiresAt: session.expiresAt,
      errorCount: session.errorCount,
    };
  }

  /**
   * Clean shutdown - close browser.
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down session manager");

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // --- Private Methods ---

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const config = getConfig();
      this.browser = await chromium.launch({
        headless: !config.showBrowser,
      });
    }
    return this.browser;
  }

  private async handleCookieConsent(page: Page): Promise<void> {
    // Wait a bit for consent banner to appear
    await page.waitForTimeout(2000);

    for (const selector of CONSENT_SELECTORS) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          logger.debug("Accepted cookie consent");
          await page.waitForTimeout(1000);
          return;
        }
      } catch {
        // Selector not found, try next
      }
    }
    logger.debug("No cookie consent banner found");
  }

  private async waitForSessionCookies(context: BrowserContext): Promise<void> {
    const maxAttempts = 15;
    const pollInterval = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const cookies = await context.cookies();

      // The critical cookie is __d - a JWT containing the access token
      // This is generated client-side by Disney's JavaScript after page load
      const authCookie = cookies.find((c) => c.name === "__d");

      if (authCookie) {
        logger.debug("Disney auth cookie (__d) detected", { attempt: attempt + 1 });
        return;
      }

      // Also check for finderPublicTokenExpireTime which indicates the finder API is ready
      const finderToken = cookies.find((c) => c.name === "finderPublicTokenExpireTime");

      if (finderToken) {
        logger.debug("Finder token detected", { attempt: attempt + 1 });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    logger.warn("Disney auth cookies not detected after max attempts");
  }

  private async extractSession(
    context: BrowserContext,
    destination: DestinationId
  ): Promise<DisneySession> {
    const storageState = await context.storageState();

    const cookies: SessionCookie[] = storageState.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));

    // Extract specific tokens
    const tokens = this.extractTokens(cookies, storageState.origins);

    // Calculate expiration
    const expiresAt = this.calculateExpiration(cookies);

    const now = new Date().toISOString();

    return {
      destination,
      state: "active",
      cookies,
      tokens,
      createdAt: now,
      refreshedAt: now,
      expiresAt,
      errorCount: 0,
    };
  }

  private extractTokens(
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
          );
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

  private calculateExpiration(cookies: SessionCookie[]): string {
    // Primary: Check __d JWT for expiration info
    const authCookie = cookies.find((c) => c.name === "__d");
    if (authCookie) {
      try {
        const payload = JSON.parse(
          Buffer.from(authCookie.value.split(".")[1] ?? "", "base64").toString()
          // eslint-disable-next-line @typescript-eslint/naming-convention
        ) as { iat?: number; expires_in?: string };
        // payload.iat is when token was issued, expires_in is seconds
        if (payload.iat && payload.expires_in) {
          const expiresAtMs = (payload.iat + parseInt(payload.expires_in, 10)) * 1000;
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
      .map((c) => c.expires * 1000); // Convert to milliseconds

    if (validExpirations.length > 0) {
      const earliestExpiry = Math.min(...validExpirations);
      if (earliestExpiry > Date.now()) {
        return new Date(earliestExpiry).toISOString();
      }
    }

    // Default expiration (8 hours, matching Disney's token TTL)
    return new Date(Date.now() + DEFAULT_SESSION_HOURS * 60 * 60 * 1000).toISOString();
  }

  private getTimezone(destination: DestinationId): string {
    switch (destination) {
      case "wdw":
        return "America/New_York";
      case "dlr":
        return "America/Los_Angeles";
      default:
        return "America/New_York";
    }
  }

  private getUserAgent(): string {
    return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }
}

// Singleton instance
let instance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  instance ??= new SessionManager();
  return instance;
}
