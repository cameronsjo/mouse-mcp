/**
 * JWKS Client
 *
 * Fetches and caches JSON Web Key Sets from authorization servers.
 * Used for local JWT signature validation.
 *
 * WHY: Local JWT validation is faster than token introspection (no network call).
 * JWKS caching reduces latency and handles AS unavailability gracefully.
 */

import { createLogger, type LogContext } from "../shared/logger.js";
import type { JWKSResponse, JSONWebKey } from "./types.js";

const logger = createLogger("JWKSClient");

/** Default cache TTL: 10 minutes */
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

/** Maximum cache TTL: 1 hour */
const MAX_CACHE_TTL_MS = 60 * 60 * 1000;

/** Fetch timeout: 10 seconds */
const FETCH_TIMEOUT_MS = 10_000;

interface CachedJWKS {
  readonly keys: Map<string, JSONWebKey>;
  readonly fetchedAt: number;
  readonly expiresAt: number;
}

/**
 * JWKS client with caching.
 *
 * Fetches JWKS from authorization server and caches keys by kid.
 * Automatically refreshes cache when expired or on cache miss.
 */
export class JWKSClient {
  private readonly jwksUri: string;
  private cache: CachedJWKS | null = null;
  private readonly cacheTtlMs: number;

  constructor(jwksUri: string, options?: { cacheTtlMs?: number }) {
    this.jwksUri = jwksUri;
    this.cacheTtlMs = Math.min(options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS, MAX_CACHE_TTL_MS);
  }

  /**
   * Get a key by kid.
   *
   * Fetches JWKS if cache is empty or expired.
   * On cache miss for specific kid, forces refresh once.
   */
  async getKey(kid: string): Promise<JSONWebKey | null> {
    // Check cache first
    if (this.cache && Date.now() < this.cache.expiresAt) {
      const key = this.cache.keys.get(kid);
      if (key) {
        logger.debug("JWKS cache hit", { kid } as LogContext);
        return key;
      }
    }

    // Cache miss or expired - fetch fresh JWKS
    await this.refresh();

    return this.cache?.keys.get(kid) ?? null;
  }

  /**
   * Get all cached keys.
   */
  async getAllKeys(): Promise<readonly JSONWebKey[]> {
    if (!this.cache || Date.now() >= this.cache.expiresAt) {
      await this.refresh();
    }
    return this.cache ? Array.from(this.cache.keys.values()) : [];
  }

  /**
   * Force refresh the JWKS cache.
   */
  async refresh(): Promise<void> {
    logger.debug("Fetching JWKS", { uri: this.jwksUri } as LogContext);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, FETCH_TIMEOUT_MS);

      const response = await fetch(this.jwksUri, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
      }

      const jwks = (await response.json()) as JWKSResponse;

      if (jwks.keys === undefined || !Array.isArray(jwks.keys)) {
        throw new Error("Invalid JWKS response: missing keys array");
      }

      // Build key map indexed by kid
      const keys = new Map<string, JSONWebKey>();
      for (const key of jwks.keys) {
        if (key.kid !== undefined) {
          keys.set(key.kid, key);
        }
      }

      const now = Date.now();
      this.cache = {
        keys,
        fetchedAt: now,
        expiresAt: now + this.cacheTtlMs,
      };

      logger.info("JWKS cache refreshed", {
        keyCount: keys.size,
        ttlMs: this.cacheTtlMs,
      } as LogContext);
    } catch (error) {
      logger.error("JWKS fetch failed", error, { uri: this.jwksUri } as LogContext);
      throw error;
    }
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this.cache = null;
    logger.debug("JWKS cache cleared");
  }

  /**
   * Check if cache is valid.
   */
  isCacheValid(): boolean {
    return this.cache !== null && Date.now() < this.cache.expiresAt;
  }
}

/** Singleton JWKS client instances by URI */
const clients = new Map<string, JWKSClient>();

/**
 * Get or create a JWKS client for the given URI.
 */
export function getJWKSClient(jwksUri: string): JWKSClient {
  let client = clients.get(jwksUri);
  if (!client) {
    client = new JWKSClient(jwksUri);
    clients.set(jwksUri, client);
  }
  return client;
}

/**
 * Clear all JWKS client caches.
 */
export function clearAllJWKSCaches(): void {
  for (const client of clients.values()) {
    client.clearCache();
  }
  clients.clear();
}
