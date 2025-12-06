/**
 * search Tool
 *
 * Look up Disney entities by ID or fuzzy name matching.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { formatErrorResponse, fuzzySearch, ValidationError } from "../shared/index.js";
import {
  getEntityById,
  searchEntitiesByName,
  getAttractions,
  getDining,
  getShows,
} from "../db/index.js";
import type { DisneyEntity, DestinationId, EntityType } from "../types/index.js";

export const definition: ToolDefinition = {
  name: "search",
  description:
    "Search for Disney entities by ID or name. " +
    "Uses fuzzy matching for name queries like 'Space Mountain' or 'Be Our Guest'. " +
    "For conceptual queries like 'thrill rides' or 'romantic dinner', use discover instead.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "Entity ID for exact lookup (e.g., '80010190')",
      },
      name: {
        type: "string",
        description: "Entity name to search for (e.g., 'Space Mountain', 'Haunted Mansion')",
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
    },
    required: [],
  },
};

export const handler: ToolHandler = async (args) => {
  const id = args.id as string | undefined;
  const name = args.name as string | undefined;
  const destination = args.destination as DestinationId | undefined;
  const entityType = args.entityType as EntityType | undefined;

  // Require either id or name
  if (!id && !name) {
    return formatErrorResponse(
      new ValidationError("Either 'id' or 'name' is required", "id|name", null)
    );
  }

  try {
    // Direct ID lookup
    if (id) {
      const entity = await getEntityById(id);

      if (!entity) {
        // Try fetching from API if not in local DB
        const client = getDisneyFinderClient();
        const fetched = await client.getEntityById(id);

        if (!fetched) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    id,
                    found: false,
                    message: "No entity found with this ID",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return formatEntityResult(fetched);
      }

      return formatEntityResult(entity);
    }

    // Fuzzy name search
    if (name) {
      // First try fuzzy search in database
      let candidates = await searchEntitiesByName<DisneyEntity>(name, {
        destinationId: destination,
        entityType,
        limit: 20,
      });

      // If no results in DB, fetch from API first
      if (candidates.length === 0) {
        const client = getDisneyFinderClient();
        const destinations = destination ? [destination] : (["wdw", "dlr"] as DestinationId[]);

        for (const dest of destinations) {
          if (!entityType || entityType === "ATTRACTION") {
            await client.getAttractions(dest);
          }
          if (!entityType || entityType === "RESTAURANT") {
            await client.getDining(dest);
          }
          if (!entityType || entityType === "SHOW") {
            await client.getShows(dest);
          }
        }

        // Try search again
        candidates = await searchEntitiesByName<DisneyEntity>(name, {
          destinationId: destination,
          entityType,
          limit: 20,
        });
      }

      // If still no results, try loading from DB and fuzzy matching
      if (candidates.length === 0) {
        const destinations = destination ? [destination] : (["wdw", "dlr"] as DestinationId[]);
        candidates = [];

        for (const dest of destinations) {
          if (!entityType || entityType === "ATTRACTION") {
            candidates.push(...(await getAttractions(dest)));
          }
          if (!entityType || entityType === "RESTAURANT") {
            candidates.push(...(await getDining(dest)));
          }
          if (!entityType || entityType === "SHOW") {
            candidates.push(...(await getShows(dest)));
          }
        }
      }

      // Perform fuzzy matching
      const matches = fuzzySearch(name, candidates, {
        threshold: 0.4,
        limit: 5,
      });

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  query: name,
                  found: false,
                  message: "No matching entities found. Try discover for conceptual searches.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Return best match with alternatives
      // WHY: Safe to assert - we checked matches.length > 0 above
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const bestMatch = matches[0]!;
      const alternatives = matches.slice(1);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                query: name,
                found: true,
                confidence: Math.round(bestMatch.score * 100) / 100,
                bestMatch: formatEntity(bestMatch.entity),
                alternatives: alternatives.map((m) => ({
                  name: m.entity.name,
                  id: m.entity.id,
                  type: m.entity.entityType,
                  score: Math.round(m.score * 100) / 100,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return formatErrorResponse(new Error("Unexpected state"));
  } catch (error) {
    return formatErrorResponse(error);
  }
};

function formatEntityResult(entity: DisneyEntity): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            found: true,
            entity: formatEntity(entity),
          },
          null,
          2
        ),
      },
    ],
  };
}

function formatEntity(entity: DisneyEntity): Record<string, unknown> {
  // Return full entity data with normalized field names
  const { entityType, destinationId, parkName, ...rest } = entity;
  return {
    ...rest,
    type: entityType,
    destination: destinationId,
    park: parkName,
  };
}
