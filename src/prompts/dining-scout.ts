/**
 * Dining Scout Prompt
 *
 * Helps find and recommend Disney dining experiences.
 */

import type { RegisteredPrompt, GetPromptResult } from "./types.js";

export const diningScoutPrompt: RegisteredPrompt = {
  definition: {
    name: "dining-scout",
    description:
      "Find the perfect Disney dining experience based on cuisine, atmosphere, and special occasions",
    arguments: [
      {
        name: "occasion",
        description:
          "The occasion or vibe (e.g., 'romantic dinner', 'family celebration', 'character breakfast', 'quick service')",
        required: false,
      },
      {
        name: "cuisine",
        description: "Preferred cuisine type (e.g., 'American', 'Asian', 'seafood', 'steakhouse')",
        required: false,
      },
      {
        name: "budget",
        description: "Budget level (e.g., 'budget-friendly', 'moderate', 'signature dining')",
        required: false,
      },
      {
        name: "location",
        description:
          "Preferred location (e.g., 'Magic Kingdom', 'EPCOT World Showcase', 'Disney Springs')",
        required: false,
      },
    ],
  },

  handler: (args): GetPromptResult => {
    const occasion = args.occasion ?? "any occasion";
    const cuisine = args.cuisine ?? "any cuisine";
    const budget = args.budget ?? "any budget";
    const location = args.location ?? "any Walt Disney World location";

    return {
      description: `Finding dining for ${occasion}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I'm looking for Disney dining recommendations.

My preferences:
- Occasion/Vibe: ${occasion}
- Cuisine preference: ${cuisine}
- Budget: ${budget}
- Preferred location: ${location}

Please help me find the perfect dining experience:

1. Use the **discover** tool with semantic search to find matching restaurants:
   - Search combining occasion and cuisine: "${occasion} ${cuisine}"
   - Filter by location if specified

2. For each recommended restaurant, provide:
   - Name and location
   - Cuisine type and price range
   - Atmosphere and what makes it special
   - Must-try dishes if known
   - Reservation tips (how far in advance, best times)

3. Include alternatives:
   - A "hidden gem" option that's less crowded
   - A backup option in case first choice is unavailable

4. Practical tips:
   - Mobile ordering availability for quick service
   - Disney Dining Plan acceptability
   - Best times to visit for atmosphere or shorter waits

Please rank recommendations by how well they match my criteria.`,
          },
        },
      ],
    };
  },
};
