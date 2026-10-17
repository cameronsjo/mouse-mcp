/**
 * Privacy tests for the shared Sentry options.
 *
 * Sentry 11 collects request PII by default. These tests run a representative
 * HTTP-request event through a real NodeClient configured with the service's
 * privacy options and assert no PII reaches the transport.
 */

import * as Sentry from "@sentry/node";
import type { ErrorEvent, Event, NodeOptions } from "@sentry/node";
import { afterEach, describe, expect, it } from "vitest";
import { SENTRY_DATA_COLLECTION, SENTRY_PRIVACY_OPTIONS, scrubEvent } from "./sentry-privacy.js";

type Transport = ReturnType<NonNullable<NodeOptions["transport"]>>;
type Envelope = Parameters<Transport["send"]>[0];
type PrivacyOptions = Pick<NodeOptions, "dataCollection" | "includeLocalVariables" | "beforeSend">;

const IP = "203.0.113.42";
const API_KEY = "sk-test-0123456789abcdef";
const EMAIL = "guest@example.com";

/** An event carrying the request data Sentry's HTTP instrumentation attaches. */
function requestEvent(): Event {
  return {
    message: "boom",
    sdkProcessingMetadata: {
      normalizedRequest: {
        method: "POST",
        url: `https://mouse.example.com/mcp?email=${EMAIL}&token=abc`,
        query_string: `email=${EMAIL}&token=abc`,
        headers: {
          "x-api-key": API_KEY,
          "x-forwarded-for": IP,
          cookie: "session=s3cr3t",
          "user-agent": "vitest",
        },
        cookies: { session: "s3cr3t" },
        data: JSON.stringify({ email: EMAIL }),
      },
      ipAddress: IP,
    },
  };
}

let client: Sentry.NodeClient | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** Send one event through a NodeClient and return the event the transport received. */
async function sendThroughClient(options: PrivacyOptions): Promise<ErrorEvent> {
  const events: ErrorEvent[] = [];
  client = new Sentry.NodeClient({
    dsn: "https://public@o0.ingest.sentry.io/0",
    integrations: [Sentry.requestDataIntegration()],
    stackParser: Sentry.defaultStackParser,
    transport: () => ({
      send: (envelope: Envelope) => {
        const items: ReadonlyArray<readonly [{ type: string }, unknown]> = envelope[1];
        for (const [header, payload] of items) {
          if (header.type === "event") events.push(payload as ErrorEvent);
        }
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
    ...options,
  });
  client.init();
  client.captureEvent(requestEvent());
  await client.flush(1000);

  expect(events, "transport should receive exactly one event").toHaveLength(1);
  const [event] = events;
  if (event === undefined) throw new Error("expected the transport to receive an event");
  return event;
}

/** Assert none of the request's PII appears anywhere in the event. */
function expectNoPii(event: ErrorEvent): void {
  const serialized = JSON.stringify({ ...event, sdkProcessingMetadata: undefined });
  for (const secret of [IP, API_KEY, EMAIL, "s3cr3t", "token=abc"]) {
    expect(serialized).not.toContain(secret);
  }
}

describe("Sentry privacy options", () => {
  it("sends no request PII through the configured client", async () => {
    const event = await sendThroughClient(SENTRY_PRIVACY_OPTIONS);

    expectNoPii(event);
    expect(event.user?.ip_address).toBeUndefined();
    expect(event.request?.headers).toBeUndefined();
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.url).toBe("https://mouse.example.com/mcp");
  });

  it("dataCollection alone stops IP, header, cookie, and query capture", async () => {
    const event = await sendThroughClient({ dataCollection: SENTRY_DATA_COLLECTION });

    expect(event.user?.ip_address).toBeUndefined();
    expect(event.request?.headers ?? {}).toEqual({});
    expect(event.request?.cookies ?? {}).toEqual({});
    expect(event.request?.query_string).toBeUndefined();
    expect(event.request?.url).not.toContain("token=abc");
  });

  it("disables stack-frame variable capture", () => {
    expect(SENTRY_DATA_COLLECTION.stackFrameVariables).toBe(false);
    expect(SENTRY_PRIVACY_OPTIONS.includeLocalVariables).toBe(false);
  });

  it("scrubEvent strips request PII on its own", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: "https://mouse.example.com/mcp?token=abc",
        query_string: "token=abc",
        headers: { "x-api-key": API_KEY },
        cookies: { session: "s3cr3t" },
        data: { email: EMAIL },
      },
      user: { ip_address: IP, id: "u1" },
    };

    const scrubbed = scrubEvent(event);

    expectNoPii(scrubbed);
    expect(scrubbed.user?.id).toBe("u1");
  });
});
