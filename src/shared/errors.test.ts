/**
 * Tests for custom error classes and the error response formatter
 *
 * Test Plan:
 *
 * DisneyMcpError (Classification: Pure logic — error class)
 *   [x] Happy: sets code, name, message, and optional details
 *
 * SessionError (Classification: Pure logic)
 *   [x] Happy: code = SESSION_ERROR, name = SessionError
 *
 * ApiError (Classification: Pure logic)
 *   [x] Happy: sets statusCode, endpoint, code = API_ERROR, name = ApiError
 *   [x] Happy: statusCode and endpoint also appear in details
 *
 * CacheError (Classification: Pure logic)
 *   [x] Happy: code = CACHE_ERROR, name = CacheError
 *
 * DatabaseError (Classification: Pure logic)
 *   [x] Happy: code = DATABASE_ERROR, name = DatabaseError
 *
 * ValidationError (Classification: Pure logic)
 *   [x] Happy: sets field, value, code = VALIDATION_ERROR, name = ValidationError
 *
 * formatErrorResponse (Classification: Pure logic / Data transformer)
 *   [x] Happy: DisneyMcpError → uses subclass code in JSON
 *   [x] Happy: generic Error → code = UNKNOWN_ERROR
 *   [x] Happy: non-Error string → message = String(error), code = UNKNOWN_ERROR
 *   [x] Happy: result always has isError = true
 *   [x] Happy: content array has one text entry whose text parses as JSON
 *   [x] Boundary: content[0].type === 'text'
 *   [x] Boundary: ValidationError → uses VALIDATION_ERROR code (subclass code forwarded)
 */

import { describe, it, expect } from "vitest";
import {
  DisneyMcpError,
  SessionError,
  ApiError,
  CacheError,
  DatabaseError,
  ValidationError,
  formatErrorResponse,
} from "./errors.js";

describe("DisneyMcpError", () => {
  it("sets code, name, message, and optional details", () => {
    const err = new DisneyMcpError("something went wrong", "MY_CODE", { key: "val" });
    expect(err.message).toBe("something went wrong");
    expect(err.code).toBe("MY_CODE");
    expect(err.name).toBe("DisneyMcpError");
    expect(err.details).toEqual({ key: "val" });
  });

  it("is an instance of Error", () => {
    expect(new DisneyMcpError("msg", "CODE")).toBeInstanceOf(Error);
  });
});

describe("SessionError", () => {
  it("has code SESSION_ERROR and name SessionError", () => {
    const err = new SessionError("session expired");
    expect(err.code).toBe("SESSION_ERROR");
    expect(err.name).toBe("SessionError");
    expect(err.message).toBe("session expired");
  });

  it("is an instance of DisneyMcpError", () => {
    expect(new SessionError("msg")).toBeInstanceOf(DisneyMcpError);
  });
});

describe("ApiError", () => {
  it("sets statusCode, endpoint, code = API_ERROR, and name = ApiError", () => {
    const err = new ApiError("not found", 404, "/api/parks");
    expect(err.statusCode).toBe(404);
    expect(err.endpoint).toBe("/api/parks");
    expect(err.code).toBe("API_ERROR");
    expect(err.name).toBe("ApiError");
  });

  it("includes statusCode and endpoint in details", () => {
    const err = new ApiError("server error", 500, "/api/attractions");
    expect(err.details).toMatchObject({ statusCode: 500, endpoint: "/api/attractions" });
  });
});

describe("CacheError", () => {
  it("has code CACHE_ERROR and name CacheError", () => {
    const err = new CacheError("cache miss");
    expect(err.code).toBe("CACHE_ERROR");
    expect(err.name).toBe("CacheError");
  });
});

describe("DatabaseError", () => {
  it("has code DATABASE_ERROR and name DatabaseError", () => {
    const err = new DatabaseError("query failed");
    expect(err.code).toBe("DATABASE_ERROR");
    expect(err.name).toBe("DatabaseError");
  });
});

describe("ValidationError", () => {
  it("sets field, value, code = VALIDATION_ERROR, and name = ValidationError", () => {
    const err = new ValidationError("field required", "destinationId", null);
    expect(err.field).toBe("destinationId");
    expect(err.value).toBeNull();
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.name).toBe("ValidationError");
  });
});

describe("formatErrorResponse", () => {
  it("always sets isError to true", () => {
    const response = formatErrorResponse(new Error("boom"));
    expect(response.isError).toBe(true);
  });

  it("content array has exactly one entry with type 'text'", () => {
    const response = formatErrorResponse(new Error("msg"));
    expect(response.content).toHaveLength(1);
    expect(response.content[0]!.type).toBe("text");
  });

  it("content text is valid JSON", () => {
    const response = formatErrorResponse(new Error("msg"));
    expect(() => JSON.parse(response.content[0]!.text)).not.toThrow();
  });

  it("uses the subclass code for a DisneyMcpError", () => {
    const err = new SessionError("session gone");
    const response = formatErrorResponse(err);
    const body = JSON.parse(response.content[0]!.text) as { code: string; error: string };
    expect(body.code).toBe("SESSION_ERROR");
    expect(body.error).toBe("session gone");
  });

  it("uses VALIDATION_ERROR code for ValidationError", () => {
    const err = new ValidationError("bad field", "name", "");
    const response = formatErrorResponse(err);
    const body = JSON.parse(response.content[0]!.text) as { code: string };
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("uses UNKNOWN_ERROR code for a plain Error", () => {
    const response = formatErrorResponse(new Error("generic failure"));
    const body = JSON.parse(response.content[0]!.text) as { code: string; error: string };
    expect(body.code).toBe("UNKNOWN_ERROR");
    expect(body.error).toBe("generic failure");
  });

  it("converts a non-Error string to a message and uses UNKNOWN_ERROR code", () => {
    const response = formatErrorResponse("something broke");
    const body = JSON.parse(response.content[0]!.text) as { code: string; error: string };
    expect(body.code).toBe("UNKNOWN_ERROR");
    expect(body.error).toBe("something broke");
  });

  it("converts a numeric non-Error value to a string message", () => {
    const response = formatErrorResponse(42);
    const body = JSON.parse(response.content[0]!.text) as { code: string; error: string };
    expect(body.error).toBe("42");
    expect(body.code).toBe("UNKNOWN_ERROR");
  });
});
