/**
 * Dining Resources
 *
 * MCP resources for Disney dining locations.
 */

import { getEntityById } from "../db/index.js";
import type { DisneyDining } from "../types/index.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("DiningResources");

/**
 * Get a specific dining location by entity ID.
 */
export async function getDiningById(entityId: string): Promise<DisneyDining | null> {
  logger.debug("Fetching dining by ID", { entityId });
  const entity = await getEntityById<DisneyDining>(entityId);

  if (!entity) {
    logger.warn("Dining location not found", { entityId });
    return null;
  }

  if (entity.entityType !== "RESTAURANT") {
    logger.warn("Entity is not a restaurant", { entityId, entityType: entity.entityType });
    return null;
  }

  return entity;
}
