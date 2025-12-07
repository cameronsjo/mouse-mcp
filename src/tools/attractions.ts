/**
 * find_attractions Tool
 *
 * Get attractions for a Disney destination or park with metadata.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { formatErrorResponse, ValidationError } from "../shared/index.js";
import type { DisneyAttraction, DestinationId } from "../types/index.js";

export const definition: ToolDefinition = {
  name: "find_attractions",
  description:
    "Find attractions at Disney parks with filters. " +
    "Returns ride metadata including height requirements, Lightning Lane status, " +
    "thrill level, and single rider availability. " +
    "Use list_parks first to get valid destination and park IDs.",
  inputSchema: {
    type: "object" as const,
    properties: {
      destination: {
        type: "string",
        description: "Destination ID: 'wdw' (Walt Disney World) or 'dlr' (Disneyland Resort)",
        enum: ["wdw", "dlr"],
      },
      parkId: {
        type: "string",
        description:
          "Filter to a specific park by ID (e.g., '80007944' for Magic Kingdom). " +
          "Get park IDs from list_parks.",
      },
      filters: {
        type: "object",
        description: "Optional filters to narrow results",
        properties: {
          hasLightningLane: {
            type: "boolean",
            description: "Only show attractions with Lightning Lane",
          },
          maxHeightRequirement: {
            type: "number",
            description: "Maximum height requirement in inches (e.g., 40 for kids)",
          },
          thrillLevel: {
            type: "string",
            description: "Filter by thrill level",
            enum: ["family", "moderate", "thrill"],
          },
          hasSingleRider: {
            type: "boolean",
            description: "Only show attractions with single rider line",
          },
        },
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 50, max: 200)",
      },
      offset: {
        type: "number",
        description: "Number of results to skip for pagination (default: 0)",
      },
    },
    required: ["destination"],
  },
};

export const handler: ToolHandler = async (args) => {
  // Validate destination
  const destination = args.destination as string | undefined;
  if (!destination || !["wdw", "dlr"].includes(destination)) {
    return formatErrorResponse(
      new ValidationError("destination must be 'wdw' or 'dlr'", "destination", destination)
    );
  }

  const parkId = args.parkId as string | undefined;
  const filters = (args.filters as Record<string, unknown>) ?? {};
  const limit = Math.min(Math.max(1, (args.limit as number) ?? 50), 200);
  const offset = Math.max(0, (args.offset as number) ?? 0);

  try {
    const client = getDisneyFinderClient();
    let attractions = await client.getAttractions(destination as DestinationId, parkId);

    // Apply filters
    attractions = applyFilters(attractions, filters);

    // Get total count before pagination
    const totalCount = attractions.length;

    // Apply pagination
    const paginatedAttractions = attractions.slice(offset, offset + limit);
    const hasMore = offset + limit < totalCount;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              destination,
              parkId: parkId ?? null,
              pagination: {
                total: totalCount,
                returned: paginatedAttractions.length,
                offset,
                limit,
                hasMore,
              },
              attractions: paginatedAttractions.map(formatAttraction),
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

function applyFilters(
  attractions: DisneyAttraction[],
  filters: Record<string, unknown>
): DisneyAttraction[] {
  return attractions.filter((attr) => {
    // Lightning Lane filter
    if (filters.hasLightningLane === true) {
      if (!attr.lightningLane?.available) return false;
    }

    // Height requirement filter
    if (typeof filters.maxHeightRequirement === "number") {
      const maxHeight = filters.maxHeightRequirement;
      if (attr.heightRequirement && attr.heightRequirement.inches > maxHeight) {
        return false;
      }
    }

    // Thrill level filter
    if (filters.thrillLevel) {
      if (attr.thrillLevel !== filters.thrillLevel) return false;
    }

    // Single rider filter
    if (filters.hasSingleRider === true) {
      if (!attr.singleRider) return false;
    }

    return true;
  });
}

function formatAttraction(attr: DisneyAttraction): {
  id: string;
  name: string;
  slug: string | null;
  park: string | null;
  location: { latitude: number; longitude: number } | null;
  url: string | null;
  metadata: {
    heightRequirement: string | null;
    thrillLevel: string | null;
    experienceType: string | null;
    duration: string | null;
  };
  features: {
    lightningLane: string;
    singleRider: boolean;
    riderSwap: boolean;
    photopass: boolean;
    virtualQueue: boolean;
  };
  accessibility: {
    wheelchairAccessible: boolean;
  };
  tags: string[];
} {
  return {
    id: attr.id,
    name: attr.name,
    slug: attr.slug,
    park: attr.parkName,
    location: attr.location,
    url: attr.url,
    metadata: {
      heightRequirement: attr.heightRequirement?.description ?? null,
      thrillLevel: attr.thrillLevel,
      experienceType: attr.experienceType,
      duration: attr.duration,
    },
    features: {
      lightningLane: attr.lightningLane?.tier ?? "none",
      singleRider: attr.singleRider,
      riderSwap: attr.riderSwap,
      photopass: attr.photopass,
      virtualQueue: attr.virtualQueue,
    },
    accessibility: {
      wheelchairAccessible: attr.wheelchairAccessible,
    },
    tags: attr.tags,
  };
}
