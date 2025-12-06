/**
 * Structured Logger
 *
 * Simple structured logging to stderr (MCP servers must not write to stdout).
 */

import { getConfig, type LogLevel } from "../config/index.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export interface LogContext {
  [key: string]: unknown;
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
      errorData["error"] = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined) {
      errorData["error"] = String(error);
    }

    this.log("ERROR", message, errorData);
  }

  private log(level: LogLevel, message: string, data?: LogContext): void {
    if (LOG_LEVELS[level] < this.minLevel) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
    };

    // Write to stderr (MCP protocol uses stdout)
    process.stderr.write(JSON.stringify(entry) + "\n");
  }
}

/**
 * Create a logger for a specific context.
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
