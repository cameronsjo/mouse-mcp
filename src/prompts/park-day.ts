/**
 * Park Day Planning Prompt
 *
 * Guides LLM to help plan a perfect day at a Disney park.
 */

import type { RegisteredPrompt, GetPromptResult } from "./types.js";

export const parkDayPrompt: RegisteredPrompt = {
  definition: {
    name: "plan-park-day",
    description:
      "Plan a perfect day at a Disney theme park with personalized recommendations for attractions, dining, and timing",
    arguments: [
      {
        name: "park",
        description:
          "The park to plan for (e.g., 'Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom')",
        required: true,
      },
      {
        name: "party_size",
        description: "Number of people in the party",
        required: false,
      },
      {
        name: "interests",
        description:
          "Interests and preferences (e.g., 'thrill rides', 'character meets', 'shows', 'relaxed pace')",
        required: false,
      },
      {
        name: "dietary",
        description:
          "Dietary restrictions or preferences (e.g., 'vegetarian', 'gluten-free', 'seafood')",
        required: false,
      },
    ],
  },

  handler: (args): GetPromptResult => {
    const park = args.park ?? "Magic Kingdom";
    const partySize = args.party_size ?? "unknown";
    const interests = args.interests ?? "general";
    const dietary = args.dietary ?? "none specified";

    return {
      description: `Planning a day at ${park}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I need help planning a perfect day at ${park}.

Party details:
- Party size: ${partySize}
- Interests: ${interests}
- Dietary needs: ${dietary}

Please help me create an optimized park day plan by:

1. First, use the **initialize** tool to load the Disney parks data if not already done.

2. Use the **discover** tool with semantic search to find attractions matching our interests:
   - Search for "${interests}" to find relevant attractions
   - Consider thrill level and accessibility for the party

3. Use the **discover** tool to find dining options:
   - Search for restaurants that match dietary needs: "${dietary}"
   - Consider timing for reservations (lunch and dinner)

4. Create a suggested itinerary that includes:
   - Morning priorities (rope drop strategy)
   - Mid-day break recommendations
   - Evening must-dos
   - Lightning Lane suggestions if applicable

5. Include practical tips:
   - Best times to visit popular attractions
   - Hidden gems that match our interests
   - Photo opportunities along the route

Please structure the plan chronologically and include estimated times for each activity.`,
          },
        },
      ],
    };
  },
};
