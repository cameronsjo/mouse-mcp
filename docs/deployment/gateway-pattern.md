# Gateway Pattern Deployment

Deploy mouse-mcp behind an MCP gateway with Authelia authentication and Tailscale Funnel ingress.

## Overview

This pattern is for self-hosted deployments where:

- You already run Authelia for SSO
- You want zero external auth dependencies
- You're using Tailscale Funnel for public ingress
- You have multiple MCP servers behind a single gateway

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
│                                                                  │
│  [Claude.ai] ──HTTPS──► [Tailscale Funnel]                      │
│                         mcp-gateway.tailnet.ts.net               │
└─────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                    Docker Network: mcp-gateway                   │
│                               │                                  │
│                               ▼                                  │
│                    ┌──────────────────┐                         │
│                    │  tailscale-mcp   │                         │
│                    │  (Funnel ingress)│                         │
│                    └────────┬─────────┘                         │
│                             │                                    │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                    │
│              ▼              ▼              ▼                    │
│     ┌─────────────┐  ┌────────────┐  ┌──────────┐              │
│     │  Authelia   │  │agentgateway│  │  Redis   │              │
│     │  :9091      │  │   :8080    │  │  :6379   │              │
│     └─────────────┘  └─────┬──────┘  └──────────┘              │
│                            │                                    │
│              ┌─────────────┼─────────────┐                     │
│              ▼             ▼             ▼                     │
│     ┌─────────────┐ ┌────────────┐ ┌────────────┐             │
│     │  mouse-mcp  │ │ obsidian   │ │ home-asst  │             │
│     │    :3000    │ │   :3001    │ │   :3002    │             │
│     └─────────────┘ └────────────┘ └────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Docker and Docker Compose
- Tailscale with Funnel enabled
- Existing Authelia deployment (or willingness to set one up)
- Domain on your Tailnet (e.g., `mcp-gateway.tailnet.ts.net`)

## Configuration Files

### docker-compose.gateway.yml

```yaml
services:
  # Tailscale container with Funnel
  tailscale-mcp:
    image: tailscale/tailscale:latest
    hostname: mcp-gateway
    environment:
      - TS_AUTHKEY=${TS_AUTHKEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_SERVE_CONFIG=/config/serve.json
    volumes:
      - tailscale-state:/var/lib/tailscale
      - ./tailscale-serve.json:/config/serve.json:ro
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    restart: unless-stopped
    networks:
      - mcp-gateway

  # Authelia - OIDC Provider
  authelia:
    image: authelia/authelia:latest
    volumes:
      - ./authelia:/config
    environment:
      - TZ=America/Chicago
    networks:
      - mcp-gateway
    depends_on:
      - redis
    restart: unless-stopped

  # Redis - Authelia session storage
  redis:
    image: redis:7-alpine
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - redis-data:/data
    networks:
      - mcp-gateway
    restart: unless-stopped

  # agentgateway - MCP multiplexer with CEL authorization
  agentgateway:
    image: ghcr.io/agentgateway/agentgateway:latest
    volumes:
      - ./agentgateway.yaml:/etc/agentgateway/config.yaml:ro
    networks:
      - mcp-gateway
    depends_on:
      - authelia
    restart: unless-stopped

  # mouse-mcp - Disney Parks MCP server
  mouse-mcp:
    build:
      context: ../..
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - MOUSE_MCP_TRANSPORT=http
      - MOUSE_MCP_PORT=3000
      - MOUSE_MCP_HOST=0.0.0.0
      # OAuth disabled - agentgateway handles authentication
      - MOUSE_MCP_OAUTH_ENABLED=false
    volumes:
      - mouse-mcp-data:/app/.data
    networks:
      - mcp-gateway
    restart: unless-stopped
    # No ports exposed - only agentgateway can reach it

networks:
  mcp-gateway:
    driver: bridge

volumes:
  tailscale-state:
  redis-data:
  mouse-mcp-data:
```

### tailscale-serve.json

Tailscale Funnel configuration routing requests to internal services:

```json
{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "mcp-gateway.YOUR_TAILNET.ts.net:443": {
      "Handlers": {
        "/auth/": {
          "Proxy": "http://authelia:9091"
        },
        "/mcp": {
          "Proxy": "http://agentgateway:8080"
        },
        "/.well-known/": {
          "Proxy": "http://agentgateway:8080"
        }
      }
    }
  },
  "AllowFunnel": {
    "mcp-gateway.YOUR_TAILNET.ts.net:443": true
  }
}
```

### agentgateway.yaml

MCP gateway configuration with JWT validation and CEL authorization:

