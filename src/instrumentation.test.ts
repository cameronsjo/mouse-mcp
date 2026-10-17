/**
 * Pins the options the live Sentry bootstrap passes to Sentry.init.
 */

import type { NodeOptions } from "@sentry/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL_COLLECTION_OFF,
  resolveDataCollection,
} from "./observability/__test-helpers__/data-collection.js";

const init = vi.hoisted(() => vi.fn<(options: NodeOptions) => void>());

vi.mock("@sentry/node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/node")>()),
  init,
  setTag: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  init.mockReset();
});

/** Load the bootstrap with a DSN set and return the options it passed to Sentry.init. */
async function bootstrapOptions(): Promise<NodeOptions> {
  vi.stubEnv("MOUSE_MCP_SENTRY_DSN", "https://public@o0.ingest.sentry.io/0");
  await import("./instrumentation.js");
  expect(init).toHaveBeenCalledTimes(1);
  const [options] = init.mock.calls[0] ?? [];
  if (options === undefined) throw new Error("expected Sentry.init to receive options");
  return options;
}

describe("instrumentation bootstrap", () => {
  it("passes options that resolve to every data-collection category off", async () => {
    const options = await bootstrapOptions();

    expect(await resolveDataCollection(options)).toEqual(ALL_COLLECTION_OFF);
  });

  it("disables local variables and installs the scrubbing beforeSend", async () => {
    const options = await bootstrapOptions();

    expect(options.includeLocalVariables).toBe(false);
    // Same module instance the bootstrap just loaded.
    const { scrubEvent } = await import("./observability/sentry-privacy.js");
    expect(options.beforeSend).toBe(scrubEvent);
  });
});
