/**
 * Embedding Event Handlers
 *
 * Subscribes to entity lifecycle events and generates embeddings.
 * WHY: Decouples embedding generation from entity storage to break circular dependency.
 */

import { getEntityEmitter, wrapEventHandler } from "../events/entity-events.js";
import { ensureEmbedding, ensureEmbeddingsBatch } from "./search.js";
import { deleteEmbeddingsByDestination } from "../vectordb/index.js";
import { createLogger } from "../shared/logger.js";
import type { EntityEventMap } from "../events/entity-events.js";

const logger = createLogger("EmbeddingHandlers");

/**
 * Handle entity:saved event.
 * Generates embedding for a single entity.
 */
async function handleEntitySaved(payload: EntityEventMap["entity:saved"]): Promise<void> {
  const { entity } = payload;

  logger.debug("Generating embedding for saved entity", {
    id: entity.id,
    name: entity.name,
  });

  await ensureEmbedding(entity);
}

/**
 * Handle entity:batch-saved event.
 * Generates embeddings for multiple entities efficiently.
 */
async function handleEntityBatchSaved(
  payload: EntityEventMap["entity:batch-saved"]
): Promise<void> {
  const { entities, count } = payload;

  logger.debug("Generating embeddings for batch", { count });

  await ensureEmbeddingsBatch(entities);
}

/**
 * Handle entity:deleted event.
 * Cleans up embeddings for deleted entities.
 */
async function handleEntityDeleted(payload: EntityEventMap["entity:deleted"]): Promise<void> {
  const { destinationId, count } = payload;

  logger.debug("Cleaning up embeddings for deleted entities", {
    destinationId,
    count,
  });

  await deleteEmbeddingsByDestination(destinationId);
}

/**
 * Register all embedding event handlers.
 * WHY: Called during server initialization to wire up event subscriptions.
 *
 * Returns a cleanup function to unregister handlers.
 */
export function registerEmbeddingHandlers(): () => void {
  const emitter = getEntityEmitter();

  logger.info("Registering embedding event handlers");

  // Wrap handlers with error handling
  const wrappedEntitySaved = wrapEventHandler("entity:saved", handleEntitySaved);
  const wrappedBatchSaved = wrapEventHandler("entity:batch-saved", handleEntityBatchSaved);
  const wrappedEntityDeleted = wrapEventHandler("entity:deleted", handleEntityDeleted);

  // Register handlers
  emitter.onEvent("entity:saved", wrappedEntitySaved);
  emitter.onEvent("entity:batch-saved", wrappedBatchSaved);
  emitter.onEvent("entity:deleted", wrappedEntityDeleted);

  logger.info("Embedding event handlers registered");

  // Return cleanup function
  return () => {
    logger.info("Unregistering embedding event handlers");
    emitter.offEvent("entity:saved", wrappedEntitySaved);
    emitter.offEvent("entity:batch-saved", wrappedBatchSaved);
    emitter.offEvent("entity:deleted", wrappedEntityDeleted);
  };
}
