# Model Context Protocol (MCP) Standards & Best Practices - December 2025

**Last Updated**: December 6, 2025
**Current MCP Specification**: 2025-11-25 (Anniversary Release)

## Executive Summary

The Model Context Protocol (MCP) marked its first anniversary with a major specification release (version 2025-11-25) on November 25, 2025. The protocol has evolved from an experimental concept to an industry standard with nearly 2,000 registered servers in the MCP Registry. This document provides a comprehensive overview of current MCP standards, best practices, and implementation guidance.

## Table of Contents

1. [Latest Specification Version](#latest-specification-version)
2. [Official SDKs and Libraries](#official-sdks-and-libraries)
3. [Protocol Architecture](#protocol-architecture)
4. [Transport Layer Recommendations](#transport-layer-recommendations)
5. [Authentication and Authorization](#authentication-and-authorization)
6. [Tool Definition Best Practices](#tool-definition-best-practices)
7. [Resource and Prompt Patterns](#resource-and-prompt-patterns)
8. [Breaking Changes and Deprecations](#breaking-changes-and-deprecations)
9. [Implementation Patterns](#implementation-patterns)
10. [Security and Trust Principles](#security-and-trust-principles)

## Latest Specification Version

**Version**: 2025-11-25 (Released November 25, 2025)

### Major New Features

#### 1. Task-Based Workflows (SEP-1686)

Servers can now track work through task abstractions supporting states:

- `working` - Task in progress
- `input_required` - Waiting for user input
- `completed` - Task finished successfully
- `failed` - Task encountered errors
- `cancelled` - Task was cancelled

**Use Cases**:

- Healthcare data analysis
- Enterprise automation
- Code migration tools
- Multi-agent systems

**Key Capabilities**:

- Active polling of task status
- Result retrieval after completion
- Proper security boundaries with session-based access control

#### 2. Enhanced Authorization

**Client ID Metadata Documents (CIMD) - SEP-991**:

- URL-based client registration eliminates complex OAuth Dynamic Client Registration (DCR)
- Each client has metadata available at a pre-defined URL
- Authorization servers can log, manage, and deny registrations

**Authorization Extensions**:

- OAuth client credentials flow (SEP-1046)
- Enterprise IdP policy controls via Cross App Access (SEP-990)

#### 3. Sampling with Tools (SEP-1577)

Servers can now run agentic loops independently:

- Tool calling in sampling requests
- Server-side agent reasoning
- Parallel tool execution
- Explicit capability declarations (replacing ambiguous context parameters)

#### 4. URL Mode Elicitation (SEP-1036)

Secure out-of-band credential flows:

- Users authenticate through browsers without exposing credentials to MCP clients
- Supports PCI-compliant payment processing
- External OAuth integrations

#### 5. Extensions Framework

Optional, composable, versioned extensions operating outside core specification:

- Allows experimentation with specialized capabilities
- Enables community-driven innovation before formal integration
- Provides flexibility for scenario-specific additions

### Developer Experience Improvements

- Standardized tool naming (SEP-986)
- Decoupled RPC payloads (SEP-1319)
- Improved connection management (SEP-1699)
- Enhanced SDK version handling (SEP-1309)

### Backward Compatibility

**IMPORTANT**: The 2025-11-25 release maintains full backward compatibility with existing implementations.

## Official SDKs and Libraries

### TypeScript SDK

**Package**: `@modelcontextprotocol/sdk`
**Latest Version**: 1.24.3 (Released December 5, 2025)
**Registry**: npm
**Repository**: [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)

**Installation**:

```bash
npm install @modelcontextprotocol/sdk zod
```

**Key Features**:

- Full MCP specification implementation
- Easy creation of MCP servers (resources, prompts, tools)
- MCP client support for connecting to any MCP server
- Standard transports (stdio, Streamable HTTP)

**Peer Dependencies**:

- **zod**: Required for schema validation
- SDK imports from `zod/v4` internally
- Maintains backwards compatibility with Zod v3.25+

**Stats**:

- 18,095 dependents
- 10,938 GitHub stars
- 1,475 forks
- Active weekly releases

### Python SDK

**Official Package**: `mcp`
**Latest Version**: 1.2.1
**Registry**: PyPI
**Repository**: [modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk)

**Installation**:

```bash
pip install mcp
# or with uv (recommended)
uv add mcp
```

**FastMCP Integration**:

FastMCP 1.0 was incorporated into the official MCP SDK in 2024:

```python
from mcp.server.fastmcp import FastMCP
```

### FastMCP (Standalone)

**Package**: `fastmcp`
**Latest Version**: 2.13.0.2 (Released April 11, 2025)
**Registry**: PyPI
**Repository**: [jlowin/fastmcp](https://github.com/jlowin/fastmcp)

**Installation**:

```bash
pip install fastmcp
# or with uv (recommended)
uv add fastmcp
```

**Key Features**:

- More ergonomic interface for MCP servers
- Production-ready framework
- Enterprise auth (Google, GitHub, Azure, Auth0, WorkOS)
- Deployment tools and testing frameworks
- Client libraries
- MCP Middleware for intercepting server operations (v2.9+)
- Server-side type conversion for prompts

**Minimum Requirements**:

- Python >= 3.10
- MIT License

**Note**: FastMCP 2.0 (released April 16, 2025) is the actively maintained, production-ready framework that extends beyond basic protocol implementation.

### Java SDK

**Repository**: [modelcontextprotocol/java-sdk](https://github.com/modelcontextprotocol/java-sdk)
**Maintained in collaboration with Spring AI**

## Protocol Architecture

### Core Design

MCP is an open protocol enabling seamless integration between LLM applications and external data sources and tools.

**Message Format**: JSON-RPC 2.0
**Connection Model**: Stateful connections
**Negotiation**: Server and client capability negotiation

### Key Participants

1. **Hosts**: LLM applications that initiate connections
2. **Clients**: Connectors within the host application
3. **Servers**: Services providing context and capabilities

### Design Inspiration

MCP draws from the Language Server Protocol (LSP), standardizing tool integration the way LSP standardized language support across development tools.

### Server Capabilities

Servers provide three core primitives:

1. **Resources**: Context and data for users or AI models
2. **Prompts**: Templated messages and workflows
3. **Tools**: Functions for the AI model to execute

### Client Capabilities

Clients may offer:

1. **Sampling**: Server-initiated agentic behaviors and recursive LLM interactions
2. **Roots**: Server-initiated inquiries into URI or filesystem boundaries
3. **Elicitation**: Server-initiated requests for additional user information

### Additional Utilities

- Configuration management
- Progress tracking
- Cancellation support
- Error reporting
- Structured logging

## Transport Layer Recommendations

### Overview

MCP supports three primary transport mechanisms:

1. **Streamable HTTP** (recommended for remote/web)
2. **stdio** (recommended for local tools)
3. **SSE** (deprecated, legacy only)

### Streamable HTTP (RECOMMENDED)

**Status**: Current standard as of protocol version 2025-03-26
**Use Cases**: Web applications, distributed systems, remote MCP access

**Key Features**:

- Single-endpoint architecture
- Supports both request-response and streaming patterns
- POST and GET methods supported
- Optional SSE for streaming multiple server messages
- Supports stateless servers without persistent connections
- No overhead of maintaining high-availability connections

**Architecture**:

```
Client → Single HTTP Endpoint (POST/GET) → Server
         ↓
    Optional SSE Stream
         ↓
    Multiple Responses
```

**When to Use**:

- Cloud/remote deployments
- Browser-based clients
- Distributed systems
- Stateless server architectures

### stdio (RECOMMENDED for Local)

**Use Cases**: Local integrations, command-line tools, desktop applications

**Key Features**:

- Communicates through standard input/output streams
- Simple and performant
- Ideal for single-client scenarios
- Low overhead
- Great for local tools

**Architecture**:

```
Client launches Server as subprocess
    ↓
stdin/stdout communication
    ↓
Direct IPC (no network)
```

**When to Use**:

- Local CLI tools
- Desktop applications
- Development tools
- Single-client scenarios

### SSE (DEPRECATED)

**Status**: Officially deprecated as of MCP specification version 2025-03-26
**Use Cases**: Legacy compatibility only

**Migration Path**:

- New implementations: Use Streamable HTTP
- Existing servers: Support both SSE and Streamable HTTP for backward compatibility
- SSE format (`text/event-stream`) remains a component of Streamable HTTP

**Backward Compatibility**:

Servers wanting to support older clients should continue to host:

- SSE endpoint (legacy)
- POST endpoint (legacy)
- Streamable HTTP "MCP endpoint" (current)

### Transport Decision Matrix

| Use Case | Transport | Rationale |
|----------|-----------|-----------|
| Local CLI tools | stdio | Lowest overhead, simple IPC |
| Desktop applications | stdio | Direct process communication |
| Web applications | Streamable HTTP | Browser compatibility |
| Cloud deployments | Streamable HTTP | Scalable, stateless |
| Distributed systems | Streamable HTTP | Network-based, flexible |
| Legacy compatibility | SSE + Streamable HTTP | Backward compatibility |

## Authentication and Authorization

### OAuth 2.1 Standard (MANDATORY)

MCP uses a subset of OAuth 2.1 for authorization. OAuth 2.1 is the officially mandated authorization standard in the MCP specifications.

**Core Requirements**:

- MCP auth implementations MUST implement OAuth 2.1
- PKCE (Proof Key for Code Exchange) is MANDATORY
- MCP auth SHOULD support Dynamic Client Registration
- MCP servers SHOULD implement Authorization Server Metadata

### PKCE Requirements

**What**: Proof Key for Code Exchange
**Status**: REQUIRED for all MCP clients

**Security Benefits**:

- Creates secret "verifier-challenge" pair
- Ensures only original client can exchange authorization code for tokens
- Prevents code interception attacks
- Prevents code injection attacks

**Implementation**:

- Clients MUST verify PKCE support before proceeding with authorization
- Clients MUST use S256 code challenge method when technically capable

### Client ID Metadata Documents (CIMD)

**Introduced**: 2025-11-25 specification
**Status**: Recommended default for client registration

**Key Benefits**:

- Eliminates complex OAuth Dynamic Client Registration (DCR)
- URL-based client registration
- Client manages metadata at pre-defined URL
- Authorization server can log, manage, and deny registrations

**Security Considerations**:

Extensive security section covering:

- SSRF (Server-Side Request Forgery) risks
- Localhost redirect URI risks
- Trust policies

### Registration Priority (2025-11-25)

Recommended prioritization:

1. **Pre-registration** (if available)
2. **CIMD-based approach** (recommended)
3. **DCR-based approach** (legacy)
4. **Manual user input** (fallback)

### Dynamic Client Registration

**Protocol**: OAuth 2.0 Dynamic Client Registration (RFC7591)
**Status**: OPTIONAL (backward compatibility)

MCP clients and authorization servers MAY support Dynamic Client Registration to allow MCP clients to obtain OAuth client IDs without user interaction.

### Discovery Mechanisms

MCP servers MUST implement one of:

1. **WWW-Authenticate Header**: Include resource metadata URL when returning 401 Unauthorized
2. **Well-known URIs**: Standard discovery endpoints

MCP clients MUST:

- Support both discovery mechanisms
- Use resource metadata URL from WWW-Authenticate headers when present

### Transport-Specific Authorization

**HTTP-based transports**:

- SHOULD conform to MCP authorization specification
- OAuth 2.1 with PKCE required

**stdio transports**:

- SHOULD NOT follow HTTP-based authorization
- Retrieve credentials from environment instead

**Alternative transports**:

- MUST follow established security best practices for their protocol

### Third-Party OAuth Providers

Supported integrations:

- GitHub OAuth
- Google OAuth
- Azure AD
- Auth0
- WorkOS
- Stytch
- Custom OAuth providers

### Resource Server Classification

**As of June 2025**: MCP servers are officially classified as OAuth Resource Servers

**Requirements**:

- Protected resource metadata
- Resource indicators to prevent malicious servers from obtaining access tokens
- Enhanced security requirements

## Tool Definition Best Practices

### Core Tool Structure

Each tool in MCP is uniquely identified and includes:

- **Name**: Unique identifier for the tool
- **Description**: Clear explanation of tool purpose and behavior
- **Input Schema**: JSON Schema defining parameters
- **Output Schema** (optional): JSON Schema for structured results

### JSON Schema Requirements

**Input Schema**:

```typescript
{
  "type": "object",
  "properties": {
    "param_name": {
      "type": "string",
      "description": "Clear parameter description"
    }
  },
  "required": ["param_name"]
}
```

**Output Schema** (optional):

- Servers MUST provide structured results conforming to schema
- Clients SHOULD validate structured results against schema
- For backward compatibility, include serialized JSON in TextContent block

### Best Practices

#### 1. Clear Naming and Descriptions

- Use unique, descriptive names reflecting function
- Avoid abbreviations or ambiguous terms
- Ensure clarity for both development and usage
- Follow standardized naming conventions (SEP-986)

**Example**:

```typescript
// Good
{
  "name": "search_documentation",
  "description": "Search through product documentation using keywords"
}

// Avoid
{
  "name": "srch_doc",
  "description": "Searches docs"
}
```

#### 2. Detailed Input Schemas

- Use JSON Schema for all input parameters
- Include type information
- Mark required fields
- Provide descriptions for each parameter
- Guide model usage and improve error handling

**Example**:

```typescript
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query to find relevant documentation",
      "minLength": 1,
      "maxLength": 500
    },
    "limit": {
      "type": "integer",
      "description": "Maximum number of results to return",
      "minimum": 1,
      "maximum": 100,
      "default": 10
    }
  },
  "required": ["query"]
}
```

#### 3. Atomic Tool Design

- Design tools to perform a single, well-scoped task
- Avoid combining unrelated operations
- Simplifies validation
- Improves error handling
- Enhances reusability

**Anti-pattern**:

```typescript
// Too broad - combines multiple operations
{
  "name": "manage_users",
  "description": "Create, update, delete, or list users"
}
```

**Better approach**:

```typescript
{
  "name": "create_user",
  "description": "Create a new user account"
}
{
  "name": "update_user",
  "description": "Update existing user information"
}
{
  "name": "delete_user",
  "description": "Delete a user account"
}
{
  "name": "list_users",
  "description": "List all user accounts"
}
```

#### 4. Schema-First Design

- Treat JSON schemas as core API design
- Invest time in clear descriptions
- Provide useful examples
- Improves maintainability and ease of use

#### 5. Output Schema and Structured Content

Structured content is returned as JSON in `structuredContent` field:

- Servers MUST conform to output schema if provided
- Clients SHOULD validate against output schema
- Include serialized JSON in TextContent for backward compatibility

**Example**:

```typescript
{
  "outputSchema": {
    "type": "object",
    "properties": {
      "results": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "url": { "type": "string" },
            "relevance": { "type": "number" }
          }
        }
      }
    }
  }
}
```

### Security Considerations

**Human-in-the-Loop**:

- There SHOULD always be a human in the loop
- Users must have ability to deny tool invocations
- Applications SHOULD provide clear UI showing exposed tools

**Input Validation**:

- Validate all inputs against schema
- Sanitize user input
- Implement rate limiting
- Log all tool invocations

### Testing Strategy

Comprehensive testing should cover:

1. **Functional Testing**:
   - Verify tools execute correctly with valid inputs
   - Handle invalid inputs appropriately

2. **Integration Testing**:
   - Test interaction with external systems
   - Use both real and mocked dependencies

3. **Security Testing**:
   - Validate authentication and authorization
   - Test input sanitization
   - Verify rate limiting

4. **Performance Testing**:
   - Behavior under load
   - Timeout handling
   - Resource cleanup

5. **Error Handling**:
   - Proper error reporting through MCP protocol
   - Resource cleanup on errors

## Resource and Prompt Patterns

### Core MCP Primitives

MCP offers three distinct interaction types working together:

1. **Prompts**: User-driven (slash commands, menu options)
2. **Resources**: Application-driven (client decides data usage)
3. **Tools**: Model-driven (AI chooses when to call)

### Resources

**Purpose**: Read-only interfaces exposing data as structured, contextual information

**Characteristics**:

- Knowledge-focused (not action-focused)
- Provide context without side effects
- Act as intelligent knowledge bases
- Like a well-organized library: read and reference, but don't alter

**Identification**: Each resource uniquely identified by URI

**Use Cases**:

- File content access
- Database schemas
- Application-specific information
- Repository metadata
- Documentation
- Configuration data

**Example Pattern (GitHub MCP)**:

```typescript
// Resources expose data
resources: [
  "github://repo/issues",
  "github://repo/pull-requests",
  "github://repo/commits",
  "github://repo/metadata"
]
```

### Prompts

**Purpose**: Reusable message templates and workflows guiding LLM behavior

**Characteristics**:

- Predefined instruction templates
- Standardize common tasks
- Accept arguments for customization
- Maintain standardized structure
- Ensure consistency across teams

**Content Types**:

1. **Text Content**: Natural language interactions
2. **Image Content**: Visual information (base64-encoded, valid MIME type)
3. **Embedded Resources**: Server-side resources referenced directly

**Use Cases**:

- Common task automation
- Workflow templates
- Best practice enforcement
- Team consistency
- Multi-step processes

**Example Pattern (GitHub MCP)**:

```typescript
prompts: [
  {
    name: "summarize_issues",
    description: "Summarize recent issues",
    arguments: [
      {
        name: "repository",
        description: "Repository name",
        required: true
      },
      {
        name: "milestone",
        description: "Milestone filter",
        required: false
      }
    ]
  }
]
```

### Embedded Resources in Prompts

Prompts can include resources to add context beyond simple text:

**Benefits**:

- AI works with specific context (not general knowledge)
- Seamlessly incorporates server-managed content
- Enables documentation, code samples, reference materials in conversation flow

**Example**:

```typescript
{
  "name": "analyze_code",
  "description": "Analyze code with project context",
  "messages": [
    {
      "role": "user",
      "content": {
        "type": "resource",
        "uri": "github://repo/coding-standards.md"
      }
    }
  ]
}
```

### Combined Pattern Example (GitHub MCP)

**Prompts**: Shortcuts with autocomplete

- "summarize recent issues"
- Select project repository
- Select milestone

**Resources**: Expose data

- Repository metadata
- Issue lists
- Pull request data
- Commit histories

**Tools**: Handle actions

- Create issues
- Update labels
- Assign team members

**Result**: Users interact with GitHub through natural language while applications process GitHub data in sophisticated ways.

### Workflow Automation Patterns

MCP prompts enable workflow automation combining:

- Flexibility of scripting
- Intelligence of modern AI systems
- Structured, repetitive workflow handling

**Patterns apply to**:

- Data processing pipelines
- Code review workflows
- Documentation generation
- Testing automation
- Deployment procedures

## Breaking Changes and Deprecations

### Version History

**Current**: 2025-11-25 (Anniversary Release)
**Previous**: 2025-06-18, 2025-03-26, 2024-11-05

### Major Breaking Changes by Version

#### 2025-11-25 (Current)

**No Breaking Changes**: Maintains full backward compatibility

**New Features** (opt-in):

- Task-based workflows
- Sampling with tools
- URL mode elicitation
- Extensions framework

**Authorization Changes**:

- CIMD (Client ID Metadata Documents) now recommended
- PKCE mandatory enforcement clarified
- S256 code challenge method required when capable

#### 2025-06-18

**Breaking Changes**:

1. **Removed JSON-RPC Batching**: No longer supported in protocol

**New Features**:

- Structured tool outputs
- Enhanced OAuth security
- Server-initiated user interactions
- MCP servers classified as OAuth Resource Servers

#### 2025-03-26

**Breaking Changes**:

1. **SSE Transport Deprecated**: Replaced with Streamable HTTP
2. **Authorization Framework**: OAuth 2.1 requirement introduced

**Migration Required**:

- HTTP+SSE transport → Streamable HTTP transport
- Implement OAuth 2.1 with PKCE for HTTP transports

### Deprecation Timeline

#### SSE Transport

**Deprecated**: 2025-03-26
**Status**: Legacy support only
**Migration Path**: Use Streamable HTTP

**Backward Compatibility Strategy**:

```
Support both during transition:
- SSE endpoint (legacy clients)
- POST endpoint (legacy clients)
- Streamable HTTP endpoint (current clients)
```

#### Dynamic Client Registration (DCR)

**Status**: Supported but not recommended
**Replacement**: Client ID Metadata Documents (CIMD)
**Timeline**: DCR remains supported for backward compatibility

### Versioning Strategy

**Protocol Versioning**:

- Version negotiation during initialization
- Clients and servers may support multiple protocol versions
- Protocol version in format: YYYY-MM-DD

**SDK Versioning**:

- TypeScript SDK: Semantic versioning (1.24.3)
- Python SDK: Semantic versioning (1.2.1)
- FastMCP: Semantic versioning (2.13.0.2)

**Version Negotiation**:

```json
{
  "protocolVersion": "2025-11-25",
  "capabilities": {
    "experimental": {
      "tasks": {}
    }
  }
}
```

### Migration Guidance

#### SSE to Streamable HTTP

**For New Implementations**:

- Use Streamable HTTP from start
- Skip SSE entirely

**For Existing Servers**:

- Add Streamable HTTP support alongside SSE
- Maintain SSE for backward compatibility
- Gradually deprecate SSE as clients migrate

**Key Differences**:

| Feature | SSE | Streamable HTTP |
|---------|-----|-----------------|
| Endpoints | Multiple (GET+POST) | Single |
| State | Stateful | Stateless option |
| Streaming | Required | Optional |
| Complexity | Higher | Lower |

#### OAuth DCR to CIMD

**For New Implementations**:

- Use CIMD as primary registration method
- Client hosts metadata at URL
- Authorization server fetches and validates

**For Existing Implementations**:

- Support both CIMD and DCR
- Prioritize CIMD when available
- Fall back to DCR for legacy

## Implementation Patterns

### TypeScript Server Pattern

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Initialize server
const server = new Server(
  {
    name: "example-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "example_tool",
        description: "An example tool",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "example_tool") {
    const { query } = request.params.arguments;
    // Implement tool logic
    return {
      content: [
        {
          type: "text",
          text: `Result for: ${query}`,
        },
      ],
    };
  }
  throw new Error("Tool not found");
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
```

### Python Server Pattern (Official SDK)

```python
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

# Initialize server
mcp = FastMCP("example-server")

# Define input schema
class SearchInput(BaseModel):
    query: str = Field(description="Search query")
    limit: int = Field(default=10, description="Maximum results")

# Register tool
@mcp.tool()
async def search_tool(input: SearchInput) -> str:
    """
    Search for relevant information

    Args:
        input: Search parameters

    Returns:
        Search results as JSON string
    """
    # Implement tool logic
    return f"Results for {input.query} (limit: {input.limit})"

# Register resource
@mcp.resource("example://data/{id}")
async def get_data(id: str) -> str:
    """Fetch data by ID"""
    # Implement resource logic
    return f"Data for ID: {id}"

# Register prompt
@mcp.prompt()
async def analysis_prompt(topic: str) -> str:
    """Generate analysis prompt for topic"""
    return f"Analyze the following topic: {topic}"
```

### FastMCP Server Pattern (Standalone)

```python
from fastmcp import FastMCP
from pydantic import BaseModel, Field
import logging

# Configure logging (to stderr, not stdout!)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]  # Uses stderr by default
)
logger = logging.getLogger(__name__)

# Initialize server with dependencies
mcp = FastMCP(
    "production-server",
    dependencies=["aiohttp", "pydantic"]
)

class ToolInput(BaseModel):
    """Well-documented input schema"""
    param: str = Field(..., description="Clear parameter description")
    optional: int = Field(42, description="Optional with default")

@mcp.tool()
async def production_tool(input: ToolInput) -> dict:
    """
    Production-ready tool with error handling

    Args:
        input: Validated input matching schema

    Returns:
        Structured result dictionary

    Raises:
        ValueError: When input validation fails
    """
    try:
        # Business logic
        result = await process(input.param)
        logger.info("Tool executed successfully", extra={"param": input.param})
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error("Tool failed", exc_info=True, extra={"param": input.param})
        raise

# Graceful shutdown
async def cleanup():
    await mcp.shutdown()
    logger.info("Server shutdown complete")
```

### Production Deployment Patterns

#### HTTP-Based Deployment (Python + FastAPI)

```python
from fastapi import FastAPI
from fastmcp import FastMCP

# Initialize FastMCP
mcp = FastMCP("api-server")

# Mount in FastAPI
app = FastAPI()

@app.on_event("startup")
async def startup():
    # Initialize MCP server
    await mcp.initialize()

@app.on_event("shutdown")
async def shutdown():
    # Cleanup MCP server
    await mcp.shutdown()

# Expose MCP endpoint
app.mount("/mcp", mcp.asgi_app())

# Run with uvicorn
# uvicorn main:app --host 0.0.0.0 --port 8000
```

#### stdio Transport (Local Tools)

```typescript
// Client connecting to stdio server
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "uv",
  args: ["run", "python", "server.py"],
});

const client = new Client(
  {
    name: "example-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);

await client.connect(transport);
```

### Logging Best Practices

**CRITICAL**: stdout vs stderr handling

**For stdio transports**:

- NEVER log to stdout (interferes with protocol)
- ALWAYS log to stderr
- Use logging libraries defaulting to stderr

**For HTTP transports**:

- stdout logging is safe
- stderr still recommended for consistency

**Implementation**:

```python
# Python - correct
import logging
logging.basicConfig(
    handlers=[logging.StreamHandler()]  # stderr by default
)

# Python - WRONG for stdio
print("Debug message")  # Goes to stdout!

# JavaScript - correct
console.error("Debug message");  // stderr

// JavaScript - WRONG for stdio
console.log("Debug message");  // stdout!
```

### Cross-Language Compatibility

**Pattern**: Streamable HTTP enables language interoperability

```
Python Client ↔ TypeScript Server ✓
TypeScript Client ↔ Python Server ✓
Python Client ↔ Python Server ✓
TypeScript Client ↔ TypeScript Server ✓
```

**Key**: Use Streamable HTTP transport for cross-language communication

## Security and Trust Principles

### Core Security Requirements

MCP implementations MUST adhere to these security principles:

#### 1. User Consent and Control

**Requirements**:

- Explicit user consent for data access and operations
- Users retain control over data sharing and actions
- Clear UIs for reviewing and authorizing activities

**Implementation**:

- Never execute tools without user approval
- Display tool descriptions and parameters before execution
- Allow users to deny tool invocations
- Provide audit logs of all actions

#### 2. Data Privacy

**Requirements**:

- Explicit user consent before exposing data to servers
- No data transmission without consent
- Appropriate access controls

**Implementation**:

- Sanitize PII before logging or transmission
- Implement field-level access controls
- Use allowlist/blocklist for sensitive fields
- Encrypt data in transit and at rest

#### 3. Tool Safety

**Requirements**:

- Tool descriptions are untrusted unless from trusted servers
- Explicit user consent before tool invocation
- Users must understand tool behavior

**Implementation**:

- Clear, accurate tool descriptions
- Display tool parameters and expected behavior
- Warn about destructive operations
- Implement undo/rollback where possible

#### 4. LLM Sampling Controls

**Requirements**:

- Explicit user approval for sampling requests
- User control over prompt content and result visibility
- Protocol limits server visibility into prompts

**Implementation**:

- Display sampling requests to users
- Allow users to review and modify prompts
- Restrict server access to sampling results
- Log all sampling activities

### Implementation Guidelines

Implementors SHOULD:

- Build robust consent and authorization flows
- Provide clear security documentation
- Implement appropriate access controls
- Follow security best practices
- Consider privacy implications
- Regular security audits
- Incident response procedures

### PII Sanitization

**Critical for all MCP implementations**:

```python
import re

# Common PII patterns
EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
SSN_PATTERN = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')
PHONE_PATTERN = re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b')
CREDIT_CARD_PATTERN = re.compile(r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b')

def sanitize_pii(text: str) -> str:
    """Remove PII from text"""
    text = EMAIL_PATTERN.sub('[EMAIL]', text)
    text = SSN_PATTERN.sub('[SSN]', text)
    text = PHONE_PATTERN.sub('[PHONE]', text)
    text = CREDIT_CARD_PATTERN.sub('[CREDIT_CARD]', text)
    return text

# Always sanitize before:
# - Logging
# - External API calls
# - Caching/storage
# - Error messages
```

### Input Validation

**All tool inputs MUST be validated**:

```typescript
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "format": "email",
        "maxLength": 255
      },
      "age": {
        "type": "integer",
        "minimum": 0,
        "maximum": 150
      }
    },
    "required": ["email"]
  }
}
```

### Rate Limiting

**Implement rate limiting for all MCP endpoints**:

```python
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter

@app.post("/mcp/tools")
@limiter.limit("100/minute")
async def call_tool(request: Request):
    # Tool execution
    pass
```

### Audit Logging

**Log all MCP interactions with context**:

```python
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

def audit_log(event: str, user_id: str, details: dict):
    logger.info(
        "MCP_AUDIT",
        extra={
            "timestamp": datetime.utcnow().isoformat(),
            "event": event,
            "user_id": user_id,
            "details": sanitize_pii(str(details))
        }
    )

# Usage
audit_log("tool_invoked", user.id, {
    "tool_name": "search_tool",
    "parameters": tool_params
})
```

## Sources

### Official Specifications and Announcements

- [Model Context Protocol Specification (Latest)](https://modelcontextprotocol.io/specification/latest)
- [One Year of MCP: November 2025 Spec Release](https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/)
- [Model Context Protocol GitHub Repository](https://github.com/modelcontextprotocol/modelcontextprotocol)
- [MCP Versioning](https://modelcontextprotocol.io/specification/versioning)

### SDKs and Libraries

- [TypeScript SDK (@modelcontextprotocol/sdk)](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- [Python SDK GitHub](https://github.com/modelcontextprotocol/python-sdk)
- [FastMCP PyPI](https://pypi.org/project/fastmcp/1.0/)
- [FastMCP GitHub](https://github.com/jlowin/fastmcp)
- [Introducing FastMCP 2.0](https://www.jlowin.dev/blog/fastmcp-2)
- [Java SDK GitHub](https://github.com/modelcontextprotocol/java-sdk)

### Transport Layer

- [MCP Transports Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP Transport Protocols Comparison](https://mcpcat.io/guides/comparing-stdio-sse-streamablehttp/)
- [Why MCP Deprecated SSE](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [SSE vs Streamable HTTP](https://brightdata.com/blog/ai/sse-vs-streamable-http)

### Authentication and Authorization

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP Spec Updates from June 2025](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
- [Understanding OAuth 2.1 for MCP](https://www.marktechpost.com/2025/08/31/understanding-oauth-2-1-for-mcp-model-context-protocol-servers-discovery-authorization-and-access-phases/)
- [What's New In The 2025-11-25 MCP Authorization Spec](https://den.dev/blog/mcp-november-authorization-spec/)
- [Let's fix OAuth in MCP](https://aaronparecki.com/2025/04/03/15/oauth-for-model-context-protocol)

### Tools, Resources, and Prompts

- [MCP Tools Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Prompts Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)
- [How to Effectively Use Prompts, Resources, and Tools in MCP](https://composio.dev/blog/how-to-effectively-use-prompts-resources-and-tools-in-mcp)
- [MCP Prompts for Workflow Automation](http://blog.modelcontextprotocol.io/posts/2025-07-29-prompts-for-automation/)
- [Understanding MCP Features Guide](https://workos.com/blog/mcp-features-guide)
- [MCP JSON Schema Validation Best Practices](https://www.byteplus.com/en/topic/542256)

### Implementation Guides

- [MCP Server Guide (Python/TypeScript)](https://github.com/kaianuar/mcp-server-guide)
- [How to Build a Custom MCP Server with TypeScript](https://www.freecodecamp.org/news/how-to-build-a-custom-mcp-server-with-typescript-a-handbook-for-developers/)
- [Example MCP Servers](https://modelcontextprotocol.io/examples)
- [MCP for Beginners (Microsoft)](https://github.com/microsoft/mcp-for-beginners)
- [Building MCP Servers the Right Way](https://maurocanuto.medium.com/building-mcp-servers-the-right-way-a-production-ready-guide-in-typescript-8ceb9eae9c7f)
- [Building Your First MCP Server (GitHub)](https://github.blog/ai-and-ml/github-copilot/building-your-first-mcp-server-how-to-extend-ai-tools-with-custom-capabilities/)

### Migration and Breaking Changes

- [When Your MCP Server Breaks Everything](https://scottefein.github.io/mcp-versioning/)
- [MCP Streamable HTTP Implementation](https://github.com/invariantlabs-ai/mcp-streamable-http)

---

**Document Version**: 1.0
**Last Updated**: December 6, 2025
**Next Review**: March 2026 (or upon next major MCP specification release)
