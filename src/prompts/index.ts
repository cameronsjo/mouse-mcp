/**
 * Prompts Registry
 *
 * Central registry for all MCP prompts provided by the Disney Parks server.
 */

import type { Prompt, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { planVisitPrompt, getPlanVisitPrompt } from "./plan-visit.js";
import { findDiningPrompt, getFindDiningPrompt } from "./find-dining.js";
import { compareAttractionsPrompt, getCompareAttractionsPrompt } from "./compare-attractions.js";

/**
 * Prompt handler function type.
 */
export type PromptHandler = (args: Record<string, string>) => Promise<GetPromptResult>;

/**
 * Registry entry combining prompt definition and handler.
 */
interface PromptEntry {
  definition: Prompt;
  handler: PromptHandler;
}

/**
 * Registry of all available prompts.
 * WHY: Centralized registry pattern for easy prompt discovery and invocation.
 */
const promptRegistry = new Map<string, PromptEntry>([
  [
    "plan_visit",
    {
      definition: planVisitPrompt,
      handler: getPlanVisitPrompt,
    },
  ],
  [
    "find_dining",
    {
      definition: findDiningPrompt,
      handler: getFindDiningPrompt,
    },
  ],
  [
    "compare_attractions",
    {
      definition: compareAttractionsPrompt,
      handler: getCompareAttractionsPrompt,
    },
  ],
]);

/**
 * Get all prompt definitions for ListPrompts response.
 */
export function getPromptDefinitions(): Prompt[] {
  return Array.from(promptRegistry.values()).map((entry) => entry.definition);
}

/**
 * Get a specific prompt handler by name.
 */
export function getPromptHandler(name: string): PromptHandler | null {
  const entry = promptRegistry.get(name);
  return entry ? entry.handler : null;
}

/**
 * Check if a prompt exists.
 */
export function hasPrompt(name: string): boolean {
  return promptRegistry.has(name);
}
