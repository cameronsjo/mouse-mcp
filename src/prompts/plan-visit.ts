/**
 * Plan Visit Prompt
 *
 * Helps users create a personalized park visit itinerary.
 */

import type { Prompt, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import type { DestinationId } from "../types/index.js";
import { getDisneyFinderClient } from "../clients/index.js";

export const planVisitPrompt: Prompt = {
  name: "plan_visit",
  description:
    "Create a personalized park visit itinerary for a Disney destination. " +
    "Helps plan attractions, dining, shows, and logistics based on preferences.",
  arguments: [
    {
      name: "destination",
      description: "Destination ID (wdw or dlr)",
      required: true,
    },
    {
      name: "date",
      description: "Visit date in YYYY-MM-DD format (optional)",
      required: false,
    },
    {
      name: "preferences",
      description:
        "Comma-separated preferences (e.g., 'thrill rides, character dining, avoiding crowds')",
      required: false,
    },
  ],
};

export async function getPlanVisitPrompt(args: Record<string, string>): Promise<GetPromptResult> {
  const destinationId = args.destination as DestinationId;
  const date = args.date;
  const preferences = args.preferences;

  // Fetch destination details to embed in the prompt
  const client = getDisneyFinderClient();
  const destinations = await client.getDestinations();
  const destination = destinations.find((d) => d.id === destinationId);

  if (!destination) {
    throw new Error(`Unknown destination: ${destinationId}`);
  }

  // Build the prompt text with embedded destination data
  let promptText = `Help me plan a visit to ${destination.name}!\n\n`;
  promptText += `**Destination Details:**\n`;
  promptText += `- Location: ${destination.location}\n`;
  promptText += `- Timezone: ${destination.timezone}\n`;
  promptText += `- Theme Parks: ${destination.parks.map((p) => p.name).join(", ")}\n\n`;

  if (date) {
    promptText += `**Visit Date:** ${date}\n\n`;
  }

  if (preferences) {
    promptText += `**My Preferences:**\n${preferences}\n\n`;
  }

  promptText += `Please help me create a detailed itinerary that includes:\n`;
  promptText += `1. Which park(s) to visit and in what order\n`;
  promptText += `2. Must-see attractions based on my preferences\n`;
  promptText += `3. Dining recommendations (table service and quick service)\n`;
  promptText += `4. Shows and entertainment to catch\n`;
  promptText += `5. Tips for maximizing time and avoiding crowds\n`;
  promptText += `6. Lightning Lane strategy if applicable\n\n`;
  promptText += `Use the available MCP tools to fetch current attraction lists, dining options, and show schedules to provide specific, actionable recommendations.`;

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
