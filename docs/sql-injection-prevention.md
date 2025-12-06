# SQL Injection Prevention for LanceDB

## Overview

This document describes the SQL injection prevention design for LanceDB queries in the Mouse MCP project.

## The Problem

LanceDB uses Apache DataFusion's SQL expression engine for filtering via the `.where()` method. Unlike traditional SQL databases, **LanceDB does NOT support parameterized queries**. All WHERE clauses must be constructed as string expressions.

### Vulnerable Code

The original implementation in `/src/vectordb/lancedb.ts` was vulnerable to SQL injection:

```typescript
// Line 118 - Direct string interpolation (VULNERABLE)
await table.delete(`id = '${record.id}' AND model = '${record.model}'`);

// Line 174 - Direct string interpolation (VULNERABLE)
.where(`id = '${entityId}' AND model = '${model}'`)

// Lines 220-222 - Direct string interpolation (VULNERABLE)
const filters: string[] = [`model = '${model}'`];
if (entityType) filters.push(`entityType = '${entityType}'`);
if (destinationId) filters.push(`destinationId = '${destinationId}'`);
```

### Attack Vectors

Without proper escaping, an attacker could inject malicious SQL:

```typescript
// Injection attempt
const maliciousId = "test' OR '1'='1";
const query = `id = '${maliciousId}'`;
// Results in: id = 'test' OR '1'='1'
// This matches ALL records instead of just one!

// Drop table attempt
const maliciousModel = "'; DROP TABLE embeddings; --";
const query = `model = '${maliciousModel}'`;
// Results in: model = ''; DROP TABLE embeddings; --'
```

## DataFusion SQL Escaping Rules

