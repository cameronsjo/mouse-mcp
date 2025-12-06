# RFC 9457 Problem Details - Architecture

Architecture diagrams and data flow for RFC 9457 Problem Details implementation in Mouse MCP.

## System Architecture

```mermaid
graph TB
    subgraph "MCP Client"
        A[Client Request]
        Z[Client Response Handler]
    end

    subgraph "Mouse MCP Server"
        B[MCP Server]
        C[Tool Handler]
        D[Business Logic]
    end

    subgraph "Error Handling Layer"
        E[Error Classes]
        F[formatErrorResponse]
        G[Sanitization]
        H[UUID Generator]
    end

    subgraph "External Services"
        I[Disney API]
        J[Database]
        K[Cache]
    end

    A -->|Tool Call| B
    B -->|Route| C
    C -->|Execute| D
    D -->|Success| C
    D -->|Error| E

    D -.->|API Request| I
    D -.->|DB Query| J
    D -.->|Cache Read| K

    I -.->|API Error| E
    J -.->|DB Error| E
    K -.->|Cache Error| E

    E -->|Convert| F
    F -->|Sanitize| G
    F -->|Generate URN| H
    F -->|Problem Details| C
    C -->|Response| B
    B -->|RFC 9457 JSON| Z
```

## Error Flow Diagram

```mermaid
sequenceDiagram
    participant Client
    participant MCP as MCP Server
    participant Tool as Tool Handler
    participant Logic as Business Logic
    participant External as External Service
    participant Error as Error Handler

    Client->>MCP: Tool Call Request
    MCP->>Tool: Route to disney_attractions
    Tool->>Logic: Execute with args

    alt Validation Failure
        Logic->>Error: throw ValidationError
        Error->>Tool: Problem Details Response
    else Session Failure
        Logic->>Logic: Check session
        Logic->>Error: throw SessionError
        Error->>Tool: Problem Details Response
    else API Failure
        Logic->>External: API Request
        External-->>Logic: 503 Service Unavailable
        Logic->>Error: throw ApiError
        Error->>Tool: Problem Details Response
    else Success
        Logic->>External: API Request
        External-->>Logic: 200 OK
        Logic->>Tool: Success Response
    end

    Tool->>MCP: Format Response
    MCP->>Client: Return Response
    Client->>Client: Parse Problem Details
    Client->>Client: Handle Error Type
```

## Error Class Hierarchy

```mermaid
classDiagram
    Error <|-- DisneyMcpError
    DisneyMcpError <|-- ValidationError
    DisneyMcpError <|-- ApiError
    DisneyMcpError <|-- SessionError
    DisneyMcpError <|-- NotFoundError
    DisneyMcpError <|-- DatabaseError
    DisneyMcpError <|-- CacheError
    DisneyMcpError <|-- ConfigError

    class Error {
        +message: string
        +name: string
        +stack: string
    }

    class DisneyMcpError {
        +code: string
        +details: Record
        +tool: string
        +entityId: string
        +entityType: string
        +toProblemDetails() ProblemDetails
    }

    class ValidationError {
        +field: string
        +value: unknown
        +toProblemDetails() ProblemDetails
    }

    class ApiError {
        +statusCode: number
        +endpoint: string
        +toProblemDetails() ProblemDetails
    }

    class SessionError {
        +isAuthFailure: boolean
        +toProblemDetails() ProblemDetails
    }

    class NotFoundError {
        +entityType: string
        +entityId: string
        +toProblemDetails() ProblemDetails
    }

    class DatabaseError {
        +toProblemDetails() ProblemDetails
    }

    class CacheError {
        +toProblemDetails() ProblemDetails
    }

    class ConfigError {
        +configKey: string
        +toProblemDetails() ProblemDetails
    }
```

## Problem Details Data Structure

```mermaid
graph LR
    subgraph "RFC 9457 Required Fields"
        A[type: URI]
        B[title: string]
        C[status: number]
        D[detail: string]
        E[instance: URN]
    end

    subgraph "Standard Extensions"
        F[timestamp: ISO8601]
        G[tool: string]
    end

    subgraph "Error-Specific Extensions"
        H[field: string]
        I[invalidValue: unknown]
        J[endpoint: string]
        K[entityType: string]
        L[entityId: string]
        M[configKey: string]
    end

    A --> PD[ProblemDetails]
    B --> PD
    C --> PD
    D --> PD
    E --> PD
    F -.-> PD
    G -.-> PD
    H -.-> PD
    I -.-> PD
    J -.-> PD
    K -.-> PD
    L -.-> PD
    M -.-> PD
```

## Error Type Selection Flow

