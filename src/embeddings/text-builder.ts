/**
 * Embedding Text Builder
 *
 * Combines entity fields into optimized text for embedding generation.
 * Optionally uses E5-style prefixes for query-document asymmetry (configurable).
 */

import { createHash } from "node:crypto";
import type {
  DisneyEntity,
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DisneyShop,
  DisneyEvent,
  DisneyHotel,
} from "../types/index.js";
import { getConfig } from "../config/index.js";

/**
 * Document prefix for E5-style query-document asymmetry.
 * Documents get this prefix when embedded for storage.
 * This improves retrieval quality for models trained with such prefixes.
 */
export const DOCUMENT_PREFIX = "passage: ";

/**
 * Query prefix for E5-style query-document asymmetry.
 * Queries get this prefix when embedded for search.
 */
export const QUERY_PREFIX = "query: ";

/**
 * Build embedding text from an entity (for document storage).
 * Combines relevant fields into a semantic representation.
 * Optionally adds document prefix for E5-style asymmetric search (when enabled in config).
 */
export function buildEmbeddingText(entity: DisneyEntity): string {
  const parts: string[] = [];

  // Always include name (primary identifier)
  parts.push(entity.name);

  // Add entity type context
  parts.push(formatEntityType(entity.entityType));

  // Add location context
  if (entity.parkName) {
    parts.push(`at ${entity.parkName}`);
  }

  // Add type-specific fields
  switch (entity.entityType) {
    case "ATTRACTION":
      parts.push(...buildAttractionText(entity as DisneyAttraction));
      break;
    case "RESTAURANT":
      parts.push(...buildDiningText(entity as DisneyDining));
      break;
    case "SHOW":
      parts.push(...buildShowText(entity as DisneyShow));
      break;
    case "HOTEL":
      parts.push(...buildHotelText(entity as DisneyHotel));
      break;
    case "SHOP":
      parts.push(...buildShopText(entity as DisneyShop));
      break;
    case "EVENT":
      parts.push(...buildEventText(entity as DisneyEvent));
      break;
    case "DESTINATION":
    case "PARK":
      // These entity types use only base fields (name, parkName)
      break;
  }

  const text = parts.filter(Boolean).join(". ");

  // Optionally add E5-style document prefix (for models trained with asymmetric prefixes)
  const config = getConfig();
  return config.useE5Prefixes ? DOCUMENT_PREFIX + text : text;
}

/**
 * Format a query string with optional E5-style prefix.
 * Use this when embedding search queries.
 * Prefix is only added when useE5Prefixes is enabled in config.
 */
export function formatQueryText(query: string): string {
  const config = getConfig();
  return config.useE5Prefixes ? QUERY_PREFIX + query : query;
}

function formatEntityType(type: string): string {
  const typeMap: Record<string, string> = {
    ATTRACTION: "ride attraction",
    RESTAURANT: "dining restaurant",
    SHOW: "entertainment show",
    PARK: "theme park",
    HOTEL: "resort hotel",
    DESTINATION: "vacation destination",
  };
  return typeMap[type] ?? type.toLowerCase();
}

/** Tags that add noise without semantic value */
const NOISE_TAGS = new Set([
  "FinderPCAttractions",
  "FinderMobileAttractions",
  "FinderPCDining",
  "FinderMobileDining",
  "FinderPCEntertainment",
  "FinderMobileEntertainment",
  "RatingsReviewsAttractions",
  "RatingsReviewsDining",
  "mobile-playapp-enabled",
  "play-disney-parks",
  "flex-rec",
]);

/** Tags that should be expanded to natural language */
const TAG_EXPANSIONS: Record<string, string> = {
  "thrill-rides": "thrilling exciting high speed adrenaline",
  "thrill-rides-rec": "thrilling exciting high speed adrenaline",
  "slow-rides": "gentle relaxed calm leisurely scenic",
  "slow-rides-rec": "gentle relaxed calm leisurely scenic",
  "big-drops": "big drops falling plunging steep descent",
  "small-drops": "small drops mild descent",
  dark: "dark ride indoor darkness",
  spinning: "spinning rotating twisting",
  "water-rides": "water ride splash wet getting wet",
  "indoor-attractions": "indoor air conditioned covered",
  "outdoor-attractions": "outdoor outside",
  "disney-classics": "classic nostalgic iconic legendary",
  "park-classics-rec": "classic nostalgic iconic",
  "experiences-for-little-ones-rec": "toddler friendly young children gentle",
  "character-meet": "meet character photo opportunity autograph",
  "character-dining": "dining with characters meet characters during meal",
};

