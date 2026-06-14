/**
 * Tests for timeout utilities
 *
 * Test Plan:
 *
 * TimeoutError (Classification: Pure logic — error class)
 *   [x] Happy: sets operation, timeoutMs, name, and message
 *
 * TIMEOUTS (Classification: Not worth unit testing — constant values)
 *   Skipped: asserting magic numbers from the source is tautological.
 *
 * withTimeout (Classification: Pure logic / Control flow — fake timers)
 *   [x] Happy: fast operation resolves before timeout → returns result, no error
 *   [x] Unhappy: operation exceeds timeout → rejects with TimeoutError
 *   [x] Happy: TimeoutError carries correct operation name and timeoutMs
 *   [x] Unhappy: external AbortSignal abort before timeout → propagates AbortError
 *   [x] Unhappy: external AbortSignal already aborted when passed → propagates immediately
 *
 * withToolTimeout (Classification: Pure logic / Thin wrapper)
 *   [x] Happy: wraps handler and passes args through
 *   [x] Happy: returns the handler's resolved value
 *   [x] Unhappy: propagates an error thrown by the handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout, withToolTimeout, TimeoutError } from "./timeout.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Helper: a function that hangs until the provided AbortSignal fires.
 * Also checks signal.aborted on entry so pre-aborted signals are handled correctly.
 */
function hangingFn(): (signal: AbortSignal) => Promise<never> {
  return async (signal) => {
    // If the signal is already aborted, throw immediately so withTimeout can catch it.
    if (signal.aborted) throw signal.reason as Error;
    return new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  };
}

describe("TimeoutError", () => {
  it("sets name to TimeoutError", () => {
    const err = new TimeoutError("my-op", 5000);
    expect(err.name).toBe("TimeoutError");
  });

  it("exposes the operation name", () => {
    const err = new TimeoutError("fetch-parks", 3000);
    expect(err.operation).toBe("fetch-parks");
  });

  it("exposes the timeoutMs", () => {
    const err = new TimeoutError("fetch-parks", 3000);
    expect(err.timeoutMs).toBe(3000);
  });

  it("includes operation and timeoutMs in the message", () => {
    const err = new TimeoutError("sync", 1500);
    expect(err.message).toContain("sync");
    expect(err.message).toContain("1500");
  });

  it("is an instance of Error", () => {
    expect(new TimeoutError("op", 100)).toBeInstanceOf(Error);
  });
});

describe("withTimeout", () => {
  it("returns the operation result when it completes before the timeout", async () => {
    const result = await withTimeout("fast-op", async () => "done", 5_000);
    expect(result).toBe("done");
  });

  it("rejects with TimeoutError when the operation exceeds the timeout", async () => {
    const promise = withTimeout("slow-op", hangingFn(), 500);
    // Run timer advancement and rejection assertion in parallel to avoid unhandled-rejection warning
    await Promise.all([
      expect(promise).rejects.toBeInstanceOf(TimeoutError),
      vi.advanceTimersByTimeAsync(501),
    ]);
  });

  it("TimeoutError from timeout carries the correct operation and timeoutMs", async () => {
    const promise = withTimeout("search", hangingFn(), 1_000);
    // Capture via .catch before advancing timers to avoid unhandled-rejection warning
    const capturedError = promise.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_001);
    const err = await capturedError;
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).operation).toBe("search");
    expect((err as TimeoutError).timeoutMs).toBe(1_000);
  });

  it("propagates AbortError when an external signal is aborted before the timeout", async () => {
    const externalController = new AbortController();
    const abortReason = Object.assign(new Error("External cancel"), { name: "AbortError" });

    const promise = withTimeout("op", hangingFn(), 5_000, externalController.signal);
    externalController.abort(abortReason);

    await expect(promise).rejects.toMatchObject({ name: "AbortError", message: "External cancel" });
  });

  it("propagates AbortError when the external signal is already aborted on entry", async () => {
    const externalController = new AbortController();
    const abortReason = Object.assign(new Error("Pre-aborted"), { name: "AbortError" });
    externalController.abort(abortReason);

    const promise = withTimeout("op", hangingFn(), 5_000, externalController.signal);

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("withToolTimeout", () => {
  it("passes args through to the wrapped handler", async () => {
    const handler = vi.fn().mockResolvedValue("result");
    const wrapped = withToolTimeout("my-tool", handler, 5_000);

    await wrapped({ destination: "wdw", limit: 10 });

    expect(handler).toHaveBeenCalledWith({ destination: "wdw", limit: 10 });
  });

  it("returns the handler's resolved value", async () => {
    const handler = vi.fn().mockResolvedValue({ found: true });
    const wrapped = withToolTimeout("my-tool", handler, 5_000);

    const result = await wrapped({});

    expect(result).toEqual({ found: true });
  });

  it("propagates an error thrown by the handler", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("handler blew up"));
    const wrapped = withToolTimeout("my-tool", handler, 5_000);

    await expect(wrapped({})).rejects.toThrow("handler blew up");
  });
});
