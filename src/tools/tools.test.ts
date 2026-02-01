/**
 * MCP Tools Tests
 *
 * Tests for tool definitions and handlers.
 * Focuses on input validation, error handling, and response format.
 */

import { describe, it, expect } from "vitest";
import { getToolDefinitions, getTool, registerTools } from "./index.js";
import type { ToolEntry } from "./types.js";

describe("Tool Registration", () => {
  describe("getToolDefinitions", () => {
    it("should return all tool definitions", () => {
      const definitions = getToolDefinitions();

      expect(definitions).toBeInstanceOf(Array);
      expect(definitions.length).toBeGreaterThan(0);

      // Each definition should have required fields
      for (const def of definitions) {
        expect(def.name).toBeDefined();
        expect(typeof def.name).toBe("string");
        expect(def.description).toBeDefined();
        expect(typeof def.description).toBe("string");
        expect(def.inputSchema).toBeDefined();
        expect(def.inputSchema.type).toBe("object");
      }
    });

    it("should include expected tools", () => {
      const definitions = getToolDefinitions();
      const toolNames = definitions.map((d) => d.name);

      expect(toolNames).toContain("list_parks");
      expect(toolNames).toContain("find_attractions");
      expect(toolNames).toContain("find_dining");
      expect(toolNames).toContain("search");
      expect(toolNames).toContain("discover");
      expect(toolNames).toContain("status");
      expect(toolNames).toContain("initialize");
    });
  });

  describe("getTool", () => {
    it("should return tool entry by name", () => {
      const tool = getTool("list_parks");

      expect(tool).toBeDefined();
      expect(tool?.definition.name).toBe("list_parks");
      expect(tool?.handler).toBeInstanceOf(Function);
    });

    it("should return undefined for unknown tool", () => {
      const tool = getTool("nonexistent_tool");

      expect(tool).toBeUndefined();
    });
  });

  describe("registerTools", () => {
    it("should populate tool map", () => {
      const toolMap = new Map<string, ToolEntry>();
      registerTools(toolMap);

      expect(toolMap.size).toBeGreaterThan(0);
      expect(toolMap.has("list_parks")).toBe(true);
      expect(toolMap.has("find_attractions")).toBe(true);
    });
  });
});

describe("Tool Definitions", () => {
  describe("list_parks", () => {
    it("should have valid schema with no required fields", () => {
      const tool = getTool("list_parks");

      expect(tool?.definition.inputSchema.type).toBe("object");
      expect(tool?.definition.inputSchema.required).toEqual([]);
      // list_parks has no input properties - it returns all destinations
    });
  });

  describe("find_attractions", () => {
    it("should have valid schema with required destination", () => {
      const tool = getTool("find_attractions");

      expect(tool?.definition.inputSchema.required).toContain("destination");
      expect(tool?.definition.inputSchema.properties.destination).toBeDefined();
      expect(tool?.definition.inputSchema.properties.parkId).toBeDefined();
      expect(tool?.definition.inputSchema.properties.filters).toBeDefined();
    });
  });

  describe("find_dining", () => {
    it("should have valid schema with required destination", () => {
      const tool = getTool("find_dining");

      expect(tool?.definition.inputSchema.required).toContain("destination");
      expect(tool?.definition.inputSchema.properties.destination).toBeDefined();
    });
  });

  describe("search", () => {
    it("should have valid schema with id or name properties", () => {
      const tool = getTool("search");

      // search uses id or name for lookup, neither is required
      expect(tool?.definition.inputSchema.properties.id).toBeDefined();
      expect(tool?.definition.inputSchema.properties.name).toBeDefined();
      expect(tool?.definition.inputSchema.properties.destination).toBeDefined();
    });
  });

  describe("discover", () => {
    it("should have valid schema with required query", () => {
      const tool = getTool("discover");

      expect(tool?.definition.inputSchema.required).toContain("query");
      expect(tool?.definition.inputSchema.properties.query).toBeDefined();
      expect(tool?.definition.inputSchema.properties.destination).toBeDefined();
      expect(tool?.definition.inputSchema.properties.entityType).toBeDefined();
    });
  });

  describe("status", () => {
    it("should have valid schema", () => {
      const tool = getTool("status");

      expect(tool?.definition.inputSchema.type).toBe("object");
      expect(tool?.definition.inputSchema.properties).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("should have valid schema", () => {
      const tool = getTool("initialize");

      expect(tool?.definition.inputSchema.type).toBe("object");
      expect(tool?.definition.inputSchema.properties.destination).toBeDefined();
      expect(tool?.definition.inputSchema.properties.skipEmbeddings).toBeDefined();
    });
  });
});

describe("Tool Input Validation", () => {
  // Note: Full handler tests would require mocking the Disney client
  // These tests validate the tool definitions have proper schemas

  it("all tools should define a name", () => {
    const definitions = getToolDefinitions();

    for (const def of definitions) {
      expect(def.name).toBeDefined();
      expect(def.name.length).toBeGreaterThan(0);
      // Name should be lowercase with underscores
      expect(def.name).toMatch(/^[a-z_]+$/);
    }
  });

  it("all tools should define a description", () => {
    const definitions = getToolDefinitions();

    for (const def of definitions) {
      expect(def.description).toBeDefined();
      expect(def.description.length).toBeGreaterThan(10);
    }
  });

  it("all tools should have object input schema", () => {
    const definitions = getToolDefinitions();

    for (const def of definitions) {
      expect(def.inputSchema.type).toBe("object");
      expect(def.inputSchema.properties).toBeDefined();
      expect(def.inputSchema.required).toBeInstanceOf(Array);
    }
  });
});
