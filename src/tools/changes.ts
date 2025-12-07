/**
 * changes Tool
 *
 * Query entity change history to track:
 * - Refurbishments and closures
 * - New attractions/restaurants opening
 * - Name changes
 * - Attribute changes (height requirements, pricing, etc.)
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import {
  getRecentChanges,
  getChangeSummaries,
  getEntityHistory,
  getHistoryStats,
  type ChangeType,
} from "../db/index.js";
import type { DestinationId, EntityType } from "../types/index.js";

export const definition: ToolDefinition = {
  name: "changes",
  description:
    "Query entity change history to track refurbishments, new openings, name changes, " +
    "and attribute changes. Use to see what's new or different at the parks.",
  inputSchema: {
    type: "object" as const,
    properties: {
      entityId: {
        type: "string",
        description: "Filter by specific entity ID to see its change history",
      },
      destination: {
        type: "string",
        enum: ["wdw", "dlr"],
        description: "Filter by destination (wdw = Walt Disney World, dlr = Disneyland)",
      },
      entityType: {
        type: "string",
        enum: ["ATTRACTION", "RESTAURANT", "SHOW", "SHOP", "EVENT", "HOTEL"],
        description: "Filter by entity type",
      },
      changeType: {
        type: "string",
        enum: ["created", "updated", "deleted"],
        description: "Filter by change type (created = new, updated = modified, deleted = removed)",
      },
      days: {
        type: "number",
        description: "Show changes from the last N days (default: 7)",
      },
      summary: {
        type: "boolean",
        description: "Return summaries grouped by entity instead of individual changes (default: false)",
      },
      stats: {
        type: "boolean",
        description: "Return statistics about tracked changes (default: false)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 50)",
      },
    },
    required: [],
  },
};

export const handler: ToolHandler = async (args) => {
  const entityId = args.entityId as string | undefined;
  const destination = args.destination as DestinationId | undefined;
  const entityType = args.entityType as EntityType | undefined;
  const changeType = args.changeType as ChangeType | undefined;
  const days = (args.days as number) ?? 7;
  const summary = args.summary === true;
  const stats = args.stats === true;
  const limit = (args.limit as number) ?? 50;

  // Return statistics if requested
  if (stats) {
    const historyStats = await getHistoryStats();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              description: "Change tracking statistics",
              stats: historyStats,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // If specific entity requested, return its full history
  if (entityId) {
    const history = await getEntityHistory(entityId, limit);

    if (history.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              message: `No change history found for entity ${entityId}`,
              entityId,
            }),
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
              entityId,
              changeCount: history.length,
              changes: history.map(formatChange),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Return summaries if requested
  if (summary) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const summaries = await getChangeSummaries({
      destinationId: destination,
      entityType,
      changeType,
      since: since.toISOString(),
      limit,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              description: `Entity change summaries from the last ${days} days`,
              filters: {
                destination: destination ?? "all",
                entityType: entityType ?? "all",
                changeType: changeType ?? "all",
              },
              entityCount: summaries.length,
              summaries: summaries.map((s) => ({
                entityId: s.entityId,
                name: s.entityName,
                type: s.entityType,
                changeCount: s.changeCount,
                firstSeen: s.firstSeen,
                lastChange: {
                  type: s.lastChange.changeType,
                  changedFields: s.lastChange.changedFields,
                  detectedAt: s.lastChange.detectedAt,
                },
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Return recent changes
  const changes = await getRecentChanges(days, {
    destinationId: destination,
    entityType,
    changeType,
    limit,
  });

  if (changes.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            message: `No changes found in the last ${days} days`,
            filters: {
              destination: destination ?? "all",
              entityType: entityType ?? "all",
              changeType: changeType ?? "all",
            },
          }),
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
            description: `Changes from the last ${days} days`,
            filters: {
              destination: destination ?? "all",
              entityType: entityType ?? "all",
              changeType: changeType ?? "all",
            },
            changeCount: changes.length,
            changes: changes.map(formatChange),
          },
          null,
          2
        ),
      },
    ],
  };
};

/**
 * Format a change record for output.
 * Includes human-readable descriptions of what changed.
 */
function formatChange(change: {
  entityId: string;
  changeType: ChangeType;
  oldData: unknown;
  newData: unknown;
  changedFields: string[];
  detectedAt: string;
}) {
  const entityName =
    (change.newData as { name?: string })?.name ??
    (change.oldData as { name?: string })?.name ??
    change.entityId;

  const entityType =
    (change.newData as { entityType?: string })?.entityType ??
    (change.oldData as { entityType?: string })?.entityType ??
    "UNKNOWN";

  const result: Record<string, unknown> = {
    entityId: change.entityId,
    name: entityName,
    type: entityType,
    changeType: change.changeType,
    detectedAt: change.detectedAt,
  };

  // Add change details
  if (change.changeType === "created") {
    result.description = `New ${entityType.toLowerCase()} added: ${entityName}`;
  } else if (change.changeType === "deleted") {
    result.description = `${entityType.toLowerCase()} removed: ${entityName}`;
  } else if (change.changeType === "updated") {
    result.changedFields = change.changedFields;
    result.description = formatUpdateDescription(change);
  }

  return result;
}

/**
 * Generate a human-readable description of an update.
 */
function formatUpdateDescription(change: {
  oldData: unknown;
  newData: unknown;
  changedFields: string[];
}): string {
  const descriptions: string[] = [];
  const oldData = change.oldData as Record<string, unknown> | null;
  const newData = change.newData as Record<string, unknown> | null;

  for (const field of change.changedFields) {
    const oldValue = oldData?.[field];
    const newValue = newData?.[field];

    switch (field) {
      case "name":
        descriptions.push(`renamed from "${oldValue}" to "${newValue}"`);
        break;
      case "heightRequirement":
        if (!oldValue && newValue) {
          descriptions.push("height requirement added");
        } else if (oldValue && !newValue) {
          descriptions.push("height requirement removed");
        } else {
          descriptions.push("height requirement changed");
        }
        break;
      case "lightningLane":
        descriptions.push("Lightning Lane status changed");
        break;
      case "singleRider":
        descriptions.push(
          newValue ? "single rider added" : "single rider removed"
        );
        break;
      case "virtualQueue":
        descriptions.push(
          newValue ? "virtual queue added" : "virtual queue removed"
        );
        break;
      case "priceRange":
        descriptions.push("pricing changed");
        break;
      case "mobileOrder":
        descriptions.push(
          newValue ? "mobile order enabled" : "mobile order disabled"
        );
        break;
      case "tags":
        descriptions.push("tags updated");
        break;
      default:
        descriptions.push(`${field} changed`);
    }
  }

  return descriptions.join(", ") || "attributes updated";
}