```mermaid
graph TD
    START[Error Occurred] --> CHECK_INPUT{Input Related?}

    CHECK_INPUT -->|Yes| CHECK_VALID{Input Valid?}
    CHECK_VALID -->|No| VALIDATION[ValidationError<br/>400 Bad Request]
    CHECK_VALID -->|Yes, but missing| CHECK_EXISTS{Resource Exists?}
    CHECK_EXISTS -->|No| NOTFOUND[NotFoundError<br/>404 Not Found]

    CHECK_INPUT -->|No| CHECK_EXTERNAL{External System?}
    CHECK_EXTERNAL -->|Yes, API| API[ApiError<br/>502/503]
    CHECK_EXTERNAL -->|Yes, Database| DATABASE[DatabaseError<br/>500]
    CHECK_EXTERNAL -->|Yes, Cache| CACHE[CacheError<br/>500]

    CHECK_EXTERNAL -->|No| CHECK_AUTH{Auth Related?}
    CHECK_AUTH -->|Yes| SESSION[SessionError<br/>401 Unauthorized]

    CHECK_AUTH -->|No| CHECK_CONFIG{Config Related?}
    CHECK_CONFIG -->|Yes| CONFIG[ConfigError<br/>500]
    CHECK_CONFIG -->|No| GENERIC[DisneyMcpError<br/>500]

    VALIDATION --> END[Format as<br/>Problem Details]
    NOTFOUND --> END
    API --> END
    DATABASE --> END
    CACHE --> END
    SESSION --> END
    CONFIG --> END
    GENERIC --> END
```

## Sanitization Pipeline

```mermaid
graph LR
    A[Error Created] --> B[toProblemDetails]
    B --> C{Contains Sensitive Data?}

    C -->|File Paths| D[Replace with '[path]']
    C -->|Tokens/Keys| E[Replace with '[redacted]']
    C -->|Emails| F[Replace with '[email]']
    C -->|Query Params| G[Sanitize URL]
    C -->|Large Objects| H[Summarize '[Object]']
    C -->|Long Strings| I[Truncate '...']

    D --> J[Safe Problem Details]
    E --> J
    F --> J
    G --> J
    H --> J
    I --> J

    J --> K[formatErrorResponse]
    K --> L[MCP Response]
```

## Tool Handler Pattern

```mermaid
graph TD
    A[Tool Invoked] --> B[Validate Input]
    B -->|Invalid| B1[throw ValidationError<br/>with tool name]

    B -->|Valid| C[Check Session]
    C -->|No Session| C1[throw SessionError<br/>with tool name]

    C -->|Session OK| D[Execute Business Logic]
    D -->|API Call| E{API Success?}
    E -->|No| E1[throw ApiError<br/>with tool name]

    E -->|Yes| F[Process Results]
    F --> G[Return Success Response]

    B1 --> H[Catch Block]
    C1 --> H
    E1 --> H

    H --> I[formatErrorResponse<br/>with tool name]
    I --> J[Return Problem Details]
```

## Client Error Handling Flow

```mermaid
graph TD
    A[Receive Response] --> B{isError: true?}
    B -->|No| C[Process Success]

    B -->|Yes| D[Parse Problem Details]
    D --> E{Check Error Type}

    E -->|validation-error| F[Highlight Field<br/>Show Validation Message]
    E -->|session-error| G[Trigger Auth Flow<br/>Retry After Auth]
    E -->|api-error| H{Status Code?}
    H -->|503| I[Retry with Backoff]
    H -->|429| J[Wait & Retry]
    H -->|Other| K[Show API Error]

    E -->|not-found| L[Show Not Found UI<br/>Suggest Alternatives]
    E -->|database-error| M[Show Error<br/>Log Instance URN]
    E -->|configuration-error| N[Show Config Guide<br/>Link to Docs]
    E -->|Other| O[Show Generic Error<br/>Log Instance URN]

    F --> P[Allow User Action]
    G --> P
    I --> P
    J --> P
    K --> P
    L --> P
    M --> P
    N --> P
    O --> P
```

## Error Type Registry Lookup

```mermaid
graph LR
    A[Error Instance] --> B[Get error.name]
    B --> C{Lookup in Registry}

    C -->|ValidationError| D[type: validation-error<br/>title: Validation Failed<br/>status: 400]
    C -->|ApiError| E[type: api-error<br/>title: External API Error<br/>status: 502/503]
    C -->|SessionError| F[type: session-error<br/>title: Session Error<br/>status: 401]
    C -->|NotFoundError| G[type: not-found<br/>title: Resource Not Found<br/>status: 404]
    C -->|DatabaseError| H[type: database-error<br/>title: Database Error<br/>status: 500]
    C -->|CacheError| I[type: cache-error<br/>title: Cache Error<br/>status: 500]
    C -->|ConfigError| J[type: configuration-error<br/>title: Configuration Error<br/>status: 500]
    C -->|Unknown| K[type: about:blank<br/>title: An error occurred<br/>status: 500]

    D --> L[Apply to Problem Details]
    E --> L
    F --> L
    G --> L
    H --> L
    I --> L
    J --> L
    K --> L
```

