/**
 * disney_status Tool
 *
 * Get server health status and cache statistics.
 */

import type { ToolDefinition, ToolHandler } from "./types.js";
import { getSessionManager } from "../clients/index.js";
import { getDatabaseStats, getCacheStats, getEntityCounts } from "../db/index.js";

export const definition: ToolDefinition = {
  name: "disney_status",
  description:
    "Get server health status and cache statistics. " +
    "Useful for debugging data freshness and connectivity issues.",
  inputSchema: {
    type: "object" as const,
    properties: {
      includeDetails: {
        type: "boolean",
        description: "Include detailed cache and entity breakdown (default: false)",
      },
    },
    required: [],
  },
};

export const handler: ToolHandler = async (args) => {
  const includeDetails = args["includeDetails"] === true;

  const sessionManager = getSessionManager();
  const dbStats = await getDatabaseStats();
  const cacheStats = await getCacheStats();

  // Get session status for each destination
  const wdwSession = await sessionManager.getSessionStatus("wdw");
  const dlrSession = await sessionManager.getSessionStatus("dlr");

  const status = {
    server: {
      version: "1.0.0",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    sessions: {
      wdw: {
        hasSession: wdwSession.hasSession,
        isValid: wdwSession.isValid,
        expiresAt: wdwSession.expiresAt,
        errorCount: wdwSession.errorCount,
      },
      dlr: {
        hasSession: dlrSession.hasSession,
        isValid: dlrSession.isValid,
        expiresAt: dlrSession.expiresAt,
        errorCount: dlrSession.errorCount,
      },
    },
    cache: {
      totalEntries: cacheStats.totalEntries,
      expiredEntries: cacheStats.expiredEntries,
      sources: cacheStats.sources,
    },
    database: {
      entityCount: dbStats.entityCount,
      cacheEntries: dbStats.cacheEntries,
      sizeKb: Math.round(dbStats.dbSizeBytes / 1024),
    },
    health: {
      databaseHealthy: dbStats.entityCount >= 0,
      cacheHealthy: cacheStats.expiredEntries < cacheStats.totalEntries,
      wdwSessionHealthy: wdwSession.isValid || !wdwSession.hasSession,
      dlrSessionHealthy: dlrSession.isValid || !dlrSession.hasSession,
    },
  };

  // Add detailed breakdown if requested
  if (includeDetails) {
    const wdwCounts = await getEntityCounts("wdw");
    const dlrCounts = await getEntityCounts("dlr");

    Object.assign(status, {
      details: {
        wdw: {
          attractions: wdwCounts.ATTRACTION,
          restaurants: wdwCounts.RESTAURANT,
          shows: wdwCounts.SHOW,
        },
        dlr: {
          attractions: dlrCounts.ATTRACTION,
          restaurants: dlrCounts.RESTAURANT,
          shows: dlrCounts.SHOW,
        },
      },
    });
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(status, null, 2),
      },
    ],
  };
};
