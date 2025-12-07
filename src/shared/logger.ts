/**
 * Structured Logger
 *
 * Dual output: MCP logging protocol for inspector + file logging for debugging.
 * Log files are written to .logs/ directory with daily rotation.
 *
 * Uses MCP SDK's sendLoggingMessage() to avoid double-serialized JSON in inspector.
 * Console output (stderr) uses plain text for human readability.
 *
 * Integrates with OpenTelemetry to include trace/span IDs in log entries
 * for distributed tracing correlation.
 */

import { appendFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { trace } from "@opentelemetry/api";
import { getConfig, type LogLevel } from "../config/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Map our log levels to MCP logging levels.
 * MCP supports: debug, info, notice, warning, error, critical, alert, emergency
 */
const MCP_LOG_LEVEL_MAP: Record<LogLevel, "debug" | "info" | "warning" | "error"> = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warning",
  ERROR: "error",
};

export type LogContext = Record<string, unknown>;

/**
 * Global MCP server instance for logging.
 * Set via setMcpServer() during server initialization.
 */
let mcpServer: Server | null = null;

/**
 * Set the MCP server instance for logging.
 * Call this during server initialization to enable MCP logging protocol.
 */
export function setMcpServer(server: Server): void {
  mcpServer = server;
}

/**
 * Get current trace context for log correlation.
 */
function getTraceContext(): { traceId?: string; spanId?: string } {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  return {};
}

/** Get the project root directory */
function getProjectRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  // Go up from src/shared/logger.ts to project root
  return join(dirname(currentFile), "..", "..");
}

/**
 * Set secure permissions on a path (Unix only).
 * WHY: Extracted to avoid circular dependency with file-security module.
 */
function setSecurePermissions(path: string, mode: number): void {
  if (process.platform === "win32") {
    return; // Skip on Windows
  }

  try {
    chmodSync(path, mode);
  } catch {
    // Silently fail - don't break logging
  }
}

/** Get the log file path for today */
function getLogFilePath(): string {
  const logsDir = join(getProjectRoot(), ".logs");

  // Ensure logs directory exists with secure permissions
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
    setSecurePermissions(logsDir, 0o700);
  }

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return join(logsDir, `mouse-mcp-${today}.log`);
}

/** Write to log file (fire-and-forget) */
function writeToFile(entry: string): void {
  try {
    const logPath = getLogFilePath();
    const isNewFile = !existsSync(logPath);
    appendFileSync(logPath, entry + "\n");

    // Set secure permissions on new log files
    if (isNewFile) {
      setSecurePermissions(logPath, 0o600);
    }
  } catch {
    // Silently fail file writes - don't break the server
  }
}

/**
 * Format log entry for human-readable output (console + file).
 * WHY: Plain text format prevents double-serialized JSON in MCP inspector.
 */
function formatLogEntry(
  timestamp: string,
  level: LogLevel,
  context: string,
  message: string,
  data?: LogContext
): string {
  const dataStr = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : "";
  return `[${timestamp}] ${level.padEnd(5)} [${context}] ${message}${dataStr}`;
}

export class Logger {
  private readonly context: string;
  private readonly minLevel: number;

  constructor(context: string) {
    this.context = context;
    this.minLevel = LOG_LEVELS[getConfig().logLevel];
  }

  debug(message: string, data?: LogContext): void {
    this.log("DEBUG", message, data);
  }

  info(message: string, data?: LogContext): void {
    this.log("INFO", message, data);
  }

  warn(message: string, data?: LogContext): void {
    this.log("WARN", message, data);
  }

  error(message: string, error?: unknown, data?: LogContext): void {
    const errorData: LogContext = { ...data };

    if (error instanceof Error) {
      errorData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined && error !== null) {
      // Use JSON.stringify for objects, String() for primitives
      errorData.error =
        typeof error === "object"
          ? JSON.stringify(error)
          : String(error as string | number | boolean);
    }

    this.log("ERROR", message, errorData);
  }

  private log(level: LogLevel, message: string, data?: LogContext): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const traceContext = getTraceContext();

    // Build structured data for MCP logging
    const structuredData: LogContext = {
      context: this.context,
      ...(traceContext.traceId ? { traceId: traceContext.traceId } : {}),
      ...(traceContext.spanId ? { spanId: traceContext.spanId } : {}),
      ...(data && Object.keys(data).length > 0 ? data : {}),
    };

    // Send to MCP inspector via logging protocol (prevents double-serialized JSON)
    // WHY: MCP inspector expects structured logs via sendLoggingMessage(), not JSON on stderr
    if (mcpServer) {
      void mcpServer.sendLoggingMessage({
        level: MCP_LOG_LEVEL_MAP[level],
        data: structuredData,
        logger: this.context,
      });
    }

    // Write plain text to stderr for console/terminal readability
    // WHY: Developers reading logs in terminal need human-readable format
    const tracePrefix = traceContext.traceId ? ` [${traceContext.traceId.slice(0, 8)}]` : "";
    const plainText = formatLogEntry(timestamp, level, this.context + tracePrefix, message, data);
    process.stderr.write(plainText + "\n");

    // Write human-readable format to log file
    writeToFile(plainText);
  }
}

/**
 * Create a logger for a specific context.
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
