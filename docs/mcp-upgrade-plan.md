# Mouse MCP - Modernization Plan (December 2025)

**Created**: December 6, 2025
**Current MCP SDK**: `@modelcontextprotocol/sdk` ^1.12.0
**Latest MCP SDK**: `@modelcontextprotocol/sdk` 1.24.3
**Latest MCP Spec**: 2025-11-25 (Anniversary Release)

## Executive Summary

Mouse MCP is a well-architected MCP server with solid foundations. This plan identifies gaps between the current implementation and the December 2025 MCP standards, then provides a phased upgrade path. The current implementation is **not broken** - it follows the 2024 patterns that still work - but modernizing will unlock new capabilities and ensure future compatibility.

## Gap Analysis

### SDK Version Gap

| Aspect | Current | Latest | Gap Severity |
|--------|---------|--------|--------------|
| SDK Version | 1.12.0 | 1.24.3 | **Medium** |
| Protocol Version | 2024-11-05 | 2025-11-25 | **Medium** |
| Server API | Low-level `Server` class | `McpServer` high-level API | **Low** |

**Note**: The low-level `Server` class is marked `@deprecated` but still functional. The `McpServer` class provides a cleaner API but isn't required.

### Feature Gaps

| Feature | Current | Modern Standard | Priority |
|---------|---------|-----------------|----------|
| **Transport** | stdio only | stdio + Streamable HTTP | P1 |
| **Authentication** | None | OAuth 2.1 + PKCE | P1 (for HTTP) |
| **Structured Output** | Text only | `outputSchema` + `structuredContent` | P2 |
| **Resources** | Not implemented | URI-based data exposure | P2 |
| **Prompts** | Not implemented | Templated workflows | P3 |
| **Task Workflows** | Not implemented | Long-running task states | P3 |
| **Sampling** | Not implemented | Server-side LLM calls | P4 |
| **Zod Schemas** | JSON Schema | Zod v4 validation | P2 |

### Code Quality Gaps

| Area | Current | Best Practice | Impact |
|------|---------|---------------|--------|
| Tool naming | `disney_*` prefix | Standardized naming (SEP-986) | **OK** - already follows conventions |
| Error handling | RFC 9457 | RFC 9457 | **OK** - already implemented |
| Logging | Custom logger | Structured logging | **OK** - already implemented |
| Type safety | Good | Strict TypeScript | **OK** - already configured |

### Dependencies

| Package | Current | Latest | Action |
|---------|---------|--------|--------|
| `@modelcontextprotocol/sdk` | ^1.12.0 | 1.24.3 | **Upgrade** |
| `zod` | Not installed | 3.25+ | **Add** (SDK peer dependency) |
| `typescript` | ^5.7.2 | 5.7.2 | **OK** |
| `@lancedb/lancedb` | ^0.22.3 | 0.22.3 | **OK** (consider removal) |
| `playwright` | ^1.49.1 | 1.49.1 | **OK** |

## What's Working Well

Before modernizing, acknowledge what's already solid:

1. **RFC 9457 Error Handling** - Comprehensive implementation with security sanitization
2. **Event-Driven Architecture** - Clean circular dependency resolution
3. **Dual API Strategy** - Disney Finder + ThemeParks.wiki fallback
4. **Semantic Search** - OpenAI + Transformers.js embedding providers
5. **Caching Strategy** - SQLite persistence with TTLs
6. **Tool Design** - Clear, atomic tools with good descriptions
7. **Documentation** - Extensive docs including roadmap research

## Phased Upgrade Plan

### Phase 0: SDK Upgrade (Foundation)

**Goal**: Update to latest SDK without breaking changes

**Tasks**:

1. Add `zod` as dependency (SDK peer requirement)
2. Update `@modelcontextprotocol/sdk` to ^1.24.3
3. Fix any deprecation warnings
4. Verify all existing functionality works
5. Update tsconfig if needed for SDK changes

**Code Changes**:

```bash
npm install zod@^3.25.0
npm install @modelcontextprotocol/sdk@^1.24.3
```

**Risk**: Low - SDK maintains backward compatibility
**Duration**: Short

### Phase 1: Structured Tool Output

**Goal**: Add `outputSchema` for type-safe tool responses

**Why**: Modern MCP clients can validate responses and display structured data

**Current Pattern**:

```typescript
return {
  content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
};
```

**Modern Pattern**:

```typescript
return {
  content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  structuredContent: result  // Typed response matching outputSchema
};
```

**Tasks**:

