/**
 * Tool Types
 *
 * Type definitions for MCP tool handlers.
 */

/** Tool definition for MCP registration */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  outputSchema?: Record<string, unknown>;
}

/** Tool result format */
export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/** Tool handler function signature */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/** Tool registration entry */
export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}
