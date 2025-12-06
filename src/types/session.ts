/**
 * Session Types
 *
 * Types for Playwright-based Disney API session management.
 */

import type { DestinationId } from "./disney.js";

/** Session state tracking */
export type SessionState =
  | "uninitialized"
  | "initializing"
  | "active"
  | "refreshing"
  | "expired"
  | "error";

/** Cookie structure matching Playwright's format */
export interface SessionCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires: number;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: "Strict" | "Lax" | "None";
}

/** Complete session data persisted to storage */
export interface DisneySession {
  /** Which Disney destination this session is for */
  readonly destination: DestinationId;

  /** Current session state */
  readonly state: SessionState;

  /** All cookies extracted from browser session */
  readonly cookies: SessionCookie[];

  /** Key tokens extracted from cookies/localStorage */
  readonly tokens: {
    /** Primary authorization token if available */
    readonly authToken?: string;
    /** Session identifier from Disney */
    readonly sessionId?: string;
    /** CSRF token if required */
    readonly csrfToken?: string;
  };

  /** When session was established (ISO 8601 UTC) */
  readonly createdAt: string;

  /** When session was last refreshed (ISO 8601 UTC) */
  readonly refreshedAt: string;

  /** When session expires (ISO 8601 UTC) */
  readonly expiresAt: string;

  /** Number of consecutive errors during API calls */
  readonly errorCount: number;

  /** Last error message if any */
  readonly lastError?: string;
}

/** Session manager configuration */
export interface SessionManagerConfig {
  /** Directory for database storage */
  readonly dbPath: string;

  /** How many minutes before expiration to trigger refresh (default: 60 for daily refresh) */
  readonly refreshBufferMinutes: number;

  /** Maximum consecutive errors before forcing re-initialization */
  readonly maxConsecutiveErrors: number;

  /** Browser launch options */
  readonly browserOptions: {
    readonly headless: boolean;
    readonly timeout: number;
  };
}
