/**
 * Configuration
 *
 * Environment-based configuration with validation.
 * All environment variables are prefixed with MOUSE_MCP_.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type EmbeddingProviderType = "openai" | "transformers" | "auto";

export type TransportMode = "stdio" | "http";

export interface Config {
  readonly nodeEnv: "development" | "production" | "test";
  readonly logLevel: LogLevel;
  readonly dbPath: string;
  readonly refreshBufferMinutes: number;
  readonly timeoutMs: number;
  /** Show browser window during Playwright sessions (useful for debugging) */
  readonly showBrowser: boolean;
  /** Embedding provider selection */
  readonly embeddingProvider: EmbeddingProviderType;
  /** OpenAI API key for embeddings (optional) */
  readonly openaiApiKey: string | undefined;
  /** Transport mode: stdio (default) or http */
  readonly transport: TransportMode;
  /** HTTP server port (only used when transport=http) */
  readonly httpPort: number;
  /** HTTP server host (only used when transport=http) */
  readonly httpHost: string;
}

let cachedConfig: Config | null = null;

/**
 * Get application configuration.
 * Configuration is cached after first load.
 */
export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const nodeEnv = (process.env.NODE_ENV ?? "development") as Config["nodeEnv"];

  // Default database path: .data/disney.db (project-local)
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const defaultDbPath = join(projectRoot, ".data", "disney.db");

  cachedConfig = {
    nodeEnv,
    logLevel: parseLogLevel(process.env.MOUSE_MCP_LOG_LEVEL, nodeEnv),
    dbPath: process.env.MOUSE_MCP_DB_PATH ?? defaultDbPath,
    // Daily refresh - check once per day
    refreshBufferMinutes: parseInt(process.env.MOUSE_MCP_REFRESH_BUFFER ?? "60", 10),
    timeoutMs: parseInt(process.env.MOUSE_MCP_TIMEOUT ?? "30000", 10),
    showBrowser: process.env.MOUSE_MCP_SHOW_BROWSER === "true",
    // Embedding configuration
    embeddingProvider: parseEmbeddingProvider(process.env.MOUSE_MCP_EMBEDDING_PROVIDER),
    openaiApiKey: process.env.OPENAI_API_KEY,
    // Transport configuration
    transport: parseTransportMode(process.env.MOUSE_MCP_TRANSPORT),
    httpPort: parseInt(process.env.MOUSE_MCP_PORT ?? "3000", 10),
    httpHost: process.env.MOUSE_MCP_HOST ?? "127.0.0.1",
  };

  return cachedConfig;
}

/**
 * Parse log level from environment, with sensible defaults.
 */
function parseLogLevel(value: string | undefined, nodeEnv: string): LogLevel {
  if (value) {
    const upper = value.toUpperCase();
    if (isLogLevel(upper)) {
      return upper;
    }
  }

  // Default: DEBUG in development, INFO in production
  return nodeEnv === "production" ? "INFO" : "DEBUG";
}

function isLogLevel(value: string): value is LogLevel {
  return ["DEBUG", "INFO", "WARN", "ERROR"].includes(value);
}

/**
 * Parse embedding provider from environment.
 */
function parseEmbeddingProvider(value: string | undefined): EmbeddingProviderType {
  if (value) {
    const lower = value.toLowerCase();
    if (lower === "openai" || lower === "transformers" || lower === "auto") {
      return lower;
    }
  }
  return "auto";
}

/**
 * Parse transport mode from environment.
 */
function parseTransportMode(value: string | undefined): TransportMode {
  if (value?.toLowerCase() === "http") {
    return "http";
  }
  return "stdio"; // Default for backwards compatibility
}

/**
 * Reset config cache (useful for testing).
 */
export function resetConfig(): void {
  cachedConfig = null;
}
