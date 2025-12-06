/**
 * Transport Types
 *
 * Type definitions for transport configuration and management.
 */

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/**
 * Transport mode selection.
 */
export type TransportMode = "stdio" | "http";

/**
 * HTTP transport configuration.
 */
export interface HttpTransportConfig {
  /** Port for HTTP server */
  readonly port: number;
  /** Host to bind to (127.0.0.1 for localhost, 0.0.0.0 for all interfaces) */
  readonly host: string;
  /** Enable session resumability with event store */
  readonly resumability: boolean;
}

/**
 * Transport configuration.
 */
export interface TransportConfig {
  /** Transport mode */
  readonly mode: TransportMode;
  /** HTTP configuration (only used when mode is 'http') */
  readonly http: HttpTransportConfig;
}

/**
 * Transport instance union type.
 */
export type TransportInstance = Transport | StreamableHTTPServerTransport;

/**
 * HTTP server instance interface.
 */
export interface HttpServerInstance {
  /** Start the HTTP server */
  start(): Promise<void>;
  /** Stop the HTTP server */
  stop(): Promise<void>;
  /** Get the server address */
  getAddress(): { host: string; port: number } | null;
}
