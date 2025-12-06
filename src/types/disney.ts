/**
 * Disney Parks Entity Types
 *
 * Normalized data structures for Disney park entities.
 * Focus on static metadata (no live wait times or operational status).
 */

/** Supported destination identifiers (Phase 1: WDW and DLR only) */
export type DestinationId = "wdw" | "dlr";

/** Entity type classification */
export type EntityType =
  | "DESTINATION"
  | "PARK"
  | "ATTRACTION"
  | "RESTAURANT"
  | "SHOW"
  | "SHOP"
  | "EVENT"
  | "HOTEL";

/** Service type for dining locations */
export type DiningServiceType =
  | "table-service"
  | "quick-service"
  | "character-dining"
  | "fine-signature-dining"
  | "lounge"
  | "food-cart";

/** Meal periods available at dining locations */
export type MealPeriod = "breakfast" | "lunch" | "dinner" | "snacks";

/** Lightning Lane tier classification */
export type LightningLaneTier = "individual" | "multi-pass" | "none";

/** Thrill level classification */
export type ThrillLevel = "family" | "moderate" | "thrill";

/** Geographic coordinates */
export interface GeoLocation {
  readonly latitude: number;
  readonly longitude: number;
}

/** Park reference (lightweight) */
export interface ParkRef {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
}

/** Destination reference (lightweight) */
export interface DestinationRef {
  readonly id: DestinationId;
  readonly name: string;
}

/** Base entity with common fields */
export interface DisneyEntity {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly entityType: EntityType;
  readonly destinationId: DestinationId;
  readonly parkId: string | null;
  readonly parkName: string | null;
  readonly location: GeoLocation | null;
  readonly url: string | null;
}

/** Destination (resort) containing parks */
export interface DisneyDestination {
  readonly id: DestinationId;
  readonly name: string;
  readonly location: string;
  readonly timezone: string;
  readonly parks: ParkRef[];
  readonly otherVenues: ParkRef[];
}

/** Height requirement specification */
export interface HeightRequirement {
  readonly inches: number;
  readonly centimeters: number;
  readonly description: string;
}

/** Lightning Lane availability info */
export interface LightningLaneInfo {
  readonly tier: LightningLaneTier;
  readonly available: boolean;
}

/** Attraction with ride metadata */
export interface DisneyAttraction extends DisneyEntity {
  readonly entityType: "ATTRACTION";
  readonly heightRequirement: HeightRequirement | null;
  readonly thrillLevel: ThrillLevel | null;
  readonly experienceType: string | null;
  readonly duration: string | null;
  readonly lightningLane: LightningLaneInfo | null;
  readonly singleRider: boolean;
  readonly riderSwap: boolean;
  readonly photopass: boolean;
  readonly virtualQueue: boolean;
  readonly wheelchairAccessible: boolean;
  readonly tags: string[];
}

/** Price range indicator */
export interface PriceRange {
  readonly symbol: "$" | "$$" | "$$$" | "$$$$";
  readonly description: string;
}

/** Dining location with service details */
export interface DisneyDining extends DisneyEntity {
  readonly entityType: "RESTAURANT";
  readonly serviceType: DiningServiceType | null;
  readonly mealPeriods: MealPeriod[];
  readonly cuisineTypes: string[];
  readonly priceRange: PriceRange | null;
  readonly mobileOrder: boolean;
  readonly reservationsRequired: boolean;
  readonly reservationsAccepted: boolean;
  readonly characterDining: boolean;
  readonly disneyDiningPlan: boolean;
  readonly tags: string[];
}

/** Show/entertainment entity */
export interface DisneyShow extends DisneyEntity {
  readonly entityType: "SHOW";
  readonly showType: "fireworks" | "parade" | "stage-show" | "character-meet" | "other";
  readonly duration: string | null;
  readonly tags: string[];
}

/** Shop/merchandise location entity */
export interface DisneyShop extends DisneyEntity {
  readonly entityType: "SHOP";
  readonly shopType: "merchandise" | "apparel" | "gifts" | "specialty" | "other";
  readonly tags: string[];
}

/** Event/tour entity */
export interface DisneyEvent extends DisneyEntity {
  readonly entityType: "EVENT";
  readonly eventType: "special-event" | "tour" | "extra" | "seasonal" | "other";
  readonly tags: string[];
}

/** Hotel tier classification */
export type HotelTier = "value" | "moderate" | "deluxe" | "deluxe-villa" | "other";

/**
 * Hotel/resort entity.
 * Note: Only available via Disney API (not ThemeParks.wiki fallback).
 */
export interface DisneyHotel extends DisneyEntity {
  readonly entityType: "HOTEL";
  readonly tier: HotelTier | null;
  readonly area: string | null;
  readonly transportation: string[];
  readonly amenities: string[];
  readonly tags: string[];
}

/** API response wrapper for tool results */
export interface ToolResponse<T> {
  readonly data: T;
  readonly cacheInfo: {
    readonly cachedAt: string;
    readonly expiresAt: string;
    readonly source: "disney" | "themeparks-wiki";
  };
}

/** Search result with relevance score */
export interface SearchResult<T extends DisneyEntity> {
  readonly entity: T;
  readonly score: number;
}
