/**
 * Disney Finder API Client
 *
 * Primary data source for Disney park information.
 * Requires valid Disney session - no fallback to third-party sources.
 */

import { createLogger, withRetry } from "../shared/index.js";
import { ApiError } from "../shared/errors.js";
import { getConfig } from "../config/index.js";
import { getSessionManager } from "./session-manager.js";
import { cacheGet, cacheSet, saveEntities, getEntityById as getEntityFromDb } from "../db/index.js";
import type {
  DestinationId,
  DisneyDestination,
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DisneyShop,
  DisneyEvent,
  DisneyEntity,
  ParkRef,
} from "../types/index.js";

const logger = createLogger("DisneyFinder");

/** Disney Finder API base URLs */
const API_URLS: Record<DestinationId, string> = {
  wdw: "https://disneyworld.disney.go.com/finder/api/v1/explorer-service",
  dlr: "https://disneyland.disney.go.com/finder/api/v1/explorer-service",
};

/** Destination entity IDs for Disney API */
const DESTINATION_ENTITY_IDS: Record<DestinationId, string> = {
  wdw: "80007798;entityType=destination",
  dlr: "80008297;entityType=destination",
};

/** Destination metadata for normalization */
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
    parkId?: string,
    options?: { skipCache?: boolean }
  ): Promise<DisneyAttraction[]> {
    const cacheKey = parkId
      ? `attractions:${destinationId}:${parkId}`
      : `attractions:${destinationId}`;

    // Check cache first (unless skipCache is set)
    if (!options?.skipCache) {
      const cached = await cacheGet<DisneyAttraction[]>(cacheKey);
      if (cached) {
        logger.debug("Returning cached attractions", { destinationId, parkId });
        return cached.data;
      }
    } else {
      logger.debug("Skipping cache for attractions", { destinationId, parkId });
    }

    // Fetch from Disney API (no fallback - require authentic Disney data)
    const attractions = await this.fetchAttractionsFromDisney(destinationId, parkId);

    // Cache and persist
    await cacheSet(cacheKey, attractions, { ttlHours: 24, source: "disney" });
    await saveEntities(attractions);

    return attractions;
  }

  /**
   * Get dining locations for a destination.
   * Uses cache with 24-hour TTL.
   */
  async getDining(
    destinationId: DestinationId,
    parkId?: string,
    options?: { skipCache?: boolean }
  ): Promise<DisneyDining[]> {
    const cacheKey = parkId ? `dining:${destinationId}:${parkId}` : `dining:${destinationId}`;

    // Check cache first (unless skipCache is set)
    if (!options?.skipCache) {
      const cached = await cacheGet<DisneyDining[]>(cacheKey);
      if (cached) {
        logger.debug("Returning cached dining", { destinationId, parkId });
        return cached.data;
      }
    } else {
      logger.debug("Skipping cache for dining", { destinationId, parkId });
    }

    // Fetch from Disney API (no fallback - require authentic Disney data)
    const dining = await this.fetchDiningFromDisney(destinationId, parkId);

    // Cache and persist
    await cacheSet(cacheKey, dining, { ttlHours: 24, source: "disney" });
    await saveEntities(dining);

    return dining;
  }

  /**
   * Get shows/entertainment for a destination.
   * Uses cache with 24-hour TTL.
   */
  async getShows(
    destinationId: DestinationId,
    parkId?: string,
    options?: { skipCache?: boolean }
  ): Promise<DisneyShow[]> {
    const cacheKey = parkId ? `shows:${destinationId}:${parkId}` : `shows:${destinationId}`;

    // Check cache first (unless skipCache is set)
    if (!options?.skipCache) {
      const cached = await cacheGet<DisneyShow[]>(cacheKey);
      if (cached) {
        logger.debug("Returning cached shows", { destinationId, parkId });
        return cached.data;
      }
    } else {
      logger.debug("Skipping cache for shows", { destinationId, parkId });
    }

    // Fetch from Disney API (no fallback - require authentic Disney data)
    const shows = await this.fetchEntertainmentFromDisney(destinationId, parkId);

    // Cache and persist
    await cacheSet(cacheKey, shows, { ttlHours: 24, source: "disney" });
    await saveEntities(shows);

    return shows;
  }

  /**
   * Get shops/merchandise locations for a destination.
   * Uses cache with 24-hour TTL.
   */
  async getShops(
    destinationId: DestinationId,
    parkId?: string,
    options?: { skipCache?: boolean }
  ): Promise<DisneyShop[]> {
    const cacheKey = parkId ? `shops:${destinationId}:${parkId}` : `shops:${destinationId}`;

    // Check cache first (unless skipCache is set)
    if (!options?.skipCache) {
      const cached = await cacheGet<DisneyShop[]>(cacheKey);
      if (cached) {
        logger.debug("Returning cached shops", { destinationId, parkId });
        return cached.data;
      }
    } else {
      logger.debug("Skipping cache for shops", { destinationId, parkId });
    }

    // Try Disney API
    try {
      const shops = await this.fetchShopsFromDisney(destinationId, parkId);

      // Cache and persist
      await cacheSet(cacheKey, shops, { ttlHours: 24, source: "disney" });
      await saveEntities(shops);

      return shops;
    } catch (error) {
      logger.warn("Disney API failed for shops", {
        destinationId,
        error: error instanceof Error ? error.message : String(error),
      });
      // No ThemeParks.wiki fallback for shops
      return [];
    }
  }

  /**
   * Get events/tours for a destination.
   * Uses cache with 24-hour TTL.
   */
  async getEvents(
    destinationId: DestinationId,
    parkId?: string,
    options?: { skipCache?: boolean }
  ): Promise<DisneyEvent[]> {
    const cacheKey = parkId ? `events:${destinationId}:${parkId}` : `events:${destinationId}`;

    // Check cache first (unless skipCache is set)
    if (!options?.skipCache) {
      const cached = await cacheGet<DisneyEvent[]>(cacheKey);
      if (cached) {
        logger.debug("Returning cached events", { destinationId, parkId });
        return cached.data;
      }
    } else {
      logger.debug("Skipping cache for events", { destinationId, parkId });
    }

    // Try Disney API
    try {
      const events = await this.fetchEventsFromDisney(destinationId, parkId);

      // Cache and persist
      await cacheSet(cacheKey, events, { ttlHours: 24, source: "disney" });
      await saveEntities(events);

      return events;
    } catch (error) {
      logger.warn("Disney API failed for events", {
        destinationId,
        error: error instanceof Error ? error.message : String(error),
      });
      // No ThemeParks.wiki fallback for events
      return [];
    }
  }

  /**
   * Get a single entity by ID from local database.
   */
  async getEntityById(id: string): Promise<DisneyEntity | null> {
    return getEntityFromDb(id);
  }

  // --- Private Methods ---

  private async fetchAttractionsFromDisney(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyAttraction[]> {
    const sessionManager = getSessionManager();
    const headers = await sessionManager.getAuthHeaders(destinationId);

    if (!headers.Cookie) {
      throw new ApiError("No valid session", 401, "attractions");
    }

    const baseUrl = API_URLS[destinationId];
    const destEntityId = DESTINATION_ENTITY_IDS[destinationId];
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Disney's finder API endpoint format:
    // /list-ancestor-entities/{site}/{destinationEntityId}/{date}/attractions
    const endpoint = parkId
      ? `/list-ancestor-entities/${destinationId}/${parkId};entityType=theme-park/${today}/attractions`
      : `/list-ancestor-entities/${destinationId}/${destEntityId}/${today}/attractions`;

    const response = await this.fetchWithAuth<DisneyApiResponse>(
      `${baseUrl}${endpoint}`,
      headers,
      destinationId
    );

    // Normalize Disney API response to our types
    return this.normalizeAttractions(response.results ?? [], destinationId);
  }

  private async fetchDiningFromDisney(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyDining[]> {
    const sessionManager = getSessionManager();
    const headers = await sessionManager.getAuthHeaders(destinationId);

    if (!headers.Cookie) {
      throw new ApiError("No valid session", 401, "dining");
    }

    const baseUrl = API_URLS[destinationId];
    const destEntityId = DESTINATION_ENTITY_IDS[destinationId];
    const today = new Date().toISOString().split("T")[0];

    // Disney's finder API endpoint format for dining
    const endpoint = parkId
      ? `/list-ancestor-entities/${destinationId}/${parkId};entityType=theme-park/${today}/dining`
      : `/list-ancestor-entities/${destinationId}/${destEntityId}/${today}/dining`;

    const response = await this.fetchWithAuth<DisneyApiResponse>(
      `${baseUrl}${endpoint}`,
      headers,
      destinationId
    );

    return this.normalizeDining(response.results ?? [], destinationId);
  }

  private async fetchEntertainmentFromDisney(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyShow[]> {
    const sessionManager = getSessionManager();
    const headers = await sessionManager.getAuthHeaders(destinationId);

    if (!headers.Cookie) {
      throw new ApiError("No valid session", 401, "entertainment");
    }

    const baseUrl = API_URLS[destinationId];
    const destEntityId = DESTINATION_ENTITY_IDS[destinationId];
    const today = new Date().toISOString().split("T")[0];

    // Disney's finder API endpoint for entertainment
    const endpoint = parkId
      ? `/list-ancestor-entities/${destinationId}/${parkId};entityType=theme-park/${today}/entertainment`
      : `/list-ancestor-entities/${destinationId}/${destEntityId}/${today}/entertainment`;

    const response = await this.fetchWithAuth<DisneyApiResponse>(
      `${baseUrl}${endpoint}`,
      headers,
      destinationId
    );

    return this.normalizeEntertainment(response.results ?? [], destinationId);
  }

  private async fetchShopsFromDisney(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyShop[]> {
    const sessionManager = getSessionManager();
    const headers = await sessionManager.getAuthHeaders(destinationId);

    if (!headers.Cookie) {
      throw new ApiError("No valid session", 401, "shops");
    }

    const baseUrl = API_URLS[destinationId];
    const destEntityId = DESTINATION_ENTITY_IDS[destinationId];
    const today = new Date().toISOString().split("T")[0];

    // Disney's finder API endpoint for shops
    const endpoint = parkId
      ? `/list-ancestor-entities/${destinationId}/${parkId};entityType=theme-park/${today}/shops`
      : `/list-ancestor-entities/${destinationId}/${destEntityId}/${today}/shops`;

    const response = await this.fetchWithAuth<DisneyApiResponse>(
      `${baseUrl}${endpoint}`,
      headers,
      destinationId
    );

    return this.normalizeShops(response.results ?? [], destinationId);
  }

  private async fetchEventsFromDisney(
    destinationId: DestinationId,
    parkId?: string
  ): Promise<DisneyEvent[]> {
    const sessionManager = getSessionManager();
    const headers = await sessionManager.getAuthHeaders(destinationId);

    if (!headers.Cookie) {
      throw new ApiError("No valid session", 401, "events");
    }

    const baseUrl = API_URLS[destinationId];
    const destEntityId = DESTINATION_ENTITY_IDS[destinationId];
    const today = new Date().toISOString().split("T")[0];

    // Disney's finder API endpoint for events and tours
    const endpoint = parkId
      ? `/list-ancestor-entities/${destinationId}/${parkId};entityType=theme-park/${today}/events-tours`
      : `/list-ancestor-entities/${destinationId}/${destEntityId}/${today}/events-tours`;

    const response = await this.fetchWithAuth<DisneyApiResponse>(
      `${baseUrl}${endpoint}`,
      headers,
      destinationId
    );

    return this.normalizeEvents(response.results ?? [], destinationId);
  }

  private async fetchWithAuth<T>(
    url: string,
    headers: Record<string, string>,
    destinationId: DestinationId
  ): Promise<T> {
    const sessionManager = getSessionManager();

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, this.timeoutMs);

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
            await sessionManager.reportError(destinationId, new Error(`HTTP ${response.status}`));
            throw new ApiError(`Disney API error: ${response.status}`, response.status, url);
          }

          await sessionManager.reportSuccess(destinationId);
          return (await response.json()) as T;
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        nonRetryableStatusCodes: [401, 403], // Don't retry auth failures
      }
    );
  }

  private normalizeAttractions(
    results: DisneyApiEntity[],
    destinationId: DestinationId
  ): DisneyAttraction[] {
    const parks = PARK_INFO[destinationId];
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return results.map((entity) => {
      // Extract park ID from parkIds array (format: "80007944;entityType=theme-park")
      const parkIdFull = entity.parkIds?.[0];
      const parkId = parkIdFull?.split(";")[0] ?? null;

      // Extract coordinates from marker if available
      const lat = entity.marker?.lat;
      const lng = entity.marker?.lng;

      // Parse height from facets (e.g., "44-inches-112-cm-or-taller")
      const heightFacet = entity.facets?.height?.[0];
      const heightRequirement = heightFacet ? this.parseHeightFromFacet(heightFacet) : null;

      // Parse thrill level from facets
      const parkInterests = entity.facets?.parkInterests ?? [];
      const thrillLevel = parkInterests.includes("thrill-rides-rec")
        ? ("thrill" as const)
        : parkInterests.includes("park-classics-rec")
          ? ("moderate" as const)
          : ("family" as const);

      // Check for Lightning Lane/Genie+ from facets
      const eaFacets = entity.facets?.eA ?? [];
      const hasLightningLane = eaFacets.length > 0;
      const isIndividualLL = eaFacets.includes("individual-lightning-lane");

      // Flatten all facet values into tags
      const tags: string[] = [];
      if (entity.facets) {
        for (const [, values] of Object.entries(entity.facets)) {
          if (Array.isArray(values)) {
            tags.push(...values);
          }
        }
      }

      return {
        id: entity.facilityId ?? entity.id.split(";")[0] ?? entity.id,
        name: entity.name,
        slug: entity.urlFriendlyId ?? this.slugify(entity.name),
        entityType: "ATTRACTION" as const,
        destinationId,
        parkId,
        parkName: entity.locationName ?? (parkId ? (parkMap.get(parkId) ?? null) : null),
        location: lat && lng ? { latitude: lat, longitude: lng } : null,
        url: entity.url ?? entity.webLinks?.wdwDetail?.href ?? null,
        heightRequirement,
        thrillLevel,
        experienceType: entity.facets?.interests?.[0] ?? null,
        duration: null, // Not in the API response
        lightningLane: hasLightningLane
          ? { tier: isIndividualLL ? "individual" : "multi-pass", available: true }
          : null,
        singleRider: tags.includes("single-rider"),
        riderSwap: tags.includes("rider-swap") || tags.includes("supervision-policy"),
        photopass: tags.includes("photopass-available"),
        virtualQueue: tags.includes("virtual-queue"),
        wheelchairAccessible: !entity.facets?.mobilityDisabilities?.includes(
          "must-transfer-from-wheelchair"
        ),
        tags,
      };
    });
  }

  private normalizeDining(
    results: DisneyApiEntity[],
    destinationId: DestinationId
  ): DisneyDining[] {
    const parks = PARK_INFO[destinationId];
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return results.map((entity) => {
      // Extract park ID from parkIds array
      const parkIdFull = entity.parkIds?.[0];
      const parkId = parkIdFull?.split(";")[0] ?? null;

      // Extract coordinates from marker
      const lat = entity.marker?.lat;
      const lng = entity.marker?.lng;

      // Parse dining-specific facets
      const diningExperience = entity.facets?.diningExperience ?? [];
      const cuisineFacets = entity.facets?.cuisine ?? [];
      const mealPeriodFacets = entity.facets?.mealPeriod ?? [];
      const priceFacet = entity.facets?.priceRange?.[0];

      // Flatten all facet values into tags
      const tags: string[] = [];
      if (entity.facets) {
        for (const [, values] of Object.entries(entity.facets)) {
          if (Array.isArray(values)) {
            tags.push(...values);
          }
        }
      }

      return {
        id: entity.facilityId ?? entity.id.split(";")[0] ?? entity.id,
        name: entity.name,
        slug: entity.urlFriendlyId ?? this.slugify(entity.name),
        entityType: "RESTAURANT" as const,
        destinationId,
        parkId,
        parkName: entity.locationName ?? (parkId ? (parkMap.get(parkId) ?? null) : null),
        location: lat && lng ? { latitude: lat, longitude: lng } : null,
        url: entity.url ?? entity.webLinks?.wdwDetail?.href ?? null,
        serviceType: this.parseServiceTypeFromFacet(diningExperience),
        mealPeriods: this.parseMealPeriodsFromFacets(mealPeriodFacets),
        cuisineTypes: cuisineFacets,
        priceRange: priceFacet ? this.parsePriceRange(priceFacet) : null,
        mobileOrder: tags.includes("mobile-order"),
        reservationsRequired: tags.includes("reservations-required"),
        reservationsAccepted:
          tags.includes("reservations-accepted") || tags.includes("reservations-required"),
        characterDining:
          tags.includes("character-dining") || diningExperience.includes("character-dining"),
        disneyDiningPlan: tags.includes("disney-dining-plan-participant"),
        tags,
      };
    });
  }

  /**
   * Normalize entertainment entities, filtering out rides.
   *
   * Disney's /entertainment endpoint returns rides alongside shows.
   * We filter to only return actual shows (rides should come from /attractions).
   */
  private normalizeEntertainment(
    results: DisneyApiEntity[],
    destinationId: DestinationId
  ): DisneyShow[] {
    const parks = PARK_INFO[destinationId];
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    // Filter out rides, keep only shows
    const showEntities = results.filter((entity) => !this.isRide(entity));
    logger.debug("Filtered entertainment results", {
      total: results.length,
      rides: results.length - showEntities.length,
      shows: showEntities.length,
    });

    return showEntities.map((entity) => {
      // Extract park ID from parkIds array
      const parkIdFull = entity.parkIds?.[0];
      const parkId = parkIdFull?.split(";")[0] ?? null;

      // Extract coordinates from marker
      const lat = entity.marker?.lat;
      const lng = entity.marker?.lng;

      // Flatten all facet values into tags
      const tags: string[] = [];
      if (entity.facets) {
        for (const [, values] of Object.entries(entity.facets)) {
          if (Array.isArray(values)) {
            tags.push(...values);
          }
        }
      }

      // Determine show type from facets or entity type
      const showType = this.parseShowType(entity, tags);

      return {
        id: entity.facilityId ?? entity.id.split(";")[0] ?? entity.id,
        name: entity.name,
        slug: entity.urlFriendlyId ?? this.slugify(entity.name),
        entityType: "SHOW" as const,
        destinationId,
        parkId,
        parkName: entity.locationName ?? (parkId ? (parkMap.get(parkId) ?? null) : null),
        location: lat && lng ? { latitude: lat, longitude: lng } : null,
        url: entity.url ?? entity.webLinks?.wdwDetail?.href ?? null,
        showType,
        duration: null, // Not typically in API response
        tags,
      };
    });
  }

  /**
   * Determine if an entity is a ride based on Disney API facets.
   *
   * Classification rules:
   * - RIDE if: thrillFactor exists, OR
   *   parkInterests contains 'thrill-rides-rec' or 'slow-rides-rec', OR
   *   height requirement exists (not 'any-height')
   *
   * - SHOW if: No thrillFactor, any-height, interests = 'indoor-attractions'
   *   without ride indicators, OR name contains show/theater/fireworks/parade
   */
  private isRide(entity: DisneyApiEntity): boolean {
    const facets = entity.facets ?? {};
    const parkInterests = facets.parkInterests ?? [];

    // Flatten all facet values into a single array for comprehensive checks
    const allFacetValues: string[] = [];
    for (const values of Object.values(facets)) {
      if (Array.isArray(values)) {
        allFacetValues.push(...values);
      }
    }

    // Check for explicit ride indicators in parkInterests
    const hasRideInterest =
      parkInterests.includes("thrill-rides-rec") || parkInterests.includes("slow-rides-rec");

    // Check for height requirement (pattern like "48-inches-122-cm-or-taller", but NOT "any-height")
    // Height may be in facets.height or elsewhere in facets
    const heightPattern = /\d+-inches-\d+-cm/;
    const hasHeightRequirement = allFacetValues.some(
      (v) => heightPattern.test(v) && v !== "any-height"
    );

    // Check for ride-specific tags/facets
    const hasThrillIndicators =
      allFacetValues.includes("thrill-rides") ||
      allFacetValues.includes("slow-rides") ||
      allFacetValues.includes("water-rides") ||
      allFacetValues.includes("big-drops") ||
      allFacetValues.includes("small-drops") ||
      allFacetValues.includes("spinning") ||
      allFacetValues.includes("dark");

    // It's a ride if any ride indicator is present
    return hasRideInterest || hasHeightRequirement || hasThrillIndicators;
  }

  private normalizeShops(results: DisneyApiEntity[], destinationId: DestinationId): DisneyShop[] {
    const parks = PARK_INFO[destinationId];
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return results.map((entity) => {
      // Extract park ID from parkIds array
      const parkIdFull = entity.parkIds?.[0];
      const parkId = parkIdFull?.split(";")[0] ?? null;

      // Extract coordinates from marker
      const lat = entity.marker?.lat;
      const lng = entity.marker?.lng;

      // Flatten all facet values into tags
      const tags: string[] = [];
      if (entity.facets) {
        for (const [, values] of Object.entries(entity.facets)) {
          if (Array.isArray(values)) {
            tags.push(...values);
          }
        }
      }

      // Determine shop type from facets
      const shopType = this.parseShopType(tags);

      return {
        id: entity.facilityId ?? entity.id.split(";")[0] ?? entity.id,
        name: entity.name,
        slug: entity.urlFriendlyId ?? this.slugify(entity.name),
        entityType: "SHOP" as const,
        destinationId,
        parkId,
        parkName: entity.locationName ?? (parkId ? (parkMap.get(parkId) ?? null) : null),
        location: lat && lng ? { latitude: lat, longitude: lng } : null,
        url: entity.url ?? entity.webLinks?.wdwDetail?.href ?? null,
        shopType,
        tags,
      };
    });
  }

  private normalizeEvents(results: DisneyApiEntity[], destinationId: DestinationId): DisneyEvent[] {
    const parks = PARK_INFO[destinationId];
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    return results.map((entity) => {
      // Extract park ID from parkIds array
      const parkIdFull = entity.parkIds?.[0];
      const parkId = parkIdFull?.split(";")[0] ?? null;

      // Extract coordinates from marker
      const lat = entity.marker?.lat;
      const lng = entity.marker?.lng;

      // Flatten all facet values into tags
      const tags: string[] = [];
      if (entity.facets) {
        for (const [, values] of Object.entries(entity.facets)) {
          if (Array.isArray(values)) {
            tags.push(...values);
          }
        }
      }

      // Determine event type from facets
      const eventType = this.parseEventType(entity, tags);

      return {
        id: entity.facilityId ?? entity.id.split(";")[0] ?? entity.id,
        name: entity.name,
        slug: entity.urlFriendlyId ?? this.slugify(entity.name),
        entityType: "EVENT" as const,
        destinationId,
        parkId,
        parkName: entity.locationName ?? (parkId ? (parkMap.get(parkId) ?? null) : null),
        location: lat && lng ? { latitude: lat, longitude: lng } : null,
        url: entity.url ?? entity.webLinks?.wdwDetail?.href ?? null,
        eventType,
        tags,
      };
    });
  }

  /**
   * Parse height requirement from facet string.
   * Format examples: "any-height", "44-inches-112-cm-or-taller", "40-inches-102-cm-or-taller"
   */
  private parseHeightFromFacet(facet: string): DisneyAttraction["heightRequirement"] {
    if (facet === "any-height") return null;

    // Match pattern like "44-inches-112-cm-or-taller"
    const match = /(\d+)-inches-(\d+)-cm/.exec(facet);
    if (match?.[1] && match[2]) {
      return {
        inches: parseInt(match[1], 10),
        centimeters: parseInt(match[2], 10),
        description: `${match[1]} inches (${match[2]} cm) or taller`,
      };
    }
    return null;
  }

  /**
   * Parse service type from dining experience facets.
   * Format examples: "table-service", "quick-service", "character-dining"
   */
  private parseServiceTypeFromFacet(facets: string[]): DisneyDining["serviceType"] {
    if (facets.includes("fine-signature-dining")) return "fine-signature-dining";
    if (facets.includes("character-dining")) return "character-dining";
    if (facets.includes("table-service")) return "table-service";
    if (facets.includes("quick-service")) return "quick-service";
    if (facets.includes("lounge")) return "lounge";
    return null;
  }

  /**
   * Parse meal periods from facet strings.
   * Format examples: "serves-breakfast", "serves-lunch", "serves-dinner"
   */
  private parseMealPeriodsFromFacets(facets: string[]): DisneyDining["mealPeriods"] {
    const periods: DisneyDining["mealPeriods"] = [];
    if (facets.some((f) => f.includes("breakfast"))) periods.push("breakfast");
    if (facets.some((f) => f.includes("lunch"))) periods.push("lunch");
    if (facets.some((f) => f.includes("dinner"))) periods.push("dinner");
    if (facets.some((f) => f.includes("snack"))) periods.push("snacks");
    return periods;
  }

  /**
   * Parse price range from facet string.
   * Format examples: "$", "$$", "$$$", "$$$$"
   */
  private parsePriceRange(facet: string): DisneyDining["priceRange"] {
    const dollarMatch = /^\$+$/.exec(facet);
    if (dollarMatch) {
      const symbol = dollarMatch[0] as "$" | "$$" | "$$$" | "$$$$";
      return {
        symbol,
        description: this.getPriceDescription(symbol),
      };
    }
    return null;
  }

  private getPriceDescription(symbol: "$" | "$$" | "$$$" | "$$$$"): string {
    switch (symbol) {
      case "$":
        return "Budget-friendly";
      case "$$":
        return "Moderate";
      case "$$$":
        return "Expensive";
      case "$$$$":
        return "Fine Dining";
      default:
        return symbol;
    }
  }

  /**
   * Parse show type from entity and facets.
   */
  private parseShowType(entity: DisneyApiEntity, tags: string[]): DisneyShow["showType"] {
    const name = entity.name.toLowerCase();

    // Check for fireworks
    if (
      name.includes("firework") ||
      name.includes("happily ever after") ||
      name.includes("harmonious") ||
      name.includes("luminous") ||
      tags.includes("nighttime-spectaculars")
    ) {
      return "fireworks";
    }

    // Check for parades
    if (name.includes("parade") || tags.includes("parades")) {
      return "parade";
    }

    // Check for character meets
    if (name.includes("meet") || name.includes("character") || tags.includes("meet-and-greets")) {
      return "character-meet";
    }

    // Check for stage shows
    if (
      name.includes("show") ||
      name.includes("musical") ||
      name.includes("concert") ||
      tags.includes("stage-shows")
    ) {
      return "stage-show";
    }

    return "other";
  }

  /**
   * Parse shop type from facets/tags.
   */
  private parseShopType(tags: string[]): DisneyShop["shopType"] {
    if (tags.includes("apparel-costumes") || tags.includes("apparel")) {
      return "apparel";
    }
    if (tags.includes("collectibles") || tags.includes("specialty")) {
      return "specialty";
    }
    if (tags.includes("gifts") || tags.includes("souvenirs")) {
      return "gifts";
    }
    if (tags.includes("toys") || tags.includes("merchandise")) {
      return "merchandise";
    }
    return "other";
  }

  /**
   * Parse event type from entity and facets.
   */
  private parseEventType(entity: DisneyApiEntity, tags: string[]): DisneyEvent["eventType"] {
    const name = entity.name.toLowerCase();

    // Check for tours
    if (name.includes("tour") || tags.includes("tours")) {
      return "tour";
    }

    // Check for seasonal events
    if (
      name.includes("holiday") ||
      name.includes("christmas") ||
      name.includes("halloween") ||
      tags.includes("seasonal")
    ) {
      return "seasonal";
    }

    // Check for extra/premium experiences
    if (
      name.includes("extra") ||
      name.includes("after hours") ||
      name.includes("dessert party") ||
      tags.includes("enchanting-extras")
    ) {
      return "extra";
    }

    // Check for special events
    if (name.includes("event") || name.includes("celebration") || tags.includes("special-events")) {
      return "special-event";
    }

    return "other";
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}

