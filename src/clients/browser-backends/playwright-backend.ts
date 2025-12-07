/**
 * Playwright Backend
 *
 * Default browser backend using Playwright's bundled Chromium.
 * This is the current production implementation.
 */

import { chromium, type Browser } from "playwright";
import type { BrowserBackend } from "./types.js";
import { getConfig } from "../../config/index.js";
import { createLogger } from "../../shared/index.js";

const logger = createLogger("PlaywrightBackend");

export class PlaywrightBackend implements BrowserBackend {
  readonly name = "playwright";
  private browser: Browser | null = null;

  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const config = getConfig();
    logger.info("Launching Playwright Chromium", { headless: !config.showBrowser });

    this.browser = await chromium.launch({
      headless: !config.showBrowser,
    });

    return this.browser;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info("Playwright browser closed");
    }
  }

  async isAvailable(): Promise<boolean> {
    // Playwright is always available since it's a dependency
    return true;
  }
}
