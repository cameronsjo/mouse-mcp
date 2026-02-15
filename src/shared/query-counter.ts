/**
 * Query Counter
 *
 * In-memory counter for MCP tool invocations.
 * Resets on server restart (no persistence needed).
 *
 * WHY: Homepage widget needs a queries_total stat.
 * In-memory is sufficient since the widget shows current-session activity.
 */

let queryCount = 0;

/** Increment the query counter. Called on each tool invocation. */
export function incrementQueryCount(): void {
  queryCount++;
}

/** Get the current query count. */
export function getQueryCount(): number {
  return queryCount;
}
