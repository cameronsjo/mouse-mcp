/**
 * PII Sanitizer Tests
 *
 * Comprehensive test suite for PII detection and redaction.
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeForLogging,
  sanitizeForCache,
  sanitizeObject,
  containsPII,
} from "./pii-sanitizer.js";

describe("PII Sanitizer", () => {
  describe("sanitizeForLogging", () => {
    it("should redact email addresses", () => {
      const input = "Contact us at support@example.com or admin@company.org";
      const result = sanitizeForLogging(input);
      expect(result).toBe("Contact us at [REDACTED_EMAIL] or [REDACTED_EMAIL]");
      expect(result).not.toContain("support@example.com");
      expect(result).not.toContain("admin@company.org");
    });

    it("should redact phone numbers in various formats", () => {
      const testCases = [
        {
          input: "Call me at (555) 123-4567",
          expected: "Call me at [REDACTED_PHONE]",
        },
        {
          input: "Phone: 555-123-4567",
          expected: "Phone: [REDACTED_PHONE]",
        },
        {
          input: "Mobile: 5551234567",
          expected: "Mobile: [REDACTED_PHONE]",
        },
        {
          input: "International: +1-555-123-4567",
          expected: "International: [REDACTED_PHONE]",
        },
      ];

      for (const { input, expected } of testCases) {
        const result = sanitizeForLogging(input);
        expect(result).toBe(expected);
      }
    });

    it("should redact Social Security Numbers", () => {
      const input = "SSN: 123-45-6789 for verification";
      const result = sanitizeForLogging(input);
      expect(result).toBe("SSN: [REDACTED_SSN] for verification");
      expect(result).not.toContain("123-45-6789");
    });

    it("should redact credit card numbers", () => {
      const testCases = [
        {
          input: "Card: 4532-1234-5678-9010",
          expected: "Card: [REDACTED_CREDIT_CARD]",
        },
        {
          input: "CC: 4532 1234 5678 9010",
          expected: "CC: [REDACTED_CREDIT_CARD]",
        },
        {
          input: "Number: 4532123456789010",
          expected: "Number: [REDACTED_CREDIT_CARD]",
        },
      ];

      for (const { input, expected } of testCases) {
        const result = sanitizeForLogging(input);
        expect(result).toBe(expected);
      }
    });

    it("should redact IP addresses", () => {
      const input = "Request from 192.168.1.100 at 10.0.0.5";
      const result = sanitizeForLogging(input);
      expect(result).toBe("Request from [REDACTED_IP_ADDRESS] at [REDACTED_IP_ADDRESS]");
      expect(result).not.toContain("192.168.1.100");
      expect(result).not.toContain("10.0.0.5");
    });

    it("should redact API keys and tokens", () => {
      const testCases = [
        {
          input: "api_key: sk_live_1234567890abcdefghij",
          expected: "api_key: [REDACTED_API_KEY]",
        },
        {
          input: "token=ghp_1234567890abcdefghijklmnop",
          expected: "token: [REDACTED_API_KEY]",
        },
        {
          input: "secret: AIzaSyB1234567890abcdefghijklm",
          expected: "secret: [REDACTED_API_KEY]",
        },
      ];

      for (const { input, expected } of testCases) {
        const result = sanitizeForLogging(input);
        expect(result).toBe(expected);
      }
    });

    it("should redact ZIP codes when preceded by keywords", () => {
      const input = "Address: 123 Main St, zip 12345-6789";
      const result = sanitizeForLogging(input);
      expect(result).toContain("[REDACTED_ZIP_CODE]");
      expect(result).not.toContain("12345-6789");
    });

    it("should not redact valid ZIP codes without context to avoid false positives", () => {
      // Stand-alone numbers should not be redacted unless they match other PII patterns
      const input = "Order number 12345 shipped";
      const result = sanitizeForLogging(input);
      expect(result).toBe(input); // Should remain unchanged
    });

    it("should handle multiple PII types in one string", () => {
      const input = "Email: john@example.com, Phone: 555-123-4567, SSN: 123-45-6789";
      const result = sanitizeForLogging(input);
      expect(result).toBe("Email: [REDACTED_EMAIL], Phone: [REDACTED_PHONE], SSN: [REDACTED_SSN]");
    });

    it("should handle strings with no PII", () => {
      const input = "Searching for Space Mountain at Magic Kingdom";
      const result = sanitizeForLogging(input);
      expect(result).toBe(input);
    });

    it("should handle empty strings", () => {
      const result = sanitizeForLogging("");
      expect(result).toBe("");
    });

    it("should preserve non-string input", () => {
      // TypeScript typing prevents this, but test runtime behavior
      const result = sanitizeForLogging(123 as unknown as string);
      expect(result).toBe(123);
    });
  });

  describe("sanitizeForCache", () => {
    it("should sanitize cache keys containing emails", () => {
      const key = "user:john.doe@example.com:profile";
      const result = sanitizeForCache(key);
      expect(result).toBe("user:[REDACTED_EMAIL]:profile");
    });

    it("should sanitize cache keys containing phone numbers", () => {
      const key = "booking:555-123-4567:reservation";
      const result = sanitizeForCache(key);
      expect(result).toBe("booking:[REDACTED_PHONE]:reservation");
    });

    it("should not modify cache keys without PII", () => {
      const key = "attractions:wdw:magic-kingdom";
      const result = sanitizeForCache(key);
      expect(result).toBe(key);
    });
  });

  describe("sanitizeObject", () => {
    it("should sanitize string values in flat objects", () => {
      const obj = {
        name: "John Doe",
        email: "john@example.com",
        phone: "555-123-4567",
        park: "Magic Kingdom",
      };

      const result = sanitizeObject(obj);
      expect(result.name).toBe("John Doe");
      expect(result.email).toBe("[REDACTED_EMAIL]");
      expect(result.phone).toBe("[REDACTED_PHONE]");
      expect(result.park).toBe("Magic Kingdom");
    });

    it("should sanitize nested objects", () => {
      const obj = {
        user: {
          contact: {
            email: "user@example.com",
            phone: "555-123-4567",
          },
          preferences: {
            park: "EPCOT",
          },
        },
      };

      const result = sanitizeObject(obj);
      expect(result.user.contact.email).toBe("[REDACTED_EMAIL]");
      expect(result.user.contact.phone).toBe("[REDACTED_PHONE]");
      expect(result.user.preferences.park).toBe("EPCOT");
    });

    it("should sanitize arrays of strings", () => {
      const obj = {
        contacts: ["admin@example.com", "support@example.com"],
        parks: ["Magic Kingdom", "EPCOT"],
      };

      const result = sanitizeObject(obj);
      expect(result.contacts).toEqual(["[REDACTED_EMAIL]", "[REDACTED_EMAIL]"]);
      expect(result.parks).toEqual(["Magic Kingdom", "EPCOT"]);
    });

    it("should sanitize arrays of objects", () => {
      const obj = {
        users: [
          { name: "Alice", email: "alice@example.com" },
          { name: "Bob", email: "bob@example.com" },
        ],
      };

      const result = sanitizeObject(obj);
      expect(result.users[0]?.email).toBe("[REDACTED_EMAIL]");
      expect(result.users[1]?.email).toBe("[REDACTED_EMAIL]");
      expect(result.users[0]?.name).toBe("Alice");
      expect(result.users[1]?.name).toBe("Bob");
    });

    it("should preserve non-string primitive values", () => {
      const obj = {
        count: 42,
        enabled: true,
        value: null,
        price: 99.99,
      };

      const result = sanitizeObject(obj);
      expect(result).toEqual(obj);
    });

    it("should handle empty objects", () => {
      const obj = {};
      const result = sanitizeObject(obj);
      expect(result).toEqual({});
    });
  });

  describe("containsPII", () => {
    it("should detect emails", () => {
      expect(containsPII("Contact: support@example.com")).toBe(true);
    });

    it("should detect phone numbers", () => {
      expect(containsPII("Call 555-123-4567")).toBe(true);
    });

    it("should detect SSNs", () => {
      expect(containsPII("SSN: 123-45-6789")).toBe(true);
    });

    it("should detect credit cards", () => {
      expect(containsPII("Card: 4532-1234-5678-9010")).toBe(true);
    });

    it("should detect IP addresses", () => {
      expect(containsPII("From 192.168.1.1")).toBe(true);
    });

    it("should detect API keys", () => {
      expect(containsPII("api_key: sk_live_1234567890abcdefghij")).toBe(true);
    });

    it("should return false for clean text", () => {
      expect(containsPII("Searching for Space Mountain")).toBe(false);
    });

    it("should return false for empty strings", () => {
      expect(containsPII("")).toBe(false);
    });

    it("should handle non-string input", () => {
      expect(containsPII(123 as unknown as string)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle text with unicode characters", () => {
      const input = "Email: user@example.com with emoji 🎢";
      const result = sanitizeForLogging(input);
      expect(result).toBe("Email: [REDACTED_EMAIL] with emoji 🎢");
    });

    it("should handle very long strings efficiently", () => {
      const longText = "normal text ".repeat(1000) + "email@example.com";
      const result = sanitizeForLogging(longText);
      expect(result).toContain("[REDACTED_EMAIL]");
      expect(result).not.toContain("email@example.com");
    });

    it("should handle malformed email-like patterns correctly", () => {
      const input = "Not an email: user@@ or @domain";
      const result = sanitizeForLogging(input);
      // Should not match invalid patterns
      expect(result).toBe(input);
    });

    it("should handle multiple consecutive PII items", () => {
      const input = "john@example.com jane@example.com bob@example.com";
      const result = sanitizeForLogging(input);
      expect(result).toBe("[REDACTED_EMAIL] [REDACTED_EMAIL] [REDACTED_EMAIL]");
    });
  });

  describe("real-world scenarios", () => {
    it("should sanitize user search queries with accidental PII", () => {
      const query = "Find reservations for john.doe@gmail.com at Magic Kingdom";
      const result = sanitizeForLogging(query);
      expect(result).toBe("Find reservations for [REDACTED_EMAIL] at Magic Kingdom");
    });

    it("should sanitize error messages containing user data", () => {
      const error = "Failed to send notification to user@example.com: Connection timeout";
      const result = sanitizeForLogging(error);
      expect(result).toBe("Failed to send notification to [REDACTED_EMAIL]: Connection timeout");
    });

    it("should sanitize cache keys with user identifiers", () => {
      const cacheKey = "reservation:555-123-4567:2024-12-25";
      const result = sanitizeForCache(cacheKey);
      expect(result).toBe("reservation:[REDACTED_PHONE]:2024-12-25");
    });

    it("should handle Disney park data without false positives", () => {
      const parkData = {
        name: "Magic Kingdom Park",
        id: "80007944",
        location: "Orlando, FL",
        attractions: ["Space Mountain", "Big Thunder Mountain Railroad"],
      };
      const result = sanitizeObject(parkData);
      // Should not modify park data
      expect(result).toEqual(parkData);
    });
  });
});
