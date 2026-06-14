/**
 * Tests for embedding text builder
 *
 * Test Plan:
 *
 * buildEmbeddingText (Classification: Data transformer — entity fixtures, no doubles)
 *   [x] Happy: always includes entity name as first token
 *   [x] Happy: includes formatted entity type context
 *   [x] Happy: includes park name when present
 *   [x] Boundary: park name absent → no "at <park>" fragment
 *   [x] Happy: ATTRACTION — thrill level "thrill" → contains thrill text
 *   [x] Happy: ATTRACTION — no height requirement → contains "no height requirement"
 *   [x] Happy: ATTRACTION — height ≥ 48 inches → contains "tall riders" context
 *   [x] Happy: ATTRACTION — noise tags are filtered out
 *   [x] Happy: ATTRACTION — known tags are expanded to natural language
 *   [x] Happy: RESTAURANT — service type mapped, cuisine and meal period included
 *   [x] Happy: SHOW — showType mapped to natural language
 *   [x] Happy: HOTEL — tier mapped, area and transportation included
 *   [x] Happy: SHOP — shopType mapped
 *   [x] Happy: EVENT — eventType mapped
 *   [x] Boundary: DESTINATION entity type → no type-specific fields added
 *   [x] Boundary: PARK entity type → no type-specific fields added
 *
 * hashEmbeddingText (Classification: Data transformer — pure, deterministic)
 *   [x] Happy: returns 16-character hex string
 *   [x] Happy: same input always returns same hash (deterministic)
 *   [x] Happy: different inputs return different hashes (collision-free for simple cases)
 */

import { describe, it, expect } from "vitest";
import type {
  DisneyEntity,
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DisneyShop,
  DisneyEvent,
  DisneyHotel,
} from "../types/index.js";
import { buildEmbeddingText, hashEmbeddingText } from "./text-builder.js";

// --- Fixture factories ---

const BASE: Omit<DisneyEntity, "entityType"> = {
  id: "test-id",
  name: "Test Entity",
  slug: null,
  destinationId: "wdw",
  parkId: "park-1",
  parkName: "Magic Kingdom",
  location: null,
  url: null,
};

function makeAttraction(overrides: Partial<DisneyAttraction> = {}): DisneyAttraction {
  return {
    ...BASE,
    entityType: "ATTRACTION",
    heightRequirement: null,
    thrillLevel: null,
    experienceType: null,
    duration: null,
    lightningLane: null,
    singleRider: false,
    riderSwap: false,
    photopass: false,
    virtualQueue: false,
    wheelchairAccessible: false,
    tags: [],
    ...overrides,
  };
}

function makeDining(overrides: Partial<DisneyDining> = {}): DisneyDining {
  return {
    ...BASE,
    entityType: "RESTAURANT",
    serviceType: null,
    mealPeriods: [],
    cuisineTypes: [],
    priceRange: null,
    mobileOrder: false,
    reservationsRequired: false,
    reservationsAccepted: false,
    characterDining: false,
    disneyDiningPlan: false,
    tags: [],
    ...overrides,
  };
}

function makeShow(overrides: Partial<DisneyShow> = {}): DisneyShow {
  return {
    ...BASE,
    entityType: "SHOW",
    showType: "stage-show",
    duration: null,
    tags: [],
    ...overrides,
  };
}

function makeShop(overrides: Partial<DisneyShop> = {}): DisneyShop {
  return {
    ...BASE,
    entityType: "SHOP",
    shopType: "merchandise",
    tags: [],
    ...overrides,
  };
}

function makeEvent(overrides: Partial<DisneyEvent> = {}): DisneyEvent {
  return {
    ...BASE,
    entityType: "EVENT",
    eventType: "special-event",
    tags: [],
    ...overrides,
  };
}

function makeHotel(overrides: Partial<DisneyHotel> = {}): DisneyHotel {
  return {
    ...BASE,
    entityType: "HOTEL",
    tier: null,
    area: null,
    transportation: [],
    amenities: [],
    tags: [],
    ...overrides,
  };
}

// --- buildEmbeddingText ---

describe("buildEmbeddingText — base fields", () => {
  it("starts with the entity name", () => {
    const text = buildEmbeddingText(makeAttraction({ name: "Space Mountain" }));
    expect(text.split(". ")[0]).toBe("Space Mountain");
  });

  it("includes the entity type context string", () => {
    const text = buildEmbeddingText(makeAttraction());
    expect(text).toContain("ride attraction");
  });

  it("includes 'at <parkName>' when parkName is present", () => {
    const text = buildEmbeddingText(makeAttraction({ parkName: "EPCOT" }));
    expect(text).toContain("at EPCOT");
  });

  it("omits the park fragment when parkName is null", () => {
    const text = buildEmbeddingText(makeAttraction({ parkName: null }));
    expect(text).not.toContain("at ");
  });
});

