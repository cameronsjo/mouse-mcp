/**
 * Tests for fuzzy matching utilities
 *
 * Test Plan:
 *
 * fuzzySearch (Classification: Pure logic — wraps Fuse.js, real objects, no doubles)
 *   [x] Happy: exact name match → top result, score ≈ 1 (inverted Fuse score)
 *   [x] Happy: one-character typo → still matches (within default threshold)
 *   [x] Happy: respects limit option (returns at most N results)
 *   [x] Happy: score is in (0, 1] for matches (inverted from Fuse 0=perfect)
 *   [x] Boundary: empty entity list → []
 *   [x] Boundary: strict threshold excludes weak match → []
 *   [x] Boundary: empty query → []  (Fuse returns nothing for empty query)
 *   [x] Unhappy: query with no reasonable match under strict threshold → []
 *
 * findBestMatch (Classification: Pure logic — thin wrapper)
 *   [x] Happy: returns the top match when one exists
 *   [x] Boundary: returns null when no entity list is provided
 *   [x] Boundary: returns null when strict threshold excludes all candidates
 */

import { describe, it, expect } from "vitest";
import type { DisneyEntity } from "../types/index.js";
import { fuzzySearch, findBestMatch } from "./fuzzy-match.js";

/** Minimal DisneyEntity fixture factory */
function makeEntity(name: string, id: string = name): DisneyEntity {
  return {
    id,
    name,
    slug: null,
    entityType: "ATTRACTION",
    destinationId: "wdw",
    parkId: null,
    parkName: "Magic Kingdom",
    location: null,
    url: null,
  };
}

const ATTRACTIONS = [
  makeEntity("Space Mountain", "space-mountain"),
  makeEntity("Haunted Mansion", "haunted-mansion"),
  makeEntity("Pirates of the Caribbean", "pirates"),
  makeEntity("Big Thunder Mountain Railroad", "big-thunder"),
  makeEntity("Seven Dwarfs Mine Train", "seven-dwarfs"),
];

describe("fuzzySearch", () => {
  it("returns the exact-name match as the top result", () => {
    const results = fuzzySearch("Space Mountain", ATTRACTIONS);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.entity.name).toBe("Space Mountain");
  });

  it("returns a score close to 1 for an exact name match", () => {
    const results = fuzzySearch("Space Mountain", ATTRACTIONS);
    // Fuse score 0 → inverted to 1
    expect(results[0]!.score).toBeGreaterThan(0.9);
  });

  it("still matches with a minor typo", () => {
    // "Hauted Mansoin" has 2 typos but stays within default threshold 0.4
    const results = fuzzySearch("Hauted Mansion", ATTRACTIONS);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.entity.name).toBe("Haunted Mansion");
  });

  it("respects the limit option", () => {
    const results = fuzzySearch("Mountain", ATTRACTIONS, { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("returns an empty array when the entity list is empty", () => {
    const results = fuzzySearch("Space Mountain", []);
    expect(results).toHaveLength(0);
  });

  it("returns an empty array for an empty query", () => {
    const results = fuzzySearch("", ATTRACTIONS);
    expect(results).toHaveLength(0);
  });

  it("returns an empty array when strict threshold excludes all candidates", () => {
    // threshold 0 = only perfect match; "ZZZZZ" has no match
    const results = fuzzySearch("ZZZZZ", ATTRACTIONS, { threshold: 0 });
    expect(results).toHaveLength(0);
  });

  it("scores are in the range (0, 1] for results that are returned", () => {
    const results = fuzzySearch("Pirates", ATTRACTIONS);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

describe("findBestMatch", () => {
  it("returns the top-scoring entity when a match exists", () => {
    const match = findBestMatch("Haunted Mansion", ATTRACTIONS);
    expect(match).not.toBeNull();
    expect(match!.entity.name).toBe("Haunted Mansion");
  });

  it("returns null when the entity list is empty", () => {
    const match = findBestMatch("Space Mountain", []);
    expect(match).toBeNull();
  });

  it("returns null when strict threshold excludes all candidates", () => {
    const match = findBestMatch("ZZZZZ", ATTRACTIONS, { threshold: 0 });
    expect(match).toBeNull();
  });
});
