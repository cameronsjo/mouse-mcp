/**
 * Timeout Utilities
 *
 * Provides timeout wrappers for async operations to prevent long-running
 * tool calls from blocking the MCP connection.
 */

import { createLogger } from "./logger.js";

const logger = createLogger("timeout");

/** Timeout error thrown when operations exceed time limit */
export class TimeoutError extends Error {
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/** Default timeout values for different operation types */
export const TIMEOUTS = {
  /** Standard tool operations (30 seconds) */
  DEFAULT: 30_000,
  /** Data sync operations (2 minutes) */
  SYNC: 120_000,
  /** Quick status checks (10 seconds) */
  STATUS: 10_000,
  /** Semantic search operations (45 seconds) */
  SEARCH: 45_000,
} as const;

/**
 * Wraps an async operation with a timeout.
 *
 * @param operation - Name of the operation for error messages
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param signal - Optional AbortSignal to cancel the operation
 * @returns Promise that resolves with the operation result or rejects with TimeoutError
 */
export async function withTimeout<T>(
  operation: string,
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  // Create an AbortController for timeout
  const controller = new AbortController();
  const combinedSignal = signal
    ? createCombinedSignal(signal, controller.signal)
    : controller.signal;

  // Set up timeout
  const timeoutId = setTimeout(() => {
    logger.warn(`Operation timed out`, { operation, timeoutMs });
    controller.abort(new TimeoutError(operation, timeoutMs));
  }, timeoutMs);

  try {
    // Execute the operation with the combined signal
    const result = await fn(combinedSignal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    // Re-throw TimeoutError or AbortError as-is
    if (error instanceof TimeoutError || (error as Error).name === "AbortError") {
      throw error;
    }

    // Check if the abort was due to timeout
    if (controller.signal.aborted && controller.signal.reason instanceof TimeoutError) {
      throw controller.signal.reason;
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Creates a combined AbortSignal that triggers when either signal is aborted.
 *
 * @param signal1 - First abort signal
 * @param signal2 - Second abort signal
 * @returns Combined AbortSignal
 */
function createCombinedSignal(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
  const controller = new AbortController();

  const abort1 = (): void => {
    controller.abort(signal1.reason);
  };
  const abort2 = (): void => {
    controller.abort(signal2.reason);
  };

  if (signal1.aborted) {
    controller.abort(signal1.reason);
  } else {
    signal1.addEventListener("abort", abort1, { once: true });
  }

  if (signal2.aborted) {
    controller.abort(signal2.reason);
  } else {
    signal2.addEventListener("abort", abort2, { once: true });
  }

  return controller.signal;
}

/**
 * Wraps a tool handler with timeout protection.
 *
 * @param toolName - Name of the tool for logging
 * @param handler - Tool handler function
 * @param timeoutMs - Timeout in milliseconds (default: TIMEOUTS.DEFAULT)
 * @returns Wrapped handler with timeout protection
 */
export function withToolTimeout<TArgs extends Record<string, unknown>, TResult>(
  toolName: string,
  handler: (args: TArgs) => Promise<TResult>,
  timeoutMs: number = TIMEOUTS.DEFAULT
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs): Promise<TResult> => {
    return withTimeout(
      toolName,
      async () => {
        // Note: signal parameter available but not passed to handler
        // Most handlers don't need it, but it's available for cancellable operations
        return handler(args);
      },
      timeoutMs
    );
  };
}
