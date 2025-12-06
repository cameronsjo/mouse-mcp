# Roadmap Research

Research questions and investigations for mouse-mcp.

## Active Research Initiatives

| Initiative | File | Priority | Status |
|------------|------|----------|--------|
| MCP OAuth 2.1 Authorization | [research-mcp-authorization.md](./research-mcp-authorization.md) | P1 | Active |

---

## General Research Questions

| Item | Priority | Question | Status |
|------|----------|----------|--------|
| JWT signature verification | p1 | Should Disney JWT tokens be verified or is metadata extraction sufficient? | Open |
| LanceDB parameterized queries | p1 | Does LanceDB support parameterized queries natively? | Open |
| fastmcp migration feasibility | p2 | Would migrating to Python fastmcp provide benefits vs current TypeScript SDK? | Open |
| Circular dependency resolution | p2 | Best pattern to resolve entities.ts ↔ embeddings/search.ts coupling | Open |
| RFC 9457 error format adoption | p3 | Should error responses follow RFC 9457 Problem Details spec? | Open |

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
