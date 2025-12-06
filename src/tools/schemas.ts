/**
 * Output Schemas for Disney MCP Tools
 *
 * Zod schemas for structured output validation and JSON Schema generation.
 * These schemas define the output format for each MCP tool.
 */

import { z } from "zod";

// Common schemas
const geoLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

const parkRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
});

const metadataSchema = z.object({
  cachedAt: z.string(),
  source: z.enum(["disney", "themeparks-wiki"]),
});

// list_parks output schema
const destinationSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  timezone: z.string(),
  parks: z.array(parkRefSchema),
});

export const listParksOutputSchema = z.object({
  destinations: z.array(destinationSchema),
  _meta: metadataSchema,
});

// find_attractions output schema
const attractionSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  park: z.string().nullable(),
  location: geoLocationSchema.nullable(),
  url: z.string().nullable(),
  metadata: z.object({
    heightRequirement: z.string().nullable(),
    thrillLevel: z.string().nullable(),
    experienceType: z.string().nullable(),
    duration: z.string().nullable(),
  }),
  features: z.object({
    lightningLane: z.string(),
    singleRider: z.boolean(),
    riderSwap: z.boolean(),
    photopass: z.boolean(),
    virtualQueue: z.boolean(),
  }),
  accessibility: z.object({
    wheelchairAccessible: z.boolean(),
  }),
  tags: z.array(z.string()),
});

export const findAttractionsOutputSchema = z.object({
  destination: z.string(),
  parkId: z.string().nullable(),
  count: z.number(),
  attractions: z.array(attractionSchema),
});

// find_dining output schema
const diningSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  park: z.string().nullable(),
  location: geoLocationSchema.nullable(),
  url: z.string().nullable(),
  metadata: z.object({
    serviceType: z.string().nullable(),
    priceRange: z.string().nullable(),
    cuisine: z.array(z.string()),
    mealPeriods: z.array(z.string()),
  }),
  features: z.object({
    reservationsAccepted: z.boolean(),
    reservationsRequired: z.boolean(),
    mobileOrder: z.boolean(),
    characterDining: z.boolean(),
    disneyDiningPlan: z.boolean(),
  }),
});

export const findDiningOutputSchema = z.object({
  destination: z.string(),
  parkId: z.string().nullable(),
  count: z.number(),
  dining: z.array(diningSchema),
});

// search output schemas
const searchEntitySchema = z.record(z.unknown());

const searchAlternativeSchema = z.object({
  name: z.string(),
  id: z.string(),
  type: z.string(),
  score: z.number(),
});

export const searchByIdOutputSchema = z.object({
  found: z.boolean(),
  entity: searchEntitySchema.optional(),
  id: z.string().optional(),
  message: z.string().optional(),
});

export const searchByNameOutputSchema = z.object({
  query: z.string(),
  found: z.boolean(),
  confidence: z.number().optional(),
  bestMatch: searchEntitySchema.optional(),
  alternatives: z.array(searchAlternativeSchema).optional(),
  message: z.string().optional(),
});

// discover output schema
const discoverResultSchema = z.object({
  name: z.string(),
  id: z.string(),
  type: z.string(),
  destination: z.string(),
  park: z.string().nullable(),
  score: z.number(),
  distance: z.number(),
});

export const discoverOutputSchema = z.object({
  query: z.string(),
  found: z.boolean(),
  count: z.number().optional(),
  results: z.array(discoverResultSchema).optional(),
  message: z.string().optional(),
});

// status output schema
const sessionStatusSchema = z.object({
  hasSession: z.boolean(),
  isValid: z.boolean(),
  expiresAt: z.string().nullable(),
  errorCount: z.number(),
});

const cacheStatsSchema = z.object({
  totalEntries: z.number(),
  expiredEntries: z.number(),
  sources: z.record(z.number()),
});

const databaseStatsSchema = z.object({
  entityCount: z.number(),
  cacheEntries: z.number(),
  sizeKb: z.number(),
});

const healthStatusSchema = z.object({
  databaseHealthy: z.boolean(),
  cacheHealthy: z.boolean(),
  wdwSessionHealthy: z.boolean(),
  dlrSessionHealthy: z.boolean(),
});

const entityCountsSchema = z.object({
  attractions: z.number(),
  restaurants: z.number(),
  shows: z.number(),
});

export const statusOutputSchema = z.object({
  server: z.object({
    version: z.string(),
    uptime: z.number(),
    timestamp: z.string(),
  }),
  sessions: z.object({
    wdw: sessionStatusSchema,
    dlr: sessionStatusSchema,
  }),
  cache: cacheStatsSchema,
  database: databaseStatsSchema,
  health: healthStatusSchema,
  details: z
    .object({
      wdw: entityCountsSchema,
      dlr: entityCountsSchema,
    })
    .optional(),
});

// initialize (sync) output schema
const embeddingStatsSchema = z.object({
  total: z.number(),
  byModel: z.record(z.number()),
});

const syncTimingSchema = z.object({
  dataLoadMs: z.number(),
  embeddingMs: z.number(),
});

const syncStatsSchema = z.object({
  destinations: z.array(z.string()),
  attractions: z.number(),
  dining: z.number(),
  shows: z.number(),
  shops: z.number(),
  events: z.number(),
  embeddings: embeddingStatsSchema,
  provider: z.string(),
  timing: syncTimingSchema,
});

export const initializeOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  stats: syncStatsSchema,
  note: z.string(),
});

// Export union schema for search tool (handles both ID and name search)
export const searchOutputSchema = z.union([searchByIdOutputSchema, searchByNameOutputSchema]);

// JSON Schema generation helpers
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Convert Zod schema to JSON Schema
  // WHY: MCP SDK requires JSON Schema format, not Zod schemas
  // This is a simplified conversion - for production use a library like zod-to-json-schema

  if (schema instanceof z.ZodObject) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodNullable)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",

      enum: schema.options,
    };
  }

  if (schema instanceof z.ZodNullable) {
    const innerSchema = zodToJsonSchema(schema.unwrap());
    return {
      ...innerSchema,
      nullable: true,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodUnion) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      oneOf: schema.options.map((option: z.ZodType) => zodToJsonSchema(option)),
    };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: "object",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      additionalProperties: zodToJsonSchema(schema.valueSchema),
    };
  }

  // Fallback for unknown types
  return { type: "object" };
}