## HTTP Status Code Mapping

```mermaid
graph TD
    A[Error Class] --> B{Determine Status Code}

    B -->|ValidationError| C[400 Bad Request]
    B -->|SessionError| D[401 Unauthorized]
    B -->|NotFoundError| E[404 Not Found]

    B -->|ApiError| F{Upstream Status?}
    F -->|4xx| G[502 Bad Gateway]
    F -->|5xx| H[503 Service Unavailable]

    B -->|DatabaseError| I[500 Internal Server Error]
    B -->|CacheError| J[500 Internal Server Error]
    B -->|ConfigError| K[500 Internal Server Error]
    B -->|DisneyMcpError| L[500 Internal Server Error]

    C --> M[Include in Problem Details]
    D --> M
    E --> M
    G --> M
    H --> M
    I --> M
    J --> M
    K --> M
    L --> M
```

## Component Interaction

```mermaid
graph TB
    subgraph "Application Layer"
        A[Tool Handlers]
        B[Business Logic]
    end

    subgraph "Error Layer"
        C[Error Classes]
        D[Error Registry]
        E[formatErrorResponse]
        F[Sanitizers]
    end

    subgraph "Utilities"
        G[UUID Generator]
        H[Timestamp Generator]
    end

    A --> B
    B --> C
    C --> D
    C --> E
    E --> F
    E --> G
    E --> H
    E --> A
```

## Data Flow: Validation Error Example

```mermaid
sequenceDiagram
    participant User
    participant Tool as disney_attractions
    participant Validator
    participant Error as ValidationError
    participant Formatter as formatErrorResponse
    participant Sanitizer

    User->>Tool: { destination: "orlando" }
    Tool->>Validator: Validate destination
    Validator->>Validator: Check if "orlando" in ["wdw", "dlr"]
    Validator->>Error: new ValidationError(<br/>"Invalid destination",<br/>"destination",<br/>"orlando",<br/>"disney_attractions")
    Error->>Error: Set name = "ValidationError"
    Error->>Formatter: throw error
    Formatter->>Error: Call toProblemDetails()
    Error->>Error: Lookup in ERROR_TYPE_REGISTRY
    Error->>Sanitizer: Sanitize value "orlando"
    Sanitizer-->>Error: "orlando" (under 100 chars)
    Error-->>Formatter: ProblemDetails object
    Formatter->>Formatter: Generate UUID
    Formatter->>Formatter: Add timestamp
    Formatter-->>Tool: ProblemDetailsResponse
    Tool-->>User: JSON RFC 9457 response
```

## Security Sanitization Flow

```mermaid
graph TD
    A[Error Data] --> B{Type of Data?}

    B -->|String| C{Content Check}
    C -->|Contains /path/| D[Replace with '[path]']
    C -->|Contains email| E[Replace with '[email]']
    C -->|Long token pattern| F[Replace with '[redacted]']
    C -->|Length > 100| G[Truncate to 97 chars + '...']
    C -->|Safe| H[Pass Through]

    B -->|URL| I{Has Query Params?}
    I -->|Yes| J{Sensitive Params?}
    J -->|token, key, secret, etc| K[Set to '[redacted]']
    J -->|No| L[Pass Through]
    I -->|No| L

    B -->|Object| M[Return '[Object]']
    B -->|Array| N[Return '[Array of N items]']
    B -->|Primitive| O[Pass Through]

    D --> P[Safe Value]
    E --> P
    F --> P
    G --> P
    H --> P
    K --> P
    L --> P
    M --> P
    N --> P
    O --> P
```

## Extension Fields by Error Type

```mermaid
graph TD
    A[Error Type] --> B{Which Error?}

    B -->|ValidationError| C[Base Fields<br/>+ field<br/>+ invalidValue]
    B -->|ApiError| D[Base Fields<br/>+ endpoint]
    B -->|SessionError| E[Base Fields<br/>only]
    B -->|NotFoundError| F[Base Fields<br/>+ entityType<br/>+ entityId]
    B -->|DatabaseError| G[Base Fields<br/>only]
    B -->|CacheError| H[Base Fields<br/>only]
    B -->|ConfigError| I[Base Fields<br/>+ configKey]
    B -->|DisneyMcpError| J[Base Fields<br/>only]

    style C fill:#e1f5ff
    style D fill:#fff4e1
    style E fill:#ffe1e1
    style F fill:#e1ffe1
    style G fill:#f5e1ff
    style H fill:#ffe1f5
    style I fill:#e1ffff
    style J fill:#f5f5f5
```

## References

- [RFC 9457 Full Implementation](./rfc9457-problem-details.md)
- [Error Type URIs](./error-types.md)
- [Quick Reference](./rfc9457-quick-reference.md)
- [Examples](./rfc9457-examples.md)
