/**
 * Audit Logger
 *
 * Provides audit logging for MCP tool invocations with sanitization and timing.
 * Captures tool execution metadata for debugging and compliance.
 *
 * WHY: Tool invocations need to be audited for debugging, performance monitoring,
 * and compliance. This provides centralized audit logging with automatic PII
 * sanitization and timing metrics.
 */

import { createLogger, type LogContext } from "./logger.js";
import { sanitizeObject } from "./pii-sanitizer.js";
import type { ToolHandler, ToolResult } from "../tools/types.js";

const auditLogger = createLogger("Audit");

/**
 * Audit log entry structure.
 */
interface AuditLogEntry {
  /** Tool name */
  tool: string;
  /** ISO timestamp when tool was invoked (UTC) */
  timestamp: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Success or failure status */
  status: "success" | "error";
  /** Error message if status is error (sanitized) */
  errorMessage?: string;
  /** Error name if status is error */
  errorName?: string;
}

/**
 * Wrap a tool handler with audit logging.
 *
 * Logs tool invocations with:
 * - Tool name
 * - Timestamp (UTC)
 * - Input parameters (sanitized for PII)
 * - Success/failure status
 * - Duration (ms)
 * - Error messages (sanitized)
 *
 * WHY: Wrapping handlers provides non-invasive audit logging without
 * modifying individual tool implementations.
 *
 * @param toolName - Name of the tool being wrapped
 * @param handler - Original tool handler function
 * @returns Wrapped handler with audit logging
 */
export function withAuditLogging(toolName: string, handler: ToolHandler): ToolHandler {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    // Sanitize input parameters before logging
    // WHY: User input may contain PII that shouldn't be logged
    const sanitizedArgs = sanitizeObject(args);

    auditLogger.info("Tool invocation started", {
      tool: toolName,
      timestamp,
      args: sanitizedArgs,
    } as LogContext);

    try {
      // Execute the tool handler
      const result = await handler(args);
      const durationMs = Math.round(performance.now() - startTime);

      // Log successful completion
      const auditEntry: AuditLogEntry = {
        tool: toolName,
        timestamp,
        durationMs,
        status: "success",
      };

      auditLogger.info("Tool invocation completed", auditEntry as unknown as LogContext);

      return result;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);

      // Extract and sanitize error information
      let errorMessage = "Unknown error";
      let errorName = "Error";

      if (error instanceof Error) {
        errorMessage = error.message;
        errorName = error.name;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      // Sanitize error message for PII
      const sanitizedError = sanitizeObject({ message: errorMessage });

      // Log failed execution
      const auditEntry: AuditLogEntry = {
        tool: toolName,
        timestamp,
        durationMs,
        status: "error",
        errorMessage: sanitizedError.message,
        errorName,
      };

      auditLogger.error("Tool invocation failed", undefined, auditEntry as unknown as LogContext);

      // Re-throw error to preserve original error handling
      throw error;
    }
  };
}

/**
 * Create an audit log entry without executing a tool.
 *
 * WHY: For testing and validation of audit log format.
 *
 * @param toolName - Tool name
 * @param status - Execution status
 * @param durationMs - Duration in milliseconds
 * @param errorMessage - Optional error message
 * @returns Audit log entry
 */
export function createAuditEntry(
  toolName: string,
  status: "success" | "error",
  durationMs: number,
  errorMessage?: string
): AuditLogEntry {
  return {
    tool: toolName,
    timestamp: new Date().toISOString(),
    durationMs,
    status,
    ...(errorMessage ? { errorMessage: sanitizeObject({ msg: errorMessage }).msg } : {}),
  };
}
