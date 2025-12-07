/**
 * MCP Prompts
 *
 * Prompt templates for Disney trip planning and park navigation.
 */

/** Prompt argument definition */
export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

/** Prompt definition */
export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: PromptArgument[];
}

/** Prompt message content */
export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
}

/** Result from getting a prompt */
export interface GetPromptResult {
  description?: string;
  messages: PromptMessage[];
}

/** All available prompts */
const prompts: PromptDefinition[] = [
  {
    name: "plan-park-day",
    description:
      "Create a personalized park day itinerary based on preferences, party size, and priorities.",
    arguments: [
      {
        name: "destination",
        description: "Destination: 'wdw' (Walt Disney World) or 'dlr' (Disneyland)",
        required: true,
      },
      {
        name: "park",
        description: "Park name (e.g., 'Magic Kingdom', 'EPCOT', 'Disneyland')",
        required: true,
      },
      {
        name: "party",
        description:
          "Party composition (e.g., '2 adults, 2 kids ages 5 and 8')",
        required: false,
      },
      {
        name: "priorities",
        description:
          "Top priorities (e.g., 'thrill rides', 'character meets', 'shows')",
        required: false,
      },
    ],
  },
  {
    name: "dining-recommendations",
    description:
      "Get personalized dining recommendations based on cuisine preferences and budget.",
    arguments: [
      {
        name: "destination",
        description: "Destination: 'wdw' or 'dlr'",
        required: true,
      },
      {
        name: "meal",
        description: "Meal type: 'breakfast', 'lunch', 'dinner', or 'snacks'",
        required: true,
      },
      {
        name: "preferences",
        description:
          "Preferences (e.g., 'character dining', 'quick service', 'fine dining')",
        required: false,
      },
      {
        name: "budget",
        description: "Budget level: '$', '$$', '$$$', or '$$$$'",
        required: false,
      },
    ],
  },
  {
    name: "attraction-strategy",
    description:
      "Develop a strategy for experiencing must-do attractions efficiently.",
    arguments: [
      {
        name: "destination",
        description: "Destination: 'wdw' or 'dlr'",
        required: true,
      },
      {
        name: "park",
        description: "Park name",
        required: true,
      },
      {
        name: "must_dos",
        description:
          "Must-do attractions (comma-separated)",
        required: false,
      },
      {
        name: "has_lightning_lane",
        description: "Whether you have Lightning Lane: 'yes' or 'no'",
        required: false,
      },
    ],
  },
  {
    name: "first-timer-guide",
    description:
      "Comprehensive guide for first-time Disney visitors with essential tips.",
    arguments: [
      {
        name: "destination",
        description: "Destination: 'wdw' or 'dlr'",
        required: true,
      },
      {
        name: "trip_length",
        description: "Number of park days",
        required: false,
      },
    ],
  },
  {
    name: "whats-new",
    description:
      "Discover recent changes, new attractions, and what's different since your last visit.",
    arguments: [
      {
        name: "destination",
        description: "Destination: 'wdw' or 'dlr'",
        required: true,
      },
      {
        name: "last_visit",
        description:
          "When you last visited (e.g., '2023', 'last year', 'never')",
        required: false,
      },
    ],
  },
  {
    name: "height-requirements",
    description:
      "Get attractions suitable for your party based on height restrictions.",
    arguments: [
      {
        name: "destination",
        description: "Destination: 'wdw' or 'dlr'",
        required: true,
      },
      {
        name: "shortest_height",
        description:
          "Height of shortest rider in inches (e.g., '40')",
        required: true,
      },
    ],
  },
];

/**
 * Get all prompt definitions.
 */
export function getPromptDefinitions(): PromptDefinition[] {
  return prompts;
}

/**
 * Get a prompt by name.
 */
export function getPrompt(name: string): PromptDefinition | undefined {
  return prompts.find((p) => p.name === name);
}

/**
 * Generate prompt messages for a given prompt.
 */
export function generatePrompt(
  name: string,
  args: Record<string, string>
): GetPromptResult | null {
  const prompt = getPrompt(name);
  if (!prompt) {
    return null;
  }

  switch (name) {
    case "plan-park-day":
      return generateParkDayPrompt(args);
    case "dining-recommendations":
      return generateDiningPrompt(args);
    case "attraction-strategy":
      return generateAttractionStrategyPrompt(args);
    case "first-timer-guide":
      return generateFirstTimerPrompt(args);
    case "whats-new":
      return generateWhatsNewPrompt(args);
    case "height-requirements":
      return generateHeightPrompt(args);
    default:
      return null;
  }
}

function generateParkDayPrompt(args: Record<string, string>): GetPromptResult {
  const destination = args.destination ?? "wdw";
  const park = args.park ?? "Magic Kingdom";
  const party = args.party ?? "2 adults";
  const priorities = args.priorities ?? "popular attractions";

  const destName = destination === "wdw" ? "Walt Disney World" : "Disneyland Resort";

  return {
    description: `Park day itinerary for ${park}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I'm planning a day at ${park} at ${destName}. Help me create a personalized itinerary.

**Party:** ${party}
**Top priorities:** ${priorities}

Please use the available Disney tools to:
1. First, use \`find_attractions\` to get attractions at ${park}
2. Consider Lightning Lane strategy and popular ride recommendations
3. Include meal breaks with \`find_dining\` for restaurant options
4. Suggest optimal touring order to minimize wait times
5. Include any shows or entertainment worth seeing

Create a time-blocked itinerary from park opening to closing, accounting for our priorities and any height restrictions for our party.`,
        },
      },
    ],
  };
}

