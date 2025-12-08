/**
 * Thrill Finder Prompt
 *
 * Helps find attractions matching specific thrill preferences.
 */

import type { RegisteredPrompt, GetPromptResult } from "./types.js";

export const thrillFinderPrompt: RegisteredPrompt = {
  definition: {
    name: "thrill-finder",
    description:
      "Find attractions matching your thrill tolerance and preferences across Walt Disney World",
    arguments: [
      {
        name: "thrill_level",
        description:
          "Desired thrill intensity (e.g., 'gentle for kids', 'moderate family', 'maximum thrills')",
        required: true,
      },
      {
        name: "type",
        description:
          "Attraction types of interest (e.g., 'roller coasters', 'dark rides', 'water rides', 'shows')",
        required: false,
      },
      {
        name: "avoid",
        description:
          "Things to avoid (e.g., 'heights', 'drops', 'spinning', 'enclosed spaces', 'water')",
        required: false,
      },
    ],
  },

  handler: (args): GetPromptResult => {
    const thrillLevel = args.thrill_level ?? "moderate family";
    const type = args.type ?? "any type";
    const avoid = args.avoid ?? "nothing specific";

    return {
      description: `Finding ${thrillLevel} attractions`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I need help finding attractions that match my thrill preferences.

My preferences:
- Thrill level: ${thrillLevel}
- Types I'm interested in: ${type}
- Things I want to avoid: ${avoid}

Please help me find suitable attractions:

1. Use the **discover** tool to search for attractions:
   - Search: "${thrillLevel} ${type}"
   - Look across all four parks

2. For each recommended attraction, provide:
   - Name and park location
   - Thrill level and intensity description
   - Height requirements if any
   - What makes it exciting (or gentle)
   - Any elements that might cause discomfort (drops, spins, darkness)
   - Average wait time expectations

3. Organize recommendations by:
   - "Perfect matches" - exactly what I'm looking for
   - "Worth trying" - might be slightly outside comfort zone but great experience
   - "Skip these" - attractions that don't match my criteria

4. For each park, suggest:
   - The must-do attraction for my thrill level
   - A hidden gem that fits my preferences
   - Best time of day to experience each ride

Please be specific about any intensity elements so I can make informed decisions.`,
          },
        },
      ],
    };
  },
};
