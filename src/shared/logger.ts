/**
 * Structured Logger
 *
 * Dual output: stderr for MCP compatibility + file logging for debugging.
 * Log files are written to .logs/ directory with daily rotation.
 */

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig, type LogLevel } from "../config/index.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export type LogContext = Record<string, unknown>;

/** Get the project root directory */
function getProjectRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  // Go up from src/shared/logger.ts to project root
  return join(dirname(currentFile), "..", "..");
}

/** Get the log file path for today */
function getLogFilePath(): string {
  const logsDir = join(getProjectRoot(), ".logs");

  // Ensure logs directory exists
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return join(logsDir, `mouse-mcp-${today}.log`);
}

/** Write to log file (fire-and-forget) */
function writeToFile(entry: string): void {
  try {
    const logPath = getLogFilePath();
    appendFileSync(logPath, entry + "\n");
  } catch {
    // Silently fail file writes - don't break the server
  }
}

/** Format log entry for human-readable file output */
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
    } else if (error !== undefined) {
      errorData.error = String(error);
    }

    this.log("ERROR", message, errorData);
  }

  private log(level: LogLevel, message: string, data?: LogContext): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const timestamp = new Date().toISOString();

    const entry = {
      timestamp,
      level,
      context: this.context,
      message,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    };

    // Write JSON to stderr (MCP protocol uses stdout)
    process.stderr.write(JSON.stringify(entry) + "\n");

    // Write human-readable format to log file
    writeToFile(formatLogEntry(timestamp, level, this.context, message, data));
  }
}

/**
 * Create a logger for a specific context.
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