function generateDiningPrompt(args: Record<string, string>): GetPromptResult {
  const destination = args.destination ?? "wdw";
  const meal = args.meal ?? "dinner";
  const preferences = args.preferences ?? "table service";
  const budget = args.budget ?? "$$";

  const destName = destination === "wdw" ? "Walt Disney World" : "Disneyland Resort";

  return {
    description: `Dining recommendations for ${meal}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I need dining recommendations for ${meal} at ${destName}.

**Preferences:** ${preferences}
**Budget:** ${budget}

Please use the \`find_dining\` tool to search for restaurants, then:
1. Filter by my preferences and budget level
2. Recommend 3-5 best options with pros/cons
3. Note which require reservations
4. Mention any character dining or unique experiences
5. Suggest backup options in case my top choice is unavailable

Include practical tips like reservation timing and mobile order availability.`,
        },
      },
    ],
  };
}

function generateAttractionStrategyPrompt(args: Record<string, string>): GetPromptResult {
  const destination = args.destination ?? "wdw";
  const park = args.park ?? "Magic Kingdom";
  const mustDos = args.must_dos ?? "most popular rides";
  const hasLL = args.has_lightning_lane ?? "no";

  const destName = destination === "wdw" ? "Walt Disney World" : "Disneyland Resort";

  return {
    description: `Attraction strategy for ${park}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Help me develop a strategy to experience attractions efficiently at ${park} (${destName}).

**Must-do attractions:** ${mustDos}
**Lightning Lane access:** ${hasLL}

Please use \`find_attractions\` to get the attraction list, then:
1. Identify which attractions have the longest typical waits
2. Recommend rope drop strategy (what to hit first)
3. ${hasLL === "yes" ? "Suggest optimal Lightning Lane selections" : "Suggest alternatives to Lightning Lane for busy rides"}
4. Identify single rider options
5. Note any virtual queue requirements
6. Create a rough order to tackle my must-dos efficiently

Focus on minimizing total wait time while hitting all my priorities.`,
        },
      },
    ],
  };
}

function generateFirstTimerPrompt(args: Record<string, string>): GetPromptResult {
  const destination = args.destination ?? "wdw";
  const tripLength = args.trip_length ?? "3-4";

  const destName = destination === "wdw" ? "Walt Disney World" : "Disneyland Resort";

  return {
    description: `First-timer guide for ${destName}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I'm a first-time visitor to ${destName} with ${tripLength} park days. Give me a comprehensive guide!

Please use the available tools to research and provide:

1. **Park Overview**: Use \`list_parks\` to show me all parks and what makes each unique
2. **Must-Do Experiences**: Top attractions, shows, and experiences I shouldn't miss
3. **Dining Highlights**: Signature dining experiences and best quick service options
4. **Practical Tips**:
   - Lightning Lane strategy
   - Best times to visit each park
   - Mobile app features to use
   - What to bring/wear
5. **Hidden Gems**: Lesser-known experiences worth seeking out
6. **Common Mistakes**: What first-timers often get wrong

Create a suggested multi-day plan distributing parks across my ${tripLength} days.`,
        },
      },
    ],
  };
}

function generateWhatsNewPrompt(args: Record<string, string>): GetPromptResult {
  const destination = args.destination ?? "wdw";
  const lastVisit = args.last_visit ?? "a few years ago";

  const destName = destination === "wdw" ? "Walt Disney World" : "Disneyland Resort";

  return {
    description: `What's new at ${destName}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I last visited ${destName} ${lastVisit}. What's new and different?

Please use the \`changes\` tool to find recent changes, and other tools to research:

1. **New Attractions**: Any rides or experiences that opened recently
2. **Closures/Refurbishments**: What's closed or changed
3. **Name Changes**: Anything rebranded or reimagined
4. **New Dining**: Restaurant openings or major menu changes
5. **Operational Changes**: New Lightning Lane tiers, virtual queues, policies
6. **Coming Soon**: What's announced but not yet open

Use the \`changes\` tool with \`destination: "${destination}"\` to see tracked changes, then supplement with attraction and dining searches to give me a complete picture.`,
        },
      },
    ],
  };
}

function generateHeightPrompt(args: Record<string, string>): GetPromptResult {
  const destination = args.destination ?? "wdw";
  const shortestHeight = args.shortest_height ?? "40";

  const destName = destination === "wdw" ? "Walt Disney World" : "Disneyland Resort";

  return {
    description: `Height-appropriate attractions`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `My shortest rider is ${shortestHeight} inches tall. What attractions can we all enjoy at ${destName}?

Please use \`find_attractions\` for each park and categorize attractions into:

1. **All Can Ride**: No height requirement or meets our ${shortestHeight}" minimum
2. **Close Call**: Just above our height (${shortestHeight}"-48")
3. **Must Skip**: Too tall for our party

For attractions we can ride together:
- Highlight the best ones for the whole family
- Note any that might still be too intense despite meeting height
- Suggest rider swap opportunities for attractions that don't meet our requirement

Also identify character meets and shows as great alternatives when siblings need to split up.`,
        },
      },
    ],
  };
}
