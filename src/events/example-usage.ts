/**
 * Event System Usage Examples
 *
 * This file demonstrates how to use the typed event emitter system.
 * These are examples only - not executed in production.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */

import { getEntityEmitter, wrapEventHandler } from "./entity-events.js";
import type { EntityEventMap } from "./entity-events.js";
import type { DisneyEntity } from "../types/index.js";

// ============================================================================
// Example 1: Emitting Events from Entity Operations
// ============================================================================

async function exampleSaveEntity(entity: DisneyEntity): Promise<void> {
  // ... save entity to database ...

  // Emit event to trigger embedding generation
  const emitter = getEntityEmitter();
  const timestamp = new Date().toISOString();

  emitter.emitEvent("entity:saved", {
    entity,
    timestamp,
  });

  // Event is fire-and-forget - no need to wait
  // Handlers will process asynchronously
}

// ============================================================================
// Example 2: Creating Event Handlers
// ============================================================================

// Type-safe handler - TypeScript infers the payload type
async function handleEntitySaved(payload: EntityEventMap["entity:saved"]): Promise<void> {
  const { entity, timestamp } = payload;

  console.log(`Processing entity saved at ${timestamp}`);
  console.log(`Entity: ${entity.name} (${entity.id})`);

  // Perform async operation
  await generateEmbeddingForEntity(entity);
}

async function handleBatchSaved(payload: EntityEventMap["entity:batch-saved"]): Promise<void> {
  const { entities, count, timestamp } = payload;

  console.log(`Processing ${count} entities saved at ${timestamp}`);

  // Process batch efficiently
  await generateEmbeddingsInBatch(entities);
}

async function handleEntityDeleted(payload: EntityEventMap["entity:deleted"]): Promise<void> {
  const { destinationId, count, timestamp } = payload;

  console.log(`Cleaning up ${count} deleted entities at ${timestamp}`);

  // Cleanup related data
  await cleanupEmbeddingsForDestination(destinationId);
}

// ============================================================================
// Example 3: Registering Handlers with Error Handling
// ============================================================================

function registerHandlersExample(): () => void {
  const emitter = getEntityEmitter();

  // Wrap handlers to ensure errors are caught and logged
  const wrappedSaved = wrapEventHandler("entity:saved", handleEntitySaved);
  const wrappedBatch = wrapEventHandler("entity:batch-saved", handleBatchSaved);
  const wrappedDeleted = wrapEventHandler("entity:deleted", handleEntityDeleted);

  // Register handlers
  emitter.onEvent("entity:saved", wrappedSaved);
  emitter.onEvent("entity:batch-saved", wrappedBatch);
  emitter.onEvent("entity:deleted", wrappedDeleted);

  // Return cleanup function
  return () => {
    emitter.offEvent("entity:saved", wrappedSaved);
    emitter.offEvent("entity:batch-saved", wrappedBatch);
    emitter.offEvent("entity:deleted", wrappedDeleted);
  };
}

// ============================================================================
// Example 4: One-Time Event Handlers
// ============================================================================

function registerOneTimeHandler(): void {
  const emitter = getEntityEmitter();

  // Handler runs once then auto-removes
  emitter.onceEvent("entity:saved", async (payload) => {
    console.log("First entity saved:", payload.entity.name);
  });
}

// ============================================================================
// Example 5: Monitoring and Debugging
// ============================================================================

import { getRegisteredEvents, getEventListenerCount, isEntityEventName } from "./entity-events.js";

function monitoringExample(): void {
  // Get all registered event names
  const events = getRegisteredEvents();
  console.log("Active events:", events);

  // Get listener count for specific event
  const savedCount = getEventListenerCount("entity:saved");
  console.log(`entity:saved has ${savedCount} listeners`);

  const batchCount = getEventListenerCount("entity:batch-saved");
  console.log(`entity:batch-saved has ${batchCount} listeners`);

  // Validate event name
  const eventName = "entity:saved";
  if (isEntityEventName(eventName)) {
    console.log(`${eventName} is a valid event`);
  }
}

// ============================================================================
// Example 6: Error Handling
// ============================================================================

function errorHandlingExample(): void {
  const emitter = getEntityEmitter();

  // Listen for errors in event handlers
  emitter.on("error", (error: Error) => {
    console.error("Event handler error:", error);
    // Send to monitoring service, log to file, etc.
  });

  // Register a handler that might throw
  const riskyHandler = wrapEventHandler("entity:saved", async (_payload) => {
    // This error will be caught and emitted as an 'error' event
    throw new Error("Something went wrong!");
  });

  emitter.onEvent("entity:saved", riskyHandler);
}

// ============================================================================
// Example 7: Complete Server Integration
// ============================================================================

class ExampleServer {
  private cleanupHandlers?: () => void;

  async start(): Promise<void> {
    // Register all event handlers at startup
    this.cleanupHandlers = registerHandlersExample();

    console.log("Server started with event handlers registered");
  }

  async stop(): Promise<void> {
    // Cleanup event handlers at shutdown
    if (this.cleanupHandlers) {
      this.cleanupHandlers();
    }

    console.log("Server stopped and event handlers cleaned up");
  }
}

// ============================================================================
// Example 8: Type Safety Demonstrations
// ============================================================================

function typeSafetyExamples(): void {
  const emitter = getEntityEmitter();

  // ✅ Type-safe: Correct event and payload
  const mockEntity: DisneyEntity = {
    id: "test",
    name: "Test Entity",
  } as DisneyEntity;
  emitter.emitEvent("entity:saved", {
    entity: mockEntity,
    timestamp: new Date().toISOString(),
  });

  // ❌ Compile error: Invalid event name
  // emitter.emitEvent("invalid-event", { entity: {} as DisneyEntity, timestamp: "" });

  // ❌ Compile error: Wrong payload type
  // emitter.emitEvent("entity:saved", { wrong: "payload" });

  // ✅ Type-safe handler with inferred payload type
  emitter.onEvent("entity:saved", (payload) => {
    // payload is automatically typed as EntityEventMap["entity:saved"]
    console.log(payload.entity.name); // ✅
    console.log(payload.timestamp); // ✅
    // console.log(payload.invalid); // ❌ Compile error
  });

  // ✅ Type-safe batch handler
  emitter.onEvent("entity:batch-saved", (payload) => {
    // payload is automatically typed as EntityEventMap["entity:batch-saved"]
    console.log(`Processing ${payload.count} entities`);
    payload.entities.forEach((entity) => {
      console.log(entity.name); // ✅
    });
  });
}

// ============================================================================
// Helper Functions (Examples Only)
// ============================================================================

async function generateEmbeddingForEntity(entity: DisneyEntity): Promise<void> {
  console.log(`Generating embedding for ${entity.name}`);
  // Implementation would go here
}

async function generateEmbeddingsInBatch(entities: DisneyEntity[]): Promise<void> {
  console.log(`Generating ${entities.length} embeddings`);
  // Implementation would go here
}

async function cleanupEmbeddingsForDestination(destinationId: string): Promise<void> {
  console.log(`Cleaning up embeddings for ${destinationId}`);
  // Implementation would go here
}

// ============================================================================
// Export Examples (Not Actually Used)
// ============================================================================

export {
  exampleSaveEntity,
  registerHandlersExample,
  registerOneTimeHandler,
  monitoringExample,
  errorHandlingExample,
  ExampleServer,
  typeSafetyExamples,
};
