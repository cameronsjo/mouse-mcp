/**
 * Tests for withRetry — exponential backoff with non-retryable detection
 *
 * Test Plan:
 *
 * withRetry (Classification: Pure logic / Control flow — fake timers, jitter:false)
 *   [x] Happy: succeeds on first attempt → returns value, no delay
 *   [x] Happy: fails once then succeeds → retries and returns value
 *   [x] Unhappy: all attempts fail with retryable error → exhausts retries, throws last error
 *   [x] Unhappy: error has statusCode in NON_RETRYABLE list (400) → throws immediately, no retry
 *   [x] Unhappy: error has statusCode NOT in list (500) → IS retried
 *   [x] Unhappy: error has .status property matching non-retryable → throws immediately
 *   [x] Happy: error message contains network pattern (ECONNRESET) → IS retried
 *   [x] Boundary: exponential backoff delays are correct (jitter:false, baseDelayMs verified)
 *   [x] Boundary: delay is capped at maxDelayMs
 *
 * NOTE — Behavioral finding:
 *   A plain Error() without a recognised network-pattern message is treated as
 *   NON-RETRYABLE by isNonRetryable(). The instanceof Error branch returns
 *   !isNetworkError → !false → true (non-retryable). Only errors whose .message
 *   contains a known network pattern (ECONNRESET, ETIMEDOUT, timeout, etc.) or
 *   whose .statusCode/.status is NOT in nonRetryableStatusCodes are retried.
 *   This is tested in "considers a plain Error without network patterns non-retryable".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "./retry.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withRetry", () => {
  it("returns the value immediately when the first attempt succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 3, jitter: false });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries after a retryable failure and returns the eventual success value", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("recovered");

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false });
    // Advance timers in parallel with the assertion to avoid unhandled-rejection warning
    const [result] = await Promise.all([promise, vi.advanceTimersByTimeAsync(100)]);

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("exhausts all retries and throws the last error when every attempt fails", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("timeout"));

    const promise = withRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      jitter: false,
    });
    // Attach rejection handler before advancing timers to avoid unhandled-rejection warning.
    // Delays: 100ms (attempt 0→1) + 200ms (attempt 1→2) = 300ms total
    await Promise.all([
      expect(promise).rejects.toThrow("timeout"),
      vi.advanceTimersByTimeAsync(300),
    ]);
    // attempts 0, 1, 2 (maxRetries=2 means 3 total calls)
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately without retry for a non-retryable statusCode (400)", async () => {
    const err = Object.assign(new Error("Bad Request"), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxRetries: 3, jitter: false })).rejects.toThrow("Bad Request");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries when statusCode is 500 (not in non-retryable list)", async () => {
    const retryableError = Object.assign(new Error("Internal Server Error"), { statusCode: 500 });
    const fn = vi.fn().mockRejectedValueOnce(retryableError).mockResolvedValue("ok");

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 100, jitter: false });
    const [result] = await Promise.all([promise, vi.advanceTimersByTimeAsync(100)]);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately without retry when .status property is non-retryable (401)", async () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { maxRetries: 3, jitter: false })).rejects.toThrow("Unauthorized");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on ECONNRESET network error (recognised retryable pattern)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("network ok");

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 50, jitter: false });
    const [result] = await Promise.all([promise, vi.advanceTimersByTimeAsync(50)]);

    expect(result).toBe("network ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("considers a plain Error without network patterns non-retryable (documented behavior)", async () => {
    // NOTE: This is the behavioral finding described in the file header.
    // isNonRetryable() returns true for plain Errors lacking network pattern keywords.
    const fn = vi.fn().mockRejectedValue(new Error("unexpected failure"));

    await expect(withRetry(fn, { maxRetries: 3, jitter: false })).rejects.toThrow(
      "unexpected failure"
    );

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("applies exponential backoff between retries with jitter disabled", async () => {
    const callTimestamps: number[] = [];
    const fn = vi.fn().mockImplementation(async () => {
      callTimestamps.push(Date.now());
      throw new Error("ECONNRESET");
    });

    const promise = withRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      jitter: false,
    });
    // Attach rejection handler before advancing timers to avoid unhandled-rejection warning
    await Promise.all([
      expect(promise).rejects.toThrow("ECONNRESET"),
      vi.advanceTimersByTimeAsync(5_000),
    ]);

    expect(callTimestamps).toHaveLength(3);
    // Delay between call 0→1: baseDelay * 2^0 = 100ms
    expect(callTimestamps[1]! - callTimestamps[0]!).toBe(100);
    // Delay between call 1→2: baseDelay * 2^1 = 200ms
    expect(callTimestamps[2]! - callTimestamps[1]!).toBe(200);
  });

  it("caps the backoff delay at maxDelayMs", async () => {
    const callTimestamps: number[] = [];
    const fn = vi.fn().mockImplementation(async () => {
      callTimestamps.push(Date.now());
      throw new Error("ECONNRESET");
    });

    const promise = withRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 100,
      // cap below the attempt-1 uncapped delay of 200ms
      maxDelayMs: 150,
      jitter: false,
    });
    // Attach rejection handler before advancing timers to avoid unhandled-rejection warning
    await Promise.all([
      expect(promise).rejects.toThrow("ECONNRESET"),
      vi.advanceTimersByTimeAsync(5_000),
    ]);

    expect(callTimestamps).toHaveLength(3);
    expect(callTimestamps[1]! - callTimestamps[0]!).toBe(100); // 100 * 2^0 = 100 (under cap)
    expect(callTimestamps[2]! - callTimestamps[1]!).toBe(150); // min(200, 150) = 150 (capped)
  });
});
