/**
 * Browser Backends
 *
 * Factory for creating browser backend instances.
 */

export type { BrowserBackend, BrowserBackendType, SessionExtractionResult } from "./types.js";
export { PlaywrightBackend } from "./playwright-backend.js";
export { LightpandaBackend } from "./lightpanda-backend.js";

import type { BrowserBackend, BrowserBackendType } from "./types.js";
import { PlaywrightBackend } from "./playwright-backend.js";
import { LightpandaBackend } from "./lightpanda-backend.js";
import { createLogger } from "../../shared/index.js";

const logger = createLogger("BrowserBackends");

/**
 * Create a browser backend based on type.
 *
 * @param type - Backend type ("playwright" or "lightpanda")
 * @param cdpEndpoint - CDP endpoint URL for Lightpanda (optional)
 */
export function createBrowserBackend(
  type: BrowserBackendType = "playwright",
  cdpEndpoint?: string
): BrowserBackend {
  switch (type) {
    case "lightpanda":
      logger.info("Creating Lightpanda backend");
      return new LightpandaBackend(cdpEndpoint);

    case "playwright":
    default:
      logger.info("Creating Playwright backend");
      return new PlaywrightBackend();
  }
}

/**
 * Auto-detect and create the best available backend.
 *
 * Prefers Lightpanda if available, falls back to Playwright.
 */
export async function createAutoBackend(cdpEndpoint?: string): Promise<BrowserBackend> {
  const lightpanda = new LightpandaBackend(cdpEndpoint);

  if (await lightpanda.isAvailable()) {
    logger.info("Auto-detected Lightpanda, using as backend");
    return lightpanda;
  }

  logger.info("Lightpanda not available, using Playwright");
  return new PlaywrightBackend();
}
