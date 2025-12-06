/**
 * ThemeParks.wiki API Client
 *
 * Fallback data source when Disney authentication fails.
 * Provides comprehensive park data without authentication.
 *
 * API Docs: https://api.themeparks.wiki
 */

import { withRetry } from "../shared/index.js";
import { ApiError } from "../shared/errors.js";
import { getConfig } from "../config/index.js";
import type {
  DestinationId,
  DisneyDestination,
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DisneyEntity,
  HeightRequirement,
  LightningLaneInfo,
  ThrillLevel,
  DiningServiceType,
  MealPeriod,
  PriceRange,
} from "../types/index.js";

const BASE_URL = "https://api.themeparks.wiki/v1";

/** ThemeParks.wiki destination UUIDs */
const DESTINATION_UUIDS: Record<DestinationId, string> = {
  wdw: "e957da41-3552-4cf6-b636-5babc5cbc4e5",
  dlr: "bfc89fd6-314d-44b4-b89e-df1a89cf991e",
};

/** Destination metadata */
const DESTINATION_INFO: Record<
  DestinationId,
  { name: string; location: string; timezone: string }
> = {
  wdw: {
    name: "Walt Disney World Resort",
    location: "Orlando, FL",
    timezone: "America/New_York",
  },
  dlr: {
    name: "Disneyland Resort",
    location: "Anaheim, CA",
    timezone: "America/Los_Angeles",
  },
};

/** Raw entity from ThemeParks.wiki API */
interface WikiEntity {
  id: string;
  name: string;
  entityType: string;
  parentId?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  tags?: Array<{ key: string; value: string }>;
}

/** Raw destination response */
interface WikiDestination {
  id: string;
  name: string;
  slug: string;
  parks: WikiEntity[];
}

/**
 * ThemeParks.wiki API client.
 *
 * Provides fallback data when Disney API authentication fails.
 * Note: Some metadata (height requirements, Lightning Lane) may not be available.
 */
