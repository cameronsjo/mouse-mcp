/**
 * disney_destinations Tool
 *
 * Lists all supported Disney destinations with their parks.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { cacheGet, cacheSet } from "../db/index.js";
import type { DisneyDestination } from "../types/index.js";

export const definition: ToolDefinition = {
  name: "disney_destinations",
  description:
    "List all supported Disney destinations (Walt Disney World, Disneyland) " +
    "with their parks, timezones, and locations. Use this to discover available " +
    "parks before querying attractions or dining.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export const handler: ToolHandler = async () => {
  const cacheKey = "destinations";

  // Check cache (7-day TTL for destinations)
  const cached = await cacheGet<DisneyDestination[]>(cacheKey);
  if (cached) {
    return formatResult(cached.data, cached.cachedAt);
  }

  // Fetch destinations
  const client = getDisneyFinderClient();
  const destinations = await client.getDestinations();

  // Cache for 7 days
  await cacheSet(cacheKey, destinations, { ttlHours: 24 * 7 });

  return formatResult(destinations, new Date().toISOString());
};

function formatResult(
  destinations: DisneyDestination[],
  cachedAt: string
): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            destinations: destinations.map((d) => ({
              id: d.id,
              name: d.name,
              location: d.location,
              timezone: d.timezone,
              parks: d.parks.map((p) => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
              })),
            })),
            _meta: {
              cachedAt,
              source: "disney",
            },
          },
          null,
          2
        ),
      },
    ],
  };
}
