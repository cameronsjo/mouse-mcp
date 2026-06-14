/**
 * Query Counter Tests
 *
 * Verifies the in-memory query counter used by the Homepage widget endpoint.
 */

import { describe, it, expect } from "vitest";

// Fresh import per test file — module-level state resets via vitest isolation
import { incrementQueryCount, getQueryCount } from "./query-counter.js";

describe("Query Counter", () => {
  // WHY: Counter is module-level state; tests run in isolated module scope
  // so the counter starts at whatever state prior tests left it in.
  // We capture the baseline and assert relative increments.

  it("should increment the counter", () => {
    const baseline = getQueryCount();
    incrementQueryCount();
    expect(getQueryCount()).toBe(baseline + 1);
  });

  it("should increment multiple times", () => {
    const baseline = getQueryCount();
    incrementQueryCount();
    incrementQueryCount();
    incrementQueryCount();
    expect(getQueryCount()).toBe(baseline + 3);
  });

  it("should report a non-negative integer count", () => {
    const count = getQueryCount();
    // Stronger than a bare typeof check: a counter must be a whole, non-negative number.
    expect(Number.isInteger(count)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
