#!/usr/bin/env tsx
/**
 * Schema Verification Script
 *
 * Verifies that all MCP tool output schemas are correctly defined and can be converted to JSON Schema.
 */

import {
  listParksOutputSchema,
  findAttractionsOutputSchema,
  findDiningOutputSchema,
  searchOutputSchema,
  discoverOutputSchema,
  statusOutputSchema,
  initializeOutputSchema,
  zodToJsonSchema,
} from "../src/tools/schemas.js";

interface SchemaTest {
  name: string;
  schema: unknown;
  sampleData: unknown;
}

const tests: SchemaTest[] = [
  {
    name: "list_parks",
    schema: listParksOutputSchema,
    sampleData: {
      destinations: [
        {
          id: "wdw",
          name: "Walt Disney World Resort",
          location: "Orlando, FL",
          timezone: "America/New_York",
          parks: [
            {
              id: "80007944",
              name: "Magic Kingdom Park",
              slug: "magic-kingdom",
            },
          ],
        },
      ],
      _meta: {
        cachedAt: "2025-12-06T00:00:00.000Z",
        source: "disney",
      },
    },
  },
  {
    name: "find_attractions",
    schema: findAttractionsOutputSchema,
    sampleData: {
      destination: "wdw",
      parkId: "80007944",
      count: 1,
      attractions: [
        {
          id: "80010190",
          name: "Space Mountain",
          slug: "space-mountain",
          park: "Magic Kingdom Park",
          location: { latitude: 28.4186, longitude: -81.5781 },
          url: "https://disneyworld.disney.go.com/attractions/magic-kingdom/space-mountain/",
          metadata: {
            heightRequirement: "44 inches (112 cm)",
            thrillLevel: "thrill",
            experienceType: "roller-coaster",
            duration: "3 minutes",
          },
          features: {
            lightningLane: "multi-pass",
            singleRider: false,
            riderSwap: true,
            photopass: true,
            virtualQueue: false,
          },
          accessibility: {
            wheelchairAccessible: false,
          },
          tags: ["dark", "indoor", "fast"],
        },
      ],
    },
  },
  {
    name: "find_dining",
    schema: findDiningOutputSchema,
    sampleData: {
      destination: "wdw",
      parkId: null,
      count: 1,
      dining: [
        {
          id: "90001234",
          name: "Be Our Guest Restaurant",
          slug: "be-our-guest-restaurant",
          park: "Magic Kingdom Park",
          location: { latitude: 28.4186, longitude: -81.5781 },
          url: "https://disneyworld.disney.go.com/dining/magic-kingdom/be-our-guest-restaurant/",
          metadata: {
            serviceType: "table-service",
            priceRange: "$$",
            cuisine: ["French", "American"],
            mealPeriods: ["breakfast", "lunch", "dinner"],
          },
          features: {
            reservationsAccepted: true,
            reservationsRequired: true,
            mobileOrder: false,
            characterDining: false,
            disneyDiningPlan: true,
          },
        },
      ],
    },
  },
  {
    name: "search (by name)",
    schema: searchOutputSchema,
    sampleData: {
      query: "space mountain",
      found: true,
      confidence: 0.95,
      bestMatch: {
        id: "80010190",
        name: "Space Mountain",
        type: "ATTRACTION",
      },
      alternatives: [
        {
          name: "Space Mountain (Disneyland)",
          id: "80010191",
          type: "ATTRACTION",
          score: 0.85,
        },
      ],
    },
  },
  {
    name: "discover",
    schema: discoverOutputSchema,
    sampleData: {
      query: "thrill rides",
      found: true,
      count: 2,
      results: [
        {
          name: "Space Mountain",
          id: "80010190",
          type: "ATTRACTION",
          destination: "wdw",
          park: "Magic Kingdom Park",
          score: 0.92,
          distance: 0.34,
        },
        {
          name: "Big Thunder Mountain Railroad",
          id: "80010110",
          type: "ATTRACTION",
          destination: "wdw",
          park: "Magic Kingdom Park",
          score: 0.88,
          distance: 0.42,
        },
      ],
    },
  },
  {
    name: "status",
    schema: statusOutputSchema,
    sampleData: {
      server: {
        version: "1.0.0",
        uptime: 3600,
        timestamp: "2025-12-06T00:00:00.000Z",
      },
      sessions: {
        wdw: {
          hasSession: true,
          isValid: true,
          expiresAt: "2025-12-06T01:00:00.000Z",
          errorCount: 0,
        },
        dlr: {
          hasSession: false,
          isValid: false,
          expiresAt: null,
          errorCount: 0,
        },
      },
      cache: {
        totalEntries: 100,
        expiredEntries: 5,
        sources: {
          disney: 95,
          "themeparks-wiki": 5,
        },
      },
      database: {
        entityCount: 500,
        cacheEntries: 100,
        sizeKb: 2048,
      },
      health: {
        databaseHealthy: true,
        cacheHealthy: true,
        wdwSessionHealthy: true,
        dlrSessionHealthy: false,
      },
    },
  },
  {
    name: "initialize",
    schema: initializeOutputSchema,
    sampleData: {
      success: true,
      message: "Synced 500 entities from wdw",
      stats: {
        destinations: ["wdw"],
        attractions: 200,
        dining: 150,
        shows: 50,
        shops: 80,
        events: 20,
        embeddings: {
          total: 500,
          byModel: {
            "Xenova/all-MiniLM-L6-v2": 500,
          },
        },
        provider: "Xenova/all-MiniLM-L6-v2",
        timing: {
          dataLoadMs: 5000,
          embeddingMs: 10000,
        },
      },
      note: "All embeddings ready for semantic search.",
    },
  },
];

console.log("Verifying output schemas...\n");

let passCount = 0;
let failCount = 0;

for (const test of tests) {
  try {
    // Test 1: Validate sample data against schema
    const parseResult = (test.schema as { parse: (data: unknown) => unknown }).parse(
      test.sampleData
    );

    // Test 2: Convert to JSON Schema
    const jsonSchema = zodToJsonSchema(
      test.schema as import("zod").ZodType<unknown, import("zod").ZodTypeDef, unknown>
    );

    console.log(`✓ ${test.name}`);
    console.log(`  - Sample data validated`);
    console.log(`  - JSON Schema generated (${Object.keys(jsonSchema).length} top-level keys)`);
    console.log();

    passCount++;
  } catch (error) {
    console.log(`✗ ${test.name}`);
    console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    console.log();

    failCount++;
  }
}

console.log(`\nResults: ${passCount} passed, ${failCount} failed`);

if (failCount > 0) {
  process.exit(1);
}
