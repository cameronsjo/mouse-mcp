/**
 * Lightpanda Backend
 *
 * Experimental browser backend using Lightpanda via CDP.
 * Lightpanda is a lightweight headless browser written in Zig.
 *
 * Benefits:
 * - 11x faster than Chrome
 * - 9x less memory than Chrome
 * - Instant startup
 *
 * Requirements:
 * - Lightpanda binary must be running: ./lightpanda serve --host 127.0.0.1 --port 9222
 * - Set MOUSE_MCP_BROWSER=lightpanda to enable
 *
 * @see https://github.com/lightpanda-io/browser
 */

import { chromium, type Browser } from "playwright";
import type { BrowserBackend } from "./types.js";
import { createLogger } from "../../shared/index.js";

const logger = createLogger("LightpandaBackend");

const DEFAULT_CDP_ENDPOINT = "http://127.0.0.1:9222";

export class LightpandaBackend implements BrowserBackend {
  readonly name = "lightpanda";
  private browser: Browser | null = null;
  private cdpEndpoint: string;

  constructor(cdpEndpoint: string = DEFAULT_CDP_ENDPOINT) {
    this.cdpEndpoint = cdpEndpoint;
  }

  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    logger.info("Connecting to Lightpanda via CDP", { endpoint: this.cdpEndpoint });

    try {
      // Playwright can connect to any CDP-compatible browser
      this.browser = await chromium.connectOverCDP(this.cdpEndpoint, {
        timeout: 10000,
      });

      const version = this.browser.version();
      logger.info("Connected to Lightpanda", { version });

      return this.browser;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to connect to Lightpanda", error, { endpoint: this.cdpEndpoint });
      throw new Error(`Lightpanda connection failed: ${message}. Is Lightpanda running?`);
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      // For CDP connections, we disconnect rather than close
      // (the external browser keeps running)
      await this.browser.close();
      this.browser = null;
      logger.info("Disconnected from Lightpanda");
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try to fetch the CDP /json/version endpoint
      const response = await fetch(`${this.cdpEndpoint}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        // CDP version endpoint returns { Browser: "..." } with capital B
        // eslint-disable-next-line @typescript-eslint/naming-convention -- CDP protocol uses PascalCase
        const info = (await response.json()) as { Browser?: string };
        logger.debug("Lightpanda available", { browser: info.Browser });
        return true;
      }

      return false;
    } catch {
      logger.debug("Lightpanda not available", { endpoint: this.cdpEndpoint });
      return false;
    }
  }
}
