# Roadmap Research

Research questions and investigations for mouse-mcp.

## Active Research Initiatives

| Initiative | File | Priority | Status |
|------------|------|----------|--------|
| MCP OAuth 2.1 Authorization | [research-mcp-authorization.md](./research-mcp-authorization.md) | P1 | **Decided** |
| HTTP Transport Migration | [research-http-transport.md](./research-http-transport.md) | P1 | **Decided** |

---

## General Research Questions

| Item | Priority | Question | Status |
|------|----------|----------|--------|
| JWT signature verification | p1 | Should Disney JWT tokens be verified or is metadata extraction sufficient? | **Decided** |
| LanceDB parameterized queries | p1 | Does LanceDB support parameterized queries natively? | **Decided** |
| fastmcp migration feasibility | p2 | Would migrating to Python fastmcp provide benefits vs current TypeScript SDK? | **Decided** |
| Circular dependency resolution | p2 | Best pattern to resolve entities.ts ↔ embeddings/search.ts coupling | **Decided** |
| RFC 9457 error format adoption | p3 | Should error responses follow RFC 9457 Problem Details spec? | **Decided** |

---

## Decisions

### 1. JWT Signature Verification (Disney tokens)

**Decision:** Metadata extraction only - no signature verification needed.

**Rationale:**

- The Disney `__d` JWT is only used for logging/debugging (expires_in, token_type)
- We don't make authorization decisions based on this token
- The actual session cookies are what matter for API calls
- Verifying Disney's JWT signature would require their public keys (not available)

**Action:** Add a code comment explaining this is intentional metadata extraction, not security validation.

---

### 2. LanceDB Parameterized Queries

**Decision:** LanceDB does NOT support parameterized queries. Manual escaping required.

**Findings:**

- LanceDB uses DataFusion SQL expressions as string filters via `.where()`
- No parameterized query / prepared statement support
- Escaping rules: backticks for column names, standard SQL string escaping for values
- SQL injection is a real risk with user-provided filter values

**Action:** Implement `escapeSqlValue()` helper:

```typescript
function escapeSqlValue(value: string): string {
  // Escape single quotes by doubling them (SQL standard)
  return value.replace(/'/g, "''");
}

// Usage
.where(`id = '${escapeSqlValue(entityId)}' AND model = '${escapeSqlValue(model)}'`)
```

**References:**

- [LanceDB Filtering Docs](https://lancedb.com/docs/search/filtering/)

---

### 3. FastMCP Migration Feasibility

**Decision:** Stay with TypeScript SDK. No migration.

**Rationale:**

- Current TypeScript implementation is solid and uses official SDK
- Playwright (session management) has best-in-class Node.js support
- Transformers.js embeddings work well in Node.js
- FastMCP Python advantages (Pydantic, decorators) aren't compelling enough to justify rewrite
- TypeScript FastMCP exists but adds another dependency layer
- Team already has TypeScript expertise in this codebase

**Trade-offs considered:**

| Factor | TypeScript SDK | FastMCP Python |
|--------|---------------|----------------|
| Playwright support | Native, excellent | Requires subprocess or bridge |
| Type safety | Native TypeScript | Pydantic at runtime |
| OAuth support | Manual (spec-compliant) | Built-in auth providers |
| Deployment | Node.js | Python runtime |

**References:**

- [FastMCP Python](https://github.com/jlowin/fastmcp)
- [MCP SDK Comparison](https://medium.com/@divyanshbhatiajm19/comparing-mcp-server-frameworks-which-one-should-you-choose-cbadab4ddc80)

---

### 4. Circular Dependency Resolution

**Decision:** Use event emitter pattern with typed events.

**Current problem:** `entities.ts` imports `embeddings/search.ts`, which imports `entities.ts`

**Solution:**

```typescript
// src/events/entity-events.ts
import { EventEmitter } from 'events';
import type { DisneyEntity } from '../types/index.js';

interface EntityEvents {
  'entity:saved': (entity: DisneyEntity) => void;
  'entity:batch-saved': (entities: DisneyEntity[]) => void;
}

export const entityEvents = new EventEmitter() as TypedEmitter<EntityEvents>;

// In entities.ts - emit events, no import of embeddings
entityEvents.emit('entity:saved', entity);

// In embeddings/search.ts - subscribe to events
entityEvents.on('entity:saved', (entity) => {
  void ensureEmbedding(entity);
});
```

**Alternative considered:** Dependency injection container (tsyringe) - rejected as overkill for this use case.

**References:**

- [TypeScript Circular Dependencies](https://www.fixwizrd.com/how-to/managing-circular-dependencies-in-typescript-modules/)

---

### 5. RFC 9457 Problem Details

**Decision:** Adopt RFC 9457 for MCP error responses.

**Rationale:**

- Standard format improves client error handling
- Replaces RFC 7807 (obsoleted)
- MCP clients can parse consistent error structure
- Provides `type`, `title`, `status`, `detail`, `instance` fields
- Enables machine-readable error categorization

**Implementation:**

```typescript
interface ProblemDetails {
  type: string;        // URI identifying error type
  title: string;       // Short human-readable summary
  status: number;      // HTTP status code equivalent
  detail?: string;     // Explanation specific to this occurrence
  instance?: string;   // URI for this specific occurrence
  [key: string]: unknown; // Extensions
}

// Example
{
  "type": "https://mouse-mcp.dev/errors/entity-not-found",
  "title": "Entity Not Found",
  "status": 404,
  "detail": "No attraction found with ID '12345'",
  "entityId": "12345"
}
```

**Action:** Update `formatErrorResponse()` in `src/shared/errors.ts` to return RFC 9457 format.

**References:**

- [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Problem Details Guide](https://redocly.com/blog/problem-details-9457)

---

## How to Add Research

Create a new file in this folder with the naming convention:

```
research-{topic}.md
```

Then add an entry to the "Active Research Initiatives" table above.

### Template

```markdown
# {Topic} Research

Research for {brief description}.

## Status

- **Status:** Research | In Progress | Decided | Implemented
- **Priority:** P0-P4
- **Blocking:** What this unblocks

---

## Research Questions

| Item | Priority | Question | Status |
|------|----------|----------|--------|
| ... | ... | ... | Open |

---

## Findings

...

---

## Decision

**Decision:** {What was decided}
**Rationale:** {Why}
**Date:** {When}

---

## References

- [Link](url)
```
