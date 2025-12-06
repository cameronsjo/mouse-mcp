# Typed Event Emitter Architecture

This directory contains the typed event emitter system that resolves circular dependencies in the mouse-mcp project.

## Problem

The project had a circular dependency:

- `src/db/entities.ts` needs to trigger embedding generation after saving entities
- `src/embeddings/search.ts` needs to read entities from the database
- Previously used dynamic imports as a workaround

## Solution

A typed event emitter architecture that decouples these modules:

1. `entities.ts` emits events without importing embeddings
2. `embeddings/event-handlers.ts` subscribes to events without being imported by entities
3. Server wires up subscriptions at initialization

## Architecture

### Event Flow

```
┌─────────────────┐
│  entities.ts    │
│  saveEntity()   │
└────────┬────────┘
         │ emits "entity:saved"
         │
         v
┌─────────────────────────┐
│  entity-events.ts       │
│  TypedEntityEmitter     │
└────────┬────────────────┘
         │ dispatches to handlers
         │
         v
┌──────────────────────────┐
│  event-handlers.ts       │
│  handleEntitySaved()     │
└────────┬─────────────────┘
         │ calls
         │
         v
┌──────────────────────────┐
│  embeddings/search.ts    │
│  ensureEmbedding()       │
└──────────────────────────┘
```

### Initialization Order

1. Server starts (`src/server.ts`)
2. Event emitter singleton created (`getEntityEmitter()`)
3. Event handlers registered (`registerEmbeddingHandlers()`)
4. Entities emit events during normal operations
5. Event handlers process events asynchronously
6. On shutdown, handlers are cleaned up

## Files

### `entity-events.ts`

Core event emitter module with:

- `EntityEventMap`: Type-safe event definitions
- `TypedEntityEmitter`: Extended EventEmitter with strict typing
- `getEntityEmitter()`: Singleton factory
- `wrapEventHandler()`: Error handling wrapper
- Helper functions for debugging and monitoring

### `event-handlers.ts` (in embeddings/)

Event handler subscriptions:

- `handleEntitySaved()`: Single entity embedding generation
- `handleEntityBatchSaved()`: Batch embedding generation
- `handleEntityDeleted()`: Cleanup orphaned embeddings
- `registerEmbeddingHandlers()`: Registration function

### `index.ts`

Public API exports for the event system.

## Event Types

### `entity:saved`

Emitted when a single entity is saved (insert or update).

**Payload:**

```typescript
{
  entity: DisneyEntity;
  timestamp: string;
}
```

**Handler:** Generates embedding for the entity.

### `entity:batch-saved`

Emitted when multiple entities are saved in a batch.

**Payload:**

```typescript
{
  entities: DisneyEntity[];
  count: number;
  timestamp: string;
}
```

**Handler:** Generates embeddings in batch (more efficient).

### `entity:deleted`

Emitted when entities are deleted for a destination.

**Payload:**

```typescript
{
  destinationId: string;
  count: number;
  timestamp: string;
}
```

**Handler:** Cleans up orphaned embeddings.

## Usage Examples

### Emitting Events

```typescript
import { getEntityEmitter } from "./events/entity-events.js";

// Save entity and emit event
export async function saveEntity(entity: DisneyEntity): Promise<void> {
  // ... save to database ...

  const emitter = getEntityEmitter();
  emitter.emitEvent("entity:saved", { entity, timestamp: new Date().toISOString() });
}
```

### Subscribing to Events

```typescript
import { getEntityEmitter, wrapEventHandler } from "../events/entity-events.js";
import type { EntityEventMap } from "../events/entity-events.js";

async function handleEntitySaved(payload: EntityEventMap["entity:saved"]): Promise<void> {
  const { entity } = payload;
  await ensureEmbedding(entity);
}

// Register with error handling
const emitter = getEntityEmitter();
const wrapped = wrapEventHandler("entity:saved", handleEntitySaved);
emitter.onEvent("entity:saved", wrapped);
```

### Server Initialization

```typescript
import { registerEmbeddingHandlers, removeAllEventListeners } from "./events/index.js";

class DisneyMcpServer {
  private cleanupEventHandlers?: () => void;

  async run(): Promise<void> {
    // Register event handlers
    this.cleanupEventHandlers = registerEmbeddingHandlers();

    // ... start server ...
  }

  async shutdown(): Promise<void> {
    // Cleanup event handlers
    if (this.cleanupEventHandlers) {
      this.cleanupEventHandlers();
    }
    removeAllEventListeners();

    // ... shutdown server ...
  }
}
```

