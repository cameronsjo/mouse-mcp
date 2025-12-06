/**
 * Test suite for SQL escaping functions
 *
 * These tests verify that our escaping functions properly prevent SQL injection
 * while maintaining correct SQL syntax for DataFusion/LanceDB queries.
 */

import { describe, it, expect } from "vitest";
import {
  escapeSqlValue,
  escapeSqlIdentifier,
  buildWhereClause,
  buildEqualityClause,
  type WhereCondition,
} from "./sql-escaping.js";

describe("escapeSqlValue", () => {
  it("should escape single quotes by doubling them", () => {
    expect(escapeSqlValue("O'Brien")).toBe("O''Brien");
    expect(escapeSqlValue("It's a test")).toBe("It''s a test");
    expect(escapeSqlValue("'quoted'")).toBe("''quoted''");
  });

  it("should handle multiple single quotes", () => {
    expect(escapeSqlValue("foo'bar'baz")).toBe("foo''bar''baz");
    expect(escapeSqlValue("'''")).toBe("''''''");
  });

  it("should treat backslashes literally (no escaping)", () => {
    // DataFusion treats backslashes as literal characters
    expect(escapeSqlValue("test\\n")).toBe("test\\n");
    expect(escapeSqlValue("path\\to\\file")).toBe("path\\to\\file");
    expect(escapeSqlValue("\\")).toBe("\\");
  });

  it("should handle empty strings", () => {
    expect(escapeSqlValue("")).toBe("");
  });

  it("should handle strings with no special characters", () => {
    expect(escapeSqlValue("simple")).toBe("simple");
    expect(escapeSqlValue("test123")).toBe("test123");
  });

  it("should handle SQL injection attempts", () => {
    // Classic injection attempt
    expect(escapeSqlValue("' OR '1'='1")).toBe("'' OR ''1''=''1");

    // Attempting to close string and add condition
    expect(escapeSqlValue("test' AND id='malicious")).toBe("test'' AND id=''malicious");

    // Attempting UNION attack
    expect(escapeSqlValue("' UNION SELECT * FROM secrets--")).toBe(
      "'' UNION SELECT * FROM secrets--"
    );

    // Attempting to drop table
    expect(escapeSqlValue("'; DROP TABLE embeddings; --")).toBe("''; DROP TABLE embeddings; --");
  });

  it("should handle unicode characters", () => {
    expect(escapeSqlValue("café")).toBe("café");
    expect(escapeSqlValue("日本語")).toBe("日本語");
    expect(escapeSqlValue("emoji 🎢")).toBe("emoji 🎢");
  });

  it("should handle special SQL characters (non-quote)", () => {
    expect(escapeSqlValue("100%")).toBe("100%");
    expect(escapeSqlValue("a_b")).toBe("a_b");
    expect(escapeSqlValue("test;")).toBe("test;");
    expect(escapeSqlValue("value--comment")).toBe("value--comment");
  });

  it("should reject null bytes", () => {
    expect(() => escapeSqlValue("test\0value")).toThrow("null bytes");
    expect(() => escapeSqlValue("\0")).toThrow("null bytes");
  });

  it("should validate input type", () => {
    // @ts-expect-error - testing runtime validation
    expect(() => escapeSqlValue(123)).toThrow(TypeError);
    // @ts-expect-error - testing runtime validation
    expect(() => escapeSqlValue(null)).toThrow(TypeError);
    // @ts-expect-error - testing runtime validation
    expect(() => escapeSqlValue(undefined)).toThrow(TypeError);
    // @ts-expect-error - testing runtime validation
    expect(() => escapeSqlValue({})).toThrow(TypeError);
  });
});

