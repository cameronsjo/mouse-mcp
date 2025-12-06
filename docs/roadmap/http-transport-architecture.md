# HTTP Transport Architecture

Visual diagrams showing the architecture for adding HTTP transport to mouse-mcp.

## Current Architecture (stdio only)

```mermaid
graph LR
    A[Claude Desktop] -->|spawn process| B[mouse-mcp]
    B -->|stdin/stdout| A
    B --> C[McpServer]
    C --> D[StdioServerTransport]
    D -->|JSON-RPC| A

    style A fill:#e1f5ff
    style B fill:#fff4e6
    style C fill:#f3e5f5
    style D fill:#e8f5e9
```

## Dual Transport Architecture (stdio + HTTP)

```mermaid
graph TB
    subgraph "Local Mode"
        A1[Claude Desktop] -->|spawn subprocess| B1[mouse-mcp]
        B1 --> C1[McpServer Instance]
        C1 --> D1[StdioServerTransport]
        D1 -->|stdin/stdout JSON-RPC| A1
    end

    subgraph "HTTP Mode"
        A2[HTTP Client] -->|HTTP Request| B2[Express App :3000]
        B2 --> C2[/mcp Endpoint]
        C2 --> D2[StreamableHTTPServerTransport]
        D2 --> E2[McpServer Instance]
        D2 -->|SSE Stream| A2
    end

    subgraph "Shared Server Logic"
        S1[McpServer Class]
        S1 --> T1[Tool Handlers]
        S1 --> T2[Resource Handlers]
        S1 --> T3[Prompt Handlers]
    end

    C1 -.->|uses| S1
    E2 -.->|uses| S1

    style A1 fill:#e1f5ff
    style A2 fill:#e1f5ff
    style B1 fill:#fff4e6
    style B2 fill:#fff4e6
    style S1 fill:#f3e5f5
    style D1 fill:#e8f5e9
    style D2 fill:#e8f5e9
```

## HTTP Transport Request Flow

```mermaid
sequenceDiagram
    participant C as HTTP Client
    participant E as Express App
    participant H as /mcp Handler
    participant T as StreamableHTTPServerTransport
    participant M as McpServer
    participant D as Disney API

    Note over C,E: Initialize Session
    C->>E: POST /mcp (initialize)
    E->>H: Route request
    H->>T: Create new transport
    T->>M: Connect transport
    M->>T: Ready
    T->>H: Session ID generated
    H->>E: Store transport by session ID
    E->>C: 200 OK + Mcp-Session-Id header

    Note over C,E: Tool Call
    C->>E: POST /mcp (tools/call)
    Note over C,E: Header: Mcp-Session-Id
    E->>H: Route with session ID
    H->>T: Lookup transport by session ID
    T->>M: Process tool call
    M->>D: Fetch Disney data
    D->>M: Return data
    M->>T: Tool result
    T->>E: JSON or SSE response
    E->>C: 200 OK (result)

    Note over C,E: Server Notifications (SSE)
    C->>E: GET /mcp
    Note over C,E: Header: Mcp-Session-Id
    E->>H: Route request
    H->>T: Lookup transport
    T->>E: Establish SSE stream
    E->>C: 200 OK (text/event-stream)
    M->>T: Send notification
    T->>C: SSE event
    M->>T: Send another notification
    T->>C: SSE event

    Note over C,E: Terminate Session
    C->>E: DELETE /mcp
    Note over C,E: Header: Mcp-Session-Id
    E->>H: Route request
    H->>T: Lookup transport
    T->>M: Close connection
    M->>T: Cleanup
    T->>H: Session closed
    H->>E: Remove from transport map
    E->>C: 200 OK
```

## Session Management

```mermaid
graph TB
    subgraph "Session Lifecycle"
        S1[Client Connects] --> S2[Initialize Request]
        S2 --> S3[Generate Session ID]
        S3 --> S4[Create Transport]
        S4 --> S5[Store in Map]
        S5 --> S6[Active Session]

        S6 --> S7{Request Type?}
        S7 -->|POST| S8[Handle Tool Call]
        S7 -->|GET| S9[Establish SSE Stream]
        S7 -->|DELETE| S10[Terminate Session]

        S8 --> S6
        S9 --> S6
        S10 --> S11[Close Transport]
        S11 --> S12[Remove from Map]
        S12 --> S13[Session Ended]
    end

    subgraph "Transport Map"
        M1["transports: {
            'uuid-1': Transport1,
            'uuid-2': Transport2,
            'uuid-3': Transport3
        }"]
    end

    S5 -.->|store| M1
    S6 -.->|lookup| M1
    S12 -.->|remove| M1

    style S3 fill:#ffe082
    style S4 fill:#a5d6a7
    style S6 fill:#90caf9
    style S10 fill:#ef9a9a
    style M1 fill:#f3e5f5
```

## Environment-Based Transport Selection

```mermaid
graph TB
    A[Start Application] --> B{Check MOUSE_MCP_TRANSPORT}

    B -->|stdio or undefined| C[stdio Mode]
    B -->|http| D[HTTP Mode]

    C --> E[Create StdioServerTransport]
    E --> F[Connect to stdin/stdout]
    F --> G[McpServer.connect]
    G --> H[Ready for Claude Desktop]

    D --> I[Create Express App]
    I --> J[Configure /mcp endpoint]
    J --> K[Start HTTP server on port]
    K --> L[Ready for HTTP clients]

    subgraph "Shared Logic"
        M[McpServer Instance]
        N[Tool Registration]
        O[Resource Registration]
        P[Prompt Registration]
    end

    G --> M
    L --> M
    M --> N
    M --> O
    M --> P

    style A fill:#e1f5ff
    style C fill:#c8e6c9
    style D fill:#fff9c4
    style M fill:#f3e5f5
```

