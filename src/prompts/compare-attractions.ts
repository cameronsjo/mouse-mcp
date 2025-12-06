/**
 * Compare Attractions Prompt
 *
 * Helps users compare multiple attractions to decide which to prioritize.
 */

import type { Prompt, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { searchEntitiesByName } from "../db/index.js";
import type { DisneyAttraction } from "../types/index.js";

export const compareAttractionsPrompt: Prompt = {
  name: "compare_attractions",
  description:
    "Compare multiple Disney attractions side-by-side to help decide which to prioritize. " +
    "Shows thrill levels, height requirements, Lightning Lane info, and features.",
  arguments: [
    {
      name: "attraction_names",
      description: "Comma-separated list of 2-5 attraction names to compare",
      required: true,
    },
  ],
};

export async function getCompareAttractionsPrompt(
  args: Record<string, string>
): Promise<GetPromptResult> {
  const attractionNames = args.attraction_names;

  if (!attractionNames) {
    throw new Error("attraction_names is required");
  }

  // Parse the comma-separated list
  const names = attractionNames.split(",").map((n) => n.trim());

  if (names.length < 2) {
    throw new Error("Please provide at least 2 attraction names to compare");
  }

  if (names.length > 5) {
    throw new Error("Maximum 5 attractions can be compared at once");
  }

  // Search for each attraction and embed the data
  const attractions: DisneyAttraction[] = [];
  const notFound: string[] = [];

  for (const name of names) {
    const results = await searchEntitiesByName<DisneyAttraction>(name, {
      entityType: "ATTRACTION",
      limit: 1,
    });

    if (results.length > 0 && results[0]) {
      attractions.push(results[0]);
    } else {
      notFound.push(name);
    }
  }

  // Build prompt text with embedded attraction data
  let promptText = `Compare these Disney attractions to help me decide which to prioritize:\n\n`;

  if (attractions.length > 0) {
    promptText += `**Attractions Found:**\n\n`;

    for (const attraction of attractions) {
      promptText += `### ${attraction.name}\n`;
      promptText += `- **Park:** ${attraction.parkName ?? "Unknown"}\n`;
      promptText += `- **Thrill Level:** ${attraction.thrillLevel ?? "Not specified"}\n`;

      if (attraction.heightRequirement) {
        promptText += `- **Height Requirement:** ${attraction.heightRequirement.description} (${attraction.heightRequirement.inches}")\n`;
      } else {
        promptText += `- **Height Requirement:** None\n`;
      }

      if (attraction.lightningLane) {
        promptText += `- **Lightning Lane:** ${attraction.lightningLane.tier} (${attraction.lightningLane.available ? "Available" : "Not available"})\n`;
      }

      promptText += `- **Duration:** ${attraction.duration ?? "Varies"}\n`;
      promptText += `- **Type:** ${attraction.experienceType ?? "Not specified"}\n`;

      const features: string[] = [];
      if (attraction.singleRider) features.push("Single Rider Line");
      if (attraction.riderSwap) features.push("Rider Swap");
      if (attraction.photopass) features.push("PhotoPass");
      if (attraction.virtualQueue) features.push("Virtual Queue");
      if (attraction.wheelchairAccessible) features.push("Wheelchair Accessible");

      if (features.length > 0) {
        promptText += `- **Features:** ${features.join(", ")}\n`;
      }

      if (attraction.tags && attraction.tags.length > 0) {
        promptText += `- **Tags:** ${attraction.tags.join(", ")}\n`;
      }

      promptText += `\n`;
    }
  }

  if (notFound.length > 0) {
    promptText += `**Not Found:** ${notFound.join(", ")}\n\n`;
    promptText += `Try searching with more specific names or check spelling.\n\n`;
  }

  promptText += `Please provide a detailed comparison that includes:\n`;
  promptText += `1. Key differences in thrill level and experience type\n`;
  promptText += `2. Which attractions are best for different age groups\n`;
  promptText += `3. Lightning Lane strategy recommendations\n`;
  promptText += `4. Best times to visit each attraction\n`;
  promptText += `5. Which attractions to prioritize based on the comparison\n`;
  promptText += `6. Any special considerations (height requirements, accessibility, etc.)\n\n`;
  promptText += `Use the embedded data above and your knowledge to provide actionable recommendations.`;

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
