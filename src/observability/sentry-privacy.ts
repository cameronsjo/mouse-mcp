/**
 * Sentry privacy settings shared by every Sentry.init in this service.
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
 * Remove request PII from an outgoing event. `beforeSend` runs after all
 * integrations, so this catches anything `dataCollection` lets through.
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
  // Defense in depth: strip request PII even if dataCollection misses a path.
  beforeSend: scrubEvent,
} satisfies NodeOptions;
