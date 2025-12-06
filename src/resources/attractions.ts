/**
 * Attraction Resources
 *
 * MCP resources for Disney attractions.
 */

import { getEntityById } from "../db/index.js";
import type { DisneyAttraction } from "../types/index.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("AttractionResources");

/**
 * Get a specific attraction by entity ID.
 */
export async function getAttractionById(entityId: string): Promise<DisneyAttraction | null> {
  logger.debug("Fetching attraction by ID", { entityId });
  const entity = await getEntityById<DisneyAttraction>(entityId);

  if (!entity) {
    logger.warn("Attraction not found", { entityId });
    return null;
  }

  if (entity.entityType !== "ATTRACTION") {
    logger.warn("Entity is not an attraction", { entityId, entityType: entity.entityType });
    return null;
  }

  return entity;
}
