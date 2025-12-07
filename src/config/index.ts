/**
 * Configuration
 *
 * Environment-based configuration with validation.
 * All environment variables are prefixed with MOUSE_MCP_.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateOpenAIKeyIfProvided } from "./validation.js";
import { DEFAULT_SESSION_REFRESH_BUFFER_MINUTES, BROWSER_TIMEOUT_MS } from "../shared/constants.js";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type EmbeddingProviderType = "openai" | "transformers" | "auto";

export type BrowserBackendType = "playwright" | "lightpanda" | "auto";

export interface ObservabilityConfig {
  /** Sentry DSN for error tracking and performance monitoring */
  readonly sentryDsn: string | undefined;
  /** Sample rate for traces (0.0 to 1.0) */
  readonly sentryTracesSampleRate: number;
  /** Sample rate for profiling (0.0 to 1.0) */
  readonly sentryProfilesSampleRate: number;
  /** Enable Sentry debug logging */
  readonly sentryDebug: boolean;
  /** OTLP exporter endpoint for additional trace export */
  readonly otelExporterEndpoint: string | undefined;
}

export interface Config {
  readonly nodeEnv: "development" | "production" | "test";
  readonly logLevel: LogLevel;
  readonly dbPath: string;
  readonly refreshBufferMinutes: number;
  readonly timeoutMs: number;
  /** Show browser window during Playwright sessions (useful for debugging) */
  readonly showBrowser: boolean;
  /** Browser backend selection */
  readonly browserBackend: BrowserBackendType;
  /** CDP endpoint for Lightpanda (default: http://127.0.0.1:9222) */
  readonly cdpEndpoint: string;
  /** Embedding provider selection */
  readonly embeddingProvider: EmbeddingProviderType;
  /** OpenAI API key for embeddings (optional) */
  readonly openaiApiKey: string | undefined;
  /** Observability configuration (Sentry + OTEL) */
  readonly observability: ObservabilityConfig;
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

  // Validate OpenAI API key if provided
  // WHY: Fail fast with clear error message if key format is invalid
  const openaiApiKey = process.env.OPENAI_API_KEY;
  try {
    validateOpenAIKeyIfProvided(openaiApiKey);
  } catch (error) {
    // Re-throw with additional context
    throw new Error(
      `Invalid OPENAI_API_KEY environment variable: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  cachedConfig = {
    nodeEnv,
    logLevel: parseLogLevel(process.env.MOUSE_MCP_LOG_LEVEL, nodeEnv),
    dbPath: process.env.MOUSE_MCP_DB_PATH ?? defaultDbPath,
    // Daily refresh - check once per day
    refreshBufferMinutes: parseInt(
      process.env.MOUSE_MCP_REFRESH_BUFFER ?? String(DEFAULT_SESSION_REFRESH_BUFFER_MINUTES),
      10
    ),
    timeoutMs: parseInt(process.env.MOUSE_MCP_TIMEOUT ?? String(BROWSER_TIMEOUT_MS), 10),
    showBrowser: process.env.MOUSE_MCP_SHOW_BROWSER === "true",
    // Browser backend configuration
    browserBackend: parseBrowserBackend(process.env.MOUSE_MCP_BROWSER),
    cdpEndpoint: process.env.MOUSE_MCP_CDP_ENDPOINT ?? "http://127.0.0.1:9222",
    // Embedding configuration
    embeddingProvider: parseEmbeddingProvider(process.env.MOUSE_MCP_EMBEDDING_PROVIDER),
    openaiApiKey,
    // Observability configuration
    observability: {
      sentryDsn: process.env.MOUSE_MCP_SENTRY_DSN,
      sentryTracesSampleRate: parseFloat(process.env.MOUSE_MCP_SENTRY_TRACES_SAMPLE_RATE ?? "1.0"),
      sentryProfilesSampleRate: parseFloat(
        process.env.MOUSE_MCP_SENTRY_PROFILES_SAMPLE_RATE ?? "0.1"
      ),
      sentryDebug: process.env.MOUSE_MCP_SENTRY_DEBUG === "true",
      otelExporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
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
 * Parse browser backend from environment.
 */
function parseBrowserBackend(value: string | undefined): BrowserBackendType {
  if (value) {
    const lower = value.toLowerCase();
    if (lower === "playwright" || lower === "lightpanda" || lower === "auto") {
      return lower;
    }
  }
  return "playwright"; // Default to Playwright for stability
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
 * Reset config cache (useful for testing).
 */
export function resetConfig(): void {
  cachedConfig = null;
}
