/**
 * Event System Exports
 */

export {
  getEntityEmitter,
  wrapEventHandler,
  isEntityEventName,
  getRegisteredEvents,
  getEventListenerCount,
  removeAllEventListeners,
  type EntityEventMap,
} from "./entity-events.js";

export { registerEmbeddingHandlers } from "../embeddings/event-handlers.js";
