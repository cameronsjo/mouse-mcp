/**
 * Destination Resources
 *
 * MCP resources for Disney destinations (WDW, DLR).
 */

import { getDisneyFinderClient } from "../clients/index.js";
import type { DestinationId, DisneyDestination } from "../types/index.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("DestinationResources");

/**
 * Get all destinations.
 */
export async function getAllDestinations(): Promise<DisneyDestination[]> {
  logger.debug("Fetching all destinations");
  const client = getDisneyFinderClient();
  return client.getDestinations();
}

/**
 * Get a specific destination by ID.
 */
export async function getDestinationById(id: string): Promise<DisneyDestination | null> {
  if (id !== "wdw" && id !== "dlr") {
    logger.warn("Invalid destination ID requested", { id });
    return null;
  }

  logger.debug("Fetching destination by ID", { id });
  const client = getDisneyFinderClient();
  const destinations = await client.getDestinations();

  return destinations.find((d) => d.id === id) ?? null;
}

/**
 * Get attractions for a destination.
 */
export async function getDestinationAttractions(destinationId: DestinationId): Promise<unknown> {
  logger.debug("Fetching attractions for destination", { destinationId });
  const client = getDisneyFinderClient();
  return client.getAttractions(destinationId);
}

/**
 * Get dining locations for a destination.
 */
export async function getDestinationDining(destinationId: DestinationId): Promise<unknown> {
  logger.debug("Fetching dining for destination", { destinationId });
  const client = getDisneyFinderClient();
  return client.getDining(destinationId);
}
