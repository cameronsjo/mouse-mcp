/**
 * disney_attractions Tool
 *
 * Get attractions for a Disney destination or park with metadata.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { formatErrorResponse, ValidationError } from "../shared/index.js";
import type { DisneyAttraction, DestinationId } from "../types/index.js";

export const definition: ToolDefinition = {
  name: "disney_attractions",
  description:
    "Get attractions for a Disney destination or specific park. " +
    "Returns ride metadata including height requirements, Lightning Lane status, " +
    "thrill level, single rider availability, and more. " +
    "Use disney_destinations first to get valid destination and park IDs.",
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
          "Optional: Filter to a specific park by ID (e.g., '80007944' for Magic Kingdom). " +
          "Get park IDs from disney_destinations.",
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
    },
    required: ["destination"],
  },
};

export const handler: ToolHandler = async (args) => {
  // Validate destination
  const destination = args["destination"] as string | undefined;
  if (!destination || !["wdw", "dlr"].includes(destination)) {
    return formatErrorResponse(
      new ValidationError("destination must be 'wdw' or 'dlr'", "destination", destination)
    );
  }

  const parkId = args["parkId"] as string | undefined;
  const filters = (args["filters"] as Record<string, unknown>) ?? {};

  try {
    const client = getDisneyFinderClient();
    let attractions = await client.getAttractions(destination as DestinationId, parkId);

    // Apply filters
    attractions = applyFilters(attractions, filters);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              destination,
              parkId: parkId ?? null,
              count: attractions.length,
              attractions: attractions.map(formatAttraction),
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
    if (filters["hasLightningLane"] === true) {
      if (!attr.lightningLane?.available) return false;
    }

    // Height requirement filter
    if (typeof filters["maxHeightRequirement"] === "number") {
      const maxHeight = filters["maxHeightRequirement"] as number;
      if (attr.heightRequirement && attr.heightRequirement.inches > maxHeight) {
        return false;
      }
    }

    // Thrill level filter
    if (filters["thrillLevel"]) {
      if (attr.thrillLevel !== filters["thrillLevel"]) return false;
    }

    // Single rider filter
    if (filters["hasSingleRider"] === true) {
      if (!attr.singleRider) return false;
    }

    return true;
  });
}

function formatAttraction(attr: DisneyAttraction) {
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
  };
}
