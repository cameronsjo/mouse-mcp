/**
 * initialize Tool
 *
 * Preloads all entity data and generates embeddings for semantic search.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { formatErrorResponse } from "../shared/index.js";
import { getEmbeddingStats } from "../vectordb/index.js";
import { getEmbeddingProvider } from "../embeddings/index.js";
import type { DestinationId } from "../types/index.js";
import { initializeOutputSchema, zodToJsonSchema } from "./schemas.js";

export const definition: ToolDefinition = {
  name: "initialize",
  description:
    "Initialize the server by loading all Disney park data and generating embeddings for semantic search. " +
    "Call this once before using discover for meaning-based queries. " +
    "Returns statistics about loaded entities and embedding generation progress.",
  inputSchema: {
    type: "object" as const,
    properties: {
      destination: {
        type: "string",
        description:
          "Sync specific destination. Currently only 'wdw' (Walt Disney World) is supported.",
        enum: ["wdw"],
      },
      skipEmbeddings: {
        type: "boolean",
        description: "Skip embedding generation (faster, but semantic search won't work)",
      },
      force: {
        type: "boolean",
        description:
          "Force fresh fetch from API, bypassing cache. Use to retry Disney API after session established.",
      },
    },
    required: [],
  },
  outputSchema: zodToJsonSchema(initializeOutputSchema),
};

export const handler: ToolHandler = async (args) => {
  const destinationFilter = args.destination as DestinationId | undefined;
  const skipEmbeddings = args.skipEmbeddings as boolean | undefined;
  const force = args.force as boolean | undefined;

  // DLR session establishment not working yet - focus on WDW for now
  const destinations: DestinationId[] = destinationFilter ? [destinationFilter] : ["wdw"];
  const fetchOptions = { skipCache: force ?? false };

  try {
    const client = getDisneyFinderClient();
    const byModel: Record<string, number> = {};
    const stats = {
      destinations: [] as string[],
      attractions: 0,
      dining: 0,
      shows: 0,
      shops: 0,
      events: 0,
      embeddings: {
        total: 0,
        byModel,
      },
      provider: "",
      timing: {
        dataLoadMs: 0,
        embeddingMs: 0,
      },
    };

    const dataStart = Date.now();

    // Fetch all entity types for each destination
    for (const dest of destinations) {
      stats.destinations.push(dest);

      const [attractions, dining, shows, shops, events] = await Promise.all([
        client.getAttractions(dest, undefined, fetchOptions),
        client.getDining(dest, undefined, fetchOptions),
        client.getShows(dest, undefined, fetchOptions),
        client.getShops(dest, undefined, fetchOptions),
        client.getEvents(dest, undefined, fetchOptions),
      ]);

      stats.attractions += attractions.length;
      stats.dining += dining.length;
      stats.shows += shows.length;
      stats.shops += shops.length;
      stats.events += events.length;
    }

    stats.timing.dataLoadMs = Date.now() - dataStart;

    // Initialize embedding provider (triggers model download if needed)
    if (!skipEmbeddings) {
      const embeddingStart = Date.now();

      // Just accessing the provider triggers lazy loading
      const provider = await getEmbeddingProvider();
      stats.provider = provider.fullModelName;

      // Embeddings are generated async when entities are saved
      // Wait a moment for background embedding generation to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get embedding stats
      const embeddingStats = await getEmbeddingStats();
      stats.embeddings = embeddingStats;
      stats.timing.embeddingMs = Date.now() - embeddingStart;
    }

    const totalEntities =
      stats.attractions + stats.dining + stats.shows + stats.shops + stats.events;

    const result = {
      success: true,
      message: `Synced ${totalEntities} entities from ${destinations.join(", ")}`,
      stats,
      note:
        stats.embeddings.total < totalEntities
          ? "Embeddings are still generating in the background. Run status to check progress."
          : "All embeddings ready for semantic search.",
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
      structuredContent: result,
    };
  } catch (error) {
    return formatErrorResponse(error);
  }
};