```yaml
server:
  address: ":8080"

auth:
  # Authelia JWKS endpoint (through Tailscale proxy)
  jwksUrl: https://mcp-gateway.YOUR_TAILNET.ts.net/auth/api/oidc/jwks
  issuer: https://mcp-gateway.YOUR_TAILNET.ts.net/auth
  audience: https://mcp-gateway.YOUR_TAILNET.ts.net

# MCP server targets
targets:
  - name: mouse-mcp
    url: http://mouse-mcp:3000/mcp
    protocol: streamable-http

  # Add other MCP servers here
  # - name: obsidian-mcp
  #   url: http://obsidian-mcp:3001/mcp
  #   protocol: streamable-http

# CEL authorization rules
mcpAuthorization:
  # Default deny - only explicitly allowed tools pass
  defaultAction: deny

  rules:
    # Disney Parks - read operations
    - 'mcp.tool.name == "disney_entity" && jwt.scope.contains("disney:read")'
    - 'mcp.tool.name == "disney_attractions" && jwt.scope.contains("disney:read")'
    - 'mcp.tool.name == "disney_dining" && jwt.scope.contains("disney:read")'
    - 'mcp.tool.name == "disney_destinations" && jwt.scope.contains("disney:read")'

    # Disney Parks - sync operations (refresh data)
    - 'mcp.tool.name == "disney_sync" && jwt.scope.contains("disney:sync")'

    # Disney Parks - status checks
    - 'mcp.tool.name == "disney_status" && jwt.scope.contains("disney:status")'

    # Obsidian - read operations (example for other MCP servers)
    # - 'mcp.tool.name.startsWith("obsidian_") && mcp.tool.name.contains("read") && jwt.scope.contains("read:notes")'
    # - 'mcp.tool.name.startsWith("obsidian_") && mcp.tool.name.contains("search") && jwt.scope.contains("read:notes")'

    # Obsidian - write operations
    # - 'mcp.tool.name.startsWith("obsidian_") && mcp.tool.name.contains("write") && jwt.scope.contains("write:notes")'
```

### authelia/configuration.yml (relevant sections)

Add the MCP gateway client and Disney scopes:

```yaml
identity_providers:
  oidc:
    # HMAC secret for signing - generate with: openssl rand -hex 32
    hmac_secret: ${AUTHELIA_OIDC_HMAC_SECRET}

    # Issuer private key - generate with: openssl genrsa -out private.pem 4096
    issuer_private_keys:
      - key_id: 'main'
        algorithm: 'RS256'
        use: 'sig'
        key: |
          ${AUTHELIA_OIDC_ISSUER_PRIVATE_KEY}

    clients:
      - client_id: 'mcp-gateway'
        client_name: 'MCP Gateway'
        # Generate with: authelia crypto hash generate pbkdf2 --password 'your-secret'
        client_secret: '${MCP_GATEWAY_CLIENT_SECRET_HASH}'

        public: false
        authorization_policy: 'two_factor'

        redirect_uris:
          - 'https://mcp-gateway.YOUR_TAILNET.ts.net/auth/callback'

        scopes:
          - 'openid'
          - 'profile'
          - 'email'
          # Disney Parks scopes
          - 'disney:read'
          - 'disney:sync'
          - 'disney:status'
          # Add other MCP scopes as needed
          # - 'read:notes'
          # - 'write:notes'
          # - 'execute:home'

        audience:
          - 'https://mcp-gateway.YOUR_TAILNET.ts.net'

        requested_audience_mode: 'explicit'

        grant_types:
          - 'authorization_code'
          - 'refresh_token'

        response_types:
          - 'code'

        response_modes:
          - 'query'

        pkce_challenge_method: 'S256'

        token_endpoint_auth_method: 'client_secret_post'

        # Token lifetimes
        access_token_lifespan: '1h'
        refresh_token_lifespan: '7d'
        id_token_lifespan: '1h'
```

## Environment Variables

Create a `.env` file:

```bash
# Tailscale
TS_AUTHKEY=tskey-auth-xxxxx  # Generate at https://login.tailscale.com/admin/settings/keys

# Authelia OIDC
AUTHELIA_OIDC_HMAC_SECRET=<openssl rand -hex 32>
AUTHELIA_OIDC_ISSUER_PRIVATE_KEY=<contents of private.pem>
MCP_GATEWAY_CLIENT_SECRET_HASH=<authelia crypto hash generate pbkdf2 output>
```

## Deployment

### 1. Generate secrets

