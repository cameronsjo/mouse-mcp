/**
 * SQL Injection Prevention for LanceDB/DataFusion Queries
 *
 * LanceDB uses Apache DataFusion's SQL expression engine for WHERE clauses.
 * Since parameterized queries are NOT supported, we MUST escape user input.
 *
 * DataFusion SQL Escaping Rules:
 * - Single quotes in string literals: escape by doubling ('')
 * - Backslashes: treated literally (no escaping needed in normal string literals)
 * - No support for C-style escape sequences (\n, \t) in regular string literals
 * - Column names with special chars: use backticks (`)
 *
 * References:
 * - https://datafusion.apache.org/user-guide/sql/operators.html
 * - https://lancedb.github.io/lancedb/sql/
 */

/**
 * Escapes a string value for safe use in DataFusion SQL WHERE clauses.
 *
 * DataFusion uses SQL-standard single-quote escaping: doubling the quote character.
 * Backslashes are treated literally (not as escape characters).
 *
 * WHY: LanceDB does not support parameterized queries. This function prevents
 * SQL injection by escaping single quotes in user-supplied string values.
 *
 * @param value - The string value to escape
 * @returns The escaped string value (without surrounding quotes)
 *
 * @example
 * ```typescript
 * escapeSqlValue("O'Brien");  // Returns: "O''Brien"
 * escapeSqlValue("test\\n");  // Returns: "test\\n" (backslash is literal)
 * escapeSqlValue("foo'bar'baz"); // Returns: "foo''bar''baz"
 * ```
 */
