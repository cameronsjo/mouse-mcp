/**
 * Entity Events Tests
 *
 * Test Plan:
 *
 * TypedEntityEmitter (Classification: State machine)
 *   [x] Singleton: getEntityEmitter() returns same instance on repeated calls
 *   [x] onEvent/emitEvent: handler receives entity:saved payload
 *   [x] onEvent/emitEvent: handler receives entity:batch-saved payload
 *   [x] onEvent/emitEvent: handler receives entity:deleted payload
 *   [x] Multiple listeners all fire on the same event
 *   [x] offEvent: unsubscribed handler is not called after offEvent
 *   [x] onceEvent: fires exactly once on repeated emissions
 *
 * getEventListenerCount (Classification: Pure helper)
 *   [x] Returns zero when no listeners registered
 *   [x] Returns correct count after registering listeners
 *
 * wrapEventHandler (Classification: Error isolation)
 *   [x] Calls inner handler with payload
 *   [x] Does not throw when synchronous handler throws
 *
 * isEntityEventName (Classification: Pure / input parser)
 *   [x] Returns true for all valid event names
 *   [x] Returns false for unknown name
 *   [x] Returns false for empty string
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getEntityEmitter,
  removeAllEventListeners,
  isEntityEventName,
  getEventListenerCount,
  wrapEventHandler,
} from "./entity-events.js";
import type { EntityEventMap } from "./entity-events.js";
import type { DisneyEntity } from "../types/index.js";

// Minimal entity stub for payloads
const stubEntity: DisneyEntity = {
  id: "stub-1",
  name: "Stub Entity",
  slug: null,
  entityType: "ATTRACTION",
  destinationId: "wdw",
  parkId: null,
  parkName: null,
  location: null,
  url: null,
};

beforeEach(() => {
  removeAllEventListeners();
  // Re-register the error listener removed by removeAllListeners so Node
  // doesn't throw unhandled-error for wrapEventHandler error tests.
  getEntityEmitter().on("error", () => {});
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe("getEntityEmitter", () => {
  it("returns the same singleton on repeated calls", () => {
    const first = getEntityEmitter();
    const second = getEntityEmitter();

    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// onEvent / emitEvent
// ---------------------------------------------------------------------------

describe("onEvent / emitEvent", () => {
  it("delivers entity:saved payload to handler", () => {
    const emitter = getEntityEmitter();
    const handler = vi.fn();
    const payload: EntityEventMap["entity:saved"] = {
      entity: stubEntity,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    emitter.onEvent("entity:saved", handler);
    emitter.emitEvent("entity:saved", payload);

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("delivers entity:batch-saved payload to handler", () => {
    const emitter = getEntityEmitter();
    const handler = vi.fn();
    const payload: EntityEventMap["entity:batch-saved"] = {
      entities: [stubEntity],
      count: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    emitter.onEvent("entity:batch-saved", handler);
    emitter.emitEvent("entity:batch-saved", payload);

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("delivers entity:deleted payload to handler", () => {
    const emitter = getEntityEmitter();
    const handler = vi.fn();
    const payload: EntityEventMap["entity:deleted"] = {
      destinationId: "wdw",
      count: 3,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    emitter.onEvent("entity:deleted", handler);
    emitter.emitEvent("entity:deleted", payload);

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("calls all registered handlers when the event fires", () => {
    const emitter = getEntityEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();
    const payload: EntityEventMap["entity:saved"] = {
      entity: stubEntity,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    emitter.onEvent("entity:saved", h1);
    emitter.onEvent("entity:saved", h2);
    emitter.emitEvent("entity:saved", payload);

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// offEvent
// ---------------------------------------------------------------------------

describe("offEvent", () => {
  it("handler is not called after offEvent", () => {
    const emitter = getEntityEmitter();
    const handler = vi.fn();
    const payload: EntityEventMap["entity:saved"] = {
      entity: stubEntity,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    emitter.onEvent("entity:saved", handler);
    emitter.offEvent("entity:saved", handler);
    emitter.emitEvent("entity:saved", payload);

    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// onceEvent
// ---------------------------------------------------------------------------

describe("onceEvent", () => {
  it("fires handler exactly once on repeated emissions", () => {
    const emitter = getEntityEmitter();
    const handler = vi.fn();
    const payload: EntityEventMap["entity:saved"] = {
      entity: stubEntity,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    emitter.onceEvent("entity:saved", handler);
    emitter.emitEvent("entity:saved", payload);
    emitter.emitEvent("entity:saved", payload);

    expect(handler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// getEventListenerCount
// ---------------------------------------------------------------------------

describe("getEventListenerCount", () => {
  it("returns zero when no listeners are registered", () => {
    expect(getEventListenerCount("entity:saved")).toBe(0);
  });

  it("returns the correct count after registering listeners", () => {
    const emitter = getEntityEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();

    emitter.onEvent("entity:saved", h1);
    emitter.onEvent("entity:saved", h2);

    expect(getEventListenerCount("entity:saved")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// wrapEventHandler
// ---------------------------------------------------------------------------

describe("wrapEventHandler", () => {
  it("calls the inner handler with the payload", () => {
    const inner = vi.fn();
    const payload: EntityEventMap["entity:saved"] = {
      entity: stubEntity,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    const wrapped = wrapEventHandler("entity:saved", inner);
    wrapped(payload);

    expect(inner).toHaveBeenCalledWith(payload);
  });

  it("does not throw when the synchronous handler throws", () => {
    const throwing = (): void => {
      throw new Error("handler blew up");
    };
    const payload: EntityEventMap["entity:saved"] = {
      entity: stubEntity,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    const wrapped = wrapEventHandler("entity:saved", throwing);

    expect(() => wrapped(payload)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isEntityEventName
// ---------------------------------------------------------------------------

describe("isEntityEventName", () => {
  it("returns true for entity:saved", () => {
    expect(isEntityEventName("entity:saved")).toBe(true);
  });

  it("returns true for entity:batch-saved", () => {
    expect(isEntityEventName("entity:batch-saved")).toBe(true);
  });

  it("returns true for entity:deleted", () => {
    expect(isEntityEventName("entity:deleted")).toBe(true);
  });

  it("returns false for an unknown event name", () => {
    expect(isEntityEventName("not:an:event")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isEntityEventName("")).toBe(false);
  });
});
