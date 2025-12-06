/**
 * Entity Event Emitter
 *
 * Type-safe event emitter for entity lifecycle events.
 * Resolves circular dependencies between db/entities and embeddings/search.
 *
 * WHY: Using events instead of direct imports breaks the circular dependency:
 * - entities.ts emits events without knowing about embeddings
 * - embeddings/search.ts subscribes to events without being imported by entities
 * - Server wires up subscriptions at initialization
 */

import { EventEmitter } from "node:events";
import type { DisneyEntity } from "../types/index.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("EntityEvents");

/**
 * Entity lifecycle events.
 * Each event includes the entity data and metadata about the operation.
 *
 * WHY kebab-case event names: Following industry convention for event naming
 * (DOM events, HTTP headers, etc.) to distinguish from code identifiers.
 */
export interface EntityEventMap {
  /**
   * Emitted when a single entity is saved (insert or update).
   * Triggers async embedding generation.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "entity:saved": { entity: DisneyEntity; timestamp: string };

  /**
   * Emitted when multiple entities are saved in a batch.
   * Triggers async batch embedding generation.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "entity:batch-saved": { entities: DisneyEntity[]; count: number; timestamp: string };

  /**
   * Emitted when entities are deleted for a destination.
   * Allows cleanup of related embeddings.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "entity:deleted": { destinationId: string; count: number; timestamp: string };
}

/**
 * Type-safe event emitter for entity lifecycle events.
 * Extends Node's EventEmitter with strict typing.
 */
class TypedEntityEmitter extends EventEmitter {
  /**
   * Emit a typed event.
   * Type safety ensures event name and payload match.
   */
  emitEvent<K extends keyof EntityEventMap>(event: K, payload: EntityEventMap[K]): boolean {
    logger.debug("Event emitted", { event, payload });
    return this.emit(event, payload);
  }

  /**
   * Subscribe to a typed event.
   * Type safety ensures event name and handler match.
   */
  onEvent<K extends keyof EntityEventMap>(
    event: K,
    handler: (payload: EntityEventMap[K]) => void | Promise<void>
  ): this {
    return this.on(event, handler as (payload: EntityEventMap[K]) => void);
  }

  /**
   * Subscribe to a typed event (one-time).
   * Handler is automatically removed after first invocation.
   */
  onceEvent<K extends keyof EntityEventMap>(
    event: K,
    handler: (payload: EntityEventMap[K]) => void | Promise<void>
  ): this {
    return this.once(event, handler as (payload: EntityEventMap[K]) => void);
  }

  /**
   * Unsubscribe from a typed event.
   */
  offEvent<K extends keyof EntityEventMap>(
    event: K,
    handler: (payload: EntityEventMap[K]) => void | Promise<void>
  ): this {
    return this.off(event, handler as (payload: EntityEventMap[K]) => void);
  }
}

/**
 * Singleton instance of the entity event emitter.
 * WHY singleton: Ensures all modules share the same event bus.
 */
let entityEmitter: TypedEntityEmitter | null = null;

/**
 * Get or create the entity event emitter singleton.
 */
export function getEntityEmitter(): TypedEntityEmitter {
  if (!entityEmitter) {
    entityEmitter = new TypedEntityEmitter();

    // Set max listeners higher to avoid warnings
    // WHY: Multiple tools/modules may subscribe to the same events
    entityEmitter.setMaxListeners(20);

    // Handle errors in async event handlers
    // WHY: Prevents unhandled promise rejections from crashing the process
    entityEmitter.on("error", (error: Error) => {
      logger.error("Entity event handler error", error);
    });

    logger.debug("Entity event emitter initialized");
  }

  return entityEmitter;
}

/**
 * Wrap an event handler with error handling.
 * WHY: Event handlers should never throw - errors must be caught and logged.
 *
 * Error handling strategy:
 * - Log the error with full context
 * - Emit an 'error' event for monitoring
 * - Never let errors propagate to prevent crashes
 * - Continue processing other events
 */
export function wrapEventHandler<K extends keyof EntityEventMap>(
  eventName: K,
  handler: (payload: EntityEventMap[K]) => void | Promise<void>
): (payload: EntityEventMap[K]) => void {
  return (payload: EntityEventMap[K]) => {
    const handlerName = handler.name || "anonymous";

    try {
      const result = handler(payload);

      // Handle async handlers
      if (result instanceof Promise) {
        result.catch((error: unknown) => {
          logger.error("Async event handler failed", error as Error, {
            event: eventName,
            handler: handlerName,
          });

          // Emit error event for monitoring
          const emitter = getEntityEmitter();
          emitter.emit("error", error);
        });
      }
    } catch (error) {
      // Handle sync handler errors
      logger.error("Event handler failed", error as Error, {
        event: eventName,
        handler: handlerName,
      });

      // Emit error event for monitoring
      const emitter = getEntityEmitter();
      emitter.emit("error", error as Error);
    }
  };
}

/**
 * Type guard to check if a value is a valid entity event name.
 */
export function isEntityEventName(value: string): value is keyof EntityEventMap {
  const validEvents: Array<keyof EntityEventMap> = [
    "entity:saved",
    "entity:batch-saved",
    "entity:deleted",
  ];
  return validEvents.includes(value as keyof EntityEventMap);
}

/**
 * Get all registered event names.
 * Useful for debugging and monitoring.
 */
export function getRegisteredEvents(): Array<keyof EntityEventMap> {
  const emitter = getEntityEmitter();
  return emitter.eventNames() as Array<keyof EntityEventMap>;
}

/**
 * Get listener count for a specific event.
 * Useful for debugging and monitoring.
 */
export function getEventListenerCount(event: keyof EntityEventMap): number {
  const emitter = getEntityEmitter();
  return emitter.listenerCount(event);
}

/**
 * Remove all event listeners.
 * WHY: Used during shutdown or testing cleanup.
 */
export function removeAllEventListeners(): void {
  const emitter = getEntityEmitter();
  emitter.removeAllListeners();
  logger.debug("All event listeners removed");
}
