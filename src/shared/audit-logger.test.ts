/**
 * Audit Logger Tests
 *
 * Verifies audit logging functionality including PII sanitization,
 * timing, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Track mock calls across tests
let mockInfoCalls: unknown[][] = [];
let mockErrorCalls: unknown[][] = [];

// Mock the logger module with inline function definitions
vi.mock("./logger.js", () => {
  const mockInfo = (...args: unknown[]): void => {
    mockInfoCalls.push(args);
  };
  const mockError = (...args: unknown[]): void => {
    mockErrorCalls.push(args);
  };

  return {
    createLogger: () => ({
      info: mockInfo,
      error: mockError,
      debug: (): void => {
        // Empty debug handler for testing
      },
      warn: (): void => {
        // Empty warn handler for testing
      },
    }),
  };
});

// Import after mock setup
import { withAuditLogging, createAuditEntry } from "./audit-logger.js";
import type { ToolHandler } from "../tools/types.js";

describe("Audit Logger", () => {
  beforeEach(() => {
    mockInfoCalls = [];
    mockErrorCalls = [];
  });

  describe("withAuditLogging", () => {
    it("should log successful tool invocation", async () => {
      const mockHandler: ToolHandler = vi.fn(async () => ({
        content: [{ type: "text" as const, text: "Success" }],
      }));

      const wrappedHandler = withAuditLogging("test-tool", mockHandler);
      const result = await wrappedHandler({ param: "value" });

      // Verify handler was called
      expect(mockHandler).toHaveBeenCalledWith({ param: "value" });

      // Verify result is returned unchanged
      expect(result).toEqual({
        content: [{ type: "text", text: "Success" }],
      });

      // Verify audit logs were created
      expect(mockInfoCalls).toHaveLength(2);

      // Check start log
      expect(mockInfoCalls[0]?.[0]).toBe("Tool invocation started");
      expect(mockInfoCalls[0]?.[1]).toMatchObject({
        tool: "test-tool",
        args: { param: "value" },
      });

      // Check completion log
      expect(mockInfoCalls[1]?.[0]).toBe("Tool invocation completed");
      expect(mockInfoCalls[1]?.[1]).toMatchObject({
        tool: "test-tool",
        status: "success",
      });
    });

    it("should sanitize PII in input parameters", async () => {
      const mockHandler: ToolHandler = vi.fn(async () => ({
        content: [{ type: "text" as const, text: "Success" }],
      }));

      const wrappedHandler = withAuditLogging("test-tool", mockHandler);
      await wrappedHandler({
        email: "user@example.com",
        phone: "555-123-4567",
        normalParam: "safe-value",
      });

      // Verify sanitized args in start log
      const startLog = mockInfoCalls[0]?.[1] as { args: Record<string, string> };
      expect(startLog.args.email).toBe("[REDACTED_EMAIL]");
      expect(startLog.args.phone).toBe("[REDACTED_PHONE]");
      expect(startLog.args.normalParam).toBe("safe-value");
    });

    it("should log failed tool invocation with sanitized error", async () => {
      const error = new Error("Tool failed with email user@example.com");
      const mockHandler: ToolHandler = vi.fn(async () => {
        throw error;
      });

      const wrappedHandler = withAuditLogging("test-tool", mockHandler);

      await expect(wrappedHandler({ param: "value" })).rejects.toThrow(error);

      // Verify error log was created
      expect(mockErrorCalls).toHaveLength(1);
      expect(mockErrorCalls[0]?.[0]).toBe("Tool invocation failed");

      const errorLog = mockErrorCalls[0]?.[2] as { errorMessage: string; status: string };
      expect(errorLog.status).toBe("error");
      expect(errorLog.errorMessage).toBe("Tool failed with email [REDACTED_EMAIL]");
    });

    it("should handle string errors", async () => {
      const stringError = "String error message";
      const mockHandler: ToolHandler = vi.fn(async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw stringError;
      });

      const wrappedHandler = withAuditLogging("test-tool", mockHandler);

      await expect(wrappedHandler({ param: "value" })).rejects.toBe(stringError);

      // Verify error log was created with string error
      expect(mockErrorCalls).toHaveLength(1);
      const errorLog = mockErrorCalls[0]?.[2] as { errorMessage: string };
      expect(errorLog.errorMessage).toBe("String error message");
    });

    it("should measure execution duration accurately", async () => {
      const mockHandler: ToolHandler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          content: [{ type: "text" as const, text: "Success" }],
        };
      });

      const wrappedHandler = withAuditLogging("test-tool", mockHandler);
      await wrappedHandler({});

      // Verify duration is at least 50ms
      const completionLog = mockInfoCalls[1]?.[1] as { durationMs: number };
      expect(completionLog.durationMs).toBeGreaterThanOrEqual(50);
    });

    it("should handle empty arguments", async () => {
      const mockHandler: ToolHandler = vi.fn(async () => ({
        content: [{ type: "text" as const, text: "Success" }],
      }));

      const wrappedHandler = withAuditLogging("test-tool", mockHandler);
      await wrappedHandler({});

      // Verify empty args are logged
      const startLog = mockInfoCalls[0]?.[1] as { args: Record<string, unknown> };
      expect(startLog.args).toEqual({});
    });
  });

  describe("createAuditEntry", () => {
    it("should create success audit entry", () => {
      const entry = createAuditEntry("test-tool", "success", 123);

      expect(entry).toMatchObject({
        tool: "test-tool",
        durationMs: 123,
        status: "success",
      });

      // Verify timestamp is valid ISO format
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });

    it("should create error audit entry with sanitized message", () => {
      const entry = createAuditEntry(
        "test-tool",
        "error",
        456,
        "Error with email user@example.com"
      );

      expect(entry).toMatchObject({
        tool: "test-tool",
        durationMs: 456,
        status: "error",
        errorMessage: "Error with email [REDACTED_EMAIL]",
      });
    });

    it("should create error entry without error message", () => {
      const entry = createAuditEntry("test-tool", "error", 789);

      expect(entry).toMatchObject({
        tool: "test-tool",
        durationMs: 789,
        status: "error",
      });
      expect(entry.errorMessage).toBeUndefined();
    });
  });
});
