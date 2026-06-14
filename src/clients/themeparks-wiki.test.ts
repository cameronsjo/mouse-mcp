/**
 * Tests for ThemeParksWikiClient
 *
 * Test Plan:
 *
 * ThemeParksWikiClient.getDestinations() (I/O boundary + data transformer)
 *   [x] Happy: well-formed response → normalizes destination fields (id, name, location, timezone)
 *   [x] Happy: only PARK entityType entities appear in parks list
 *   [x] Happy: park names are slugified to kebab-case
 *   [x] Happy: destination uuid absent from API response → destination omitted from results
 *   [x] Unhappy: HTTP 500 → throws ApiError
 *   [x] Unhappy: fetch throws network error → propagates
 *
 * ThemeParksWikiClient.getAttractions() (I/O boundary + data transformer)
 *   [x] Happy: returns all ATTRACTION entities from destination children
 *   [x] Happy: parkId filter limits results to matching parentId
 *   [x] Happy: uses correct destination UUID when fetching WDW children
 *   [x] Normalization: location populated when entity has coordinates
 *   [x] Normalization: location null when entity has no coordinates
 *   [x] Normalization: slug is kebab-case of entity name
 *   [x] Normalization: parkName resolved from park entities in same children response
 *   [x] Normalization: parkName null when parentId absent from parkMap
 *   [x] Normalization: heightRequirement parsed from inches string
 *   [x] Normalization: heightRequirement parsed from centimeters string
 *   [x] Normalization: heightRequirement null when tag absent
 *   [x] Normalization: thrillLevel "thrill" from tag containing "thrill"
 *   [x] Normalization: thrillLevel "family" from tag containing "all ages"
 *   [x] Normalization: thrillLevel null when thrillLevel tag absent
 *   [x] Normalization: lightningLane individual tier from lightningLaneIndividual tag
 *   [x] Normalization: lightningLane multi-pass from lightningLane tag
 *   [x] Normalization: lightningLane multi-pass from geniePlus tag
 *   [x] Normalization: lightningLane null when no Lightning Lane tags present
 *   [x] Normalization: singleRider/riderSwap/photopass/virtualQueue from presence tags
 *   [x] Normalization: wheelchairAccessible false when mustTransfer tag present
 *   [x] Normalization: tags array contains all entity tag keys
 *
 * ThemeParksWikiClient.getDining() (I/O boundary + data transformer)
 *   [x] Happy: returns all RESTAURANT entities from destination children
 *   [x] Happy: parkId filter applied to dining entities
 *   [x] Normalization: serviceType "table-service" from tag value
 *   [x] Normalization: serviceType "quick-service" from tag value
 *   [x] Normalization: serviceType null when serviceType tag absent
 *   [x] Normalization: mealPeriods populated from individual presence tags
 *   [x] Normalization: cuisineTypes split on comma from cuisine tag value
 *   [x] Normalization: cuisineTypes empty when cuisine tag absent
 *   [x] Normalization: priceRange from dollar-sign count in tag value
 *   [x] Normalization: priceRange null when priceRange tag absent
 *   [x] Normalization: reservationsAccepted true when reservationsRequired tag present
 *
 * ThemeParksWikiClient.getShows() (I/O boundary + data transformer)
 *   [x] Happy: returns all SHOW entities from destination children
 *   [x] Normalization: showType "fireworks" from name keyword
 *   [x] Normalization: showType "parade" from name keyword
 *   [x] Normalization: showType "character-meet" from "meet" in name
 *   [x] Normalization: showType "stage-show" from "show" in name
 *   [x] Normalization: showType "other" when no keywords match
 *   [x] Normalization: showType tag value takes priority over name-based inference
 *
 * ThemeParksWikiClient.getEntityById() (I/O boundary)
 *   [x] Happy: entity found in WDW children as ATTRACTION → normalized attraction
 *   [x] Happy: entity found in DLR children as RESTAURANT → normalized dining
 *   [x] Happy: entity found in WDW children as SHOW → normalized show
 *   [x] Edge: entity id not found in any destination's children → returns null
 *   [x] Edge: entity found in children but entityType unrecognized → returns null
 *   [x] Unhappy: first fetch throws → returns null (outer try/catch)
 *
 * ThemeParksWikiClient.searchEntities() (I/O boundary, delegates)
 *   [x] Happy: entityType=ATTRACTION → only attractions returned
 *   [x] Happy: entityType=RESTAURANT → only dining returned
 *
 * getThemeParksWikiClient() (singleton accessor)
 *   [x] Returns same instance on repeated calls
 *
 * Skipped:
 *   - slugify (private; tested indirectly via slug assertions above)
 *   - extractTags (private; tested indirectly via all normalization tests)
 *   - getEntitiesForDestination (private; tested indirectly via all public methods)
 *   - serviceType variants beyond table/quick (same code path; not duplicating per-branch)
 *   - searchEntities _query parameter (intentionally unused per _ prefix convention;
 *     returns all entities of the requested types regardless of query string)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// withRetry mocked as single-pass passthrough — avoids real exponential delays
vi.mock("../shared/index.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// getConfig mocked to supply a known timeoutMs without reading process.env
vi.mock("../config/index.js", () => ({
  getConfig: vi.fn(() => ({ timeoutMs: 5000 })),
}));

import { ThemeParksWikiClient, getThemeParksWikiClient } from "./themeparks-wiki.js";
import { ApiError } from "../shared/errors.js";

// ---------------------------------------------------------------------------
// Destination UUID constants (must match source module constants)
// ---------------------------------------------------------------------------
const WDW_UUID = "e957da41-3552-4cf6-b636-5babc5cbc4e5";

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn(async () => data),
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: vi.fn(async () => ({})),
  } as unknown as Response;
}

function childrenOf(children: unknown[]): Response {
  return okResponse({ children });
}

// ---------------------------------------------------------------------------
// Shared wiki entity fixtures
// ---------------------------------------------------------------------------

const PARK_ENTITY = {
  id: "park-mk",
  name: "Magic Kingdom",
  entityType: "PARK",
};

const ATTRACTION_ENTITY = {
  id: "attr-sm",
  name: "Space Mountain",
  entityType: "ATTRACTION",
  parentId: "park-mk",
  location: { latitude: 28.4177, longitude: -81.5812 },
  tags: [] as Array<{ key: string; value: string }>,
};

const RESTAURANT_ENTITY = {
  id: "rest-be",
  name: "Be Our Guest Restaurant",
  entityType: "RESTAURANT",
  parentId: "park-mk",
  tags: [] as Array<{ key: string; value: string }>,
};

const SHOW_ENTITY = {
  id: "show-hfw",
  name: "Happily Ever After",
  entityType: "SHOW",
  parentId: "park-mk",
  tags: [] as Array<{ key: string; value: string }>,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ThemeParksWikiClient", () => {
  let client: ThemeParksWikiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    client = new ThemeParksWikiClient();
  });

  // -------------------------------------------------------------------------
  // getDestinations
  // -------------------------------------------------------------------------

  describe("getDestinations", () => {
    it("should normalize destination id, name, location, and timezone from static metadata", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        okResponse({
          destinations: [
            { id: WDW_UUID, name: "Walt Disney World", slug: "wdw", parks: [PARK_ENTITY] },
          ],
        })
      );

      const [dest] = await client.getDestinations();

      expect(dest?.id).toBe("wdw");
      expect(dest?.name).toBe("Walt Disney World Resort");
      expect(dest?.location).toBe("Orlando, FL");
      expect(dest?.timezone).toBe("America/New_York");
    });

    it("should include only PARK-type entities in the parks list", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        okResponse({
          destinations: [
            {
              id: WDW_UUID,
              name: "Walt Disney World",
              slug: "wdw",
              parks: [
                PARK_ENTITY,
                { id: "attr-sm", name: "Space Mountain", entityType: "ATTRACTION" },
              ],
            },
          ],
        })
      );

      const [dest] = await client.getDestinations();

      expect(dest?.parks).toHaveLength(1);
      expect(dest?.parks[0]?.id).toBe("park-mk");
    });

    it("should slugify park names in the parks list", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        okResponse({
          destinations: [
            {
              id: WDW_UUID,
              name: "Walt Disney World",
              slug: "wdw",
              parks: [{ id: "park-mk", name: "Magic Kingdom Park", entityType: "PARK" }],
            },
          ],
        })
      );

      const [dest] = await client.getDestinations();

      expect(dest?.parks[0]?.slug).toBe("magic-kingdom-park");
    });

    it("should omit a destination whose uuid is absent from the API response", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        okResponse({
          destinations: [{ id: "unrelated-uuid", name: "Other Resort", slug: "other", parks: [] }],
        })
      );

      const results = await client.getDestinations();

      expect(results).toHaveLength(0);
    });

    it("should throw ApiError when API returns a non-ok HTTP status", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(errorResponse(500));

      await expect(client.getDestinations()).rejects.toBeInstanceOf(ApiError);
    });

    it("should propagate a network error thrown by fetch", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network failure"));

      await expect(client.getDestinations()).rejects.toThrow("Network failure");
    });
  });

  // -------------------------------------------------------------------------
  // getAttractions
  // -------------------------------------------------------------------------

  describe("getAttractions", () => {
    it("should return all ATTRACTION entities from destination children", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([PARK_ENTITY, ATTRACTION_ENTITY, RESTAURANT_ENTITY])
      );

      const results = await client.getAttractions("wdw");

      expect(results).toHaveLength(1);
      expect(results[0]?.entityType).toBe("ATTRACTION");
      expect(results[0]?.id).toBe("attr-sm");
    });

    it("should filter results to the specified parkId", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          PARK_ENTITY,
          ATTRACTION_ENTITY,
          { ...ATTRACTION_ENTITY, id: "attr-other", parentId: "park-other" },
        ])
      );

      const results = await client.getAttractions("wdw", "park-mk");

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("attr-sm");
    });

    it("should include the WDW destination UUID in the fetch URL", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([]));

      await client.getAttractions("wdw");

      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        expect.stringContaining(WDW_UUID),
        expect.any(Object)
      );
    });

    it("should populate location when the entity has coordinates", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([{ ...ATTRACTION_ENTITY, location: { latitude: 28.42, longitude: -81.58 } }])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.location?.latitude).toBe(28.42);
      expect(attr?.location?.longitude).toBe(-81.58);
    });

    it("should set location to null when the entity has no coordinates", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            id: "attr-sm",
            name: "Space Mountain",
            entityType: "ATTRACTION",
            parentId: "park-mk",
            tags: [],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.location).toBeNull();
    });

    it("should produce a kebab-case slug from the entity name", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([{ ...ATTRACTION_ENTITY, name: "Space Mountain!" }])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.slug).toBe("space-mountain");
    });

    it("should resolve parkName from the park entities in the same response", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([PARK_ENTITY, ATTRACTION_ENTITY]));

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.parkName).toBe("Magic Kingdom");
    });

    it("should set parkName to null when the parentId is not in the park map", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([{ ...ATTRACTION_ENTITY, parentId: "unknown-park-id" }])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.parkName).toBeNull();
    });

    it("should parse heightRequirement in inches and convert to centimeters", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [{ key: "heightRequirement", value: "44 in" }],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.heightRequirement?.inches).toBe(44);
      expect(attr?.heightRequirement?.centimeters).toBe(Math.round(44 * 2.54));
      expect(attr?.heightRequirement?.description).toBe("44 in");
    });

    it("should parse heightRequirement in centimeters and convert to inches", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [{ key: "heightRequirement", value: "112 cm" }],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.heightRequirement?.centimeters).toBe(112);
      expect(attr?.heightRequirement?.inches).toBe(Math.round(112 / 2.54));
    });

    it("should set heightRequirement to null when the tag is absent", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([ATTRACTION_ENTITY]));

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.heightRequirement).toBeNull();
    });

    it("should return thrillLevel 'thrill' when tag value contains 'thrill'", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [{ key: "thrillLevel", value: "High Thrill" }],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.thrillLevel).toBe("thrill");
    });

    it("should return thrillLevel 'family' when tag value contains 'all ages'", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [{ key: "thrillLevel", value: "All Ages" }],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.thrillLevel).toBe("family");
    });

    it("should set thrillLevel to null when the thrillLevel tag is absent", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([ATTRACTION_ENTITY]));

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.thrillLevel).toBeNull();
    });

    it("should set lightningLane to individual tier when lightningLaneIndividual tag present", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [{ key: "lightningLaneIndividual", value: "true" }],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.lightningLane?.tier).toBe("individual");
      expect(attr?.lightningLane?.available).toBe(true);
    });

    it("should set lightningLane to multi-pass when lightningLane tag present", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [{ key: "lightningLane", value: "true" }],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.lightningLane?.tier).toBe("multi-pass");
    });

    it("should set lightningLane to multi-pass when geniePlus tag present", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [{ key: "geniePlus", value: "true" }],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.lightningLane?.tier).toBe("multi-pass");
    });

    it("should set lightningLane to null when no Lightning Lane-related tags are present", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([ATTRACTION_ENTITY]));

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.lightningLane).toBeNull();
    });

    it("should derive boolean flags from presence-based tags", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [
              { key: "singleRider", value: "true" },
              { key: "riderSwap", value: "true" },
              { key: "photoPass", value: "true" },
              { key: "virtualQueue", value: "true" },
            ],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.singleRider).toBe(true);
      expect(attr?.riderSwap).toBe(true);
      expect(attr?.photopass).toBe(true);
      expect(attr?.virtualQueue).toBe(true);
    });

    it("should set wheelchairAccessible to false when mustTransfer tag is present", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [{ key: "mustTransfer", value: "true" }],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.wheelchairAccessible).toBe(false);
    });

    it("should populate the tags array with all entity tag keys", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...ATTRACTION_ENTITY,
            tags: [
              { key: "singleRider", value: "true" },
              { key: "photoPass", value: "true" },
            ],
          },
        ])
      );

      const [attr] = await client.getAttractions("wdw");

      expect(attr?.tags).toContain("singleRider");
      expect(attr?.tags).toContain("photoPass");
    });
  });

  // -------------------------------------------------------------------------
  // getDining
  // -------------------------------------------------------------------------

  describe("getDining", () => {
    it("should return all RESTAURANT entities from destination children", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([PARK_ENTITY, RESTAURANT_ENTITY, ATTRACTION_ENTITY])
      );

      const results = await client.getDining("wdw");

      expect(results).toHaveLength(1);
      expect(results[0]?.entityType).toBe("RESTAURANT");
      expect(results[0]?.id).toBe("rest-be");
    });

    it("should filter dining results to the specified parkId", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          PARK_ENTITY,
          RESTAURANT_ENTITY,
          { ...RESTAURANT_ENTITY, id: "rest-other", parentId: "park-other" },
        ])
      );

      const results = await client.getDining("wdw", "park-mk");

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("rest-be");
    });

    it("should return serviceType 'table-service' when tag value contains 'table'", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...RESTAURANT_ENTITY,
            tags: [{ key: "serviceType", value: "Table Service" }],
          },
        ])
      );

      const [dining] = await client.getDining("wdw");

      expect(dining?.serviceType).toBe("table-service");
    });

    it("should return serviceType 'quick-service' when tag value contains 'quick'", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...RESTAURANT_ENTITY,
            tags: [{ key: "serviceType", value: "Quick Service" }],
          },
        ])
      );

      const [dining] = await client.getDining("wdw");

      expect(dining?.serviceType).toBe("quick-service");
    });

    it("should set serviceType to null when the serviceType tag is absent", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([RESTAURANT_ENTITY]));

      const [dining] = await client.getDining("wdw");

      expect(dining?.serviceType).toBeNull();
    });

    it("should populate mealPeriods from individual presence tags", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...RESTAURANT_ENTITY,
            tags: [
              { key: "breakfast", value: "true" },
              { key: "lunch", value: "true" },
              { key: "dinner", value: "true" },
            ],
          },
        ])
      );

      const [dining] = await client.getDining("wdw");

      expect(dining?.mealPeriods).toEqual(["breakfast", "lunch", "dinner"]);
    });

    it("should split cuisineTypes on comma from the cuisine tag value", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...RESTAURANT_ENTITY,
            tags: [{ key: "cuisine", value: "French, American, Seafood" }],
          },
        ])
      );

      const [dining] = await client.getDining("wdw");

      expect(dining?.cuisineTypes).toEqual(["French", "American", "Seafood"]);
    });

    it("should return an empty cuisineTypes array when the cuisine tag is absent", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([RESTAURANT_ENTITY]));

      const [dining] = await client.getDining("wdw");

      expect(dining?.cuisineTypes).toEqual([]);
    });

    it("should build priceRange using dollar-sign count from tag value", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...RESTAURANT_ENTITY,
            tags: [{ key: "priceRange", value: "$$$" }],
          },
        ])
      );

      const [dining] = await client.getDining("wdw");

      expect(dining?.priceRange?.symbol).toBe("$$$");
      expect(dining?.priceRange?.description).toBe("$$$");
    });

    it("should set priceRange to null when the priceRange tag is absent", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([RESTAURANT_ENTITY]));

      const [dining] = await client.getDining("wdw");

      expect(dining?.priceRange).toBeNull();
    });

    it("should set reservationsAccepted true when reservationsRequired tag is present", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...RESTAURANT_ENTITY,
            tags: [{ key: "reservationsRequired", value: "true" }],
          },
        ])
      );

      const [dining] = await client.getDining("wdw");

      expect(dining?.reservationsAccepted).toBe(true);
      expect(dining?.reservationsRequired).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getShows
  // -------------------------------------------------------------------------

  describe("getShows", () => {
    it("should return all SHOW entities from destination children", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([PARK_ENTITY, SHOW_ENTITY, ATTRACTION_ENTITY])
      );

      const results = await client.getShows("wdw");

      expect(results).toHaveLength(1);
      expect(results[0]?.entityType).toBe("SHOW");
      expect(results[0]?.id).toBe("show-hfw");
    });

    it("should infer showType 'fireworks' when name contains 'fireworks'", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([{ ...SHOW_ENTITY, name: "Happily Ever After Fireworks Show" }])
      );

      const [show] = await client.getShows("wdw");

      expect(show?.showType).toBe("fireworks");
    });

    it("should infer showType 'parade' when name contains 'parade'", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([{ ...SHOW_ENTITY, name: "Festival of Fantasy Parade" }])
      );

      const [show] = await client.getShows("wdw");

      expect(show?.showType).toBe("parade");
    });

    it("should infer showType 'character-meet' when name contains 'meet'", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([{ ...SHOW_ENTITY, name: "Meet Mickey & Minnie Mouse" }])
      );

      const [show] = await client.getShows("wdw");

      expect(show?.showType).toBe("character-meet");
    });

    it("should infer showType 'stage-show' when name contains 'show'", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([{ ...SHOW_ENTITY, name: "Mickey's Royal Friendship Faire Show" }])
      );

      const [show] = await client.getShows("wdw");

      expect(show?.showType).toBe("stage-show");
    });

    it("should return showType 'other' when no name keywords match", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([{ ...SHOW_ENTITY, name: "Castle Lighting Ceremony", tags: [] }])
      );

      const [show] = await client.getShows("wdw");

      expect(show?.showType).toBe("other");
    });

    it("should use showType tag value and override name-based inference", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        childrenOf([
          {
            ...SHOW_ENTITY,
            name: "Some Generic Evening Event",
            tags: [{ key: "showType", value: "Firework Spectacular" }],
          },
        ])
      );

      const [show] = await client.getShows("wdw");

      expect(show?.showType).toBe("fireworks");
    });
  });

  // -------------------------------------------------------------------------
  // getEntityById
  // -------------------------------------------------------------------------

  describe("getEntityById", () => {
    it("should return a normalized attraction when found in WDW children", async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(okResponse(ATTRACTION_ENTITY)) // /entity/{id}
        .mockResolvedValueOnce(
          okResponse({ children: [PARK_ENTITY, ATTRACTION_ENTITY] }) // WDW children
        );

      const result = await client.getEntityById("attr-sm");

      expect(result?.id).toBe("attr-sm");
      expect(result?.entityType).toBe("ATTRACTION");
    });

    it("should return a normalized dining entity when found in DLR children", async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(okResponse(RESTAURANT_ENTITY)) // /entity/{id}
        .mockResolvedValueOnce(okResponse({ children: [] })) // WDW children: not found
        .mockResolvedValueOnce(
          okResponse({ children: [PARK_ENTITY, RESTAURANT_ENTITY] }) // DLR children: found
        );

      const result = await client.getEntityById("rest-be");

      expect(result?.id).toBe("rest-be");
      expect(result?.entityType).toBe("RESTAURANT");
    });

    it("should return a normalized show when found as SHOW in WDW children", async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(okResponse(SHOW_ENTITY)) // /entity/{id}
        .mockResolvedValueOnce(
          okResponse({ children: [PARK_ENTITY, SHOW_ENTITY] }) // WDW children
        );

      const result = await client.getEntityById("show-hfw");

      expect(result?.id).toBe("show-hfw");
      expect(result?.entityType).toBe("SHOW");
    });

    it("should return null when entity id is not found in any destination's children", async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(okResponse(ATTRACTION_ENTITY)) // /entity/{id}
        .mockResolvedValueOnce(okResponse({ children: [PARK_ENTITY] })) // WDW: not found
        .mockResolvedValueOnce(okResponse({ children: [PARK_ENTITY] })); // DLR: not found

      const result = await client.getEntityById("attr-sm");

      expect(result).toBeNull();
    });

    it("should return null when entity is found in children but entityType is unrecognized", async () => {
      const unknownEntity = { id: "park-mk", name: "Magic Kingdom", entityType: "PARK" };
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(okResponse(unknownEntity)) // first fetch: PARK type
        .mockResolvedValueOnce(okResponse({ children: [unknownEntity] })) // WDW: found, no branch handles PARK
        .mockResolvedValueOnce(okResponse({ children: [] })); // DLR: loop continues after no match

      const result = await client.getEntityById("park-mk");

      expect(result).toBeNull();
    });

    it("should return null when the first fetch throws an error", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network failure"));

      const result = await client.getEntityById("any-id");

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // searchEntities
  // -------------------------------------------------------------------------

  describe("searchEntities", () => {
    it("should return only ATTRACTION entities when entityType=ATTRACTION is specified", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([PARK_ENTITY, ATTRACTION_ENTITY]));

      const results = await client.searchEntities("space mountain", {
        destinationId: "wdw",
        entityType: "ATTRACTION",
      });

      expect(results.every((r) => r.entityType === "ATTRACTION")).toBe(true);
    });

    it("should return only RESTAURANT entities when entityType=RESTAURANT is specified", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(childrenOf([PARK_ENTITY, RESTAURANT_ENTITY]));

      const results = await client.searchEntities("be our guest", {
        destinationId: "wdw",
        entityType: "RESTAURANT",
      });

      expect(results.every((r) => r.entityType === "RESTAURANT")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getThemeParksWikiClient singleton
  // -------------------------------------------------------------------------

  describe("getThemeParksWikiClient", () => {
    it("should return the same instance on repeated calls", () => {
      const first = getThemeParksWikiClient();
      const second = getThemeParksWikiClient();

      expect(first).toBe(second);
    });
  });
});
