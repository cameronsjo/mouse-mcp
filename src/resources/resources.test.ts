/**
 * Resources Module Unit Tests
 *
 * Tests for MCP resource handlers focusing on URI parsing and validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { listResources, readResource } from "./index.js";
import type { DisneyDestination, DisneyAttraction, DisneyDining } from "../types/index.js";

// Mock the data access modules
vi.mock("./destinations.js", () => ({
  getAllDestinations: vi.fn(),
  getDestinationById: vi.fn(),
  getDestinationAttractions: vi.fn(),
  getDestinationDining: vi.fn(),
}));

vi.mock("./attractions.js", () => ({
  getAttractionById: vi.fn(),
}));

vi.mock("./dining.js", () => ({
  getDiningById: vi.fn(),
}));

// Import mocked functions for type-safe access
import {
  getAllDestinations,
  getDestinationById,
  getDestinationAttractions,
  getDestinationDining,
} from "./destinations.js";
import { getAttractionById } from "./attractions.js";
import { getDiningById } from "./dining.js";

describe("Resources", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe("listResources", () => {
    it("returns expected resource list", async () => {
      const resources = await listResources();

      expect(resources).toHaveLength(7);

      // Verify all destinations resource
      expect(resources[0]).toEqual({
        uri: "disney://destinations",
        name: "All Destinations",
        description: "List of all Disney destinations (WDW, DLR)",
        mimeType: "application/json",
      });

      // Verify WDW destination resource
      expect(resources[1]).toEqual({
        uri: "disney://destination/wdw",
        name: "Walt Disney World Resort",
        description: "Walt Disney World Resort information",
        mimeType: "application/json",
      });

      // Verify DLR destination resource
      expect(resources[2]).toEqual({
        uri: "disney://destination/dlr",
        name: "Disneyland Resort",
        description: "Disneyland Resort information",
        mimeType: "application/json",
      });

      // Verify WDW attractions resource
      expect(resources[3]).toEqual({
        uri: "disney://destination/wdw/attractions",
        name: "WDW Attractions",
        description: "All attractions at Walt Disney World Resort",
        mimeType: "application/json",
      });

      // Verify DLR attractions resource
      expect(resources[4]).toEqual({
        uri: "disney://destination/dlr/attractions",
        name: "DLR Attractions",
        description: "All attractions at Disneyland Resort",
        mimeType: "application/json",
      });

      // Verify WDW dining resource
      expect(resources[5]).toEqual({
        uri: "disney://destination/wdw/dining",
        name: "WDW Dining",
        description: "All dining locations at Walt Disney World Resort",
        mimeType: "application/json",
      });

      // Verify DLR dining resource
      expect(resources[6]).toEqual({
        uri: "disney://destination/dlr/dining",
        name: "DLR Dining",
        description: "All dining locations at Disneyland Resort",
        mimeType: "application/json",
      });
    });

    it("returns resources with correct structure", async () => {
      const resources = await listResources();

      resources.forEach((resource) => {
        expect(resource).toHaveProperty("uri");
        expect(resource).toHaveProperty("name");
        expect(resource).toHaveProperty("description");
        expect(resource).toHaveProperty("mimeType");
        expect(resource.mimeType).toBe("application/json");
        expect(resource.uri).toMatch(/^disney:\/\//);
      });
    });
  });

  describe("readResource", () => {
    describe("Valid URIs", () => {
      it("parses disney://destinations correctly", async () => {
        const mockDestinations: DisneyDestination[] = [
          {
            id: "wdw",
            name: "Walt Disney World Resort",
            entityType: "DESTINATION",
            type: "THEME_PARK",
            destination: "wdw",
          },
          {
            id: "dlr",
            name: "Disneyland Resort",
            entityType: "DESTINATION",
            type: "THEME_PARK",
            destination: "dlr",
          },
        ];

        vi.mocked(getAllDestinations).mockResolvedValue(mockDestinations);

        const result = await readResource("disney://destinations");

        expect(getAllDestinations).toHaveBeenCalledOnce();
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://destinations",
          mimeType: "application/json",
          text: JSON.stringify(mockDestinations, null, 2),
        });
      });

      it("parses disney://destination/wdw correctly", async () => {
        const mockDestination: DisneyDestination = {
          id: "wdw",
          name: "Walt Disney World Resort",
          entityType: "DESTINATION",
          type: "THEME_PARK",
          destination: "wdw",
        };

        vi.mocked(getDestinationById).mockResolvedValue(mockDestination);

        const result = await readResource("disney://destination/wdw");

        expect(getDestinationById).toHaveBeenCalledWith("wdw");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://destination/wdw",
          mimeType: "application/json",
          text: JSON.stringify(mockDestination, null, 2),
        });
      });

      it("parses disney://destination/dlr correctly", async () => {
        const mockDestination: DisneyDestination = {
          id: "dlr",
          name: "Disneyland Resort",
          entityType: "DESTINATION",
          type: "THEME_PARK",
          destination: "dlr",
        };

        vi.mocked(getDestinationById).mockResolvedValue(mockDestination);

        const result = await readResource("disney://destination/dlr");

        expect(getDestinationById).toHaveBeenCalledWith("dlr");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://destination/dlr",
          mimeType: "application/json",
          text: JSON.stringify(mockDestination, null, 2),
        });
      });

      it("parses disney://destination/wdw/attractions correctly", async () => {
        const mockAttractions = [
          {
            id: "attraction-1",
            name: "Space Mountain",
            entityType: "ATTRACTION",
            destination: "wdw",
          },
        ];

        vi.mocked(getDestinationAttractions).mockResolvedValue(mockAttractions);

        const result = await readResource("disney://destination/wdw/attractions");

        expect(getDestinationAttractions).toHaveBeenCalledWith("wdw");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://destination/wdw/attractions",
          mimeType: "application/json",
          text: JSON.stringify(mockAttractions, null, 2),
        });
      });

      it("parses disney://destination/dlr/attractions correctly", async () => {
        const mockAttractions = [
          {
            id: "attraction-2",
            name: "Matterhorn Bobsleds",
            entityType: "ATTRACTION",
            destination: "dlr",
          },
        ];

        vi.mocked(getDestinationAttractions).mockResolvedValue(mockAttractions);

        const result = await readResource("disney://destination/dlr/attractions");

        expect(getDestinationAttractions).toHaveBeenCalledWith("dlr");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://destination/dlr/attractions",
          mimeType: "application/json",
          text: JSON.stringify(mockAttractions, null, 2),
        });
      });

      it("parses disney://destination/wdw/dining correctly", async () => {
        const mockDining = [
          {
            id: "dining-1",
            name: "Be Our Guest Restaurant",
            entityType: "RESTAURANT",
            destination: "wdw",
          },
        ];

        vi.mocked(getDestinationDining).mockResolvedValue(mockDining);

        const result = await readResource("disney://destination/wdw/dining");

        expect(getDestinationDining).toHaveBeenCalledWith("wdw");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://destination/wdw/dining",
          mimeType: "application/json",
          text: JSON.stringify(mockDining, null, 2),
        });
      });

      it("parses disney://destination/dlr/dining correctly", async () => {
        const mockDining = [
          {
            id: "dining-2",
            name: "Blue Bayou Restaurant",
            entityType: "RESTAURANT",
            destination: "dlr",
          },
        ];

        vi.mocked(getDestinationDining).mockResolvedValue(mockDining);

        const result = await readResource("disney://destination/dlr/dining");

        expect(getDestinationDining).toHaveBeenCalledWith("dlr");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://destination/dlr/dining",
          mimeType: "application/json",
          text: JSON.stringify(mockDining, null, 2),
        });
      });

      it("parses disney://attraction/{id} correctly", async () => {
        const mockAttraction: DisneyAttraction = {
          id: "abc123",
          name: "Haunted Mansion",
          entityType: "ATTRACTION",
          destination: "wdw",
          type: "THEME_PARK",
        };

        vi.mocked(getAttractionById).mockResolvedValue(mockAttraction);

        const result = await readResource("disney://attraction/abc123");

        expect(getAttractionById).toHaveBeenCalledWith("abc123");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://attraction/abc123",
          mimeType: "application/json",
          text: JSON.stringify(mockAttraction, null, 2),
        });
      });

      it("parses disney://dining/{id} correctly", async () => {
        const mockDining: DisneyDining = {
          id: "xyz789",
          name: "Cinderella's Royal Table",
          entityType: "RESTAURANT",
          destination: "wdw",
          type: "THEME_PARK",
        };

        vi.mocked(getDiningById).mockResolvedValue(mockDining);

        const result = await readResource("disney://dining/xyz789");

        expect(getDiningById).toHaveBeenCalledWith("xyz789");
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          uri: "disney://dining/xyz789",
          mimeType: "application/json",
          text: JSON.stringify(mockDining, null, 2),
        });
      });
    });

    describe("Invalid URIs - Wrong Protocol", () => {
      it("rejects http:// protocol", async () => {
        await expect(readResource("http://destinations")).rejects.toThrow(
          "Unsupported protocol: http://destinations"
        );
      });

      it("rejects https:// protocol", async () => {
        await expect(readResource("https://destinations")).rejects.toThrow(
          "Unsupported protocol: https://destinations"
        );
      });

      it("rejects file:// protocol", async () => {
        await expect(readResource("file://destinations")).rejects.toThrow(
          "Unsupported protocol: file://destinations"
        );
      });

      it("rejects URIs without protocol", async () => {
        await expect(readResource("destinations")).rejects.toThrow("Unsupported protocol: destinations");
      });
    });

    describe("Invalid URIs - Unknown Path Pattern", () => {
      it("rejects unknown top-level path", async () => {
        await expect(readResource("disney://unknown")).rejects.toThrow(
          "Unknown resource URI pattern: disney://unknown"
        );
      });

      it("rejects unknown resource type", async () => {
        await expect(readResource("disney://parks/wdw")).rejects.toThrow(
          "Unknown resource URI pattern: disney://parks/wdw"
        );
      });

      it("rejects invalid destination subpath", async () => {
        await expect(readResource("disney://destination/wdw/hotels")).rejects.toThrow(
          "Unknown resource URI pattern: disney://destination/wdw/hotels"
        );
      });

      it("rejects destination path with too many segments", async () => {
        await expect(readResource("disney://destination/wdw/attractions/extra")).rejects.toThrow(
          "Unknown resource URI pattern: disney://destination/wdw/attractions/extra"
        );
      });

      it("rejects attraction path with too many segments", async () => {
        await expect(readResource("disney://attraction/abc123/extra")).rejects.toThrow(
          "Unknown resource URI pattern: disney://attraction/abc123/extra"
        );
      });

      it("rejects dining path with too many segments", async () => {
        await expect(readResource("disney://dining/xyz789/extra")).rejects.toThrow(
          "Unknown resource URI pattern: disney://dining/xyz789/extra"
        );
      });
    });

    describe("Invalid URIs - Empty Path", () => {
      it("rejects empty path after protocol", async () => {
        await expect(readResource("disney://")).rejects.toThrow("Empty resource URI: disney://");
      });

      it("rejects path with only slashes", async () => {
        await expect(readResource("disney:///")).rejects.toThrow("Empty resource URI: disney:///");
      });
    });

    describe("Edge Cases", () => {
      it("handles disney://destination//attractions (double slash)", async () => {
        // Double slash results in empty string in parts array, which gets filtered out
        // After filtering, parts = ["destination", "attractions"], length = 2
        // This matches the disney://destination/{id} pattern, treating "attractions" as a destination ID
        const mockDestination: DisneyDestination = {
          id: "dlr",
          name: "Disneyland Resort",
          entityType: "DESTINATION",
          type: "THEME_PARK",
          destination: "dlr",
        };

        vi.mocked(getDestinationById).mockResolvedValue(mockDestination);

        const result = await readResource("disney://destination//attractions");

        expect(getDestinationById).toHaveBeenCalledWith("attractions");
        expect(result).toHaveLength(1);
      });

      it("handles disney://destination/invalid (bad destination ID)", async () => {
        await expect(readResource("disney://destination/invalid/attractions")).rejects.toThrow(
          "Invalid destination: invalid"
        );
      });

      it("handles disney://destination/abc/dining (bad destination ID)", async () => {
        await expect(readResource("disney://destination/abc/dining")).rejects.toThrow(
          "Invalid destination: abc"
        );
      });

      it("rejects trailing slash on destinations", async () => {
        // Trailing slash results in pathname = "destinations/", which doesn't match "destinations" exactly
        // After filtering empty parts, we get parts = ["destinations"], but pathname check happens first
        await expect(readResource("disney://destinations/")).rejects.toThrow(
          "Unknown resource URI pattern: disney://destinations/"
        );
      });

      it("handles trailing slash on destination path", async () => {
        const mockDestination: DisneyDestination = {
          id: "wdw",
          name: "Walt Disney World Resort",
          entityType: "DESTINATION",
          type: "THEME_PARK",
          destination: "wdw",
        };

        vi.mocked(getDestinationById).mockResolvedValue(mockDestination);

        const result = await readResource("disney://destination/wdw/");

        expect(getDestinationById).toHaveBeenCalledWith("wdw");
        expect(result).toHaveLength(1);
      });

      it("handles case sensitivity in protocol", async () => {
        // Protocol must be lowercase "disney://"
        await expect(readResource("Disney://destinations")).rejects.toThrow(
          "Unsupported protocol: Disney://destinations"
        );
      });

      it("handles missing destination when querying specific destination", async () => {
        vi.mocked(getDestinationById).mockResolvedValue(null);

        await expect(readResource("disney://destination/wdw")).rejects.toThrow("Destination not found: wdw");
      });

      it("handles missing attraction when querying specific attraction", async () => {
        vi.mocked(getAttractionById).mockResolvedValue(null);

        await expect(readResource("disney://attraction/nonexistent")).rejects.toThrow(
          "Attraction not found: nonexistent"
        );
      });

      it("handles missing dining location when querying specific dining", async () => {
        vi.mocked(getDiningById).mockResolvedValue(null);

        await expect(readResource("disney://dining/nonexistent")).rejects.toThrow(
          "Dining location not found: nonexistent"
        );
      });

      it("rejects attraction path with empty ID", async () => {
        // Trailing slash results in parts = ["attraction"] after filtering
        // This has length 1, which doesn't match the attraction pattern (needs length 2)
        await expect(readResource("disney://attraction/")).rejects.toThrow(
          "Unknown resource URI pattern: disney://attraction/"
        );
      });

      it("rejects dining path with empty ID", async () => {
        // Trailing slash results in parts = ["dining"] after filtering
        // This has length 1, which doesn't match the dining pattern (needs length 2)
        await expect(readResource("disney://dining/")).rejects.toThrow(
          "Unknown resource URI pattern: disney://dining/"
        );
      });
    });

    describe("Response Format", () => {
      it("returns properly formatted TextResourceContents", async () => {
        const mockDestinations: DisneyDestination[] = [
          {
            id: "wdw",
            name: "Walt Disney World Resort",
            entityType: "DESTINATION",
            type: "THEME_PARK",
            destination: "wdw",
          },
        ];

        vi.mocked(getAllDestinations).mockResolvedValue(mockDestinations);

        const result = await readResource("disney://destinations");

        expect(result).toBeInstanceOf(Array);
        expect(result[0]).toHaveProperty("uri");
        expect(result[0]).toHaveProperty("mimeType");
        expect(result[0]).toHaveProperty("text");
        expect(result[0]?.mimeType).toBe("application/json");
      });

      it("returns valid JSON in text property", async () => {
        const mockDestinations: DisneyDestination[] = [
          {
            id: "wdw",
            name: "Walt Disney World Resort",
            entityType: "DESTINATION",
            type: "THEME_PARK",
            destination: "wdw",
          },
        ];

        vi.mocked(getAllDestinations).mockResolvedValue(mockDestinations);

        const result = await readResource("disney://destinations");

        expect(() => JSON.parse(result[0]?.text ?? "")).not.toThrow();
        const parsed = JSON.parse(result[0]?.text ?? "");
        expect(parsed).toEqual(mockDestinations);
      });

      it("formats JSON with 2-space indentation", async () => {
        const mockDestination: DisneyDestination = {
          id: "wdw",
          name: "Walt Disney World Resort",
          entityType: "DESTINATION",
          type: "THEME_PARK",
          destination: "wdw",
        };

        vi.mocked(getDestinationById).mockResolvedValue(mockDestination);

        const result = await readResource("disney://destination/wdw");

        expect(result[0]?.text).toBe(JSON.stringify(mockDestination, null, 2));
        expect(result[0]?.text).toContain("  "); // Contains 2-space indentation
      });
    });
  });
});
