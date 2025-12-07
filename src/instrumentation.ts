/**
 * OpenTelemetry Instrumentation Bootstrap
 *
 * This file MUST be loaded BEFORE any other application code.
 * It sets up Sentry with OpenTelemetry integration for distributed tracing.
 *
 * Usage:
 *   node --import ./dist/instrumentation.js dist/index.js
 *   tsx --import ./src/instrumentation.ts src/index.ts
 */

import * as Sentry from "@sentry/node";

// Environment configuration for observability
const SENTRY_DSN = process.env.MOUSE_MCP_SENTRY_DSN;
const SENTRY_TRACES_SAMPLE_RATE = parseFloat(
  process.env.MOUSE_MCP_SENTRY_TRACES_SAMPLE_RATE ?? "1.0"
);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const SERVICE_NAME = "mouse-mcp";
const SERVICE_VERSION = process.env.npm_package_version ?? "1.0.0";

// Only initialize Sentry if DSN is provided
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Performance Monitoring
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,

    // Environment identification
    environment: NODE_ENV,
    release: `${SERVICE_NAME}@${SERVICE_VERSION}`,

    // Server name for identifying instances
    serverName: process.env.HOSTNAME ?? "local",

    // Attach stack traces to messages
    attachStacktrace: true,

    // Enable debug logging in development
    debug: NODE_ENV === "development" && process.env.MOUSE_MCP_SENTRY_DEBUG === "true",

    // Filter out sensitive data
    beforeSend(event) {
      // Remove any potential PII from the event
      if (event.request?.cookies) {
        event.request.cookies = {};
      }
      if (event.request?.headers) {
        // Remove auth headers
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },

    // Filter breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      // Filter out noisy console breadcrumbs in development
      if (breadcrumb.category === "console" && NODE_ENV === "development") {
        return null;
      }
      return breadcrumb;
    },
  });

  // Set default tags for all events
  Sentry.setTag("service", SERVICE_NAME);

  // Validate OpenTelemetry setup
  Sentry.validateOpenTelemetrySetup();
} else if (NODE_ENV === "production") {
  process.stderr.write(
    "[instrumentation] MOUSE_MCP_SENTRY_DSN not set - Sentry disabled in production\n"
  );
}

// Export for use in the application
export { Sentry };