describe("buildEmbeddingText — ATTRACTION", () => {
  it("includes thrill text for thrillLevel 'thrill'", () => {
    const text = buildEmbeddingText(makeAttraction({ thrillLevel: "thrill" }));
    expect(text).toContain("thrilling");
  });

  it("includes 'no height requirement' when heightRequirement is null", () => {
    const text = buildEmbeddingText(makeAttraction({ heightRequirement: null }));
    expect(text).toContain("no height requirement");
  });

  it("includes height requirement inches and 'tall riders' for 48+ inch rides", () => {
    const text = buildEmbeddingText(
      makeAttraction({
        heightRequirement: { inches: 48, centimeters: 122, description: "48 inches" },
      })
    );
    expect(text).toContain("48 inches");
    expect(text).toContain("tall riders");
  });

  it("filters out noise tags (e.g. FinderPCAttractions)", () => {
    const text = buildEmbeddingText(
      makeAttraction({ tags: ["FinderPCAttractions", "FinderMobileAttractions"] })
    );
    expect(text).not.toContain("FinderPCAttractions");
    expect(text).not.toContain("FinderMobileAttractions");
  });

  it("expands known semantic tags to natural language (thrill-rides)", () => {
    const text = buildEmbeddingText(makeAttraction({ tags: ["thrill-rides"] }));
    expect(text).toContain("adrenaline");
  });

  it("adds 'single rider' text when singleRider is true", () => {
    const text = buildEmbeddingText(makeAttraction({ singleRider: true }));
    expect(text).toContain("single rider");
  });
});

describe("buildEmbeddingText — RESTAURANT", () => {
  it("includes mapped service type and cuisine type", () => {
    const text = buildEmbeddingText(
      makeDining({
        serviceType: "table-service",
        cuisineTypes: ["Italian", "Mediterranean"],
        mealPeriods: ["dinner"],
      })
    );
    expect(text).toContain("table service");
    expect(text).toContain("Italian");
    expect(text).toContain("serves dinner");
  });
});

describe("buildEmbeddingText — SHOW", () => {
  it("maps stage-show type to natural language", () => {
    const text = buildEmbeddingText(makeShow({ showType: "stage-show" }));
    expect(text).toContain("live stage show");
  });

  it("maps fireworks type to nighttime spectacular", () => {
    const text = buildEmbeddingText(makeShow({ showType: "fireworks" }));
    expect(text).toContain("fireworks nighttime spectacular");
  });
});

describe("buildEmbeddingText — HOTEL", () => {
  it("maps 'deluxe' tier to luxury text", () => {
    const text = buildEmbeddingText(makeHotel({ tier: "deluxe" }));
    expect(text).toContain("luxury");
  });

  it("includes area location when present", () => {
    const text = buildEmbeddingText(makeHotel({ area: "Magic Kingdom Area" }));
    expect(text).toContain("located in Magic Kingdom Area");
  });

  it("includes transportation options when present", () => {
    const text = buildEmbeddingText(makeHotel({ transportation: ["monorail", "bus"] }));
    expect(text).toContain("monorail");
  });
});

describe("buildEmbeddingText — SHOP", () => {
  it("maps merchandise shopType to shopping text", () => {
    const text = buildEmbeddingText(makeShop({ shopType: "merchandise" }));
    expect(text).toContain("merchandise shopping");
  });
});

describe("buildEmbeddingText — EVENT", () => {
  it("maps special-event type to 'limited time' text", () => {
    const text = buildEmbeddingText(makeEvent({ eventType: "special-event" }));
    expect(text).toContain("limited time");
  });
});

describe("buildEmbeddingText — DESTINATION and PARK", () => {
  it("DESTINATION uses only base fields (name and type)", () => {
    const entity: DisneyEntity = {
      ...BASE,
      entityType: "DESTINATION",
      parkName: null,
    };
    const text = buildEmbeddingText(entity);
    // Should contain name and 'vacation destination' but no type-specific extras
    expect(text).toContain("Test Entity");
    expect(text).toContain("vacation destination");
  });

  it("PARK uses only base fields (name and type)", () => {
    const entity: DisneyEntity = {
      ...BASE,
      entityType: "PARK",
      parkName: null,
    };
    const text = buildEmbeddingText(entity);
    expect(text).toContain("Test Entity");
    expect(text).toContain("theme park");
  });
});

// --- hashEmbeddingText ---

describe("hashEmbeddingText", () => {
  it("returns a 16-character hex string", () => {
    const hash = hashEmbeddingText("Space Mountain ride attraction at Magic Kingdom");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic — same input produces the same hash", () => {
    const input = "Space Mountain ride attraction";
    expect(hashEmbeddingText(input)).toBe(hashEmbeddingText(input));
  });

  it("produces different hashes for different inputs", () => {
    const a = hashEmbeddingText("Space Mountain");
    const b = hashEmbeddingText("Haunted Mansion");
    expect(a).not.toBe(b);
  });
});