describe("escapeSqlIdentifier", () => {
  it("should wrap identifiers in backticks", () => {
    expect(escapeSqlIdentifier("id")).toBe("`id`");
    expect(escapeSqlIdentifier("model")).toBe("`model`");
    expect(escapeSqlIdentifier("entityType")).toBe("`entityType`");
  });

  it("should escape SQL keywords", () => {
    expect(escapeSqlIdentifier("SELECT")).toBe("`SELECT`");
    expect(escapeSqlIdentifier("CUBE")).toBe("`CUBE`");
    expect(escapeSqlIdentifier("ORDER")).toBe("`ORDER`");
  });

  it("should handle identifiers with spaces", () => {
    expect(escapeSqlIdentifier("column name")).toBe("`column name`");
    expect(escapeSqlIdentifier("my column")).toBe("`my column`");
  });

  it("should handle identifiers with special characters", () => {
    expect(escapeSqlIdentifier("column-name")).toBe("`column-name`");
    expect(escapeSqlIdentifier("column_name")).toBe("`column_name`");
    expect(escapeSqlIdentifier("column@name")).toBe("`column@name`");
  });

  it("should escape backticks by doubling them", () => {
    expect(escapeSqlIdentifier("my`column")).toBe("`my``column`");
    expect(escapeSqlIdentifier("`quoted`")).toBe("```quoted```");
  });

  it("should reject periods (nested paths need special handling)", () => {
    expect(() => escapeSqlIdentifier("nested.field")).toThrow("periods");
    expect(() => escapeSqlIdentifier("a.b.c")).toThrow("periods");
  });

  it("should reject empty identifiers", () => {
    expect(() => escapeSqlIdentifier("")).toThrow("empty");
  });

  it("should reject null bytes", () => {
    expect(() => escapeSqlIdentifier("test\0column")).toThrow("null bytes");
  });

  it("should validate input type", () => {
    // @ts-expect-error - testing runtime validation
    expect(() => escapeSqlIdentifier(123)).toThrow(TypeError);
    // @ts-expect-error - testing runtime validation
    expect(() => escapeSqlIdentifier(null)).toThrow(TypeError);
    // @ts-expect-error - testing runtime validation
    expect(() => escapeSqlIdentifier(undefined)).toThrow(TypeError);
  });
});

