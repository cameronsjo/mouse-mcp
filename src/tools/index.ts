/**
 * Tool Registration
 *
 * Registers all Disney MCP tools.
 */

import type { ToolEntry, ToolDefinition, ToolHandler, ToolResult } from "./types.js";

import * as destinations from "./destinations.js";
import * as attractions from "./attractions.js";
import * as dining from "./dining.js";
import * as search from "./search.js";
import * as discover from "./discover.js";
import * as status from "./status.js";
import * as sync from "./sync.js";

export type { ToolDefinition, ToolHandler, ToolResult, ToolEntry };

/** All available tools */
const tools: ToolEntry[] = [
  { definition: destinations.definition, handler: destinations.handler },
  { definition: attractions.definition, handler: attractions.handler },
  { definition: dining.definition, handler: dining.handler },
  { definition: search.definition, handler: search.handler },
  { definition: discover.definition, handler: discover.handler },
  { definition: status.definition, handler: status.handler },
  { definition: sync.definition, handler: sync.handler },
];

/**
 * Register all tools into a Map for lookup.
 */
export function registerTools(toolMap: Map<string, ToolEntry>): void {
  for (const tool of tools) {
    toolMap.set(tool.definition.name, tool);
  }
}

/**
 * Get all tool definitions for MCP ListTools response.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return tools.map((t) => t.definition);
}

/**
 * Get a specific tool by name.
 */
export function getTool(name: string): ToolEntry | undefined {
  return tools.find((t) => t.definition.name === name);
}
