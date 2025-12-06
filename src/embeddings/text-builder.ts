/**
 * Embedding Text Builder
 *
 * Combines entity fields into optimized text for embedding generation.
 */

import { createHash } from "node:crypto";
import type {
  DisneyEntity,
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DisneyHotel,
} from "../types/index.js";

/**
 * Build embedding text from an entity.
 * Combines relevant fields into a semantic representation.
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
  }

  return parts.filter(Boolean).join(". ");
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

function buildAttractionText(attr: DisneyAttraction): string[] {
  const parts: string[] = [];

  // Experience type is very semantically relevant
  if (attr.experienceType) {
    parts.push(attr.experienceType);
  }

  // Thrill level helps distinguish ride types
  if (attr.thrillLevel) {
    parts.push(`${attr.thrillLevel} thrill level`);
  }

  // Height requirement context
  if (attr.heightRequirement) {
    parts.push(`height requirement ${attr.heightRequirement.inches} inches`);
  }

  // Tags contain rich categorical info
  if (attr.tags.length > 0) {
    parts.push(attr.tags.join(", "));
  }

  // Accessibility features
  if (attr.singleRider) parts.push("single rider available");
  if (attr.virtualQueue) parts.push("virtual queue");
  if (attr.lightningLane?.available) {
    parts.push(`Lightning Lane ${attr.lightningLane.tier}`);
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
