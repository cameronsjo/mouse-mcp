/**
 * OpenTelemetry Observability with Sentry Integration
 *
 * Initializes distributed tracing for the MCP server.
 * Traces are automatically sent to Sentry when SENTRY_DSN is configured.
 *
 * Environment Variables:
 * - SENTRY_DSN: Sentry Data Source Name (optional - no-op if not set)
 * - MOUSE_MCP_OTEL_ENABLED: Enable/disable tracing (default: true)
 * - NODE_ENV: Environment name (development/production)
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { trace, context, type Span, type Tracer } from "@opentelemetry/api";
import * as Sentry from "@sentry/node";
import { SENTRY_FLUSH_TIMEOUT_MS } from "../shared/constants.js";

let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry with Sentry integration.
 * Safe to call multiple times - only initializes once.
 */
export function initializeObservability(): void {
  // Only initialize once
  if (isInitialized) {
    return;
  }

  // Check if observability is enabled
  const enabled = process.env.MOUSE_MCP_OTEL_ENABLED !== "false";
  if (!enabled) {
    console.log("[Observability] Disabled via MOUSE_MCP_OTEL_ENABLED");
    isInitialized = true;
    return;
  }

  const sentryDsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV ?? "development";

  // Initialize Sentry if DSN is provided
  if (sentryDsn) {
    console.log("[Observability] Initializing Sentry with OpenTelemetry");

    Sentry.init({
      dsn: sentryDsn,
      environment,
      // Performance monitoring
      tracesSampleRate: environment === "production" ? 0.1 : 1.0,
      // Enable debug logging in development
      debug: environment === "development",
    });
  } else {
    console.log("[Observability] No SENTRY_DSN configured - tracing will not be exported");
  }

  // Initialize OpenTelemetry SDK with auto-instrumentation
  sdk = new NodeSDK({
    // Auto-instrument common Node.js libraries (http, fetch, etc.)
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable instrumentations we don't need
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      }),
    ],
    // Sentry handles span processing and export via its OTEL integration
  });

  // Start the SDK
  sdk.start();

  console.log("[Observability] OpenTelemetry initialized");

  // Mark as initialized
  isInitialized = true;

  // Ensure SDK is properly shut down on exit
  process.on("SIGTERM", () => {
    void shutdownObservability();
  });
}

/**
 * Shutdown observability and flush any pending telemetry.
 */
export async function shutdownObservability(): Promise<void> {
  if (sdk) {
    console.log("[Observability] Shutting down...");
    await sdk.shutdown();
    await Sentry.close(SENTRY_FLUSH_TIMEOUT_MS);
    console.log("[Observability] Shutdown complete");
  }
}

/**
 * Get the default tracer for manual instrumentation.
 */
export function getTracer(): Tracer {
  return trace.getTracer("mouse-mcp", "1.0.0");
}

/**
 * Execute a function within a named span.
 *
 * Usage:
 * ```ts
 * const result = await startSpan("operation-name", async (span) => {
 *   span.setAttribute("key", "value");
 *   return await doWork();
 * });
 * ```
 */
export async function startSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();

  return tracer.startActiveSpan(name, async (span) => {
    try {
      // Set attributes if provided
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          span.setAttribute(key, value);
        }
      }

      // Execute the function
      const result = await fn(span);

      // Mark span as successful
      span.setStatus({ code: 1 }); // OK

      return result;
    } catch (error) {
      // Record error in span
      span.recordException(error as Error);
      span.setStatus({
        code: 2, // ERROR
        message: error instanceof Error ? error.message : String(error),
      });

      // Re-throw the error
      throw error;
    } finally {
      // Always end the span
      span.end();
    }
  });
}

/**
 * Execute a synchronous function within a named span.
 *
 * Usage:
 * ```ts
 * const result = startSpanSync("operation-name", (span) => {
 *   span.setAttribute("key", "value");
 *   return doWork();
 * });
 * ```
 */
export function startSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  attributes?: Record<string, string | number | boolean>
): T {
  const tracer = getTracer();

  return tracer.startActiveSpan(name, (span) => {
    try {
      // Set attributes if provided
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          span.setAttribute(key, value);
        }
      }

      // Execute the function
      const result = fn(span);

      // Mark span as successful
      span.setStatus({ code: 1 }); // OK

      return result;
    } catch (error) {
      // Record error in span
      span.recordException(error as Error);
      span.setStatus({
        code: 2, // ERROR
        message: error instanceof Error ? error.message : String(error),
      });

      // Re-throw the error
      throw error;
    } finally {
      // Always end the span
      span.end();
    }
  });
}

/**
 * Get the current active span (if any).
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getSpan(context.active());
}

/**
 * Add an attribute to the current span (if active).
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const span = getCurrentSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}

/**
 * Record an event on the current span (if active).
 */
export function recordSpanEvent(name: string, attributes?: Record<string, string>): void {
  const span = getCurrentSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}
