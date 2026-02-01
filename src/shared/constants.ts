/**
 * Application Constants
 *
 * Centralized configuration for magic numbers used throughout the codebase.
 * All numeric values that control behavior should be defined here.
 */

// --- Time Constants (Milliseconds) ---

/** Default timeout for browser operations (30 seconds) */
export const BROWSER_TIMEOUT_MS = 30000;

/** Wait time for cookie consent banner to appear (2 seconds) */
export const COOKIE_CONSENT_WAIT_MS = 2000;

/** Wait time after accepting cookie consent (1 second) */
export const COOKIE_CONSENT_ACCEPTED_WAIT_MS = 1000;

/** Poll interval for checking session cookies (1 second) */
export const SESSION_COOKIE_POLL_INTERVAL_MS = 1000;

/** Default cache TTL (24 hours) */
export const DEFAULT_CACHE_TTL_HOURS = 24;

/** Sentry flush timeout on shutdown (2 seconds) */
export const SENTRY_FLUSH_TIMEOUT_MS = 2000;

/** Lightpanda CDP connection timeout (10 seconds) */
export const LIGHTPANDA_CONNECTION_TIMEOUT_MS = 10000;

/** Lightpanda CDP endpoint health check timeout (2 seconds) */
export const LIGHTPANDA_HEALTH_CHECK_TIMEOUT_MS = 2000;

// --- Retry Configuration ---

/** Maximum number of retry attempts for API calls */
export const MAX_RETRY_ATTEMPTS = 3;

/** Base delay for exponential backoff (1 second) */
export const RETRY_BASE_DELAY_MS = 1000;

/** Maximum delay cap for exponential backoff (30 seconds) */
export const RETRY_MAX_DELAY_MS = 30000;

/** Minimum jitter multiplier for exponential backoff (50%) */
export const RETRY_JITTER_MIN = 0.5;

/** Maximum jitter multiplier for exponential backoff (100%) */
export const RETRY_JITTER_MAX = 1.0;

// --- Session Management ---

/** Default session duration (8 hours, matches Disney token TTL) */
export const DEFAULT_SESSION_HOURS = 8;

/** Default refresh buffer before session expiration (60 minutes) */
export const DEFAULT_SESSION_REFRESH_BUFFER_MINUTES = 60;

/** Maximum attempts to detect session cookies */
export const SESSION_COOKIE_MAX_ATTEMPTS = 15;

// --- Search & Scoring ---

/** Default minimum similarity score threshold for semantic search (0-1 scale) */
export const DEFAULT_MIN_SIMILARITY_SCORE = 0.3;

/** Default fuzzy search threshold for Fuse.js (0-1 scale, lower = more permissive) */
export const DEFAULT_FUZZY_SEARCH_THRESHOLD = 0.4;

/** Default search result limit */
export const DEFAULT_SEARCH_LIMIT = 10;

/** Extended search result limit for broader searches */
export const EXTENDED_SEARCH_LIMIT = 20;

/** Default discover tool result limit */
export const DEFAULT_DISCOVER_LIMIT = 5;

/** Maximum discover tool result limit */
export const MAX_DISCOVER_LIMIT = 20;

/** Minimum match character length for fuzzy search */
export const FUZZY_SEARCH_MIN_MATCH_LENGTH = 2;

/** Default similarity threshold for normalized scores */
export const NORMALIZED_SCORE_THRESHOLD = 0.3;

// --- Embedding Configuration ---

/** Batch size for embedding generation (prevents memory issues) */
export const EMBEDDING_BATCH_SIZE = 50;

/** Batch size for LanceDB delete operations (prevents query length issues) */
export const LANCEDB_DELETE_CHUNK_SIZE = 50;

/** Limit multiplier for semantic search to allow score filtering */
export const SEMANTIC_SEARCH_LIMIT_MULTIPLIER = 2;

// --- Conversion Factors ---

/** Inches to centimeters conversion factor */
export const INCHES_TO_CM = 2.54;

/** Centimeters to inches conversion factor */
export const CM_TO_INCHES = 1 / 2.54;

// --- Time Unit Conversions ---

/** Milliseconds per second */
export const MS_PER_SECOND = 1000;

/** Seconds per minute */
export const SECONDS_PER_MINUTE = 60;

/** Minutes per hour */
export const MINUTES_PER_HOUR = 60;

/** Milliseconds per minute */
export const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE;

/** Milliseconds per hour */
export const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR;

// --- Browser Configuration ---

/** Browser viewport width for session establishment */
export const BROWSER_VIEWPORT_WIDTH = 1920;

/** Browser viewport height for session establishment */
export const BROWSER_VIEWPORT_HEIGHT = 1080;

/** Default user locale for browser sessions */
export const DEFAULT_LOCALE = "en-US";

/** Default Accept-Language header with quality value */
export const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

/** Default browser user agent for session establishment */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// --- HTTP Configuration ---

/** Default HTTP status codes that should not trigger retry */
export const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404] as const;

/** Session-specific non-retryable status codes (authentication failures) */
export const SESSION_NON_RETRYABLE_STATUS_CODES = [401, 403] as const;

// --- Decimal Precision ---

/** Decimal places for rounding distance scores */
export const DISTANCE_DECIMAL_PLACES = 3;

/** Multiplier for distance decimal rounding (1000 for 3 decimal places) */
export const DISTANCE_ROUNDING_MULTIPLIER = Math.pow(10, DISTANCE_DECIMAL_PLACES);