function buildAttractionText(attr: DisneyAttraction): string[] {
  const parts: string[] = [];

  // Experience type is very semantically relevant
  if (attr.experienceType) {
    parts.push(attr.experienceType);
  }

  // Thrill level with stronger semantic signals
  if (attr.thrillLevel === "thrill") {
    parts.push("thrilling exciting high intensity adrenaline rush");
  } else if (attr.thrillLevel === "moderate") {
    parts.push("moderate intensity some thrills");
  } else if (attr.thrillLevel === "family") {
    parts.push("family friendly gentle all ages");
  }

  // Height requirement with semantic context
  if (attr.heightRequirement) {
    const inches = attr.heightRequirement.inches;
    parts.push(`height requirement ${inches} inches`);
    if (inches >= 48) {
      parts.push("tall riders older children teens adults");
    } else if (inches >= 40) {
      parts.push("medium height requirement school age");
    }
  } else {
    parts.push("no height requirement any height");
  }

  // Process tags: filter noise and expand semantic meaning
  const semanticTags: string[] = [];
  for (const tag of attr.tags) {
    if (NOISE_TAGS.has(tag)) continue;
    if (tag.includes("-inches-")) continue; // Height duplicates

    const expansion = TAG_EXPANSIONS[tag];
    if (expansion) {
      semanticTags.push(expansion);
    } else if (!tag.includes("-rec") && !/^[a-z]+-[a-z]+-[a-z]+$/.exec(tag)) {
      // Keep simple tags, filter complex internal ones
      semanticTags.push(tag.replace(/-/g, " "));
    }
  }

  if (semanticTags.length > 0) {
    parts.push(semanticTags.join(". "));
  }

  // Accessibility features
  if (attr.singleRider) parts.push("single rider line available shorter wait");
  if (attr.virtualQueue) parts.push("virtual queue available");
  if (attr.lightningLane?.available) {
    parts.push(`Lightning Lane ${attr.lightningLane.tier} skip the line`);
  }

  return parts;
}

function buildDiningText(dining: DisneyDining): string[] {
  const parts: string[] = [];

  // Service type is primary categorization
  if (dining.serviceType) {
    parts.push(formatServiceType(dining.serviceType));
  }

  // Cuisine types are highly semantic
  if (dining.cuisineTypes.length > 0) {
    parts.push(dining.cuisineTypes.join(", "));
  }

  // Meal periods
  if (dining.mealPeriods.length > 0) {
    parts.push(`serves ${dining.mealPeriods.join(", ")}`);
  }

  // Price context
  if (dining.priceRange) {
    const priceDescriptions: Record<string, string> = {
      $: "budget friendly",
      $$: "moderate price",
      $$$: "upscale",
      $$$$: "fine dining expensive",
    };
    parts.push(priceDescriptions[dining.priceRange.symbol] ?? "");
  }

  // Special features
  if (dining.characterDining) parts.push("character dining experience");
  if (dining.mobileOrder) parts.push("mobile order available");
  if (dining.reservationsRequired) parts.push("reservations required");

  // Tags
  if (dining.tags.length > 0) {
    parts.push(dining.tags.join(", "));
  }

  return parts;
}

function formatServiceType(type: string): string {
  const typeMap: Record<string, string> = {
    "table-service": "table service restaurant sit down",
    "quick-service": "quick service counter service fast food",
    "character-dining": "character dining experience meet characters",
    "fine-signature-dining": "fine dining signature restaurant upscale",
    lounge: "lounge bar drinks",
    "food-cart": "food cart snack stand",
  };
  return typeMap[type] ?? type;
}

function buildShowText(show: DisneyShow): string[] {
  const parts: string[] = [];

  if (show.showType) {
    const typeMap: Record<string, string> = {
      fireworks: "fireworks nighttime spectacular",
      parade: "parade procession",
      "stage-show": "live stage show performance",
      "character-meet": "character meet and greet",
      other: "entertainment",
    };
    parts.push(typeMap[show.showType] ?? show.showType);
  }

  if (show.duration) {
    parts.push(`${show.duration} duration`);
  }

  if (show.tags.length > 0) {
    parts.push(show.tags.join(", "));
  }

  return parts;
}

function buildShopText(shop: DisneyShop): string[] {
  const parts: string[] = [];

  if (shop.shopType) {
    const typeMap: Record<string, string> = {
      merchandise: "merchandise shopping",
      apparel: "apparel clothing fashion",
      gifts: "gifts souvenirs",
      specialty: "specialty unique items",
      other: "shop store",
    };
    parts.push(typeMap[shop.shopType] ?? shop.shopType);
  }

  if (shop.tags.length > 0) {
    parts.push(shop.tags.join(", "));
  }

  return parts;
}

function buildEventText(event: DisneyEvent): string[] {
  const parts: string[] = [];

  if (event.eventType) {
    const typeMap: Record<string, string> = {
      "special-event": "special event limited time",
      tour: "guided tour experience",
      extra: "extra magic special access",
      seasonal: "seasonal holiday celebration",
      other: "event experience",
    };
    parts.push(typeMap[event.eventType] ?? event.eventType);
  }

  if (event.tags.length > 0) {
    parts.push(event.tags.join(", "));
  }

  return parts;
}

function buildHotelText(hotel: DisneyHotel): string[] {
  const parts: string[] = [];

  // Tier is primary categorization
  if (hotel.tier) {
    const tierMap: Record<string, string> = {
      value: "value resort budget friendly affordable",
      moderate: "moderate resort mid-range",
      deluxe: "deluxe resort luxury upscale",
      "deluxe-villa": "deluxe villa resort luxury DVC",
      other: "resort accommodation",
    };
    parts.push(tierMap[hotel.tier] ?? hotel.tier);
  }

  // Area context
  if (hotel.area) {
    parts.push(`located in ${hotel.area}`);
  }

  // Transportation options
  if (hotel.transportation.length > 0) {
    parts.push(`transportation: ${hotel.transportation.join(", ")}`);
  }

  // Amenities
  if (hotel.amenities.length > 0) {
    parts.push(hotel.amenities.join(", "));
  }

  // Tags
  if (hotel.tags.length > 0) {
    parts.push(hotel.tags.join(", "));
  }

  return parts;
}

/**
 * Generate a hash of the embedding input text.
 * Used to detect when entities change and need re-embedding.
 */
export function hashEmbeddingText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
