/**
 * find_dining Tool
 *
 * Get dining locations for a Disney destination or park.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { getDisneyFinderClient } from "../clients/index.js";
import { formatErrorResponse, ValidationError, withTimeout, TIMEOUTS } from "../shared/index.js";
import type { DisneyDining, DestinationId, MealPeriod } from "../types/index.js";

export const definition: ToolDefinition = {
  name: "find_dining",
  description:
    "Find dining locations at Disney parks with filters. " +
    "Returns restaurant metadata including service type, meal periods, " +
    "cuisine, price range, and reservation requirements. " +
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
        description: "Filter to a specific park by ID. Get park IDs from list_parks.",
      },
      filters: {
        type: "object",
        description: "Optional filters to narrow results",
        properties: {
          serviceType: {
            type: "string",
            description: "Filter by service type",
            enum: [
              "table-service",
              "quick-service",
              "character-dining",
              "fine-signature-dining",
              "lounge",
            ],
          },
          mealPeriod: {
            type: "string",
            description: "Filter to restaurants serving this meal",
            enum: ["breakfast", "lunch", "dinner", "snacks"],
          },
          reservationsAccepted: {
            type: "boolean",
            description: "Only show restaurants that accept reservations",
          },
          characterDining: {
            type: "boolean",
            description: "Only show character dining experiences",
          },
          mobileOrder: {
            type: "boolean",
            description: "Only show restaurants with mobile ordering",
          },
        },
      },
    },
    required: ["destination"],
  },
};

export const handler: ToolHandler = async (args) => {
  return withTimeout(
    "find_dining",
    async () => {
      // Validate destination
      const destination = args.destination as string | undefined;
      if (!destination || !["wdw", "dlr"].includes(destination)) {
        return formatErrorResponse(
          new ValidationError("destination must be 'wdw' or 'dlr'", "destination", destination)
        );
      }

      const parkId = args.parkId as string | undefined;
      const filters = (args.filters as Record<string, unknown>) ?? {};

      try {
        const client = getDisneyFinderClient();
        let dining = await client.getDining(destination as DestinationId, parkId);

        // Apply filters
        dining = applyFilters(dining, filters);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  destination,
                  parkId: parkId ?? null,
                  count: dining.length,
                  dining: dining.map(formatDining),
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
    },
    TIMEOUTS.DEFAULT
  );
};

function applyFilters(dining: DisneyDining[], filters: Record<string, unknown>): DisneyDining[] {
  return dining.filter((d) => {
    // Service type filter
    if (filters.serviceType) {
      if (d.serviceType !== filters.serviceType) return false;
    }

    // Meal period filter
    if (filters.mealPeriod) {
      if (!d.mealPeriods.includes(filters.mealPeriod as MealPeriod)) return false;
    }

    // Reservations filter
    if (filters.reservationsAccepted === true) {
      if (!d.reservationsAccepted) return false;
    }

    // Character dining filter
    if (filters.characterDining === true) {
      if (!d.characterDining) return false;
    }

    // Mobile order filter
    if (filters.mobileOrder === true) {
      if (!d.mobileOrder) return false;
    }

    return true;
  });
}

function formatDining(d: DisneyDining): {
  id: string;
  name: string;
  slug: string | null;
  park: string | null;
  location: { latitude: number; longitude: number } | null;
  url: string | null;
  metadata: {
    serviceType: string | null;
    priceRange: string | null;
    cuisine: string[];
    mealPeriods: string[];
  };
  features: {
    reservationsAccepted: boolean;
    reservationsRequired: boolean;
    mobileOrder: boolean;
    characterDining: boolean;
    disneyDiningPlan: boolean;
  };
} {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    park: d.parkName,
    location: d.location,
    url: d.url,
    metadata: {
      serviceType: d.serviceType,
      priceRange: d.priceRange?.symbol ?? null,
      cuisine: d.cuisineTypes,
      mealPeriods: d.mealPeriods,
    },
    features: {
      reservationsAccepted: d.reservationsAccepted,
      reservationsRequired: d.reservationsRequired,
      mobileOrder: d.mobileOrder,
      characterDining: d.characterDining,
      disneyDiningPlan: d.disneyDiningPlan,
    },
  };
}