```bash
# OIDC HMAC secret
openssl rand -hex 32

# OIDC issuer private key
openssl genrsa -out authelia/private.pem 4096

# Client secret (remember the plaintext for Claude.ai config)
docker run --rm authelia/authelia:latest crypto hash generate pbkdf2 --password 'your-client-secret'
```

### 2. Update placeholders

Replace `YOUR_TAILNET` with your actual Tailnet name in:

- `tailscale-serve.json`
- `agentgateway.yaml`
- `authelia/configuration.yml`

### 3. Start the stack

```bash
cd docs/deployment
docker-compose -f docker-compose.gateway.yml up -d
```

### 4. Verify Funnel is working

```bash
# Check Tailscale status
docker exec tailscale-mcp tailscale status

# Test health endpoint (through Funnel)
curl https://mcp-gateway.YOUR_TAILNET.ts.net/mcp/health
```

### 5. Configure Claude.ai

In Claude.ai settings, add the MCP server:

```json
{
  "mcpServers": {
    "disney-parks": {
      "url": "https://mcp-gateway.YOUR_TAILNET.ts.net/mcp",
      "auth": {
        "type": "oauth2",
        "authorizationUrl": "https://mcp-gateway.YOUR_TAILNET.ts.net/auth/api/oidc/authorize",
        "tokenUrl": "https://mcp-gateway.YOUR_TAILNET.ts.net/auth/api/oidc/token",
        "clientId": "mcp-gateway",
        "clientSecret": "your-client-secret",
        "scopes": ["openid", "disney:read", "disney:sync", "disney:status"]
      }
    }
  }
}
```

## Security Considerations

### Network Isolation

- MCP servers (mouse-mcp, obsidian-mcp, etc.) have no exposed ports
- Only agentgateway can reach them via Docker network
- agentgateway only accepts authenticated requests

### Token Validation

agentgateway validates:

1. JWT signature via Authelia's JWKS endpoint
2. Issuer matches configured value
3. Audience includes gateway URL
4. Token not expired
5. Required scopes present (via CEL rules)

### Scope Granularity

CEL rules enforce per-tool authorization:

```yaml
# User with disney:read can query but not sync
- 'mcp.tool.name == "disney_entity" && jwt.scope.contains("disney:read")'

# Sync requires explicit disney:sync scope
- 'mcp.tool.name == "disney_sync" && jwt.scope.contains("disney:sync")'
```

### MFA Requirement

Authelia config uses `authorization_policy: 'two_factor'`, requiring TOTP or WebAuthn for all MCP access.

## Troubleshooting

### Check agentgateway logs

```bash
docker-compose -f docker-compose.gateway.yml logs agentgateway
```

### Test JWKS endpoint

```bash
curl https://mcp-gateway.YOUR_TAILNET.ts.net/auth/api/oidc/jwks
```

### Test OAuth flow manually

```bash
# Get authorization URL
echo "https://mcp-gateway.YOUR_TAILNET.ts.net/auth/api/oidc/authorize?client_id=mcp-gateway&response_type=code&redirect_uri=https://mcp-gateway.YOUR_TAILNET.ts.net/auth/callback&scope=openid%20disney:read&code_challenge_method=S256&code_challenge=<challenge>"
```

### Verify mouse-mcp is healthy

```bash
docker-compose -f docker-compose.gateway.yml exec mouse-mcp curl localhost:3000/health
```

## Comparison with Direct OAuth

| Aspect | Gateway Pattern | Direct OAuth |
|--------|-----------------|--------------|
| Auth validation | agentgateway | mouse-mcp |
| MOUSE_MCP_OAUTH_ENABLED | false | true |
| External IdP needed | No (Authelia) | Yes (Logto/Auth0) |
| RFC 8707 compliance | Via CEL rules | Native |
| RFC 7591 DCR | Not needed | Required |
| Best for | Homelab, single client | Cloud, multi-client |

## Adding More MCP Servers

To add another MCP server (e.g., obsidian-mcp):

### 1. Add to docker-compose

```yaml
services:
  obsidian-mcp:
    image: your-obsidian-mcp:latest
    environment:
      - OBSIDIAN_VAULT_PATH=/vault
    volumes:
      - /path/to/vault:/vault:ro
    networks:
      - mcp-gateway
```

### 2. Add target to agentgateway

```yaml
targets:
  - name: obsidian-mcp
    url: http://obsidian-mcp:3001/mcp
    protocol: streamable-http
```

### 3. Add CEL rules

```yaml
mcpAuthorization:
  rules:
    - 'mcp.tool.name.startsWith("obsidian_") && jwt.scope.contains("read:notes")'
```

### 4. Add scopes to Authelia

```yaml
scopes:
  - 'read:notes'
  - 'write:notes'
```