1. Define Zod schemas for each tool's output
2. Add `outputSchema` to tool definitions
3. Return `structuredContent` alongside text content
4. Update tool registry to support output schemas

**Tools to Update**:

| Tool | Output Schema Complexity |
|------|-------------------------|
| `disney_destinations` | Simple - array of destinations |
| `disney_attractions` | Medium - array with filters |
| `disney_dining` | Medium - array with filters |
| `disney_entity` | Medium - search results |
| `disney_status` | Simple - health object |
| `disney_sync` | Simple - sync report |

**Risk**: Low - additive change
**Duration**: Short-Medium

### Phase 2: Resources Implementation

**Goal**: Expose Disney data as MCP resources for passive context

**Why**: Clients can list and subscribe to resources without explicit tool calls

**Resource URIs**:

```
disney://destinations                    # All supported parks
disney://destination/{id}                # Specific destination
disney://destination/{id}/attractions    # Attractions at destination
disney://destination/{id}/dining         # Dining at destination
disney://attraction/{id}                 # Specific attraction
disney://dining/{id}                     # Specific dining location
```

**Implementation Pattern**:

```typescript
mcpServer.resource(
  "disney://destination/{id}",
  new ResourceTemplate("disney://destination/{id}", { list: undefined }),
  async (uri, { id }) => ({
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(await getDestination(id))
    }]
  })
);
```

**Tasks**:

1. Design resource URI schema
2. Implement resource handlers in `src/resources/`
3. Add resources capability to server
4. Add resource subscription support (optional)

**Risk**: Medium - new feature area
**Duration**: Medium

### Phase 3: Streamable HTTP Transport

**Goal**: Enable cloud deployment with HTTP transport

**Why**: Current stdio-only limits to local Claude Desktop usage

**Architecture**:

```
                    ┌─────────────────────────────────────┐
                    │           mouse-mcp                  │
                    │                                      │
  Environment       │  ┌──────────────────────────────┐   │
  MOUSE_MCP_        │  │      DisneyMcpServer         │   │
  TRANSPORT=?       │  │                              │   │
        │           │  │  - Tools                     │   │
        ▼           │  │  - Resources                 │   │
   ┌────────┐       │  │  - Session Manager           │   │
   │ stdio  │──────►│  │  - Database                  │   │
   └────────┘       │  │  - Embeddings                │   │
        │           │  └──────────────────────────────┘   │
   ┌────────┐       │             │                       │
   │  http  │──────►│             ▼                       │
   └────────┘       │  ┌──────────────────────────────┐   │
                    │  │    Transport Layer           │   │
                    │  │                              │   │
                    │  │  stdio → StdioServerTransport│   │
                    │  │  http → StreamableHTTPServer │   │
                    │  └──────────────────────────────┘   │
                    └─────────────────────────────────────┘
```

**Tasks** (based on existing research in `docs/roadmap/research-http-transport.md`):

1. Create `src/transport/` module
2. Implement `HttpTransportServer` class
3. Add session management for HTTP
4. Create Express/Fastify app wrapper
5. Add health check endpoint
6. Implement graceful shutdown for HTTP
7. Update entry point with transport selection

**Environment Variables**:

| Variable | Values | Default |
|----------|--------|---------|
| `MOUSE_MCP_TRANSPORT` | `stdio`, `http` | `stdio` |
| `MOUSE_MCP_PORT` | 1024-65535 | 3000 |
| `MOUSE_MCP_HOST` | IP address | 127.0.0.1 |

**Risk**: Medium - significant new code
**Duration**: Medium-Long

### Phase 4: OAuth 2.1 Authorization

**Goal**: Secure HTTP transport with OAuth 2.1

**Why**: MCP spec requires OAuth 2.1 for HTTP transports

**Implementation** (based on existing research in `docs/roadmap/research-mcp-authorization.md`):

1. **Authorization Server**: Logto (self-hosted on Fly.io)
2. **Client Registration**: CIMD primary, DCR fallback
3. **Token Validation**: Local JWT with JWKS caching
4. **Scopes**: `disney:read`, `disney:sync`, `disney:status`, `disney:admin`

**Tasks**:

1. Create `src/auth/` module
2. Implement OAuth middleware
3. Add Protected Resource Metadata endpoint
4. Implement PKCE validation
5. Add scope-based tool authorization
6. Create step-up authorization flow (403 handling)
7. Deploy Logto to Fly.io
8. Configure Logto for MCP flows

**Endpoints to Add**:

| Endpoint | Purpose |
|----------|---------|
| `/.well-known/oauth-protected-resource` | RFC 9728 metadata |
| `/mcp` | Streamable HTTP endpoint |
| `/health` | Health check |

