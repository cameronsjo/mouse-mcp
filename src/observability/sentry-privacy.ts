/**
 * Sentry privacy settings for the service's Sentry.init.
 */

import type { ErrorEvent, NodeOptions } from "@sentry/node";

type DataCollection = NonNullable<NodeOptions["dataCollection"]>;

/**
 * Sentry 11 replaced `sendDefaultPii` (off by default in v8) with `dataCollection`,
 * whose defaults collect user IPs, cookies, headers, bodies, query strings, DB query
 * data, queue payloads, and stack-frame variables. Restore the v8 posture: collect none.
 */
export const SENTRY_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/**
 * Remove request PII from an outgoing error event.
 *
 * Runs as `beforeSend`, so it covers error events only: spans and transactions
 * never pass through it, and it leaves breadcrumbs, contexts, and other user
 * fields alone. `dataCollection` is the control for spans.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) {
      event.request.url = event.request.url.split("?", 1)[0] ?? "";
    }
  }
  if (event.user) {
    delete event.user.ip_address;
  }
  return event;
}

/** Privacy settings applied to every Sentry client this service creates. */
export const SENTRY_PRIVACY_OPTIONS = {
  dataCollection: SENTRY_DATA_COLLECTION,
  includeLocalVariables: false,
  // Second layer for error events: requestDataIntegration attaches scope body data regardless of httpBodies.
  beforeSend: scrubEvent,
} satisfies NodeOptions;
