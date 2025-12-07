/**
 * PII Sanitizer
 *
 * Pattern-based detection and redaction of personally identifiable information (PII)
 * for logging and caching safety. Prevents sensitive data from being stored or logged.
 *
 * WHY: User-generated content may contain PII that should not be persisted
 * in logs or cache. This provides defense-in-depth for data protection.
 */

/** PII patterns with regex detection */
const PII_PATTERNS = {
  /** Email addresses (RFC 5322 simplified) */
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

  /** US Phone numbers (various formats) */
  PHONE: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,

  /** Social Security Numbers (US) */
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,

  /** Credit card numbers (major providers, with or without spaces/dashes) */
  CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

  /** US ZIP codes (extended format to avoid false positives on simple numbers) */
  ZIP_CODE: /\b\d{5}(?:-\d{4})?\b/g,

  /** IP addresses (IPv4) */
  IP_ADDRESS: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

  /** API keys and tokens (common patterns) */
  API_KEY: /\b(?:api[_-]?key|token|secret)[_-]?[:=]\s*['"]?([A-Za-z0-9_-]{20,})['"]?/gi,
} as const;

/**
 * Sanitize text by redacting detected PII patterns.
 *
 * WHY: Centralized redaction logic ensures consistent handling across
 * all logging and caching operations.
 *
 * @param text - Text to sanitize
 * @returns Sanitized text with PII replaced by [REDACTED_TYPE] tokens
 */
function sanitize(text: string): string {
  let sanitized = text;

  // Apply patterns in order from most specific to least specific
  // to avoid false matches

  // Email addresses
  sanitized = sanitized.replace(PII_PATTERNS.EMAIL, "[REDACTED_EMAIL]");

  // SSNs (before phone numbers to avoid conflicts)
  sanitized = sanitized.replace(PII_PATTERNS.SSN, "[REDACTED_SSN]");

  // Credit cards (before phone numbers - longer sequences)
  sanitized = sanitized.replace(PII_PATTERNS.CREDIT_CARD, "[REDACTED_CREDIT_CARD]");

  // API keys and tokens (before phone numbers to avoid matching digit sequences)
  sanitized = sanitized.replace(PII_PATTERNS.API_KEY, (match) => {
    const prefix = match.split(/[:=]/)[0];
    return `${prefix}: [REDACTED_API_KEY]`;
  });

  // Phone numbers (after more specific patterns)
  sanitized = sanitized.replace(PII_PATTERNS.PHONE, "[REDACTED_PHONE]");

  // ZIP codes (only if preceded by common address keywords to reduce false positives)
  sanitized = sanitized.replace(
    /\b(zip|postal|code|address)[\s:]+(\d{5}(?:-\d{4})?)\b/gi,
    "$1 [REDACTED_ZIP_CODE]"
  );

  // IP addresses
  sanitized = sanitized.replace(PII_PATTERNS.IP_ADDRESS, "[REDACTED_IP_ADDRESS]");

  return sanitized;
}

/**
 * Sanitize text for logging.
 *
 * Redacts common PII patterns before writing to log files or stderr.
 *
 * @param text - Log message or data to sanitize
 * @returns Sanitized text safe for logging
 */
export function sanitizeForLogging(text: string): string {
  if (typeof text !== "string") {
    return text;
  }
  return sanitize(text);
}

/**
 * Sanitize cache keys that may contain user input.
 *
 * WHY: Cache keys might include search queries or entity names from user input.
 * Sanitize before storage to prevent PII in cache database.
 *
 * @param key - Cache key to sanitize
 * @returns Sanitized cache key
 */
export function sanitizeForCache(key: string): string {
  if (typeof key !== "string") {
    return key;
  }
  return sanitize(key);
}

/**
 * Sanitize an object's string values recursively.
 *
 * WHY: Log context objects may contain nested PII in their values.
 * This ensures comprehensive sanitization of structured data.
 *
 * @param obj - Object to sanitize
 * @returns New object with sanitized string values
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitize(value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Sanitize array elements
      sanitized[key] = value.map((item: unknown): unknown => {
        if (typeof item === "string") {
          return sanitize(item);
        } else if (item !== null && typeof item === "object") {
          return sanitizeObject(item as Record<string, unknown>);
        }
        return item;
      });
    } else {
      // Keep non-string primitives as-is
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * Check if text contains any detectable PII.
 *
 * WHY: Useful for validation and testing to verify PII detection works.
 *
 * @param text - Text to check
 * @returns true if PII patterns are detected
 */
export function containsPII(text: string): boolean {
  if (typeof text !== "string") {
    return false;
  }

  return (
    PII_PATTERNS.EMAIL.test(text) ||
    PII_PATTERNS.PHONE.test(text) ||
    PII_PATTERNS.SSN.test(text) ||
    PII_PATTERNS.CREDIT_CARD.test(text) ||
    PII_PATTERNS.IP_ADDRESS.test(text) ||
    PII_PATTERNS.API_KEY.test(text)
  );
}