describe("buildWhereClause", () => {
  describe("single conditions", () => {
    it("should build simple equality condition", () => {
      const conditions: WhereCondition[] = [{ column: "id", operator: "=", value: "test-123" }];
      expect(buildWhereClause(conditions)).toBe("`id` = 'test-123'");
    });

    it("should handle different operators", () => {
      expect(buildWhereClause([{ column: "count", operator: ">", value: 10 }])).toBe(
        "`count` > 10"
      );
      expect(buildWhereClause([{ column: "count", operator: ">=", value: 10 }])).toBe(
        "`count` >= 10"
      );
      expect(buildWhereClause([{ column: "count", operator: "<", value: 10 }])).toBe(
        "`count` < 10"
      );
      expect(buildWhereClause([{ column: "count", operator: "<=", value: 10 }])).toBe(
        "`count` <= 10"
      );
      expect(buildWhereClause([{ column: "status", operator: "!=", value: "active" }])).toBe(
        "`status` != 'active'"
      );
    });

    it("should handle LIKE operator", () => {
      expect(buildWhereClause([{ column: "name", operator: "LIKE", value: "%test%" }])).toBe(
        "`name` LIKE '%test%'"
      );
    });

    it("should handle IS NULL", () => {
      expect(buildWhereClause([{ column: "deletedAt", operator: "IS", value: null }])).toBe(
        "`deletedAt` IS NULL"
      );
    });

    it("should handle IS NOT NULL", () => {
      expect(buildWhereClause([{ column: "createdAt", operator: "IS NOT", value: null }])).toBe(
        "`createdAt` IS NOT NULL"
      );
    });
  });

  describe("value types", () => {
    it("should handle string values", () => {
      expect(buildWhereClause([{ column: "name", operator: "=", value: "test" }])).toBe(
        "`name` = 'test'"
      );
    });

    it("should handle numeric values", () => {
      expect(buildWhereClause([{ column: "count", operator: "=", value: 42 }])).toBe(
        "`count` = 42"
      );
      expect(buildWhereClause([{ column: "price", operator: "=", value: 3.14 }])).toBe(
        "`price` = 3.14"
      );
      expect(buildWhereClause([{ column: "total", operator: "=", value: 0 }])).toBe("`total` = 0");
      expect(buildWhereClause([{ column: "balance", operator: "=", value: -100 }])).toBe(
        "`balance` = -100"
      );
    });

    it("should handle boolean values", () => {
      expect(buildWhereClause([{ column: "active", operator: "=", value: true }])).toBe(
        "`active` = true"
      );
      expect(buildWhereClause([{ column: "deleted", operator: "=", value: false }])).toBe(
        "`deleted` = false"
      );
    });

    it("should reject non-finite numbers", () => {
      expect(() => buildWhereClause([{ column: "count", operator: "=", value: Infinity }])).toThrow(
        "finite"
      );
      expect(() =>
        buildWhereClause([{ column: "count", operator: "=", value: -Infinity }])
      ).toThrow("finite");
      expect(() => buildWhereClause([{ column: "count", operator: "=", value: NaN }])).toThrow(
        "finite"
      );
    });
  });

  describe("multiple conditions", () => {
    it("should combine conditions with AND by default", () => {
      const conditions: WhereCondition[] = [
        { column: "id", operator: "=", value: "test-123" },
        { column: "model", operator: "=", value: "transformers:v2" },
      ];
      expect(buildWhereClause(conditions)).toBe(
        "`id` = 'test-123' AND `model` = 'transformers:v2'"
      );
    });

    it("should combine conditions with OR when specified", () => {
      const conditions: WhereCondition[] = [
        { column: "type", operator: "=", value: "attraction" },
        { column: "type", operator: "=", value: "dining" },
      ];
      expect(buildWhereClause(conditions, "OR")).toBe("`type` = 'attraction' OR `type` = 'dining'");
    });

    it("should handle complex multi-condition queries", () => {
      const conditions: WhereCondition[] = [
        { column: "model", operator: "=", value: "transformers:v2" },
        { column: "entityType", operator: "=", value: "attraction" },
        { column: "destinationId", operator: "=", value: "wdw-magic-kingdom" },
      ];
      expect(buildWhereClause(conditions)).toBe(
        "`model` = 'transformers:v2' AND `entityType` = 'attraction' AND `destinationId` = 'wdw-magic-kingdom'"
      );
    });
  });

  describe("SQL injection prevention", () => {
    it("should safely escape injection attempts in values", () => {
      const conditions: WhereCondition[] = [
        { column: "name", operator: "=", value: "O'Brien's Pub' OR '1'='1" },
      ];
      // The escaped value won't break out of the string literal
      expect(buildWhereClause(conditions)).toBe("`name` = 'O''Brien''s Pub'' OR ''1''=''1'");
    });

    it("should safely handle attempts to inject operators", () => {
      const conditions: WhereCondition[] = [
        { column: "id", operator: "=", value: "test' AND admin='true" },
      ];
      expect(buildWhereClause(conditions)).toBe("`id` = 'test'' AND admin=''true'");
    });

    it("should reject invalid operators", () => {
      const conditions = [
        { column: "id", operator: "DROP TABLE" as const, value: "test" },
      ] as unknown as WhereCondition[];
      expect(() => buildWhereClause(conditions)).toThrow("Invalid operator");
    });

    it("should validate column names", () => {
      expect(() =>
        buildWhereClause([
          { column: "", operator: "=" as const, value: "test" },
        ] as WhereCondition[])
      ).toThrow("Invalid column");
    });
  });

  describe("validation", () => {
    it("should require at least one condition", () => {
      expect(() => buildWhereClause([])).toThrow("at least one condition");
    });

    it("should reject NULL values with non-NULL operators", () => {
      expect(() => buildWhereClause([{ column: "id", operator: "=", value: null }])).toThrow(
        "NULL values can only be used with IS or IS NOT"
      );
    });

    it("should reject IS/IS NOT with non-NULL values", () => {
      expect(() => buildWhereClause([{ column: "id", operator: "IS", value: "test" }])).toThrow(
        "requires a NULL value"
      );
      expect(() => buildWhereClause([{ column: "id", operator: "IS NOT", value: 123 }])).toThrow(
        "requires a NULL value"
      );
    });

    it("should validate logical operators", () => {
      const conditions: WhereCondition[] = [{ column: "id", operator: "=", value: "test" }];
      // @ts-expect-error - testing runtime validation
      expect(() => buildWhereClause(conditions, "XOR")).toThrow("Invalid logical operator");
    });

    it("should reject invalid condition objects", () => {
      // @ts-expect-error - testing runtime validation
      expect(() => buildWhereClause([null])).toThrow("must be an object");
      // @ts-expect-error - testing runtime validation
      expect(() => buildWhereClause(["string"])).toThrow("must be an object");
    });

    it("should reject unsupported value types", () => {
      expect(() =>
        buildWhereClause([
          // @ts-expect-error - testing runtime validation
          { column: "data", operator: "=", value: { nested: "object" } },
        ])
      ).toThrow("Invalid value type");
      expect(() =>
        buildWhereClause([
          // @ts-expect-error - testing runtime validation
          { column: "data", operator: "=", value: [1, 2, 3] },
        ])
      ).toThrow("Invalid value type");
    });
  });
});

