/**
 * Resource Registry
 *
 * MCP resource handlers for Disney data exposure.
 */

import type { Resource, TextResourceContents } from "@modelcontextprotocol/sdk/types.js";
import {
  getAllDestinations,
  getDestinationById,
  getDestinationAttractions,
  getDestinationDining,
} from "./destinations.js";
import { getAttractionById } from "./attractions.js";
import { getDiningById } from "./dining.js";
import { createLogger } from "../shared/logger.js";
import type { DestinationId } from "../types/index.js";

const logger = createLogger("Resources");

/**
 * List all available resources.
 */
export async function listResources(): Promise<Resource[]> {
  logger.debug("Listing resources");

  return [
    {
      uri: "disney://destinations",
      name: "All Destinations",
      description: "List of all Disney destinations (WDW, DLR)",
      mimeType: "application/json",
    },
    {
      uri: "disney://destination/wdw",
      name: "Walt Disney World Resort",
      description: "Walt Disney World Resort information",
      mimeType: "application/json",
    },
    {
      uri: "disney://destination/dlr",
      name: "Disneyland Resort",
      description: "Disneyland Resort information",
      mimeType: "application/json",
    },
    {
      uri: "disney://destination/wdw/attractions",
      name: "WDW Attractions",
      description: "All attractions at Walt Disney World Resort",
      mimeType: "application/json",
    },
    {
      uri: "disney://destination/dlr/attractions",
      name: "DLR Attractions",
      description: "All attractions at Disneyland Resort",
      mimeType: "application/json",
    },
    {
      uri: "disney://destination/wdw/dining",
      name: "WDW Dining",
      description: "All dining locations at Walt Disney World Resort",
      mimeType: "application/json",
    },
    {
      uri: "disney://destination/dlr/dining",
      name: "DLR Dining",
      description: "All dining locations at Disneyland Resort",
      mimeType: "application/json",
    },
  ];
}

/**
 * Read a specific resource by URI.
 */
export async function readResource(uri: string): Promise<TextResourceContents[]> {
  logger.debug("Reading resource", { uri });

  // Parse URI - expect format: disney://path/to/resource
  if (!uri.startsWith("disney://")) {
    throw new Error(`Unsupported protocol: ${uri}`);
  }

  // Extract path from URI
  const pathname = uri.substring("disney://".length);
  const parts = pathname.split("/").filter((p) => p.length > 0);

  // Handle different URI patterns
  if (pathname === "destinations") {
    // disney://destinations - all destinations
    const destinations = await getAllDestinations();
    return [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(destinations, null, 2),
      },
    ];
  }

  if (parts.length === 0) {
    throw new Error(`Empty resource URI: ${uri}`);
  }

  if (parts[0] === "destination" && parts.length === 2) {
    // disney://destination/{id} - specific destination
    const destinationId = parts[1] ?? "";
    const destination = await getDestinationById(destinationId);

    if (!destination) {
      throw new Error(`Destination not found: ${destinationId}`);
    }

    return [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(destination, null, 2),
      },
    ];
  }

  if (parts[0] === "destination" && parts.length === 3 && parts[2] === "attractions") {
    // disney://destination/{id}/attractions - attractions for destination
    const rawDestinationId = parts[1] ?? "";

    if (rawDestinationId !== "wdw" && rawDestinationId !== "dlr") {
      throw new Error(`Invalid destination: ${rawDestinationId}`);
    }

    const destinationId = rawDestinationId as DestinationId;
    const attractions = await getDestinationAttractions(destinationId);

    return [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(attractions, null, 2),
      },
    ];
  }

  if (parts[0] === "destination" && parts.length === 3 && parts[2] === "dining") {
    // disney://destination/{id}/dining - dining for destination
    const rawDestinationId = parts[1] ?? "";

    if (rawDestinationId !== "wdw" && rawDestinationId !== "dlr") {
      throw new Error(`Invalid destination: ${rawDestinationId}`);
    }

    const destinationId = rawDestinationId as DestinationId;
    const dining = await getDestinationDining(destinationId);

    return [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(dining, null, 2),
      },
    ];
  }

  if (parts[0] === "attraction" && parts.length === 2) {
    // disney://attraction/{entityId} - specific attraction
    const entityId = parts[1] ?? "";
    const attraction = await getAttractionById(entityId);

    if (!attraction) {
      throw new Error(`Attraction not found: ${entityId}`);
    }

    return [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(attraction, null, 2),
      },
    ];
  }

  if (parts[0] === "dining" && parts.length === 2) {
    // disney://dining/{entityId} - specific dining location
    const entityId = parts[1] ?? "";
    const dining = await getDiningById(entityId);

    if (!dining) {
      throw new Error(`Dining location not found: ${entityId}`);
    }

    return [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(dining, null, 2),
      },
    ];
  }

  throw new Error(`Unknown resource URI pattern: ${uri}`);
}
