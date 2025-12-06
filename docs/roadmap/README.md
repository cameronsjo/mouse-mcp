# Roadmap Documentation

Research and planning documents for mouse-mcp features and improvements.

## HTTP Transport Implementation

Comprehensive research for adding Streamable HTTP transport to enable cloud deployment:

### Quick Start
- **[http-transport-quickstart.md](./http-transport-quickstart.md)** - TL;DR guide with minimal code changes needed

### Full Documentation
- **[research-http-transport.md](./research-http-transport.md)** - Complete research document covering:
  - Available transport options in MCP SDK
  - Supporting both stdio and HTTP transport
  - Code patterns and implementation details
  - Port configuration and environment variables
  - Authentication middleware (OAuth 2.0, DNS rebinding protection)
  - MCP spec 2025-11-25 details
  - Implementation checklist
  - References and key takeaways

### Visual Guides
- **[http-transport-architecture.md](./http-transport-architecture.md)** - Architecture diagrams showing:
  - Current vs. dual transport architecture
  - HTTP request flow (sequence diagrams)
  - Session management lifecycle
  - Environment-based transport selection
  - Event store for resumability
  - Security layers
  - Deployment scenarios
  - File structure after implementation

### Code Examples
- **[http-transport-examples.md](./http-transport-examples.md)** - Working code examples:
  - Example 1: Minimal HTTP server
  - Example 2: With event store (resumability)
  - Example 3: With authentication (OAuth)
  - Example 4: Testing with MCP Inspector
  - Example 5: Docker deployment
  - curl testing commands

## Authorization & Security

OAuth 2.1 and MCP authorization research:

- **[research-mcp-authorization.md](./research-mcp-authorization.md)** - MCP OAuth 2.1 implementation details
- **[authorization-server-comparison.md](./authorization-server-comparison.md)** - Comparison of OAuth providers

## General Research

- **[research.md](./research.md)** - General research notes and findings
- **[ideas.md](./ideas.md)** - Feature ideas and roadmap planning

## Reading Order

### For Quick Implementation
1. Start with **[http-transport-quickstart.md](./http-transport-quickstart.md)**
2. Reference **[http-transport-examples.md](./http-transport-examples.md)** for specific patterns
3. Use **[http-transport-architecture.md](./http-transport-architecture.md)** for understanding

### For Deep Understanding
1. Read **[research-http-transport.md](./research-http-transport.md)** thoroughly
2. Study **[http-transport-architecture.md](./http-transport-architecture.md)** for visual context
3. Implement using **[http-transport-examples.md](./http-transport-examples.md)** as reference
4. Test using instructions in quickstart guide

### For Production Deployment
1. Understand architecture from **[http-transport-architecture.md](./http-transport-architecture.md)**
2. Review security sections in **[research-http-transport.md](./research-http-transport.md)**
3. Implement authentication using Example 3 in **[http-transport-examples.md](./http-transport-examples.md)**
4. Study OAuth research in **[research-mcp-authorization.md](./research-mcp-authorization.md)**
5. Use Docker deployment from Example 5

## Document Statistics

| Document | Lines | Purpose |
|----------|-------|---------|
| research-http-transport.md | 736 | Comprehensive research and reference |
| http-transport-quickstart.md | 147 | Quick implementation guide |
| http-transport-architecture.md | 368 | Visual diagrams and architecture |
| http-transport-examples.md | 813 | Working code examples |
| **Total** | **2,064** | Complete HTTP transport documentation |

## Key Findings Summary

### Transport Options
- **StdioServerTransport**: Current implementation for local Claude Desktop
- **StreamableHTTPServerTransport**: Recommended for HTTP (replaces deprecated SSEServerTransport)
- Both can coexist using environment-based selection

### Implementation Approach
- Single `McpServer` instance shared between transports
- Environment variable `MOUSE_MCP_TRANSPORT` controls mode (stdio/http)
- Session management with UUID generation
- Optional event store for connection resumability

### Security Requirements
- DNS rebinding protection (automatic with `createMcpExpressApp`)
- Bearer token authentication for production
- HTTPS in production (via reverse proxy)
- Rate limiting recommended

### MCP Spec 2025-11-25
- Single endpoint for GET/POST/DELETE methods
- Server-Sent Events (SSE) for streaming
- Session management via `Mcp-Session-Id` header
- Event IDs for resumability
- Protocol version negotiation

### Next Steps
1. Implement minimal HTTP support (Phase 1)
2. Test with MCP Inspector
3. Add event store for resumability (Phase 2)
4. Implement authentication (Phase 3)
5. Document deployment procedures

## Related Documentation

- **[/docs/development.md](../development.md)** - Development setup and guidelines
- **[/docs/configuration.md](../configuration.md)** - Environment configuration
- **[/docs/architecture.md](../architecture.md)** - System architecture overview

## Contributing

When adding new roadmap documents:

1. Use clear, descriptive filenames (kebab-case)
2. Include purpose and scope at the top
3. Add diagrams for complex concepts (use Mermaid)
4. Provide concrete code examples
5. Update this README with links
6. Cross-reference related documents
7. Follow RFC 2119 keywords (MUST/SHOULD/MAY)