/** Raw entity from Disney Finder API */
interface DisneyApiEntity {
  id: string;
  name: string;
  urlFriendlyId?: string;
  url?: string;
  facilityId?: string;
  entityType?: string;
  locationName?: string;
  parkIds?: string[];
  landId?: string;
  siteId?: string;

  // Media and images
  media?: {
    finderStandardThumb?: {
      url: string;
      alt?: string;
    };
    mapBubbleThumbSmall?: {
      url: string;
      alt?: string;
    };
  };

  // Map marker with coordinates
  marker?: {
    lat?: number;
    lng?: number;
    name?: string;
  };

  // Web links
  webLinks?: {
    wdwDetail?: {
      href: string;
      title?: string;
    };
    dlrDetail?: {
      href: string;
      title?: string;
    };
  };

  // Facets object - contains arrays of strings for different categories
  facets?: {
    age?: string[];
    height?: string[];
    interests?: string[];
    parkInterests?: string[];
    eA?: string[]; // Lightning Lane / Genie+
    mobilityDisabilities?: string[];
    photoPassAvailable?: string[];
    serviceAnimals?: string[];
    physicalConsiderations?: string[];
    // Dining facets
    diningExperience?: string[];
    cuisine?: string[];
    mealPeriod?: string[];
    priceRange?: string[];
    [key: string]: string[] | undefined;
  };

  // Descriptions (can have multiple types)
  descriptions?: Record<string, string>;

  // Facets label (human-readable summary)
  facetsLabel?: string;

  // Legacy fields for backward compatibility
  ancestorThemeParkId?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  links?: {
    self?: string;
  };
}

interface DisneyApiResponse {
  results?: DisneyApiEntity[];
}

// Singleton instance
let instance: DisneyFinderClient | null = null;

export function getDisneyFinderClient(): DisneyFinderClient {
  instance ??= new DisneyFinderClient();
  return instance;
}
