/**
 * Browser Backend Types
 *
 * Abstraction layer for different browser backends.
 * Allows swapping between Playwright's bundled Chromium and
 * external browsers like Lightpanda via CDP.
 */

import type { Browser } from "playwright";

export interface BrowserBackend {
  /** Backend identifier */
  readonly name: string;

  /** Launch or connect to the browser */
  launch(): Promise<Browser>;

  /** Clean shutdown */
  close(): Promise<void>;

  /** Check if this backend is available */
  isAvailable(): Promise<boolean>;
}

export interface SessionExtractionResult {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  localStorage: Array<{
    origin: string;
    items: Array<{ name: string; value: string }>;
  }>;
}

export type BrowserBackendType = "playwright" | "lightpanda";
