/**
 * Disney Finder Client Tests
 *
 * Tests for the Disney Finder API client.
 * Focuses on testable logic: static data, normalization, and error handling.
 * Full integration tests would require Disney API authentication.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getDisneyFinderClient, resetDisneyFinderClient } from "./disney-finder.js";

describe("DisneyFinderClient", () => {
  beforeEach(() => {
    resetDisneyFinderClient();
  });

  describe("getDisneyFinderClient", () => {
    it("should return singleton instance", () => {
      const client1 = getDisneyFinderClient();
      const client2 = getDisneyFinderClient();

      expect(client1).toBe(client2);
    });

    it("should return new instance after reset", () => {
      const client1 = getDisneyFinderClient();
      resetDisneyFinderClient();
      const client2 = getDisneyFinderClient();

      expect(client1).not.toBe(client2);
    });
  });

  describe("getDestinations", () => {
    it("should return static destination data", async () => {
      const client = getDisneyFinderClient();
      const destinations = await client.getDestinations();

      expect(destinations).toHaveLength(2);

      const wdw = destinations.find((d) => d.id === "wdw");
      expect(wdw).toBeDefined();
      expect(wdw?.name).toBe("Walt Disney World Resort");
      expect(wdw?.location).toBe("Orlando, FL");
      expect(wdw?.timezone).toBe("America/New_York");
      expect(wdw?.parks).toHaveLength(4);

      const dlr = destinations.find((d) => d.id === "dlr");
      expect(dlr).toBeDefined();
      expect(dlr?.name).toBe("Disneyland Resort");
      expect(dlr?.location).toBe("Anaheim, CA");
      expect(dlr?.timezone).toBe("America/Los_Angeles");
      expect(dlr?.parks).toHaveLength(2);
    });

    it("should include correct WDW parks", async () => {
      const client = getDisneyFinderClient();
      const destinations = await client.getDestinations();

      const wdw = destinations.find((d) => d.id === "wdw");
      const parkNames = wdw?.parks.map((p) => p.name);

      expect(parkNames).toContain("Magic Kingdom Park");
      expect(parkNames).toContain("EPCOT");
      expect(parkNames).toContain("Disney's Hollywood Studios");
      expect(parkNames).toContain("Disney's Animal Kingdom Theme Park");
    });

    it("should include correct DLR parks", async () => {
      const client = getDisneyFinderClient();
      const destinations = await client.getDestinations();

      const dlr = destinations.find((d) => d.id === "dlr");
      const parkNames = dlr?.parks.map((p) => p.name);

      expect(parkNames).toContain("Disneyland Park");
      expect(parkNames).toContain("Disney California Adventure Park");
    });

    it("should include park IDs and slugs", async () => {
      const client = getDisneyFinderClient();
      const destinations = await client.getDestinations();

      const wdw = destinations.find((d) => d.id === "wdw");
      const mk = wdw?.parks.find((p) => p.name === "Magic Kingdom Park");

      expect(mk?.id).toBe("80007944");
      expect(mk?.slug).toBe("magic-kingdom");
    });
  });

  describe("getEntityById", () => {
    it("should return null for non-existent entity", async () => {
      const client = getDisneyFinderClient();
      const entity = await client.getEntityById("nonexistent-id-12345");

      expect(entity).toBeNull();
    });
  });
});

describe("Destination Data Validation", () => {
  it("all parks should have valid IDs", async () => {
    const client = getDisneyFinderClient();
    const destinations = await client.getDestinations();

    for (const dest of destinations) {
      for (const park of dest.parks) {
        expect(park.id).toBeDefined();
        expect(park.id.length).toBeGreaterThan(0);
        // Park IDs should be numeric strings
        expect(park.id).toMatch(/^\d+$/);
      }
    }
  });

  it("all parks should have valid slugs", async () => {
    const client = getDisneyFinderClient();
    const destinations = await client.getDestinations();

    for (const dest of destinations) {
      for (const park of dest.parks) {
        expect(park.slug).toBeDefined();
        // Type narrowing for TypeScript
        if (park.slug !== null && park.slug !== undefined) {
          expect(park.slug.length).toBeGreaterThan(0);
          // Slugs should be lowercase with hyphens
          expect(park.slug).toMatch(/^[a-z-]+$/);
        }
      }
    }
  });

  it("all destinations should have valid timezones", async () => {
    const client = getDisneyFinderClient();
    const destinations = await client.getDestinations();

    for (const dest of destinations) {
      expect(dest.timezone).toBeDefined();
      // Valid IANA timezone format
      expect(dest.timezone).toMatch(/^America\//);
    }
  });
});