Based on [Apache DataFusion documentation](https://datafusion.apache.org/user-guide/sql/operators.html), the SQL dialect has specific escaping rules:

### String Literals

1. **Single quotes** - Escape by doubling: `'` becomes `''`
   - Example: `'O'Brien'` in SQL is written as `'O''Brien'`
2. **Backslashes** - Treated literally (NOT escape characters)
   - Example: `'foo\nbar'` contains literal backslash-n, not a newline
3. **No C-style escapes** - `\n`, `\t`, etc. are NOT supported in regular string literals
   - Use E-style strings (`E'line1\nline2'`) for escape sequences

### Identifiers (Column Names)

1. **Backticks** - Use for escaping: `` `column name` ``
2. **Special characters** - Require backtick escaping (spaces, hyphens, SQL keywords)
3. **Nested fields** - Each segment must be backtick-escaped separately
4. **Periods** - NOT supported in field names

## Solution Design

### Architecture Principles

Following SOLID principles and security-by-default:

1. **Single Responsibility** - Each function has one clear purpose
2. **Fail Fast** - Validate inputs immediately, throw on invalid data
3. **Type Safety** - Leverage TypeScript for compile-time safety
4. **Defense in Depth** - Multiple layers of validation
5. **Secure by Default** - All user input MUST go through escaping

### Core Functions

#### 1. `escapeSqlValue(value: string): string`

Escapes string values for use in WHERE clauses.

**Implementation:**

- Doubles all single quotes (`'` → `''`)
- Rejects null bytes (`\0`)
- Validates input type
- Treats backslashes literally

**Example:**

```typescript
escapeSqlValue("O'Brien"); // Returns: "O''Brien"
escapeSqlValue("test' OR '1'='1"); // Returns: "test'' OR ''1''=''1"
```

#### 2. `escapeSqlIdentifier(identifier: string): string`

Escapes column/field names for use in WHERE clauses.

**Implementation:**

- Wraps identifier in backticks
- Doubles backticks within identifier
- Rejects periods (nested paths need special handling)
- Rejects empty strings and null bytes
- Validates input type

**Example:**

```typescript
escapeSqlIdentifier("id"); // Returns: "`id`"
escapeSqlIdentifier("CUBE"); // Returns: "`CUBE`" (SQL keyword)
escapeSqlIdentifier("column name"); // Returns: "`column name`"
```

#### 3. `buildWhereClause(conditions: WhereCondition[], operator?: LogicalOperator): string`

High-level API for building safe WHERE clauses from structured conditions.

**Implementation:**

- Validates operators against allowlist
- Escapes column names and values
- Handles NULL values correctly
- Type-checks all inputs
- Combines conditions with AND/OR

**Example:**

```typescript
buildWhereClause([
  { column: "id", operator: "=", value: "attraction-123" },
  { column: "model", operator: "=", value: "transformers:v2" },
]);
// Returns: "`id` = 'attraction-123' AND `model` = 'transformers:v2'"

buildWhereClause([{ column: "deletedAt", operator: "IS", value: null }]);
// Returns: "`deletedAt` IS NULL"
```

#### 4. `buildEqualityClause(fields: Record<string, string | number | boolean>): string`

Convenience function for simple equality conditions.

**Example:**

```typescript
buildEqualityClause({ id: "test-123", model: "transformers:v2" });
// Returns: "`id` = 'test-123' AND `model` = 'transformers:v2'"
```

### Supported Types

- **String** - Escaped and wrapped in single quotes
- **Number** - Validated (finite) and used directly
- **Boolean** - Converted to `true`/`false` literals
- **Null** - Only allowed with `IS` and `IS NOT` operators

### Operator Allowlist

Only safe operators are permitted:

- Comparison: `=`, `!=`, `<`, `>`, `<=`, `>=`
- Pattern matching: `LIKE`
- Null testing: `IS`, `IS NOT`

Arbitrary operators are rejected to prevent injection attacks.

## Usage Examples

### Safe Delete Operation

**Before (VULNERABLE):**

```typescript
await table.delete(`id = '${record.id}' AND model = '${record.model}'`);
```

**After (SAFE):**

```typescript
import { buildEqualityClause } from "./sql-escaping.js";

const whereClause = buildEqualityClause({
  id: record.id,
  model: record.model,
});
await table.delete(whereClause);
```

### Safe Batch Delete

**Before (VULNERABLE):**

```typescript
const deleteConditions = records.map((r) => `(id = '${r.id}' AND model = '${r.model}')`);
await table.delete(deleteConditions.join(" OR "));
```

**After (SAFE):**

```typescript
import { buildEqualityClause } from "./sql-escaping.js";

const deleteConditions = records.map((r) =>
  buildEqualityClause({
    id: r.id,
    model: r.model,
  })
);
await table.delete(deleteConditions.map((c) => `(${c})`).join(" OR "));
```

### Safe Query with Filters

**Before (VULNERABLE):**

```typescript
const filters: string[] = [`model = '${model}'`];
if (entityType) filters.push(`entityType = '${entityType}'`);
if (destinationId) filters.push(`destinationId = '${destinationId}'`);
const whereClause = filters.join(" AND ");
```

**After (SAFE):**

```typescript
import { buildWhereClause, type WhereCondition } from "./sql-escaping.js";

const conditions: WhereCondition[] = [{ column: "model", operator: "=", value: model }];
if (entityType) conditions.push({ column: "entityType", operator: "=", value: entityType });
if (destinationId)
  conditions.push({ column: "destinationId", operator: "=", value: destinationId });

const whereClause = buildWhereClause(conditions);
```

## Security Considerations

### What This Prevents

- **String escaping attacks** - Single quotes in user input are properly escaped
- **Operator injection** - Only allowlisted operators are permitted
- **Type confusion** - All values are validated and typed correctly
- **NULL injection** - NULL values are handled explicitly
- **Column name injection** - Column names are validated and backtick-escaped

### What This Does NOT Prevent

- **Logic bugs** - Incorrect WHERE clauses due to application logic errors
- **DoS attacks** - Extremely long WHERE clauses could cause performance issues
- **Authorization bypass** - Filtering by wrong fields could expose unauthorized data

### Defense in Depth

This solution is ONE layer of defense. Additional security measures MUST include:

1. **Input validation** - Validate user input before it reaches the database layer
2. **Authorization** - Ensure users can only access their own data
3. **Rate limiting** - Prevent abuse of search/query endpoints
4. **Monitoring** - Log and alert on suspicious query patterns
5. **Least privilege** - Run database with minimal required permissions

## Testing

Comprehensive test suite in `/src/vectordb/sql-escaping.test.ts`:

- **330+ test cases** covering:
  - Basic escaping functionality
  - SQL injection attempts
  - Edge cases (unicode, special characters, null bytes)
  - Type validation
  - Operator validation
  - NULL handling
  - Real-world usage patterns

**Run tests:**

```bash
npm test sql-escaping
```

## Migration Guide

### Step 1: Import Functions

```typescript
import { buildEqualityClause, buildWhereClause } from "./sql-escaping.js";
```

### Step 2: Replace String Interpolation

Find all instances of:

```typescript
`column = '${value}'`;
```

Replace with:

```typescript
buildEqualityClause({ column: value });
```

### Step 3: Complex Queries

For queries with operators other than `=`:

```typescript
buildWhereClause([
  { column: "count", operator: ">", value: 10 },
  { column: "status", operator: "!=", value: "deleted" },
]);
```

### Step 4: Test Thoroughly

- Run test suite
- Verify queries return expected results
- Test with edge cases (special characters in data)
- Monitor logs for errors

## Performance

### Overhead

- **Negligible** - String escaping is O(n) where n is string length
- **Validation** - Input validation adds minimal overhead
- **Type checking** - Zero runtime cost (TypeScript compile-time only)

### Optimization

- Functions are pure and could be memoized if needed
- No regular expression overhead for simple cases
- Single-pass string replacement

## References

- [LanceDB Filtering Documentation](https://lancedb.github.io/lancedb/sql/)
- [LanceDB Metadata Filtering](https://docs.lancedb.com/core/filtering)
- [Apache DataFusion SQL Operators](https://datafusion.apache.org/user-guide/sql/operators.html)
- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [SQL Injection Prevention Best Practices](https://www.ptsecurity.com/ww-en/analytics/knowledge-base/how-to-prevent-sql-injection-attacks/)

## Future Enhancements

### Potential Improvements

1. **Query builder pattern** - Fluent API for complex queries
2. **Query validation** - Analyze queries for suspicious patterns
3. **Performance monitoring** - Track query execution time
4. **Query caching** - Cache frequently-used WHERE clauses
5. **Expression builder** - Support for complex expressions (nested AND/OR)

### Known Limitations

1. **No nested boolean logic** - Cannot express `(A AND B) OR (C AND D)`
   - Workaround: Build separate queries or use multiple WHERE calls
2. **No IN operator** - Not currently supported
   - Workaround: Use multiple `OR` conditions
3. **No BETWEEN operator** - Not currently supported
   - Workaround: Use `>= AND <=`

## Maintenance

### Adding New Operators

To add a new operator:

1. Add to `ComparisonOperator` type in `sql-escaping.ts`
2. Add to `validOperators` array in `buildWhereClause()`
3. Add test cases in `sql-escaping.test.ts`
4. Update this documentation

### Security Updates

If DataFusion changes its escaping rules:

1. Update `escapeSqlValue()` and `escapeSqlIdentifier()`
2. Update tests to match new behavior
3. Run full test suite
4. Update documentation with new rules
5. Notify team of breaking changes

## Contact

For questions or security concerns, contact the security team.

**Last Updated:** 2025-12-06
