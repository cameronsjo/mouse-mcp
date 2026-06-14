/**
 * find_attractions Tool Handler Tests
 *
 * Test Plan:
 *
 * handler (Classification: API handler)
 *   [x] Validation: missing destination → isError=true
 *   [x] Validation: invalid destination value → isError=true
 *   [x] Happy: client returns attractions → response includes count + list
 *   [x] Filter: hasLightningLane — only attractions with LL are included
 *   [x] Filter: thrillLevel — only matching level is included
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

import { handler } from "./attractions.js";
import { getDisneyFinderClient } from "../clients/index.js";
import type { DisneyAttraction } from "../types/index.js";

// ---------------------------------------------------------------------------
// Fixture factory
// ---------------------------------------------------------------------------

function makeAttraction(
  id: string,
  name: string,
  overrides: Partial<DisneyAttraction> = {}
): DisneyAttraction {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/ /g, "-"),
    entityType: "ATTRACTION",
    destinationId: "wdw",
    parkId: "80007944",
    parkName: "Magic Kingdom Park",
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  const client = vi.mocked(getDisneyFinderClient)();
  vi.mocked(client.getAttractions).mockResolvedValue([]);
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
    const result = await handler({ destination: "europe" });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("returns destination, count, and attraction list", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getAttractions).mockResolvedValue([
      makeAttraction("sm-001", "Space Mountain"),
      makeAttraction("hm-001", "Haunted Mansion"),
    ]);

    const result = await handler({ destination: "wdw" });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      destination: string;
      count: number;
      attractions: Array<{ id: string; name: string }>;
    };
    expect(parsed.destination).toBe("wdw");
    expect(parsed.count).toBe(2);
    expect(parsed.attractions[0]?.name).toBe("Space Mountain");
  });

  it("passes parkId filter to the client", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getAttractions).mockResolvedValue([]);

    await handler({ destination: "wdw", parkId: "80007944" });

    expect(vi.mocked(client.getAttractions)).toHaveBeenCalledWith("wdw", "80007944");
  });
});

// ---------------------------------------------------------------------------
// Filter: hasLightningLane
// ---------------------------------------------------------------------------

describe("filter: hasLightningLane", () => {
  it("excludes attractions without Lightning Lane when filter is true", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getAttractions).mockResolvedValue([
      makeAttraction("ll-yes", "LL Ride", {
        lightningLane: { tier: "individual", available: true },
      }),
      makeAttraction("ll-no", "No LL Ride", { lightningLane: null }),
    ]);

    const result = await handler({ destination: "wdw", filters: { hasLightningLane: true } });

    const parsed = JSON.parse(result.content[0]!.text) as { count: number };
    expect(parsed.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Filter: thrillLevel
// ---------------------------------------------------------------------------

describe("filter: thrillLevel", () => {
  it("returns only attractions matching the requested thrill level", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getAttractions).mockResolvedValue([
      makeAttraction("thrill-1", "Thrill Ride", { thrillLevel: "thrill" }),
      makeAttraction("family-1", "Family Ride", { thrillLevel: "family" }),
    ]);

    const result = await handler({ destination: "wdw", filters: { thrillLevel: "thrill" } });

    const parsed = JSON.parse(result.content[0]!.text) as {
      count: number;
      attractions: Array<{ id: string }>;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.attractions[0]?.id).toBe("thrill-1");
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe("error path", () => {
  it("returns isError when the client throws", async () => {
    const client = vi.mocked(getDisneyFinderClient)();
    vi.mocked(client.getAttractions).mockRejectedValue(new Error("API unreachable"));

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
