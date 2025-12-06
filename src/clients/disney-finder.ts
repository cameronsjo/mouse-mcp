/**
 * Disney Finder API Client
 *
 * Primary data source for Disney park information.
 * Falls back to ThemeParks.wiki on authentication failure.
 */

import { createLogger, withRetry } from "../shared/index.js";
import { ApiError } from "../shared/errors.js";
import { getConfig } from "../config/index.js";
import { getSessionManager } from "./session-manager.js";
import { getThemeParksWikiClient } from "./themeparks-wiki.js";
import { cacheGet, cacheSet, saveEntities } from "../db/index.js";
import type {
  DestinationId,
  DisneyDestination,
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DisneyEntity,
  ParkRef,
} from "../types/index.js";

const logger = createLogger("DisneyFinder");

/** Disney Finder API base URLs */
const API_URLS: Record<DestinationId, string> = {
  wdw: "https://disneyworld.disney.go.com/finder/api/v1/explorer-service",
  dlr: "https://disneyland.disney.go.com/finder/api/v1/explorer-service",
};

/** Destination metadata for normalization */
const DESTINATION_INFO: Record<DestinationId, { name: string; location: string; timezone: string }> = {
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

/** Park IDs and names for each destination */
const PARK_INFO: Record<DestinationId, ParkRef[]> = {
  wdw: [
    { id: "80007944", name: "Magic Kingdom Park", slug: "magic-kingdom" },
    { id: "80007838", name: "EPCOT", slug: "epcot" },
    { id: "80007998", name: "Disney's Hollywood Studios", slug: "hollywood-studios" },
    { id: "80007823", name: "Disney's Animal Kingdom Theme Park", slug: "animal-kingdom" },
  ],
  dlr: [
    { id: "330339", name: "Disneyland Park", slug: "disneyland" },
    { id: "336894", name: "Disney California Adventure Park", slug: "california-adventure" },
  ],
};

/**
 * Disney Finder API client with automatic fallback.
 *
 * Attempts to use Disney's official API for rich metadata.
 * Falls back to ThemeParks.wiki when authentication fails.
 */
export class DisneyFinderClient {
  private readonly timeoutMs: number;

  constructor() {
    this.timeoutMs = getConfig().timeoutMs;
  }

  /**
   * Get all supported destinations.
   */
  async getDestinations(): Promise<DisneyDestination[]> {
    // Destinations are static, use hardcoded data
    const destinations: DisneyDestination[] = [];

    for (const destId of ["wdw", "dlr"] as DestinationId[]) {
      const info = DESTINATION_INFO[destId];
      const parks = PARK_INFO[destId];

      destinations.push({
        id: destId,
        name: info.name,
        location: info.location,
        timezone: info.timezone,
        parks,
        otherVenues: [], // Could add Disney Springs, Downtown Disney, etc.
      });
    }

    return destinations;
  }

  /**
   * Get attractions for a destination.
   * Uses cache with 24-hour TTL.
   */
  async getAttractions(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyAttraction[]> {
    const cacheKey = parkId
      ? `attractions:${destinationId}:${parkId}`
      : `attractions:${destinationId}`;

    // Check cache first
    const cached = await cacheGet<DisneyAttraction[]>(cacheKey);
    if (cached) {
      logger.debug("Returning cached attractions", { destinationId, parkId });
      return cached.data;
    }

    // Try Disney API first
    try {
      const attractions = await this.fetchAttractionsFromDisney(destinationId, parkId);

      // Cache and persist
      await cacheSet(cacheKey, attractions, { ttlHours: 24, source: "disney" });
      await saveEntities(attractions);

      return attractions;
    } catch (error) {
      logger.warn("Disney API failed, falling back to ThemeParks.wiki", {
        destinationId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to ThemeParks.wiki
      const wikiClient = getThemeParksWikiClient();
      const attractions = await wikiClient.getAttractions(destinationId, parkId);

      // Cache and persist
      await cacheSet(cacheKey, attractions, { ttlHours: 24, source: "themeparks-wiki" });
      await saveEntities(attractions);

      return attractions;
    }
  }

  /**
   * Get dining locations for a destination.
   * Uses cache with 24-hour TTL.
   */
  async getDining(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyDining[]> {
    const cacheKey = parkId
      ? `dining:${destinationId}:${parkId}`
      : `dining:${destinationId}`;

    // Check cache first
    const cached = await cacheGet<DisneyDining[]>(cacheKey);
    if (cached) {
      logger.debug("Returning cached dining", { destinationId, parkId });
      return cached.data;
    }

    // Try Disney API first
    try {
      const dining = await this.fetchDiningFromDisney(destinationId, parkId);

      // Cache and persist
      await cacheSet(cacheKey, dining, { ttlHours: 24, source: "disney" });
      await saveEntities(dining);

      return dining;
    } catch (error) {
      logger.warn("Disney API failed, falling back to ThemeParks.wiki", {
        destinationId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to ThemeParks.wiki
      const wikiClient = getThemeParksWikiClient();
      const dining = await wikiClient.getDining(destinationId, parkId);

      // Cache and persist
      await cacheSet(cacheKey, dining, { ttlHours: 24, source: "themeparks-wiki" });
      await saveEntities(dining);

      return dining;
    }
  }

  /**
   * Get shows/entertainment for a destination.
   * Uses cache with 24-hour TTL.
   */
  async getShows(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyShow[]> {
    const cacheKey = parkId
      ? `shows:${destinationId}:${parkId}`
      : `shows:${destinationId}`;

    // Check cache first
    const cached = await cacheGet<DisneyShow[]>(cacheKey);
    if (cached) {
      logger.debug("Returning cached shows", { destinationId, parkId });
      return cached.data;
    }

    // Shows are best from ThemeParks.wiki (Disney API doesn't expose them well)
    const wikiClient = getThemeParksWikiClient();
    const shows = await wikiClient.getShows(destinationId, parkId);

    // Cache and persist
    await cacheSet(cacheKey, shows, { ttlHours: 24, source: "themeparks-wiki" });
    await saveEntities(shows);

    return shows;
  }

  /**
   * Get a single entity by ID.
   */
  async getEntityById(id: string): Promise<DisneyEntity | null> {
    // Try local database first (from previous fetches)
    // If not found, search via ThemeParks.wiki
    const wikiClient = getThemeParksWikiClient();
    return wikiClient.getEntityById(id);
  }

  // --- Private Methods ---

  private async fetchAttractionsFromDisney(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyAttraction[]> {
    const sessionManager = getSessionManager();
    const headers = await sessionManager.getAuthHeaders(destinationId);

    if (!headers["Cookie"]) {
      throw new ApiError("No valid session", 401, "attractions");
    }

    const baseUrl = API_URLS[destinationId];
    // Disney's finder API endpoint for attractions
    const endpoint = parkId
      ? `/list/ancestor/${parkId}/type/attraction`
      : `/list/destination/${destinationId}/type/attraction`;

    const response = await this.fetchWithAuth<DisneyApiResponse>(
      `${baseUrl}${endpoint}`,
      headers,
      destinationId
    );

    // Normalize Disney API response to our types
    return this.normalizeAttractions(response.results || [], destinationId);
  }

  private async fetchDiningFromDisney(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyDining[]> {
    const sessionManager = getSessionManager();
    const headers = await sessionManager.getAuthHeaders(destinationId);

    if (!headers["Cookie"]) {
      throw new ApiError("No valid session", 401, "dining");
    }

    const baseUrl = API_URLS[destinationId];
    const endpoint = parkId
      ? `/list/ancestor/${parkId}/type/dining`
      : `/list/destination/${destinationId}/type/dining`;

    const response = await this.fetchWithAuth<DisneyApiResponse>(
      `${baseUrl}${endpoint}`,
      headers,
      destinationId
    );

    return this.normalizeDining(response.results || [], destinationId);
  }

  private async fetchWithAuth<T>(
    url: string,
    headers: Record<string, string>,
    destinationId: DestinationId
  ): Promise<T> {
    const sessionManager = getSessionManager();

    return withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            ...headers,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          await sessionManager.reportError(
            destinationId,
            new Error(`HTTP ${response.status}`)
          );
          throw new ApiError(
            `Disney API error: ${response.status}`,
            response.status,
            url
          );
        }

        await sessionManager.reportSuccess(destinationId);
        return (await response.json()) as T;
      } finally {
        clearTimeout(timeout);
      }
    }, {
      nonRetryableStatusCodes: [401, 403], // Don't retry auth failures
    });
  }

  private normalizeAttractions(
    results: DisneyApiEntity[],
    destinationId: DestinationId
  ): DisneyAttraction[] {
    const parks = PARK_INFO[destinationId];
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return results.map((entity) => ({
      id: entity.id,
      name: entity.name,
      slug: entity.urlFriendlyId ?? this.slugify(entity.name),
      entityType: "ATTRACTION" as const,
      destinationId,
      parkId: entity.ancestorThemeParkId ?? null,
      parkName: entity.ancestorThemeParkId
        ? (parkMap.get(entity.ancestorThemeParkId) ?? null)
        : null,
      location: entity.coordinates
        ? {
            latitude: entity.coordinates.latitude,
            longitude: entity.coordinates.longitude,
          }
        : null,
      url: entity.links?.self ?? null,
      heightRequirement: entity.heightRequirement
        ? this.parseHeight(entity.heightRequirement)
        : null,
      thrillLevel: this.parseThrillLevel(entity.thrillLevel),
      experienceType: entity.experienceType ?? null,
      duration: entity.duration ?? null,
      lightningLane: this.parseLightningLane(entity),
      singleRider: entity.singleRider ?? false,
      riderSwap: entity.riderSwap ?? false,
      photopass: entity.photoPass ?? false,
      virtualQueue: entity.virtualQueue ?? false,
      wheelchairAccessible: entity.wheelchairAccessible ?? true,
      tags: entity.facets?.map((f) => f.id) ?? [],
    }));
  }

  private normalizeDining(
    results: DisneyApiEntity[],
    destinationId: DestinationId
  ): DisneyDining[] {
    const parks = PARK_INFO[destinationId];
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return results.map((entity) => ({
      id: entity.id,
      name: entity.name,
      slug: entity.urlFriendlyId ?? this.slugify(entity.name),
      entityType: "RESTAURANT" as const,
      destinationId,
      parkId: entity.ancestorThemeParkId ?? null,
      parkName: entity.ancestorThemeParkId
        ? (parkMap.get(entity.ancestorThemeParkId) ?? null)
        : null,
      location: entity.coordinates
        ? {
            latitude: entity.coordinates.latitude,
            longitude: entity.coordinates.longitude,
          }
        : null,
      url: entity.links?.self ?? null,
      serviceType: this.parseServiceType(entity.serviceType),
      mealPeriods: this.parseMealPeriods(entity.mealPeriods),
      cuisineTypes: entity.cuisineTypes ?? [],
      priceRange: entity.priceRange
        ? { symbol: entity.priceRange as "$" | "$$" | "$$$" | "$$$$", description: entity.priceRange }
        : null,
      mobileOrder: entity.mobileOrder ?? false,
      reservationsRequired: entity.reservationsRequired ?? false,
      reservationsAccepted: entity.reservationsAccepted ?? false,
      characterDining: entity.characterDining ?? false,
      disneyDiningPlan: entity.disneyDiningPlan ?? false,
      tags: entity.facets?.map((f) => f.id) ?? [],
    }));
  }

  private parseHeight(heightStr: string): DisneyAttraction["heightRequirement"] {
    const inchMatch = heightStr.match(/(\d+)\s*in/i);
    if (inchMatch && inchMatch[1]) {
      const inches = parseInt(inchMatch[1], 10);
      return {
        inches,
        centimeters: Math.round(inches * 2.54),
        description: heightStr,
      };
    }
    return null;
  }

  private parseThrillLevel(level?: string): DisneyAttraction["thrillLevel"] {
    if (!level) return null;
    const lower = level.toLowerCase();
    if (lower.includes("thrill")) return "thrill";
    if (lower.includes("moderate")) return "moderate";
    return "family";
  }

  private parseLightningLane(entity: DisneyApiEntity): DisneyAttraction["lightningLane"] {
    if (entity.lightningLaneIndividual) {
      return { tier: "individual", available: true };
    }
    if (entity.lightningLane || entity.geniePlus) {
      return { tier: "multi-pass", available: true };
    }
    return null;
  }

  private parseServiceType(type?: string): DisneyDining["serviceType"] {
    if (!type) return null;
    const lower = type.toLowerCase();
    if (lower.includes("table")) return "table-service";
    if (lower.includes("quick")) return "quick-service";
    if (lower.includes("character")) return "character-dining";
    if (lower.includes("fine") || lower.includes("signature")) return "fine-signature-dining";
    if (lower.includes("lounge")) return "lounge";
    return "quick-service";
  }

  private parseMealPeriods(periods?: string[]): DisneyDining["mealPeriods"] {
    if (!periods) return [];
    return periods
      .map((p) => p.toLowerCase())
      .filter((p): p is DisneyDining["mealPeriods"][number] =>
        ["breakfast", "lunch", "dinner", "snacks"].includes(p)
      );
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}

/** Raw entity from Disney API */
interface DisneyApiEntity {
  id: string;
  name: string;
  urlFriendlyId?: string;
  ancestorThemeParkId?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  links?: {
    self?: string;
  };
  facets?: Array<{ id: string }>;
  // Attraction fields
  heightRequirement?: string;
  thrillLevel?: string;
  experienceType?: string;
  duration?: string;
  lightningLane?: boolean;
  lightningLaneIndividual?: boolean;
  geniePlus?: boolean;
  singleRider?: boolean;
  riderSwap?: boolean;
  photoPass?: boolean;
  virtualQueue?: boolean;
  wheelchairAccessible?: boolean;
  // Dining fields
  serviceType?: string;
  mealPeriods?: string[];
  cuisineTypes?: string[];
  priceRange?: string;
  mobileOrder?: boolean;
  reservationsRequired?: boolean;
  reservationsAccepted?: boolean;
  characterDining?: boolean;
  disneyDiningPlan?: boolean;
}

interface DisneyApiResponse {
  results?: DisneyApiEntity[];
}

// Singleton instance
let instance: DisneyFinderClient | null = null;

export function getDisneyFinderClient(): DisneyFinderClient {
  if (!instance) {
    instance = new DisneyFinderClient();
  }
  return instance;
}