export class ThemeParksWikiClient {
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = getConfig().timeoutMs;
  }

  /**
   * Get all supported destinations.
   */
  async getDestinations(): Promise<DisneyDestination[]> {
    const response = await this.fetchJson<{ destinations: WikiDestination[] }>("/destinations");

    const destinations: DisneyDestination[] = [];

    for (const [destId, uuid] of Object.entries(DESTINATION_UUIDS)) {
      const wikiDest = response.destinations.find((d) => d.id === uuid);
      const info = DESTINATION_INFO[destId as DestinationId];

      if (wikiDest) {
        destinations.push({
          id: destId as DestinationId,
          name: info.name,
          location: info.location,
          timezone: info.timezone,
          parks: wikiDest.parks
            .filter((p) => p.entityType === "PARK")
            .map((p) => ({
              id: p.id,
              name: p.name,
              slug: this.slugify(p.name),
            })),
          otherVenues: [], // Wiki API doesn't distinguish other venues
        });
      }
    }

    return destinations;
  }

  /**
   * Get attractions for a destination.
   */
  async getAttractions(destinationId: DestinationId, parkId?: string): Promise<DisneyAttraction[]> {
    const destUuid = DESTINATION_UUIDS[destinationId];
    const entities = await this.getEntitiesForDestination(destUuid);

    // Filter to attractions
    let attractions = entities.filter((e) => e.entityType === "ATTRACTION");

    // Filter by park if specified
    if (parkId) {
      attractions = attractions.filter((e) => e.parentId === parkId);
    }

    // Get park names for context
    const parks = entities.filter((e) => e.entityType === "PARK");
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return attractions.map((e) => this.normalizeAttraction(e, destinationId, parkMap));
  }

  /**
   * Get dining locations for a destination.
   */
  async getDining(destinationId: DestinationId, parkId?: string): Promise<DisneyDining[]> {
    const destUuid = DESTINATION_UUIDS[destinationId];
    const entities = await this.getEntitiesForDestination(destUuid);

    // Filter to restaurants
    let dining = entities.filter((e) => e.entityType === "RESTAURANT");

    // Filter by park if specified
    if (parkId) {
      dining = dining.filter((e) => e.parentId === parkId);
    }

    // Get park names for context
    const parks = entities.filter((e) => e.entityType === "PARK");
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return dining.map((e) => this.normalizeDining(e, destinationId, parkMap));
  }

  /**
   * Get shows/entertainment for a destination.
   */
  async getShows(destinationId: DestinationId, parkId?: string): Promise<DisneyShow[]> {
    const destUuid = DESTINATION_UUIDS[destinationId];
    const entities = await this.getEntitiesForDestination(destUuid);

    // Filter to shows
    let shows = entities.filter((e) => e.entityType === "SHOW");

    // Filter by park if specified
    if (parkId) {
      shows = shows.filter((e) => e.parentId === parkId);
    }

    // Get park names for context
    const parks = entities.filter((e) => e.entityType === "PARK");
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return shows.map((e) => this.normalizeShow(e, destinationId, parkMap));
  }

  /**
   * Get a single entity by ID.
   */
  async getEntityById(id: string): Promise<DisneyEntity | null> {
    try {
      const entity = await this.fetchJson<WikiEntity>(`/entity/${id}`);

      // Determine destination from ID (check which destination contains it)
      for (const [destId, uuid] of Object.entries(DESTINATION_UUIDS)) {
        const entities = await this.getEntitiesForDestination(uuid);
        const found = entities.find((e) => e.id === id);
        if (found) {
          const parks = entities.filter((e) => e.entityType === "PARK");
          const parkMap = new Map(parks.map((p) => [p.id, p.name]));

          if (entity.entityType === "ATTRACTION") {
            return this.normalizeAttraction(entity, destId as DestinationId, parkMap);
          } else if (entity.entityType === "RESTAURANT") {
            return this.normalizeDining(entity, destId as DestinationId, parkMap);
          } else if (entity.entityType === "SHOW") {
            return this.normalizeShow(entity, destId as DestinationId, parkMap);
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Search entities by name.
   */
  async searchEntities(
    _query: string,
    options: {
      destinationId?: DestinationId;
      entityType?: string;
    } = {}
  ): Promise<DisneyEntity[]> {
    const destinations = options.destinationId
      ? [options.destinationId]
      : (["wdw", "dlr"] as DestinationId[]);

    const results: DisneyEntity[] = [];

    for (const destId of destinations) {
      if (!options.entityType || options.entityType === "ATTRACTION") {
        const attractions = await this.getAttractions(destId);
        results.push(...attractions);
      }

      if (!options.entityType || options.entityType === "RESTAURANT") {
        const dining = await this.getDining(destId);
        results.push(...dining);
      }

      if (!options.entityType || options.entityType === "SHOW") {
        const shows = await this.getShows(destId);
        results.push(...shows);
      }
    }

    return results;
  }

  // --- Private Methods ---

  private async getEntitiesForDestination(destUuid: string): Promise<WikiEntity[]> {
    const response = await this.fetchJson<{ children: WikiEntity[] }>(
      `/entity/${destUuid}/children`
    );
    return response.children;
  }

  private async fetchJson<T>(endpoint: string): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;

    return withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ApiError(
            `ThemeParks.wiki API error: ${response.status}`,
            response.status,
            endpoint
          );
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  private normalizeAttraction(
    entity: WikiEntity,
    destinationId: DestinationId,
    parkMap: Map<string, string>
  ): DisneyAttraction {
    const tags = this.extractTags(entity.tags);

    return {
      id: entity.id,
      name: entity.name,
      slug: this.slugify(entity.name),
      entityType: "ATTRACTION",
      destinationId,
      parkId: entity.parentId ?? null,
      parkName: entity.parentId ? (parkMap.get(entity.parentId) ?? null) : null,
      location: entity.location
        ? {
            latitude: entity.location.latitude,
            longitude: entity.location.longitude,
          }
        : null,
      url: null, // Wiki doesn't provide Disney URLs
      heightRequirement: this.extractHeightRequirement(tags),
      thrillLevel: this.extractThrillLevel(tags),
      experienceType: tags.get("attractionType") ?? null,
      duration: tags.get("duration") ?? null,
      lightningLane: this.extractLightningLane(tags),
      singleRider: tags.has("singleRider"),
      riderSwap: tags.has("riderSwap"),
      photopass: tags.has("photoPass"),
      virtualQueue: tags.has("virtualQueue"),
      wheelchairAccessible: !tags.has("mustTransfer"),
      tags: Array.from(tags.keys()),
    };
  }

  private normalizeDining(
    entity: WikiEntity,
    destinationId: DestinationId,
    parkMap: Map<string, string>
  ): DisneyDining {
    const tags = this.extractTags(entity.tags);

    return {
      id: entity.id,
      name: entity.name,
      slug: this.slugify(entity.name),
      entityType: "RESTAURANT",
      destinationId,
      parkId: entity.parentId ?? null,
      parkName: entity.parentId ? (parkMap.get(entity.parentId) ?? null) : null,
      location: entity.location
        ? {
            latitude: entity.location.latitude,
            longitude: entity.location.longitude,
          }
        : null,
      url: null,
      serviceType: this.extractServiceType(tags),
      mealPeriods: this.extractMealPeriods(tags),
      cuisineTypes: this.extractCuisine(tags),
      priceRange: this.extractPriceRange(tags),
      mobileOrder: tags.has("mobileOrder"),
      reservationsRequired: tags.has("reservationsRequired"),
      reservationsAccepted: tags.has("reservationsAccepted") || tags.has("reservationsRequired"),
      characterDining: tags.has("characterDining"),
      disneyDiningPlan: tags.has("diningPlan"),
      tags: Array.from(tags.keys()),
    };
  }

  private normalizeShow(
    entity: WikiEntity,
    destinationId: DestinationId,
    parkMap: Map<string, string>
  ): DisneyShow {
    const tags = this.extractTags(entity.tags);

    return {
      id: entity.id,
      name: entity.name,
      slug: this.slugify(entity.name),
      entityType: "SHOW",
      destinationId,
      parkId: entity.parentId ?? null,
      parkName: entity.parentId ? (parkMap.get(entity.parentId) ?? null) : null,
      location: entity.location
        ? {
            latitude: entity.location.latitude,
            longitude: entity.location.longitude,
          }
        : null,
      url: null,
      showType: this.extractShowType(tags, entity.name),
      duration: tags.get("duration") ?? null,
      tags: Array.from(tags.keys()),
    };
  }

  private extractShowType(tags: Map<string, string>, name: string): DisneyShow["showType"] {
    const showType = tags.get("showType")?.toLowerCase() ?? "";
    const nameLower = name.toLowerCase();

    // Check tags first
    if (showType.includes("firework") || nameLower.includes("firework")) return "fireworks";
    if (showType.includes("parade") || nameLower.includes("parade")) return "parade";
    if (
      showType.includes("character") ||
      showType.includes("meet") ||
      nameLower.includes("meet") ||
      nameLower.includes("character greeting")
    ) {
      return "character-meet";
    }
    if (
      showType.includes("stage") ||
      showType.includes("theater") ||
      nameLower.includes("show") ||
      nameLower.includes("musical")
    ) {
      return "stage-show";
    }

    return "other";
  }

  private extractTags(tags?: Array<{ key: string; value: string }>): Map<string, string> {
    const map = new Map<string, string>();
    if (tags) {
      for (const tag of tags) {
        map.set(tag.key, tag.value);
      }
    }
    return map;
  }

  private extractHeightRequirement(tags: Map<string, string>): HeightRequirement | null {
    const height = tags.get("heightRequirement");
    if (!height) return null;

    // Parse height string like "44 in" or "112 cm"
    const inchMatch = /(\d+)\s*in/i.exec(height);
    if (inchMatch?.[1]) {
      const inches = parseInt(inchMatch[1], 10);
      return {
        inches,
        centimeters: Math.round(inches * 2.54),
        description: height,
      };
    }

    const cmMatch = /(\d+)\s*cm/i.exec(height);
    if (cmMatch?.[1]) {
      const cm = parseInt(cmMatch[1], 10);
      return {
        inches: Math.round(cm / 2.54),
        centimeters: cm,
        description: height,
      };
    }

    return null;
  }

  private extractThrillLevel(tags: Map<string, string>): ThrillLevel | null {
    const thrill = tags.get("thrillLevel");
    if (!thrill) return null;

    const lower = thrill.toLowerCase();
    if (lower.includes("thrill")) return "thrill";
    if (lower.includes("moderate")) return "moderate";
    if (lower.includes("family") || lower.includes("all ages")) return "family";

    return null;
  }

  private extractLightningLane(tags: Map<string, string>): LightningLaneInfo | null {
    if (tags.has("lightningLaneIndividual")) {
      return { tier: "individual", available: true };
    }
    if (tags.has("lightningLane") || tags.has("geniePlus")) {
      return { tier: "multi-pass", available: true };
    }
    return null;
  }

  private extractServiceType(tags: Map<string, string>): DiningServiceType | null {
    const type = tags.get("serviceType");
    if (!type) return null;

    const lower = type.toLowerCase();
    if (lower.includes("table")) return "table-service";
    if (lower.includes("quick")) return "quick-service";
    if (lower.includes("character")) return "character-dining";
    if (lower.includes("fine") || lower.includes("signature")) return "fine-signature-dining";
    if (lower.includes("lounge")) return "lounge";
    if (lower.includes("cart")) return "food-cart";

    return null;
  }

  private extractMealPeriods(tags: Map<string, string>): MealPeriod[] {
    const periods: MealPeriod[] = [];
    if (tags.has("breakfast")) periods.push("breakfast");
    if (tags.has("lunch")) periods.push("lunch");
    if (tags.has("dinner")) periods.push("dinner");
    if (tags.has("snacks")) periods.push("snacks");
    return periods;
  }

  private extractCuisine(tags: Map<string, string>): string[] {
    const cuisine = tags.get("cuisine");
    if (!cuisine) return [];
    return cuisine.split(",").map((c) => c.trim());
  }

  private extractPriceRange(tags: Map<string, string>): PriceRange | null {
    const price = tags.get("priceRange");
    if (!price) return null;

    const dollarSigns = (price.match(/\$/g) || []).length;
    const symbol = ("$".repeat(Math.min(dollarSigns, 4)) || "$") as PriceRange["symbol"];

    return {
      symbol,
      description: price,
    };
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}

// Singleton instance
let instance: ThemeParksWikiClient | null = null;

export function getThemeParksWikiClient(): ThemeParksWikiClient {
  if (!instance) {
    instance = new ThemeParksWikiClient();
  }
  return instance;
}