export function escapeSqlValue(value: string): string {
  // Input validation: fail fast on invalid input
  if (typeof value !== "string") {
    throw new TypeError(`escapeSqlValue requires a string, got ${typeof value}`);
  }

  // Null bytes could truncate queries or cause parsing issues
  if (value.includes("\0")) {
    throw new Error("SQL values cannot contain null bytes (\\0)");
  }

  // DataFusion SQL standard: escape single quotes by doubling them
  // Example: "O'Brien" becomes "O''Brien"
  return value.replace(/'/g, "''");
}

/**
 * Escapes a column/field identifier for safe use in DataFusion SQL.
 *
 * WHY: Column names containing special characters, uppercase letters, or SQL keywords
 * must be escaped using backticks in DataFusion SQL.
 *
 * @param identifier - The column/field name to escape
 * @returns The escaped identifier with backticks
 *
 * @example
 * ```typescript
 * escapeSqlIdentifier("id");           // Returns: "`id`"
 * escapeSqlIdentifier("CUBE");         // Returns: "`CUBE`" (SQL keyword)
 * escapeSqlIdentifier("column name");  // Returns: "`column name`" (spaces)
 * ```
 */
export function escapeSqlIdentifier(identifier: string): string {
  // Input validation: fail fast on invalid input
  if (typeof identifier !== "string") {
    throw new TypeError(`escapeSqlIdentifier requires a string, got ${typeof identifier}`);
  }

  if (identifier.length === 0) {
    throw new Error("SQL identifiers cannot be empty");
  }

  // Reject identifiers containing periods (nested paths require special handling)
  if (identifier.includes(".")) {
    throw new Error(
      "SQL identifiers cannot contain periods. For nested fields, escape each segment separately."
    );
  }

  // Null bytes could truncate queries or cause parsing issues
  if (identifier.includes("\0")) {
    throw new Error("SQL identifiers cannot contain null bytes (\\0)");
  }

  // Backticks in identifiers must be escaped by doubling them
  // Example: `my`column` becomes `my``column`
  const escaped = identifier.replace(/`/g, "``");

  // DataFusion uses backticks for identifier escaping
  return `\`${escaped}\``;
}

/**
 * Comparison operators allowed in WHERE clauses.
 * Limited to a safe subset to prevent injection attacks.
 */
export type ComparisonOperator = "=" | "!=" | "<" | ">" | "<=" | ">=" | "LIKE" | "IS" | "IS NOT";

/**
 * Logical operators for combining conditions.
 */
export type LogicalOperator = "AND" | "OR";

/**
 * A single WHERE clause condition.
 */
export interface WhereCondition {
  /** Column name (will be escaped) */
  column: string;
  /** Comparison operator */
  operator: ComparisonOperator;
  /** Value to compare against (will be escaped, or use 'NULL' for IS/IS NOT) */
  value: string | number | boolean | null;
}

/**
 * Builds a safe SQL WHERE clause from structured conditions.
 *
 * WHY: This higher-level API prevents SQL injection by:
 * 1. Validating operators against an allowlist
 * 2. Properly escaping column names and values
 * 3. Handling NULL values correctly
 * 4. Type-checking inputs
 *
 * @param conditions - Array of conditions to combine
 * @param operator - Logical operator to combine conditions (default: AND)
 * @returns A safe SQL WHERE clause string
 *
 * @example
 * ```typescript
 * // Simple equality
 * buildWhereClause([
 *   { column: "id", operator: "=", value: "attraction-123" }
 * ]);
 * // Returns: "`id` = 'attraction-123'"
 *
 * // Multiple conditions with AND
 * buildWhereClause([
 *   { column: "model", operator: "=", value: "transformers:v2" },
 *   { column: "entityType", operator: "=", value: "attraction" }
 * ]);
 * // Returns: "`model` = 'transformers:v2' AND `entityType` = 'attraction'"
 *
 * // NULL handling
 * buildWhereClause([
 *   { column: "deletedAt", operator: "IS", value: null }
 * ]);
 * // Returns: "`deletedAt` IS NULL"
 *
 * // Injection attempt (safely escaped)
 * buildWhereClause([
 *   { column: "name", operator: "=", value: "O'Brien's Pub' OR '1'='1" }
 * ]);
 * // Returns: "`name` = 'O''Brien''s Pub'' OR ''1''=''1'" (safe, won't inject)
 * ```
 */
export function buildWhereClause(
  conditions: WhereCondition[],
  operator: LogicalOperator = "AND"
): string {
  // Input validation: fail fast on invalid input
  if (!Array.isArray(conditions)) {
    throw new TypeError("buildWhereClause requires an array of conditions");
  }

  if (conditions.length === 0) {
    throw new Error("buildWhereClause requires at least one condition");
  }

  if (operator !== "AND" && operator !== "OR") {
    // Cast to string for error message (TypeScript narrows to 'never' after exhaustive check)
    throw new Error(`Invalid logical operator: ${operator as string}. Must be AND or OR.`);
  }

  // Build each condition safely
  const clauses = conditions.map((condition, index) => {
    if (!condition || typeof condition !== "object") {
      throw new TypeError(`Condition at index ${index} must be an object`);
    }

    const { column, operator: op, value } = condition;

    // Validate column
    if (typeof column !== "string" || column.length === 0) {
      throw new Error(`Invalid column at index ${index}: must be a non-empty string`);
    }

    // Validate operator (allowlist)
    const validOperators: ComparisonOperator[] = [
      "=",
      "!=",
      "<",
      ">",
      "<=",
      ">=",
      "LIKE",
      "IS",
      "IS NOT",
    ];

    if (!validOperators.includes(op)) {
      throw new Error(
        `Invalid operator at index ${index}: ${op}. Must be one of: ${validOperators.join(", ")}`
      );
    }

    // Escape column name
    const escapedColumn = escapeSqlIdentifier(column);

    // Handle NULL values
    if (value === null) {
      if (op !== "IS" && op !== "IS NOT") {
        throw new Error(
          `NULL values can only be used with IS or IS NOT operators at index ${index}`
        );
      }
      return `${escapedColumn} ${op} NULL`;
    }

    // IS/IS NOT require NULL values
    if (op === "IS" || op === "IS NOT") {
      throw new Error(`Operator ${op} at index ${index} requires a NULL value`);
    }

    // Escape and format value based on type
    let escapedValue: string;

    if (typeof value === "string") {
      escapedValue = `'${escapeSqlValue(value)}'`;
    } else if (typeof value === "number") {
      // Numbers don't need escaping but validate they're safe
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number at index ${index}: must be finite`);
      }
      escapedValue = value.toString();
    } else if (typeof value === "boolean") {
      // DataFusion supports boolean literals
      escapedValue = value ? "true" : "false";
    } else {
      throw new TypeError(
        `Invalid value type at index ${index}: ${typeof value}. Must be string, number, boolean, or null.`
      );
    }

    return `${escapedColumn} ${op} ${escapedValue}`;
  });

  // Combine with logical operator
  return clauses.join(` ${operator} `);
}

/**
 * Convenience function to build a simple equality condition.
 * Common use case: id = 'value' AND model = 'value'
 *
 * @param fields - Object mapping column names to values
 * @returns A safe SQL WHERE clause string
 *
 * @example
 * ```typescript
 * buildEqualityClause({ id: "attraction-123", model: "transformers:v2" });
 * // Returns: "`id` = 'attraction-123' AND `model` = 'transformers:v2'"
 * ```
 */
export function buildEqualityClause(fields: Record<string, string | number | boolean>): string {
  const conditions: WhereCondition[] = Object.entries(fields).map(([column, value]) => ({
    column,
    operator: "=",
    value,
  }));

  return buildWhereClause(conditions, "AND");
}
