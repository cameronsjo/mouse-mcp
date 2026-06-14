/**
 * Entity Storage Integration Tests
 *
 * Test Plan:
 *
 * saveEntity / getEntityById (Classification: I/O boundary — round-trip)
 *   [x] Happy: save then retrieve returns the same entity
 *   [x] Unhappy: missing id returns null
 *   [x] Unhappy: corrupt stored JSON returns null (graceful degradation)
 *
 * getEntities (Classification: I/O boundary — parameterized query)
 *   [x] Empty DB returns []
 *   [x] Filters by destinationId
 *   [x] Filters by entityType
 *   [x] Filters by parkId
 *   [x] Results are ORDER BY name (ascending)
 *   [x] Corrupt row is skipped; clean rows are still returned
 *
 * Type helpers (Classification: thin wrappers — pass-through type check)
 *   [x] getAttractions returns only ATTRACTION entities
 *   [x] getDining returns only RESTAURANT entities
 *   [x] getShows returns only SHOW entities
 *   [x] getShops returns only SHOP entities
 *   [x] getEvents returns only EVENT entities
 *
 * searchEntitiesByName (Classification: I/O boundary + fuzzy match)
 *   [x] Fuzzy-matches similar names
 *   [x] Empty DB returns []
 *   [x] Respects entityType filter
 *
 * deleteEntitiesForDestination (Classification: I/O boundary — mutation)
 *   [x] Returns count of deleted entities
 *   [x] Removes rows from the database
 *   [x] Returns 0 when destination has no entities
 *
 * getLastEntityUpdate (Classification: I/O boundary — aggregate)
 *   [x] Returns null when no entities exist
 *   [x] Returns an ISO string after saving an entity
 *
 * getParkCount (Classification: I/O boundary — count)
 *   [x] Returns 0 when no PARK entities exist
 *   [x] Counts only PARK entities
 *
 * getEntityCounts (Classification: I/O boundary — aggregate)
 *   [x] Returns zero counts for all types on empty DB
 *   [x] Returns correct counts after seeding
 *
 * saveEntity event emission (Classification: Behavioral)
 *   [x] Emits entity:saved with the saved entity in the payload
 *   [x] Save succeeds even when the event handler throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupTempDb, teardownTempDb } from "./__test-helpers__/temp-db.js";
import {
  saveEntity,
  getEntityById,
  getEntities,
  getAttractions,
  getDining,
  getShows,
  getShops,
  getEvents,
  searchEntitiesByName,
  deleteEntitiesForDestination,
  getLastEntityUpdate,
  getParkCount,
  getEntityCounts,
} from "./entities.js";
import { getDatabase } from "./database.js";
import { getEntityEmitter, removeAllEventListeners } from "../events/entity-events.js";
import type {
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DisneyShop,
  DisneyEvent,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Entity factories
// ---------------------------------------------------------------------------

function makeAttraction(
  id: string,
  name: string,
  destinationId: "wdw" | "dlr" = "wdw",
  parkId: string | null = null
): DisneyAttraction {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/ /g, "-"),
    entityType: "ATTRACTION",
    destinationId,
    parkId,
    parkName: parkId ? "Magic Kingdom Park" : null,
    location: null,
    url: null,
    heightRequirement: null,
    thrillLevel: null,
    experienceType: null,
    duration: null,
    lightningLane: null,
    singleRider: false,
    riderSwap: false,
    photopass: false,
    virtualQueue: false,
    wheelchairAccessible: true,
    tags: [],
  };
}

function makeDining(id: string, name: string, destinationId: "wdw" | "dlr" = "wdw"): DisneyDining {
  return {
    id,
    name,
    slug: null,
    entityType: "RESTAURANT",
    destinationId,
    parkId: null,
    parkName: null,
    location: null,
    url: null,
    serviceType: null,
    priceRange: null,
    cuisineTypes: [],
    mealPeriods: [],
    reservationsAccepted: false,
    reservationsRequired: false,
    mobileOrder: false,
    characterDining: false,
    disneyDiningPlan: false,
    tags: [],
  };
}

function makeShow(id: string, name: string): DisneyShow {
  return {
    id,
    name,
    slug: null,
    entityType: "SHOW",
    destinationId: "wdw",
    parkId: null,
    parkName: null,
    location: null,
    url: null,
    showType: "stage-show",
    duration: null,
    tags: [],
  };
}

function makeShop(id: string, name: string): DisneyShop {
  return {
    id,
    name,
    slug: null,
    entityType: "SHOP",
    destinationId: "wdw",
    parkId: null,
    parkName: null,
    location: null,
    url: null,
    shopType: "merchandise",
    tags: [],
  };
}

function makeEvent(id: string, name: string): DisneyEvent {
  return {
    id,
    name,
    slug: null,
    entityType: "EVENT",
    destinationId: "wdw",
    parkId: null,
    parkName: null,
    location: null,
    url: null,
    eventType: "special-event",
    tags: [],
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  setupTempDb();
  removeAllEventListeners();
  getEntityEmitter().on("error", () => {});
});

afterEach(() => {
  teardownTempDb();
});

// ---------------------------------------------------------------------------
// saveEntity / getEntityById
// ---------------------------------------------------------------------------

describe("saveEntity / getEntityById", () => {
  it("round-trips a saved entity", async () => {
    const entity = makeAttraction("attr-rt1", "Space Mountain");

    await saveEntity(entity);
    const retrieved = await getEntityById<DisneyAttraction>("attr-rt1");

    expect(retrieved?.id).toBe("attr-rt1");
    expect(retrieved?.name).toBe("Space Mountain");
    expect(retrieved?.entityType).toBe("ATTRACTION");
  });

  it("returns null for a missing id", async () => {
    const result = await getEntityById("no-such-id");

    expect(result).toBeNull();
  });

  it("returns null when the stored JSON is corrupt", async () => {
    await saveEntity(makeAttraction("attr-corrupt1", "Bad Row"));
    const db = await getDatabase();
    db.run("UPDATE entities SET data = ? WHERE id = ?", ["{invalid{{", "attr-corrupt1"]);

    const result = await getEntityById("attr-corrupt1");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getEntities
// ---------------------------------------------------------------------------

describe("getEntities", () => {
  it("returns empty array when no entities exist", async () => {
    const result = await getEntities({ destinationId: "wdw" });

    expect(result).toEqual([]);
  });

  it("filters by destinationId", async () => {
    await saveEntity(makeAttraction("wdw-ge1", "WDW Ride", "wdw"));
    await saveEntity(makeAttraction("dlr-ge1", "DLR Ride", "dlr"));

    const result = await getEntities({ destinationId: "wdw" });

    expect(result).toHaveLength(1);
    expect(result[0]?.destinationId).toBe("wdw");
  });

  it("filters by entityType", async () => {
    await saveEntity(makeAttraction("ge-attr1", "Roller Coaster", "wdw"));
    await saveEntity(makeDining("ge-din1", "Restaurant", "wdw"));

    const result = await getEntities({ destinationId: "wdw", entityType: "ATTRACTION" });

    expect(result).toHaveLength(1);
    expect(result[0]?.entityType).toBe("ATTRACTION");
  });

  it("filters by parkId", async () => {
    await saveEntity(makeAttraction("ge-park1", "MK Ride", "wdw", "80007944"));
    await saveEntity(makeAttraction("ge-park2", "EPCOT Ride", "wdw", "80007838"));

    const result = await getEntities({ destinationId: "wdw", parkId: "80007944" });

    expect(result).toHaveLength(1);
    expect(result[0]?.parkId).toBe("80007944");
  });

  it("returns results ordered by name ascending", async () => {
    await saveEntity(makeAttraction("ord-z", "Zipper Coaster", "wdw"));
    await saveEntity(makeAttraction("ord-a", "Awesome Coaster", "wdw"));
    await saveEntity(makeAttraction("ord-m", "Magic Ride", "wdw"));

    const result = await getEntities({ destinationId: "wdw" });
    const names = result.map((e) => e.name);

    expect(names[0]).toBe("Awesome Coaster");
    expect(names[1]).toBe("Magic Ride");
    expect(names[2]).toBe("Zipper Coaster");
  });

  it("skips corrupt rows and returns the valid ones", async () => {
    await saveEntity(makeAttraction("ge-good1", "Good Ride", "wdw"));
    await saveEntity(makeAttraction("ge-bad1", "Corrupt Ride", "wdw"));
    const db = await getDatabase();
    db.run("UPDATE entities SET data = ? WHERE id = ?", ["{bad-json}", "ge-bad1"]);

    const result = await getEntities({ destinationId: "wdw" });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("ge-good1");
  });
});

// ---------------------------------------------------------------------------
// Type helper functions
// ---------------------------------------------------------------------------

describe("type helper functions", () => {
  it("getAttractions returns only ATTRACTION entities", async () => {
    await saveEntity(makeAttraction("th-a1", "Ride One", "wdw"));
    await saveEntity(makeDining("th-d1", "Food One", "wdw"));

    const result = await getAttractions("wdw");

    expect(result).toHaveLength(1);
    expect(result.every((e) => e.entityType === "ATTRACTION")).toBe(true);
  });

  it("getDining returns only RESTAURANT entities", async () => {
    await saveEntity(makeAttraction("th-a2", "Ride Two", "wdw"));
    await saveEntity(makeDining("th-d2", "Food Two", "wdw"));

    const result = await getDining("wdw");

    expect(result).toHaveLength(1);
    expect(result.every((e) => e.entityType === "RESTAURANT")).toBe(true);
  });

  it("getShows returns only SHOW entities", async () => {
    await saveEntity(makeShow("th-s1", "Fireworks Show"));

    const result = await getShows("wdw");

    expect(result).toHaveLength(1);
    expect(result[0]?.entityType).toBe("SHOW");
  });

  it("getShops returns only SHOP entities", async () => {
    await saveEntity(makeShop("th-sh1", "Gift Shop"));

    const result = await getShops("wdw");

    expect(result).toHaveLength(1);
    expect(result[0]?.entityType).toBe("SHOP");
  });

  it("getEvents returns only EVENT entities", async () => {
    await saveEntity(makeEvent("th-ev1", "Festival Event"));

    const result = await getEvents("wdw");

    expect(result).toHaveLength(1);
    expect(result[0]?.entityType).toBe("EVENT");
  });
});

// ---------------------------------------------------------------------------
// searchEntitiesByName
// ---------------------------------------------------------------------------

describe("searchEntitiesByName", () => {
  it("fuzzy-matches and ranks the closest name first", async () => {
    await saveEntity(makeAttraction("srch-1", "Space Mountain", "wdw"));
    await saveEntity(makeAttraction("srch-2", "Big Thunder Mountain Railroad", "wdw"));

    const results = await searchEntitiesByName("Space Mountain", { destinationId: "wdw" });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toBe("Space Mountain");
  });

  it("returns empty array when no candidates exist", async () => {
    const results = await searchEntitiesByName("Space Mountain", { destinationId: "wdw" });

    expect(results).toEqual([]);
  });

  it("respects entityType filter", async () => {
    await saveEntity(makeAttraction("srch-a1", "Mountain Ride", "wdw"));
    await saveEntity(makeDining("srch-d1", "Mountain Cafe", "wdw"));

    const results = await searchEntitiesByName("Mountain", {
      destinationId: "wdw",
      entityType: "ATTRACTION",
    });

    expect(results.every((e) => e.entityType === "ATTRACTION")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteEntitiesForDestination
// ---------------------------------------------------------------------------

describe("deleteEntitiesForDestination", () => {
  it("returns the count of deleted rows", async () => {
    await saveEntity(makeAttraction("del-1", "Delete Me 1", "wdw"));
    await saveEntity(makeAttraction("del-2", "Delete Me 2", "wdw"));

    const count = await deleteEntitiesForDestination("wdw");

    expect(count).toBe(2);
  });

  it("removes the rows so they can no longer be retrieved", async () => {
    await saveEntity(makeAttraction("del-3", "Gone Ride", "wdw"));
    await deleteEntitiesForDestination("wdw");

    const remaining = await getEntities({ destinationId: "wdw" });

    expect(remaining).toHaveLength(0);
  });

  it("returns 0 when destination has no entities", async () => {
    const count = await deleteEntitiesForDestination("wdw");

    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getLastEntityUpdate
// ---------------------------------------------------------------------------

describe("getLastEntityUpdate", () => {
  it("returns null when no entities exist", async () => {
    const result = await getLastEntityUpdate();

    expect(result).toBeNull();
  });

  it("returns an ISO string after saving an entity", async () => {
    await saveEntity(makeAttraction("lu-1", "Some Ride"));

    const result = await getLastEntityUpdate();

    expect(result).not.toBeNull();
    // Should be a parseable ISO date
    expect(() => new Date(result!).toISOString()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getParkCount
// ---------------------------------------------------------------------------

describe("getParkCount", () => {
  it("returns 0 when no PARK entities exist", async () => {
    await saveEntity(makeAttraction("pc-a1", "Not A Park"));

    const count = await getParkCount();

    expect(count).toBe(0);
  });

  it("counts only PARK-type entities", async () => {
    const park = {
      id: "pc-park1",
      name: "Magic Kingdom",
      slug: "magic-kingdom",
      entityType: "PARK" as const,
      destinationId: "wdw" as const,
      parkId: null,
      parkName: null,
      location: null,
      url: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await saveEntity(park as any);
    await saveEntity(makeAttraction("pc-a2", "A Ride"));

    const count = await getParkCount();

    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getEntityCounts
// ---------------------------------------------------------------------------

describe("getEntityCounts", () => {
  it("returns zero counts for all types when the DB is empty", async () => {
    const counts = await getEntityCounts("wdw");

    expect(counts.ATTRACTION).toBe(0);
    expect(counts.RESTAURANT).toBe(0);
    expect(counts.SHOW).toBe(0);
    expect(counts.SHOP).toBe(0);
    expect(counts.EVENT).toBe(0);
  });

  it("returns correct counts after seeding several entity types", async () => {
    await saveEntity(makeAttraction("ec-a1", "Ride A", "wdw"));
    await saveEntity(makeAttraction("ec-a2", "Ride B", "wdw"));
    await saveEntity(makeDining("ec-d1", "Eatery", "wdw"));

    const counts = await getEntityCounts("wdw");

    expect(counts.ATTRACTION).toBe(2);
    expect(counts.RESTAURANT).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// saveEntity event emission
// ---------------------------------------------------------------------------

describe("saveEntity event emission", () => {
  it("emits entity:saved with the correct entity payload", async () => {
    const emitter = getEntityEmitter();
    const handler = vi.fn();
    emitter.onEvent("entity:saved", handler);

    const entity = makeAttraction("ev-1", "Event Ride");
    await saveEntity(entity);

    expect(handler).toHaveBeenCalledOnce();
    const payload = handler.mock.calls[0]?.[0] as { entity: { id: string } };
    expect(payload.entity.id).toBe("ev-1");
  });

  it("save succeeds and entity is persisted even when the handler throws", async () => {
    const emitter = getEntityEmitter();
    emitter.onEvent("entity:saved", () => {
      throw new Error("deliberate handler error");
    });

    const entity = makeAttraction("ev-2", "Throw Ride");

    await expect(saveEntity(entity)).resolves.toBeUndefined();
    const retrieved = await getEntityById("ev-2");
    expect(retrieved?.id).toBe("ev-2");
  });
});
