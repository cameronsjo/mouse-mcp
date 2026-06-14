/**
 * find_dining Tool Handler Tests
 *
 * Test Plan:
 *
 * handler (Classification: API handler)
 *   [x] Validation: missing destination → isError=true
 *   [x] Validation: invalid destination value → isError=true
 *   [x] Happy: client returns dining → response includes count + list
 *   [x] Filter: reservationsAccepted — only venues that accept reservations
 *   [x] Filter: characterDining — only character dining venues
 *   [x] Filter: mealPeriod — only venues serving that meal period
 *   [x] Unhappy: client throws → isError=true (formatErrorResponse)
 *
 * Response shape invariants:
 *   - content[0].type === 'text'
 *   - content[0].text is valid JSON
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../clients/index.js", () => {
  const clientMethods = {
    getAttractions: vi.fn(),
    getDining: vi.fn(),
    getShows: vi.fn(),
    getShops: vi.fn(),
    getEvents: vi.fn(),
    getEntityById: vi.fn(),
    getDestinations: vi.fn(),
  };
  return {
    getDisneyFinderClient: vi.fn().mockReturnValue(clientMethods),
    resetDisneyFinderClient: vi.fn(),
    getSessionManager: vi.fn(),
  };
});

import { handler } from "./dining.js";
import { getDisneyFinderClient } from "../clients/index.js";
import type { DisneyDining } from "../types/index.js";

// ---------------------------------------------------------------------------
// Fixture factory
// ---------------------------------------------------------------------------

function makeDining(id: string, name: string, overrides: Partial<DisneyDining> = {}): DisneyDining {
  return {
    id,
    name,
    slug: null,
    entityType: "RESTAURANT",
    destinationId: "wdw",
    parkId: null,
    parkName: null,
    location: null,
    url: null,
    serviceType: "table-service",
    priceRange: null,
    cuisineTypes: ["american"],
    mealPeriods: ["lunch", "dinner"],
    reservationsAccepted: false,
    reservationsRequired: false,
    mobileOrder: false,
    characterDining: false,
    disneyDiningPlan: false,
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  const client = vi.mocked(getDisneyFinderClient)();
  vi.mocked(client.getDining).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validation", () => {
  it("returns isError when destination is not provided", async () => {
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
  });

  it("returns isError when destination value is invalid", async () => {
    const result = await handler({ destination: "paris" });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("returns destination, count, and dining list", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getDining).mockResolvedValue([
      makeDining("bog-001", "Be Our Guest"),
      makeDining("boma-001", "Boma"),
    ]);

    const result = await handler({ destination: "wdw" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      destination: string;
      count: number;
      dining: Array<{ id: string; name: string }>;
    };
    expect(parsed.destination).toBe("wdw");
    expect(parsed.count).toBe(2);
    expect(parsed.dining[0]?.name).toBe("Be Our Guest");
  });
});

// ---------------------------------------------------------------------------
// Filter: reservationsAccepted
// ---------------------------------------------------------------------------

describe("filter: reservationsAccepted", () => {
  it("excludes venues that do not accept reservations when filter is true", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getDining).mockResolvedValue([
      makeDining("res-yes", "Reservation Place", { reservationsAccepted: true }),
      makeDining("res-no", "Walk-In Only", { reservationsAccepted: false }),
    ]);

    const result = await handler({
      destination: "wdw",
      filters: { reservationsAccepted: true },
    });

    const parsed = JSON.parse(result.content[0]!.text) as { count: number };
    expect(parsed.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Filter: characterDining
// ---------------------------------------------------------------------------

describe("filter: characterDining", () => {
  it("returns only character dining venues when filter is true", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getDining).mockResolvedValue([
      makeDining("char-yes", "Crystal Palace", { characterDining: true }),
      makeDining("char-no", "Regular Place", { characterDining: false }),
    ]);

    const result = await handler({
      destination: "wdw",
      filters: { characterDining: true },
    });

    const parsed = JSON.parse(result.content[0]!.text) as {
      count: number;
      dining: Array<{ id: string }>;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.dining[0]?.id).toBe("char-yes");
  });
});

// ---------------------------------------------------------------------------
// Filter: mealPeriod
// ---------------------------------------------------------------------------

describe("filter: mealPeriod", () => {
  it("returns only venues serving the requested meal period", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getDining).mockResolvedValue([
      makeDining("breakfast-place", "Breakfast Spot", { mealPeriods: ["breakfast"] }),
      makeDining("dinner-place", "Dinner Spot", { mealPeriods: ["dinner"] }),
    ]);

    const result = await handler({
      destination: "wdw",
      filters: { mealPeriod: "breakfast" },
    });

    const parsed = JSON.parse(result.content[0]!.text) as {
      count: number;
      dining: Array<{ id: string }>;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.dining[0]?.id).toBe("breakfast-place");
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe("error path", () => {
  it("returns isError when the client throws", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getDining).mockRejectedValue(new Error("network error"));

    const result = await handler({ destination: "wdw" });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Response shape invariants
// ---------------------------------------------------------------------------

describe("response shape", () => {
  it("content[0].type is always text", async () => {
    const result = await handler({ destination: "wdw" });

    expect(result.content[0]?.type).toBe("text");
  });

  it("content[0].text is always valid JSON", async () => {
    const result = await handler({ destination: "wdw" });

    expect(() => JSON.parse(result.content[0]!.text)).not.toThrow();
  });
});
