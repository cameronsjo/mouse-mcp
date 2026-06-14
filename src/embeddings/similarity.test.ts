/**
 * Tests for vector similarity utilities
 *
 * Test Plan:
 *
 * cosineSimilarity (Classification: Pure logic / Data transformer)
 *   [x] Happy: identical vectors → 1
 *   [x] Happy: orthogonal vectors → 0
 *   [x] Happy: opposite vectors → -1
 *   [x] Happy: single-element vectors
 *   [x] Boundary: empty vectors [] → 0 (denominator guard)
 *   [x] Boundary: zero vector input → 0 (denominator guard)
 *   [x] Unhappy: dimension mismatch → throws with both lengths in message
 *   [x] Property: symmetric f(a,b) == f(b,a)
 *   [x] Property: result always in [-1, 1]
 *
 * topKSimilar (Classification: Pure logic / Data transformer)
 *   [x] Happy: returns k results sorted descending by similarity
 *   [x] Boundary: k=0 → empty array
 *   [x] Boundary: k > number of vectors → returns all results
 *   [x] Happy: single-vector pool
 *
 * normalizeScore (Classification: Pure logic / Data transformer)
 *   [x] Happy: similarity below threshold → 0
 *   [x] Happy: similarity at threshold → 0
 *   [x] Happy: similarity = 1 → 1 (full rescale range)
 *   [x] Happy: midpoint of [threshold, 1] → 0.5
 *   [x] Happy: custom threshold parameter respected
 */

import { describe, it, expect } from "vitest";
import { cosineSimilarity, topKSimilar, normalizeScore } from "./similarity.js";
import { NORMALIZED_SCORE_THRESHOLD } from "../shared/constants.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const result = cosineSimilarity([1, 0, 0], [1, 0, 0]);
    expect(result).toBeCloseTo(1, 10);
  });

  it("returns 0 for orthogonal vectors", () => {
    const result = cosineSimilarity([1, 0], [0, 1]);
    expect(result).toBeCloseTo(0, 10);
  });

  it("returns -1 for opposite vectors", () => {
    const result = cosineSimilarity([1, 0], [-1, 0]);
    expect(result).toBeCloseTo(-1, 10);
  });

  it("returns correct value for single-element vectors", () => {
    expect(cosineSimilarity([3], [3])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([3], [-3])).toBeCloseTo(-1, 10);
  });

  it("returns 0 for empty vectors (denominator guard)", () => {
    const result = cosineSimilarity([], []);
    expect(result).toBe(0);
  });

  it("returns 0 when one vector is all zeros (denominator guard)", () => {
    const result = cosineSimilarity([0, 0, 0], [1, 2, 3]);
    expect(result).toBe(0);
  });

  it("throws with a dimension mismatch message when vector lengths differ", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow("Vector dimension mismatch: 2 vs 3");
  });

  it("is symmetric: f(a, b) equals f(b, a)", () => {
    const a = [0.5, 0.3, 0.8];
    const b = [0.2, 0.9, 0.1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it("always returns a value in [-1, 1]", () => {
    const pairs: Array<[number[], number[]]> = [
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      [
        [-1, -2],
        [1, 2],
      ],
      [
        [0.1, 0.9],
        [0.9, 0.1],
      ],
      [
        [100, 0],
        [0, 100],
      ],
    ];
    for (const [a, b] of pairs) {
      const result = cosineSimilarity(a!, b!);
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    }
  });
});

describe("topKSimilar", () => {
  const query = [1, 0];
  const vectors = [
    [1, 0], // index 0 — identical → similarity 1
    [0, 1], // index 1 — orthogonal → similarity 0
    [-1, 0], // index 2 — opposite → similarity -1
  ];

  it("returns k results sorted by descending similarity", () => {
    const results = topKSimilar(query, vectors, 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.index).toBe(0);
    expect(results[0]!.similarity).toBeCloseTo(1, 10);
    expect(results[1]!.index).toBe(1);
    expect(results[1]!.similarity).toBeCloseTo(0, 10);
  });

  it("returns all results when k exceeds the number of vectors", () => {
    const results = topKSimilar(query, vectors, 100);
    expect(results).toHaveLength(vectors.length);
  });

  it("returns an empty array when k is 0", () => {
    const results = topKSimilar(query, vectors, 0);
    expect(results).toHaveLength(0);
  });

  it("returns the only vector when pool has a single entry", () => {
    const results = topKSimilar([1, 0], [[1, 0]], 5);
    expect(results).toHaveLength(1);
    expect(results[0]!.index).toBe(0);
    expect(results[0]!.similarity).toBeCloseTo(1, 10);
  });
});

describe("normalizeScore", () => {
  it("returns 0 when similarity is below the default threshold", () => {
    const belowThreshold = NORMALIZED_SCORE_THRESHOLD - 0.01;
    expect(normalizeScore(belowThreshold)).toBe(0);
  });

  it("returns 0 when similarity equals the default threshold", () => {
    // (threshold - threshold) / (1 - threshold) = 0
    expect(normalizeScore(NORMALIZED_SCORE_THRESHOLD)).toBe(0);
  });

  it("returns 1 when similarity is 1", () => {
    expect(normalizeScore(1)).toBeCloseTo(1, 10);
  });

  it("returns 0.5 for the midpoint between threshold and 1", () => {
    const midpoint = NORMALIZED_SCORE_THRESHOLD + (1 - NORMALIZED_SCORE_THRESHOLD) / 2;
    expect(normalizeScore(midpoint)).toBeCloseTo(0.5, 5);
  });

  it("respects a custom threshold parameter", () => {
    // Below custom threshold of 0.6 → 0
    expect(normalizeScore(0.5, 0.6)).toBe(0);
    // At custom threshold → 0
    expect(normalizeScore(0.6, 0.6)).toBe(0);
    // Midpoint of [0.6, 1] → 0.5
    const mid = 0.6 + (1 - 0.6) / 2;
    expect(normalizeScore(mid, 0.6)).toBeCloseTo(0.5, 5);
  });
});
