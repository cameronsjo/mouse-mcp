#!/usr/bin/env npx tsx
/**
 * Lightpanda Browser Test Script
 *
 * Compares Playwright and Lightpanda for Disney session extraction.
 *
 * Usage:
 *   1. Start Lightpanda: ./lightpanda serve --host 127.0.0.1 --port 9222
 *   2. Run this script: npx tsx scripts/test-lightpanda.ts
 *
 * The script will:
 *   - Test both backends against Disney's website
 *   - Compare cookie extraction capabilities
 *   - Measure performance differences
 *   - Report any compatibility issues
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const DISNEY_URL = "https://disneyworld.disney.go.com/attractions/";
const CDP_ENDPOINT = process.env.LIGHTPANDA_CDP ?? "http://127.0.0.1:9222";

const CONSENT_SELECTORS = [
  "#onetrust-accept-btn-handler",
  '[data-testid="cookie-accept"]',
  'button[aria-label*="Accept"]',
];

interface TestResult {
  backend: string;
  success: boolean;
  startupMs: number;
  navigationMs: number;
  cookieExtractionMs: number;
  totalMs: number;
  cookieCount: number;
  hasAuthCookie: boolean;
  hasFinderToken: boolean;
  hasSWID: boolean;
  authCookieValue?: string;
  error?: string;
  warnings: string[];
}

async function handleCookieConsent(page: Page): Promise<void> {
  await page.waitForTimeout(2000);

  for (const selector of CONSENT_SELECTORS) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        console.log("    ✓ Accepted cookie consent");
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      // Try next selector
    }
  }
  console.log("    ⚠ No cookie consent banner found");
}

async function waitForAuthCookies(
  context: BrowserContext,
  maxAttempts = 15
): Promise<{ found: boolean; attempts: number }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => c.name === "__d");
    const finderToken = cookies.find((c) => c.name === "finderPublicTokenExpireTime");

    if (authCookie || finderToken) {
      return { found: true, attempts: attempt + 1 };
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  return { found: false, attempts: maxAttempts };
}

async function testBackend(
  name: string,
  getBrowser: () => Promise<Browser>
): Promise<TestResult> {
  const warnings: string[] = [];
  const result: TestResult = {
    backend: name,
    success: false,
    startupMs: 0,
    navigationMs: 0,
    cookieExtractionMs: 0,
    totalMs: 0,
    cookieCount: 0,
    hasAuthCookie: false,
    hasFinderToken: false,
    hasSWID: false,
    warnings,
  };

  const totalStart = Date.now();

  try {
    // Launch browser
    console.log(`\n  [${name}] Launching browser...`);
    const launchStart = Date.now();
    const browser = await getBrowser();
    result.startupMs = Date.now() - launchStart;
    console.log(`    ✓ Browser launched in ${result.startupMs}ms`);

    // Create context
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/New_York",
    });

    try {
      const page = await context.newPage();

      // Navigate to Disney
      console.log(`  [${name}] Navigating to Disney...`);
      const navStart = Date.now();
      await page.goto(DISNEY_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      result.navigationMs = Date.now() - navStart;
      console.log(`    ✓ Navigation completed in ${result.navigationMs}ms`);

      // Handle consent
      await handleCookieConsent(page);

      // Wait for auth cookies
      console.log(`  [${name}] Waiting for auth cookies...`);
      const cookieStart = Date.now();
      const { found, attempts } = await waitForAuthCookies(context);
      result.cookieExtractionMs = Date.now() - cookieStart;

      if (!found) {
        warnings.push(`Auth cookies not found after ${attempts} attempts`);
        console.log(`    ⚠ Auth cookies not found after ${attempts} attempts`);
      } else {
        console.log(`    ✓ Auth cookies found after ${attempts} attempts (${result.cookieExtractionMs}ms)`);
      }

      // Extract cookies
      const cookies = await context.cookies();
      result.cookieCount = cookies.length;

      const authCookie = cookies.find((c) => c.name === "__d");
      const finderToken = cookies.find((c) => c.name === "finderPublicTokenExpireTime");
      const swid = cookies.find((c) => c.name === "SWID");

      result.hasAuthCookie = !!authCookie;
      result.hasFinderToken = !!finderToken;
      result.hasSWID = !!swid;

      if (authCookie) {
        // Decode JWT payload
        try {
          const payload = JSON.parse(
            Buffer.from(authCookie.value.split(".")[1] ?? "", "base64").toString()
          );
          result.authCookieValue = `JWT (expires_in: ${payload.expires_in ?? "unknown"})`;
        } catch {
          result.authCookieValue = "JWT (could not decode)";
        }
      }

      // Try to get storage state (localStorage)
      try {
        const storageState = await context.storageState();
        const localStorageItems = storageState.origins.reduce(
          (sum, o) => sum + o.localStorage.length,
          0
        );
        console.log(`    ✓ Storage state: ${cookies.length} cookies, ${localStorageItems} localStorage items`);
      } catch (e) {
        warnings.push(`storageState() failed: ${e}`);
        console.log(`    ⚠ storageState() not supported or failed`);
      }

      result.success = result.hasAuthCookie || result.hasFinderToken;

      // Close browser
      await context.close();
      await browser.close();
    } catch (e) {
      await context.close();
      throw e;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.log(`    ✗ Error: ${result.error}`);
  }

  result.totalMs = Date.now() - totalStart;
  return result;
}

async function checkLightpandaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${CDP_ENDPOINT}/json/version`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const info = (await response.json()) as { Browser?: string };
      console.log(`  Lightpanda detected: ${info.Browser ?? "unknown version"}`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         Lightpanda vs Playwright Comparison Test             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\n  Target: ${DISNEY_URL}`);
  console.log(`  CDP Endpoint: ${CDP_ENDPOINT}`);

  const results: TestResult[] = [];

  // Test Playwright
  console.log("\n━━━ Testing Playwright (Chromium) ━━━");
  const playwrightResult = await testBackend("Playwright", async () => {
    return chromium.launch({ headless: true });
  });
  results.push(playwrightResult);

  // Test Lightpanda
  console.log("\n━━━ Testing Lightpanda ━━━");
  const lightpandaAvailable = await checkLightpandaAvailable();

  if (lightpandaAvailable) {
    const lightpandaResult = await testBackend("Lightpanda", async () => {
      return chromium.connectOverCDP(CDP_ENDPOINT);
    });
    results.push(lightpandaResult);
  } else {
    console.log("  ⚠ Lightpanda not running. Start it with:");
    console.log(`    ./lightpanda serve --host 127.0.0.1 --port 9222`);
    results.push({
      backend: "Lightpanda",
      success: false,
      startupMs: 0,
      navigationMs: 0,
      cookieExtractionMs: 0,
      totalMs: 0,
      cookieCount: 0,
      hasAuthCookie: false,
      hasFinderToken: false,
      hasSWID: false,
      error: "Not running",
      warnings: [],
    });
  }

  // Print comparison
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                        Results Summary                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("  Metric              │ Playwright     │ Lightpanda");
  console.log("  ────────────────────┼────────────────┼────────────────");

  for (const metric of [
    ["Success", (r: TestResult) => (r.success ? "✓ Yes" : "✗ No")],
    ["Startup", (r: TestResult) => `${r.startupMs}ms`],
    ["Navigation", (r: TestResult) => `${r.navigationMs}ms`],
    ["Cookie Extract", (r: TestResult) => `${r.cookieExtractionMs}ms`],
    ["Total Time", (r: TestResult) => `${r.totalMs}ms`],
    ["Cookies Found", (r: TestResult) => String(r.cookieCount)],
    ["__d (Auth JWT)", (r: TestResult) => (r.hasAuthCookie ? "✓" : "✗")],
    ["finderToken", (r: TestResult) => (r.hasFinderToken ? "✓" : "✗")],
    ["SWID", (r: TestResult) => (r.hasSWID ? "✓" : "✗")],
  ] as const) {
    const [label, fn] = metric as [string, (r: TestResult) => string];
    const pw = results[0] ? fn(results[0]) : "N/A";
    const lp = results[1] ? fn(results[1]) : "N/A";
    console.log(`  ${label.padEnd(20)}│ ${pw.padEnd(14)} │ ${lp}`);
  }

  // Speed comparison
  if (results[0]?.success && results[1]?.success) {
    const speedup = (results[0].totalMs / results[1].totalMs).toFixed(1);
    console.log(`\n  ⚡ Lightpanda is ${speedup}x faster overall`);
  }

  // Warnings
  const allWarnings = results.flatMap((r) => r.warnings.map((w) => `[${r.backend}] ${w}`));
  if (allWarnings.length > 0) {
    console.log("\n  Warnings:");
    for (const w of allWarnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  // Recommendation
  console.log("\n  Recommendation:");
  if (results[1]?.success && results[0]?.success) {
    if (results[1].hasAuthCookie && results[1].hasFinderToken) {
      console.log("    ✓ Lightpanda fully compatible - safe to use for Disney sessions");
    } else if (results[1].hasAuthCookie || results[1].hasFinderToken) {
      console.log("    ⚠ Lightpanda partially compatible - may work but test thoroughly");
    } else {
      console.log("    ✗ Lightpanda not extracting required cookies - not recommended");
    }
  } else if (!results[1]?.success && results[0]?.success) {
    console.log("    ✗ Lightpanda failed - stick with Playwright");
  } else {
    console.log("    ? Could not complete comparison");
  }

  console.log("");
}

main().catch(console.error);