## HTTP Transport with Event Store (Resumability)

```mermaid
graph TB
    subgraph "Client Connection Flow"
        C1[Client Connects] --> C2[POST /mcp]
        C2 --> C3{Has Last-Event-ID?}

        C3 -->|No| C4[Normal Initialize]
        C4 --> C5[Process Request]
        C5 --> C6[Store Event]
        C6 --> C7[Send Response]

        C3 -->|Yes| C8[Resume Mode]
        C8 --> C9[Replay Events After ID]
        C9 --> C10[Continue Stream]
    end

    subgraph "Event Store"
        E1[("Event Store
        (Redis/PostgreSQL)")]
        E2["event-1: message1
        event-2: message2
        event-3: message3"]
    end

    C6 -.->|store| E1
    C9 -.->|replay| E1
    E1 --> E2

    subgraph "Disconnect/Reconnect"
        D1[Connection Lost] --> D2[Client Reconnects]
        D2 --> D3[Send Last-Event-ID]
        D3 --> C8
    end

    style C8 fill:#ffe082
    style E1 fill:#f3e5f5
    style D1 fill:#ef9a9a
```

## Security Layers

```mermaid
graph TB
    A[HTTP Request] --> B{Host Header Valid?}
    B -->|No| Z1[403 Forbidden]
    B -->|Yes| C{Environment}

    C -->|Development + localhost| D[Skip Auth]
    C -->|Production| E{Bearer Token?}

    E -->|No| Z2[401 Unauthorized]
    E -->|Yes| F{Token Valid?}

    F -->|No| Z3[401 Invalid Token]
    F -->|Yes| G{Scopes OK?}

    G -->|No| Z4[403 Insufficient Scopes]
    G -->|Yes| H[Process Request]

    D --> H
    H --> I[MCP Handler]
    I --> J[Tool Execution]

    subgraph "Security Middleware Stack"
        M1[DNS Rebinding Protection]
        M2[Bearer Auth Middleware]
        M3[Rate Limiting]
        M4[CORS Headers]
    end

    B -.->|uses| M1
    E -.->|uses| M2
    H -.->|optional| M3
    H -.->|optional| M4

    style B fill:#ffe082
    style F fill:#ffe082
    style H fill:#a5d6a7
    style Z1 fill:#ef9a9a
    style Z2 fill:#ef9a9a
    style Z3 fill:#ef9a9a
    style Z4 fill:#ef9a9a
```

## Deployment Scenarios

```mermaid
graph TB
    subgraph "Local Development"
        L1[Claude Desktop] -->|stdio| L2[mouse-mcp]
        L3[HTTP Client] -->|http://localhost:3000| L2
        L2 --> L4[No Auth Required]
    end

    subgraph "Cloud Deployment"
        C1[Claude App] -->|HTTPS| C2[Load Balancer]
        C2 -->|HTTP| C3[mouse-mcp :3000]
        C3 --> C4[Bearer Auth Required]
        C3 --> C5[Event Store]
        C5 --> C6[(Redis/PostgreSQL)]
    end

    subgraph "Hybrid Deployment"
        H1[Claude Desktop] -->|stdio| H2[mouse-mcp]
        H3[Web App] -->|HTTPS| H4[Reverse Proxy]
        H4 -->|HTTP| H2
        H2 --> H5[Auth for HTTP only]
    end

    style L2 fill:#c8e6c9
    style C3 fill:#fff9c4
    style H2 fill:#e1bee7
```

## File Structure After Implementation

```
mouse-mcp/
├── src/
│   ├── server.ts                  # DisneyMcpServer class
│   │   ├── runStdio()            # stdio transport method
│   │   └── runHttp()             # NEW: HTTP transport method
│   ├── index.ts                   # Entry point - transport selection
│   ├── config/
│   │   └── index.ts              # Config with transport settings
│   └── http/                     # NEW: HTTP-specific code
│       ├── server.ts             # HTTP server setup
│       ├── handlers.ts           # Request handlers
│       └── event-store.ts        # Event store implementation
├── .env.example                   # Updated with transport vars
└── docs/
    └── roadmap/
        ├── research-http-transport.md          # Full research
        ├── http-transport-quickstart.md        # Quick start
        └── http-transport-architecture.md      # This file
```

## Key Architecture Decisions

### 1. Single McpServer Instance
- Both transports use the same `McpServer` instance
- Tool/resource/prompt handlers are shared
- Only transport layer differs

### 2. Session Map Pattern
- Store transports by session ID
- Enables multiple concurrent HTTP connections
- Clean up on session close or timeout

### 3. Environment-Based Selection
- `MOUSE_MCP_TRANSPORT` env var controls mode
- Default to stdio for backwards compatibility
- No code changes needed to switch modes

### 4. Security by Default
- `createMcpExpressApp()` includes localhost protection
- Production MUST use authentication
- Development MAY skip auth for localhost only

### 5. Optional Resumability
- Event store is opt-in via configuration
- Start with in-memory for simplicity
- Migrate to persistent store (Redis/PostgreSQL) for production

## Next Steps

1. Review architecture diagrams
2. Identify which patterns to implement first
3. Create implementation plan
4. Begin with minimal HTTP support (Phase 1)
5. Add advanced features (resumability, auth) later
