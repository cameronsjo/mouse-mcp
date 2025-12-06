/**
 * Find Dining Prompt
 *
 * Helps users find dining options matching their criteria.
 */

import type { Prompt, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import type { DestinationId } from "../types/index.js";
import { getDisneyFinderClient } from "../clients/index.js";

export const findDiningPrompt: Prompt = {
  name: "find_dining",
  description:
    "Find dining reservations at Disney parks matching specific criteria. " +
    "Searches by cuisine type, price range, service type, and party size.",
  arguments: [
    {
      name: "destination",
      description: "Destination ID (wdw or dlr)",
      required: true,
    },
    {
      name: "cuisine",
      description: "Cuisine type (e.g., American, Italian, Asian, etc.)",
      required: false,
    },
    {
      name: "price_range",
      description: "Price range: $, $$, $$$, or $$$$",
      required: false,
    },
    {
      name: "party_size",
      description: "Number of people in party",
      required: false,
    },
  ],
};

export async function getFindDiningPrompt(args: Record<string, string>): Promise<GetPromptResult> {
  const destinationId = args.destination as DestinationId;
  const cuisine = args.cuisine;
  const priceRange = args.price_range;
  const partySize = args.party_size;

  // Fetch destination details
  const client = getDisneyFinderClient();
  const destinations = await client.getDestinations();
  const destination = destinations.find((d) => d.id === destinationId);

  if (!destination) {
    throw new Error(`Unknown destination: ${destinationId}`);
  }

  // Build the prompt text
  let promptText = `Help me find dining options at ${destination.name}!\n\n`;
  promptText += `**Search Criteria:**\n`;
  promptText += `- Destination: ${destination.name}\n`;

  if (cuisine) {
    promptText += `- Cuisine: ${cuisine}\n`;
  }

  if (priceRange) {
    promptText += `- Price Range: ${priceRange}\n`;
  }

  if (partySize) {
    promptText += `- Party Size: ${partySize} people\n`;
  }

  promptText += `\n**Available Parks:**\n`;
  for (const park of destination.parks) {
    promptText += `- ${park.name}\n`;
  }

  promptText += `\nPlease help me find dining options that match my criteria. For each recommendation:\n`;
  promptText += `1. Provide the restaurant name and location (park)\n`;
  promptText += `2. Describe the cuisine and atmosphere\n`;
  promptText += `3. Note the service type (table service, quick service, etc.)\n`;
  promptText += `4. Mention price range and if reservations are required\n`;
  promptText += `5. Highlight any special features (character dining, signature dining, etc.)\n`;
  promptText += `6. Include tips for getting reservations if applicable\n\n`;
  promptText += `Use the MCP tools to search dining options and provide specific recommendations with current information.`;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: promptText,
        },
      },
    ],
  };
}
