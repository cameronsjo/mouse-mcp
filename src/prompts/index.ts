/**
 * MCP Prompts Module
 *
 * Provides prompt templates for Disney park planning.
 * Prompts help guide the LLM to use tools effectively.
 */

import type { PromptDefinition, RegisteredPrompt, GetPromptResult } from "./types.js";
import { parkDayPrompt } from "./park-day.js";
import { diningScoutPrompt } from "./dining-scout.js";
import { thrillFinderPrompt } from "./thrill-finder.js";

export type { PromptDefinition, RegisteredPrompt, GetPromptResult } from "./types.js";

/** All registered prompts */
const prompts: readonly RegisteredPrompt[] = [parkDayPrompt, diningScoutPrompt, thrillFinderPrompt];

/** Prompt lookup by name */
const promptMap = new Map<string, RegisteredPrompt>(
  prompts.map((prompt) => [prompt.definition.name, prompt])
);

/**
 * Get all prompt definitions for ListPrompts response.
 */
export function getPromptDefinitions(): readonly PromptDefinition[] {
  return prompts.map((p) => p.definition);
}

/**
 * Get a prompt by name.
 */
export function getPrompt(name: string): RegisteredPrompt | undefined {
  return promptMap.get(name);
}

/**
 * Execute a prompt with arguments.
 */
export async function executePrompt(
  name: string,
  args: Record<string, string>
): Promise<GetPromptResult | null> {
  const prompt = promptMap.get(name);
  if (!prompt) {
    return null;
  }
  return prompt.handler(args);
}