**Risk**: High - complex authentication
**Duration**: Long

### Phase 5: Prompts Implementation

**Goal**: Add templated workflows for common use cases

**Why**: Prompts provide user-facing shortcuts and consistent workflows

**Prompts to Implement**:

| Prompt | Purpose | Arguments |
|--------|---------|-----------|
| `plan_visit` | Create park visit itinerary | destination, date, preferences |
| `find_dining` | Find dining matching criteria | destination, cuisine, budget, party_size |
| `compare_attractions` | Compare multiple attractions | attraction_ids[] |
| `accessibility_info` | Get accessibility details | destination, mobility_needs |

**Implementation Pattern**:

```typescript
mcpServer.prompt(
  "plan_visit",
  {
    destination: z.string().describe("Park ID (wdw-mk, dlr-dlp, etc.)"),
    date: z.string().optional().describe("Visit date YYYY-MM-DD"),
    preferences: z.array(z.string()).optional().describe("Preferences: thrill, family, shows")
  },
  ({ destination, date, preferences }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Create a visit plan for ${destination}...`
        }
      }
    ]
  })
);
```

**Risk**: Low - straightforward addition
**Duration**: Short

### Phase 6: Advanced Features (Future)

**Goal**: Implement cutting-edge MCP features

**Features**:

1. **Task Workflows** - Track long-running sync operations
2. **Sampling** - Server-initiated LLM requests
3. **Elicitation** - Request user credentials securely
4. **Extensions** - Custom MCP extensions

**Tasks**:

1. Implement task tracking for `disney_sync`
2. Add progress notifications
3. Explore sampling for intelligent park recommendations
4. Document extension points

**Risk**: Medium - newer features
**Duration**: Long (ongoing)

## Migration Path

### Backward Compatibility Strategy

1. **stdio Transport**: Always supported, default behavior
2. **HTTP Transport**: Opt-in via environment variable
3. **Auth**: Only required for HTTP transport
4. **Resources/Prompts**: Opt-in capabilities
5. **Structured Output**: Includes text fallback

### Testing Strategy

1. **Unit Tests**: Each new module
2. **Integration Tests**: End-to-end tool flows
3. **MCP Inspector**: Protocol compliance
4. **Load Testing**: HTTP transport under load

## Implementation Order

```
Phase 0 (Foundation)
    │
    ▼
Phase 1 (Structured Output) ──────┐
    │                              │
    ▼                              │ Can be parallel
Phase 2 (Resources) ◄─────────────┘
    │
    ▼
Phase 3 (HTTP Transport)
    │
    ▼
Phase 4 (OAuth) ── Depends on HTTP
    │
    ▼
Phase 5 (Prompts) ── Can start earlier
    │
    ▼
Phase 6 (Advanced) ── Ongoing
```

## Quick Wins (Do First)

1. **SDK Upgrade** - Immediate, low risk
2. **Add Zod** - Required for SDK
3. **Structured Output** - High value, low effort
4. **Resources** - Enable passive data access

## Decision Points

### Should we migrate from low-level `Server` to `McpServer`?

**Recommendation**: Not immediately. The deprecation is soft, and `McpServer` is essentially a wrapper. When adding resources/prompts, evaluate if `McpServer` simplifies the code.

### Should we remove LanceDB?

**Current State**: LanceDB is installed but unclear if actively used (sql.js handles SQLite).

**Recommendation**: Audit usage. If only sql.js is used, remove LanceDB to reduce dependencies and the SQL escaping complexity documented in `src/vectordb/sql-escaping.ts`.

### Express vs Fastify for HTTP?

**Recommendation**: Use the SDK's built-in Express helpers (`createMcpExpressApp`) for simplicity. Fastify would require custom integration.

## Metrics for Success

| Metric | Target |
|--------|--------|
| SDK version | 1.24.3+ |
| All tests passing | 100% |
| MCP Inspector validation | Pass |
| HTTP transport working | Yes |
| OAuth flow working | Yes |
| Claude Desktop compatibility | Maintained |

## References

- [MCP 2025-11-25 Specification](https://modelcontextprotocol.io/specification/latest)
- [docs/mcp-2025-standards.md](./mcp-2025-standards.md) - Current standards research
- [docs/roadmap/research-http-transport.md](./roadmap/research-http-transport.md) - HTTP transport research
- [docs/roadmap/research-mcp-authorization.md](./roadmap/research-mcp-authorization.md) - OAuth research
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

---

**Document Version**: 1.0
**Last Updated**: December 6, 2025
