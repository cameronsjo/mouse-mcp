/**
 * Test suite for MCP prompts module
 *
 * These tests verify that the prompts registry correctly manages prompt definitions
 * and handlers, and that each prompt handler generates valid MCP GetPromptResult output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPromptDefinitions, getPromptHandler, hasPrompt, type PromptHandler } from "./index.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

// Mock the database and client modules to avoid DB dependencies
vi.mock("../db/index.js", () => ({
  searchEntitiesByName: vi.fn(),
}));

vi.mock("../clients/index.js", () => ({
  getDisneyFinderClient: vi.fn(),
}));

// Helper to assert handler exists
function assertHandler(handler: PromptHandler | null): asserts handler is PromptHandler {
  if (!handler) {
    throw new Error("Handler should be defined");
  }
}

describe("Prompts Registry", () => {
  describe("getPromptDefinitions", () => {
    it("returns all prompt definitions", () => {
      const prompts = getPromptDefinitions();
      expect(prompts).toHaveLength(3);
    });

    it("includes plan_visit prompt", () => {
      const prompts = getPromptDefinitions();
      const planVisit = prompts.find((p) => p.name === "plan_visit");

      expect(planVisit).toBeDefined();
      expect(planVisit?.description).toContain("personalized park visit itinerary");
      expect(planVisit?.arguments).toHaveLength(3);

      // Verify required arguments
      const destArg = planVisit?.arguments?.find((a) => a.name === "destination");
      expect(destArg?.required).toBe(true);
      expect(destArg?.description).toContain("wdw or dlr");

      const dateArg = planVisit?.arguments?.find((a) => a.name === "date");
      expect(dateArg?.required).toBe(false);

      const prefArg = planVisit?.arguments?.find((a) => a.name === "preferences");
      expect(prefArg?.required).toBe(false);
    });

    it("includes find_dining prompt", () => {
      const prompts = getPromptDefinitions();
      const findDining = prompts.find((p) => p.name === "find_dining");

      expect(findDining).toBeDefined();
      expect(findDining?.description).toContain("dining reservations");
      expect(findDining?.arguments).toHaveLength(4);

      // Verify required arguments
      const destArg = findDining?.arguments?.find((a) => a.name === "destination");
      expect(destArg?.required).toBe(true);

      const cuisineArg = findDining?.arguments?.find((a) => a.name === "cuisine");
      expect(cuisineArg?.required).toBe(false);

      const priceArg = findDining?.arguments?.find((a) => a.name === "price_range");
      expect(priceArg?.required).toBe(false);

      const partyArg = findDining?.arguments?.find((a) => a.name === "party_size");
      expect(partyArg?.required).toBe(false);
    });

    it("includes compare_attractions prompt", () => {
      const prompts = getPromptDefinitions();
      const compareAttractions = prompts.find((p) => p.name === "compare_attractions");

      expect(compareAttractions).toBeDefined();
      expect(compareAttractions?.description).toContain("Compare multiple Disney attractions");
      expect(compareAttractions?.arguments).toHaveLength(1);

      // Verify required arguments
      const namesArg = compareAttractions?.arguments?.find((a) => a.name === "attraction_names");
      expect(namesArg?.required).toBe(true);
      expect(namesArg?.description).toContain("2-5 attraction names");
    });

    it("returns prompt definitions with expected structure", () => {
      const prompts = getPromptDefinitions();

      prompts.forEach((prompt) => {
        expect(prompt).toHaveProperty("name");
        expect(prompt).toHaveProperty("description");
        expect(prompt).toHaveProperty("arguments");
        expect(typeof prompt.name).toBe("string");
        expect(typeof prompt.description).toBe("string");
        expect(Array.isArray(prompt.arguments)).toBe(true);
      });
    });
  });

  describe("getPromptHandler", () => {
    it("returns handler for valid prompt name", () => {
      const handler = getPromptHandler("plan_visit");
      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    });

    it("returns handler for all valid prompts", () => {
      const validPrompts = ["plan_visit", "find_dining", "compare_attractions"];

      validPrompts.forEach((name) => {
        const handler = getPromptHandler(name);
        expect(handler).toBeDefined();
        expect(typeof handler).toBe("function");
      });
    });

    it("returns null for unknown prompt name", () => {
      const handler = getPromptHandler("unknown_prompt");
      expect(handler).toBeNull();
    });

    it("returns null for empty string", () => {
      const handler = getPromptHandler("");
      expect(handler).toBeNull();
    });

    it("returns null for non-existent prompts", () => {
      const invalidNames = ["test", "invalid", "not_a_prompt", "plan-visit"];

      invalidNames.forEach((name) => {
        const handler = getPromptHandler(name);
        expect(handler).toBeNull();
      });
    });
  });

  describe("hasPrompt", () => {
    it("returns true for existing prompts", () => {
      expect(hasPrompt("plan_visit")).toBe(true);
      expect(hasPrompt("find_dining")).toBe(true);
      expect(hasPrompt("compare_attractions")).toBe(true);
    });

    it("returns false for non-existent prompts", () => {
      expect(hasPrompt("unknown_prompt")).toBe(false);
      expect(hasPrompt("test")).toBe(false);
      expect(hasPrompt("")).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(hasPrompt("plan_visit")).toBe(true);
      expect(hasPrompt("Plan_Visit")).toBe(false);
      expect(hasPrompt("PLAN_VISIT")).toBe(false);
    });
  });
});

describe("Prompt Handlers", () => {
  // Mock data for testing
  const mockDestination = {
    id: "wdw",
    name: "Walt Disney World Resort",
    location: "Orlando, FL",
    timezone: "America/New_York",
    parks: [
      { id: "wdw-magic-kingdom", name: "Magic Kingdom" },
      { id: "wdw-epcot", name: "EPCOT" },
      { id: "wdw-hollywood-studios", name: "Hollywood Studios" },
      { id: "wdw-animal-kingdom", name: "Animal Kingdom" },
    ],
  };

  const mockAttraction = {
    id: "attraction-space-mountain",
    name: "Space Mountain",
    entityType: "ATTRACTION" as const,
    parkName: "Magic Kingdom",
    thrillLevel: "High",
    heightRequirement: {
      inches: 44,
      description: "Must be 44 inches or taller",
    },
    lightningLane: {
      tier: "Tier 1",
      available: true,
    },
    duration: "3 minutes",
    experienceType: "Thrill Ride",
    singleRider: false,
    riderSwap: true,
    photopass: true,
    virtualQueue: false,
    wheelchairAccessible: false,
    tags: ["indoor", "dark ride", "space theme"],
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("plan_visit handler", () => {
    beforeEach(async () => {
      const { getDisneyFinderClient } = await import("../clients/index.js");
      vi.mocked(getDisneyFinderClient).mockReturnValue({
        getDestinations: vi.fn().mockResolvedValue([mockDestination]),
      } as unknown as ReturnType<typeof getDisneyFinderClient>);
    });

    it("generates valid GetPromptResult structure", async () => {
      const handler = getPromptHandler("plan_visit");
      assertHandler(handler);

      const result = await handler({ destination: "wdw" });

      // Verify structure matches MCP GetPromptResult format
      expect(result).toHaveProperty("messages");
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages).toHaveLength(1);
    });

    it("generates message with correct structure", async () => {
      const handler = getPromptHandler("plan_visit");
      assertHandler(handler);
      const result = await handler({ destination: "wdw" });

      const message = result.messages[0];
      expect(message).toBeDefined();
      expect(message?.role).toBe("user");
      expect(message?.content).toHaveProperty("type");
      expect(message?.content).toHaveProperty("text");
      expect(message?.content.type).toBe("text");
      expect(typeof message?.content.text).toBe("string");
    });

    it("includes destination details in prompt text", async () => {
      const handler = getPromptHandler("plan_visit");
      assertHandler(handler);
      const result = await handler({ destination: "wdw" });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Walt Disney World Resort");
      expect(promptText).toContain("Orlando, FL");
      expect(promptText).toContain("America/New_York");
      expect(promptText).toContain("Magic Kingdom");
    });

    it("includes date when provided", async () => {
      const handler = getPromptHandler("plan_visit");
      assertHandler(handler);
      const result = await handler({
        destination: "wdw",
        date: "2025-12-25",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("2025-12-25");
      expect(promptText).toContain("Visit Date");
    });

    it("includes preferences when provided", async () => {
      const handler = getPromptHandler("plan_visit");
      assertHandler(handler);
      const result = await handler({
        destination: "wdw",
        preferences: "thrill rides, character dining, avoiding crowds",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("thrill rides, character dining, avoiding crowds");
      expect(promptText).toContain("My Preferences");
    });

    it("throws error for unknown destination", async () => {
      const handler = getPromptHandler("plan_visit");
      assertHandler(handler);

      await expect(handler({ destination: "unknown" })).rejects.toThrow("Unknown destination");
    });

    it("includes planning guidance in prompt text", async () => {
      const handler = getPromptHandler("plan_visit");
      assertHandler(handler);
      const result = await handler({ destination: "wdw" });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Which park(s) to visit");
      expect(promptText).toContain("Must-see attractions");
      expect(promptText).toContain("Dining recommendations");
      expect(promptText).toContain("Lightning Lane");
    });
  });

  describe("find_dining handler", () => {
    beforeEach(async () => {
      const { getDisneyFinderClient } = await import("../clients/index.js");
      vi.mocked(getDisneyFinderClient).mockReturnValue({
        getDestinations: vi.fn().mockResolvedValue([mockDestination]),
      } as unknown as ReturnType<typeof getDisneyFinderClient>);
    });

    it("generates valid GetPromptResult structure", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);

      const result = await handler({ destination: "wdw" });

      expect(result).toHaveProperty("messages");
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages).toHaveLength(1);
    });

    it("generates message with correct structure", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);
      const result = await handler({ destination: "wdw" });

      const message = result.messages[0];
      expect(message?.role).toBe("user");
      expect(message?.content.type).toBe("text");
      expect(typeof message?.content.text).toBe("string");
    });

    it("includes destination details in prompt text", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);
      const result = await handler({ destination: "wdw" });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Walt Disney World Resort");
      expect(promptText).toContain("Magic Kingdom");
      expect(promptText).toContain("EPCOT");
    });

    it("includes cuisine when provided", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);
      const result = await handler({
        destination: "wdw",
        cuisine: "Italian",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Italian");
      expect(promptText).toContain("Cuisine");
    });

    it("includes price range when provided", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);
      const result = await handler({
        destination: "wdw",
        price_range: "$$$",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("$$$");
      expect(promptText).toContain("Price Range");
    });

    it("includes party size when provided", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);
      const result = await handler({
        destination: "wdw",
        party_size: "6",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("6 people");
      expect(promptText).toContain("Party Size");
    });

    it("includes all search criteria when provided", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);
      const result = await handler({
        destination: "wdw",
        cuisine: "American",
        price_range: "$$",
        party_size: "4",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("American");
      expect(promptText).toContain("$$");
      expect(promptText).toContain("4 people");
    });

    it("throws error for unknown destination", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);

      await expect(handler({ destination: "invalid" })).rejects.toThrow("Unknown destination");
    });

    it("includes dining guidance in prompt text", async () => {
      const handler = getPromptHandler("find_dining");
      assertHandler(handler);
      const result = await handler({ destination: "wdw" });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("restaurant name and location");
      expect(promptText).toContain("cuisine and atmosphere");
      expect(promptText).toContain("service type");
      expect(promptText).toContain("price range");
    });
  });

  describe("compare_attractions handler", () => {
    beforeEach(async () => {
      const { searchEntitiesByName } = await import("../db/index.js");
      vi.mocked(searchEntitiesByName).mockResolvedValue([mockAttraction]);
    });

    it("generates valid GetPromptResult structure", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);

      const result = await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain",
      });

      expect(result).toHaveProperty("messages");
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages).toHaveLength(1);
    });

    it("generates message with correct structure", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      const result = await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain",
      });

      const message = result.messages[0];
      expect(message?.role).toBe("user");
      expect(message?.content.type).toBe("text");
      expect(typeof message?.content.text).toBe("string");
    });

    it("throws error when attraction_names is missing", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);

      await expect(handler({})).rejects.toThrow("attraction_names is required");
    });

    it("throws error when fewer than 2 attractions provided", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);

      await expect(handler({ attraction_names: "Space Mountain" })).rejects.toThrow(
        "at least 2 attraction names"
      );
    });

    it("throws error when more than 5 attractions provided", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);

      await expect(
        handler({
          attraction_names: "A, B, C, D, E, F",
        })
      ).rejects.toThrow("Maximum 5 attractions");
    });

    it("includes attraction details in prompt text", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      const result = await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Space Mountain");
      expect(promptText).toContain("Magic Kingdom");
      expect(promptText).toContain("High");
      expect(promptText).toContain("44 inches");
    });

    it("includes Lightning Lane information when available", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      const result = await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Lightning Lane");
      expect(promptText).toContain("Tier 1");
    });

    it("includes attraction features in prompt text", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      const result = await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Rider Swap");
      expect(promptText).toContain("PhotoPass");
    });

    it("includes tags when available", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      const result = await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("indoor");
      expect(promptText).toContain("dark ride");
      expect(promptText).toContain("space theme");
    });

    it("handles attractions not found", async () => {
      const { searchEntitiesByName } = await import("../db/index.js");
      vi.mocked(searchEntitiesByName).mockResolvedValue([]);

      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      const result = await handler({
        attraction_names: "Unknown Attraction, Another Unknown",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Not Found");
      expect(promptText).toContain("Unknown Attraction");
      expect(promptText).toContain("Another Unknown");
    });

    it("includes comparison guidance in prompt text", async () => {
      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      const result = await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain",
      });

      const promptText = result.messages[0]?.content.text;
      expect(promptText).toContain("Key differences in thrill level");
      expect(promptText).toContain("best for different age groups");
      expect(promptText).toContain("Lightning Lane strategy");
      expect(promptText).toContain("Best times to visit");
    });

    it("parses comma-separated attraction names correctly", async () => {
      const { searchEntitiesByName } = await import("../db/index.js");
      const mockFn = vi.mocked(searchEntitiesByName);

      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain, Splash Mountain",
      });

      // Verify searchEntitiesByName was called 3 times (once per attraction)
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(mockFn).toHaveBeenCalledWith("Space Mountain", expect.any(Object));
      expect(mockFn).toHaveBeenCalledWith("Big Thunder Mountain", expect.any(Object));
      expect(mockFn).toHaveBeenCalledWith("Splash Mountain", expect.any(Object));
    });

    it("trims whitespace from attraction names", async () => {
      const { searchEntitiesByName } = await import("../db/index.js");
      const mockFn = vi.mocked(searchEntitiesByName);

      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      await handler({
        attraction_names: "  Space Mountain  ,  Big Thunder Mountain  ",
      });

      // Verify names are trimmed before search
      expect(mockFn).toHaveBeenCalledWith("Space Mountain", expect.any(Object));
      expect(mockFn).toHaveBeenCalledWith("Big Thunder Mountain", expect.any(Object));
    });

    it("searches with correct entity type filter", async () => {
      const { searchEntitiesByName } = await import("../db/index.js");
      const mockFn = vi.mocked(searchEntitiesByName);

      const handler = getPromptHandler("compare_attractions");
      assertHandler(handler);
      await handler({
        attraction_names: "Space Mountain, Big Thunder Mountain",
      });

      // Verify search options include ATTRACTION entity type
      expect(mockFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entityType: "ATTRACTION",
          limit: 1,
        })
      );
    });
  });

  describe("Output structure validation", () => {
    beforeEach(async () => {
      const { getDisneyFinderClient } = await import("../clients/index.js");
      const { searchEntitiesByName } = await import("../db/index.js");

      vi.mocked(getDisneyFinderClient).mockReturnValue({
        getDestinations: vi.fn().mockResolvedValue([mockDestination]),
      } as unknown as ReturnType<typeof getDisneyFinderClient>);

      vi.mocked(searchEntitiesByName).mockResolvedValue([mockAttraction]);
    });

    it("all prompts return GetPromptResult structure", async () => {
      const prompts = [
        { name: "plan_visit", args: { destination: "wdw" } },
        { name: "find_dining", args: { destination: "wdw" } },
        { name: "compare_attractions", args: { attraction_names: "Space Mountain, Test" } },
      ];

      for (const prompt of prompts) {
        const handler = getPromptHandler(prompt.name);
        assertHandler(handler);
        const result: GetPromptResult = await handler(prompt.args);

        expect(result).toHaveProperty("messages");
        expect(Array.isArray(result.messages)).toBe(true);
        expect(result.messages.length).toBeGreaterThan(0);

        const message = result.messages[0];
        expect(message).toBeDefined();
        expect(message?.role).toBe("user");
        expect(message?.content).toHaveProperty("type");
        expect(message?.content).toHaveProperty("text");
        expect(message?.content.type).toBe("text");
        expect(typeof message?.content.text).toBe("string");
        expect(message?.content.text.length).toBeGreaterThan(0);
      }
    });

    it("all prompts return non-empty text content", async () => {
      const prompts = [
        { name: "plan_visit", args: { destination: "wdw" } },
        { name: "find_dining", args: { destination: "wdw" } },
        { name: "compare_attractions", args: { attraction_names: "Space Mountain, Test" } },
      ];

      for (const prompt of prompts) {
        const handler = getPromptHandler(prompt.name);
        assertHandler(handler);
        const result = await handler(prompt.args);

        const text = result.messages[0]?.content.text;
        expect(text).toBeDefined();
        expect(typeof text).toBe("string");
        expect(text.trim().length).toBeGreaterThan(0);
      }
    });
  });
});
