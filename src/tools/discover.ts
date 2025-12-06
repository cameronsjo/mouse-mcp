/**
 * discover Tool
 *
 * Semantic search for Disney entities using vector embeddings.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { formatErrorResponse, ValidationError } from "../shared/index.js";
import { semanticSearch } from "../embeddings/search.js";
import type { DisneyEntity, DestinationId, EntityType } from "../types/index.js";

export const definition: ToolDefinition = {
  name: "discover",
  description:
    "Discover Disney experiences using natural language. " +
    "Uses semantic search to find entities matching concepts like 'thrill rides for teenagers', " +
    "'romantic dinner spots', or 'character breakfast'. " +
    "Requires initialize to be run first. For exact name lookups, use search instead.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Natural language query describing what you're looking for " +
          "(e.g., 'thrill rides', 'romantic dinner', 'kid-friendly attractions')",
      },
      destination: {
        type: "string",
        description: "Limit search to a destination: 'wdw' or 'dlr'",
        enum: ["wdw", "dlr"],
      },
      entityType: {
        type: "string",
        description: "Filter by entity type",
        enum: ["ATTRACTION", "RESTAURANT", "SHOW"],
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 5, max: 20)",
      },
    },
    required: ["query"],
  },
};

export const handler: ToolHandler = async (args) => {
  const query = args.query as string | undefined;
  const destination = args.destination as DestinationId | undefined;
  const entityType = args.entityType as EntityType | undefined;
  const limit = Math.min(Math.max((args.limit as number | undefined) ?? 5, 1), 20);

  if (!query) {
    return formatErrorResponse(new ValidationError("'query' is required", "query", null));
  }

  try {
    const results = await semanticSearch<DisneyEntity>(query, {
      destinationId: destination,
      entityType,
      limit,
      minScore: 0.3,
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query,
                found: false,
                message:
                  "No matching entities found. Run initialize first to load data and generate embeddings.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              query,
              found: true,
              count: results.length,
              results: results.map((r) => ({
                name: r.entity.name,
                id: r.entity.id,
                type: r.entity.entityType,
                destination: r.entity.destinationId,
                park: r.entity.parkName,
                score: Math.round(r.score * 100) / 100,
                distance: Math.round(r.distance * 1000) / 1000,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return formatErrorResponse(error);
  }
};
