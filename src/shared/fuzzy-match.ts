/**
 * Fuzzy Matching
 *
 * Wrapper around Fuse.js for entity name search.
 */

import Fuse from "fuse.js";
import type { DisneyEntity, SearchResult } from "../types/index.js";
import {
  DEFAULT_FUZZY_SEARCH_THRESHOLD,
  DEFAULT_SEARCH_LIMIT,
  FUZZY_SEARCH_MIN_MATCH_LENGTH,
} from "./constants.js";

export interface FuzzyMatchOptions {
  /** Minimum score threshold (0-1, higher = stricter) */
  threshold?: number;
  /** Maximum results to return */
  limit?: number;
}

const DEFAULT_OPTIONS: FuzzyMatchOptions = {
  threshold: DEFAULT_FUZZY_SEARCH_THRESHOLD,
  limit: DEFAULT_SEARCH_LIMIT,
};

/**
 * Perform fuzzy search on a list of entities by name.
 *
 * Uses Fuse.js with tuned settings for Disney attraction/dining names.
 */
export function fuzzySearch<T extends DisneyEntity>(
  query: string,
  entities: T[],
  options: FuzzyMatchOptions = {}
): Array<SearchResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const fuse = new Fuse(entities, {
    keys: ["name"],
    threshold: opts.threshold,
    includeScore: true,
    // WHY these settings:
    // - ignoreLocation: Disney names vary in length, don't penalize matches at end
    // - minMatchCharLength: Avoid matching on very short substrings
    // - shouldSort: Return best matches first
    ignoreLocation: true,
    minMatchCharLength: FUZZY_SEARCH_MIN_MATCH_LENGTH,
    shouldSort: true,
  });

  const results = fuse.search(query, { limit: opts.limit ?? 10 });

  return results.map((result) => ({
    entity: result.item,
    // Fuse score is 0 (perfect) to 1 (worst), invert for intuitive scoring
    score: typeof result.score === "number" ? 1 - result.score : 0,
  }));
}

/**
 * Find the best match for a query.
 *
 * Returns null if no match meets the threshold.
 */
export function findBestMatch<T extends DisneyEntity>(
  query: string,
  entities: T[],
  options: FuzzyMatchOptions = {}
): SearchResult<T> | null {
  const results = fuzzySearch(query, entities, { ...options, limit: 1 });
  return results[0] ?? null;
}