describe("buildEqualityClause", () => {
  it("should build simple equality clause", () => {
    expect(buildEqualityClause({ id: "test-123" })).toBe("`id` = 'test-123'");
  });

  it("should build multi-field equality clause", () => {
    const result = buildEqualityClause({
      id: "attraction-123",
      model: "transformers:v2",
    });
    expect(result).toBe("`id` = 'attraction-123' AND `model` = 'transformers:v2'");
  });

  it("should handle different value types", () => {
    const result = buildEqualityClause({
      name: "Space Mountain",
      count: 42,
      active: true,
    });
    expect(result).toBe("`name` = 'Space Mountain' AND `count` = 42 AND `active` = true");
  });

  it("should safely escape values", () => {
    const result = buildEqualityClause({
      name: "O'Brien's",
    });
    expect(result).toBe("`name` = 'O''Brien''s'");
  });
});

describe("real-world scenarios", () => {
  it("should safely handle LanceDB delete operation", () => {
    // Real code pattern from lancedb.ts line 118
    const record = {
      id: "attraction-space-mountain",
      model: "transformers:all-MiniLM-L6-v2",
    };

    const whereClause = buildEqualityClause({
      id: record.id,
      model: record.model,
    });

    expect(whereClause).toBe(
      "`id` = 'attraction-space-mountain' AND `model` = 'transformers:all-MiniLM-L6-v2'"
    );
  });

  it("should safely handle LanceDB batch delete with injection attempt", () => {
    // Simulating malicious input
    const maliciousRecords = [
      { id: "test-1", model: "model' OR '1'='1" },
      { id: "test' OR '1'='1", model: "model-2" },
    ];

    const conditions = maliciousRecords.map((r) => {
      return buildEqualityClause({ id: r.id, model: r.model });
    });

    // Each condition is safely escaped
    expect(conditions[0]).toBe("`id` = 'test-1' AND `model` = 'model'' OR ''1''=''1'");
    expect(conditions[1]).toBe("`id` = 'test'' OR ''1''=''1' AND `model` = 'model-2'");

    // Combined with OR (as in original code)
    const fullClause = conditions.join(" OR ");
    expect(fullClause).toContain("''");
    // Injection attempts are escaped and won't execute as SQL
  });

  it("should safely handle vector search filters", () => {
    // Real code pattern from lancedb.ts line 220-224
    const model = "transformers:v2";
    const entityType = "attraction";
    const destinationId = "wdw-magic-kingdom";

    const conditions: WhereCondition[] = [
      { column: "model", operator: "=", value: model },
      { column: "entityType", operator: "=", value: entityType },
      { column: "destinationId", operator: "=", value: destinationId },
    ];

    const whereClause = buildWhereClause(conditions);

    expect(whereClause).toBe(
      "`model` = 'transformers:v2' AND `entityType` = 'attraction' AND `destinationId` = 'wdw-magic-kingdom'"
    );
  });

  it("should handle edge case: attraction names with special characters", () => {
    const conditions: WhereCondition[] = [
      { column: "name", operator: "LIKE", value: "%Rock 'n' Roller Coaster%" },
    ];

    const whereClause = buildWhereClause(conditions);

    expect(whereClause).toBe("`name` LIKE '%Rock ''n'' Roller Coaster%'");
  });
});
