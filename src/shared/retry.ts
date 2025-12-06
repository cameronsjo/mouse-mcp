/**
 * Retry Handler
 *
 * Exponential backoff with jitter for API resilience.
 */

import { createLogger } from "./logger.js";

const logger = createLogger("RetryHandler");

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Add randomization to prevent thundering herd (default: true) */
  jitter: boolean;
  /** HTTP status codes that should not trigger retry */
  nonRetryableStatusCodes?: number[];
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
  nonRetryableStatusCodes: [400, 401, 403, 404],
};

/**
 * Execute a function with retry logic.
 *
 * Uses exponential backoff with optional jitter to handle transient failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const nonRetryable = new Set(opts.nonRetryableStatusCodes);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (isNonRetryable(error, nonRetryable)) {
        logger.debug("Non-retryable error", { error: lastError.message });
        throw error;
      }

      // Last attempt - throw
      if (attempt === opts.maxRetries) {
        logger.warn("All retry attempts exhausted", {
          attempts: opts.maxRetries + 1,
          error: lastError.message,
        });
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateDelay(attempt, opts);

      logger.debug("Retrying after failure", {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Retry failed with unknown error");
}

/**
 * Calculate delay for exponential backoff with optional jitter.
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  // Exponential backoff: baseDelay * 2^attempt
  let delay = options.baseDelayMs * Math.pow(2, attempt);

  // Apply max cap
  delay = Math.min(delay, options.maxDelayMs);

  // Apply jitter (random between 50% and 100% of calculated delay)
  if (options.jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.round(delay);
}

/**
 * Check if an error should not trigger a retry.
 */
function isNonRetryable(error: unknown, nonRetryableCodes: Set<number>): boolean {
  // Check for status code property
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return nonRetryableCodes.has(error.statusCode);
  }

  // Check for status property (fetch responses)
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return nonRetryableCodes.has(error.status);
  }

  // Network errors are generally retryable
  if (error instanceof Error) {
    const retryablePatterns = [
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
      "socket hang up",
      "network",
      "timeout",
      "aborted",
    ];

    const message = error.message.toLowerCase();
    const isNetworkError = retryablePatterns.some((pattern) =>
      message.includes(pattern.toLowerCase())
    );

    // Network errors ARE retryable, so return false (not non-retryable)
    return !isNetworkError;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