## Error Handling

Event handlers are wrapped with comprehensive error handling:

1. **Sync Errors:** Caught and logged, never propagate
2. **Async Errors:** Promise rejections are caught and logged
3. **Error Events:** Errors emit an 'error' event for monitoring
4. **Isolation:** Errors in one handler don't affect others
5. **Logging:** Full context logged (event name, handler name, error details)

Example:

```typescript
export function wrapEventHandler<K extends keyof EntityEventMap>(
  eventName: K,
  handler: (payload: EntityEventMap[K]) => void | Promise<void>
): (payload: EntityEventMap[K]) => void {
  return (payload: EntityEventMap[K]) => {
    try {
      const result = handler(payload);
      if (result instanceof Promise) {
        result.catch((error: Error) => {
          logger.error("Async event handler failed", error, {
            event: eventName,
            handler: handler.name,
          });
          getEntityEmitter().emit("error", error);
        });
      }
    } catch (error) {
      logger.error("Event handler failed", error as Error, {
        event: eventName,
        handler: handler.name,
      });
      getEntityEmitter().emit("error", error as Error);
    }
  };
}
```

## Why Node's EventEmitter?

We chose Node's built-in `EventEmitter` over alternatives:

### vs. eventemitter3

- **Pro:** Faster, smaller bundle
- **Con:** Non-standard API, requires dependency
- **Decision:** Native is preferred, performance difference negligible

### vs. mitt

- **Pro:** Tiny (200 bytes), TypeScript-first
- **Con:** Limited API (no `once`, `removeListener`, etc.)
- **Decision:** Need full EventEmitter API for production use

### Node's EventEmitter

- **Pro:** Battle-tested, zero dependencies, full API
- **Pro:** Native TypeScript support in @types/node
- **Pro:** Industry standard, well-documented
- **Pro:** Built-in error handling with 'error' events
- **Con:** Slightly larger than alternatives
- **Decision:** Best choice for production-ready code

## Type Safety

The architecture is fully type-safe:

1. **Event Names:** Only valid event names accepted
2. **Payloads:** Payload types match event names
3. **Handlers:** Handler signatures verified at compile time
4. **No `any`:** Strict typing throughout

Example compile-time safety:

```typescript
// ✅ Type-safe
emitter.emitEvent("entity:saved", { entity, timestamp });

// ❌ Compile error: invalid event name
emitter.emitEvent("invalid-event", { entity, timestamp });

// ❌ Compile error: wrong payload type
emitter.emitEvent("entity:saved", { wrong: "payload" });

// ✅ Handler type inferred
emitter.onEvent("entity:saved", (payload) => {
  // payload is typed as EntityEventMap["entity:saved"]
  console.log(payload.entity.name); // ✅
  console.log(payload.invalid); // ❌ Compile error
});
```

## Monitoring and Debugging

The event system includes monitoring utilities:

```typescript
import {
  getRegisteredEvents,
  getEventListenerCount,
} from "./events/entity-events.js";

// Get all registered event names
const events = getRegisteredEvents();
console.log("Registered events:", events);

// Get listener count for an event
const count = getEventListenerCount("entity:saved");
console.log("entity:saved listeners:", count);

// Listen for errors
const emitter = getEntityEmitter();
emitter.on("error", (error) => {
  console.error("Event handler error:", error);
});
```

## Testing

For testing, clean up event listeners between tests:

```typescript
import { removeAllEventListeners } from "./events/entity-events.js";

afterEach(() => {
  removeAllEventListeners();
});
```

## Benefits

1. **Decoupling:** Modules don't directly depend on each other
2. **Type Safety:** Full TypeScript typing, no `any`
3. **Error Handling:** Robust error handling prevents crashes
4. **Testability:** Easy to mock and test independently
5. **Extensibility:** Easy to add new event handlers
6. **Performance:** Fire-and-forget async operations
7. **Monitoring:** Built-in debugging and monitoring utilities
8. **Zero Dependencies:** Uses Node's built-in EventEmitter

## Future Enhancements

Potential improvements:

1. **Event Replay:** Store events for debugging or retry
2. **Metrics:** Track event frequency, handler latency
3. **Rate Limiting:** Prevent event flooding
4. **Priority Queues:** Handle critical events first
5. **Event Persistence:** Durable events for reliability
