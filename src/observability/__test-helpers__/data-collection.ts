/**
 * Resolve Sentry's effective data-collection settings through the SDK's own resolver.
 */

import * as Sentry from "@sentry/node";
import type { NodeOptions } from "@sentry/node";

type ResolvedDataCollection = ReturnType<Sentry.NodeClient["getDataCollectionOptions"]>;

/** Every Sentry 11 data-collection category off. Source-context lines are not request data. */
export const ALL_COLLECTION_OFF: ResolvedDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 5,
};

/** Build a client from the given options and return what Sentry resolves them to. */
export async function resolveDataCollection(options: NodeOptions): Promise<ResolvedDataCollection> {
  const client = new Sentry.NodeClient({
    ...options,
    dsn: "https://public@o0.ingest.sentry.io/0",
    integrations: [],
    stackParser: Sentry.defaultStackParser,
    transport: () => ({
      send: () => Promise.resolve({}),
      flush: () => Promise.resolve(true),
    }),
  });
  try {
    return client.getDataCollectionOptions();
  } finally {
    await client.close();
  }
}
