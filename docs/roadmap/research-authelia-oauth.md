# Authelia OAuth 2.1 Compatibility for MCP

Research on using Authelia as the OAuth 2.1 authorization server for MCP cloud deployment.

## Status

- **Status:** Research Complete
- **Priority:** P1
- **Date:** 2025-12-07
- **Conclusion:** Authelia is **NOT RECOMMENDED** for standard MCP OAuth 2.1, but **WORKS** with gateway pattern

---

## Executive Summary

Authelia is a capable OpenID Connect provider for traditional web app SSO, but **lacks critical MCP OAuth 2.1 requirements**:

| MCP Requirement | Authelia Support | Status |
|-----------------|------------------|--------|
| OAuth 2.1 / PKCE (RFC 7636) | ✅ Full S256 support | Ready |
| Authorization Server Metadata (RFC 8414) | ✅ Complete | Ready |
| **Resource Indicators (RFC 8707)** | ❌ Not implemented | **Blocker** |
| **Dynamic Client Registration (RFC 7591)** | ❌ Planned (Beta 8) | **Blocker** |
| JWKS Endpoint | ✅ Full support | Ready |
| JWT Access Tokens (RFC 9068) | ✅ Available | Ready |
| Pushed Authorization Requests (RFC 9126) | ✅ Available | Ready |
| Custom Scopes | ✅ Available | Ready |

**Recommendations:**

- **Standard MCP OAuth 2.1:** Use **Logto (self-hosted)** - has full RFC 8707 and RFC 7591 support
- **Self-hosted with existing Authelia:** Use **Gateway Pattern** with agentgateway + Tailscale Funnel

---

## Alternative: Gateway Pattern (Authelia + agentgateway)

For self-hosted deployments where you already run Authelia, there's a viable alternative that sidesteps the RFC 8707/7591 gaps by using a **policy-based gateway** instead of pure OAuth 2.1 resource binding.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                 │
│                                                                  │
│  [Claude.ai] ──HTTPS──► [Tailscale Funnel]                      │
│                         mcp-gateway.tailnet.ts.net               │
└─────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                    Self-Hosted Infrastructure                    │
│                               │                                  │
│                               ▼                                  │
│                    ┌──────────────────┐                         │
│                    │  tailscale-mcp   │                         │
│                    │  (ingress proxy) │                         │
│                    └────────┬─────────┘                         │
│                             │                                    │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                    │
│              ▼              ▼              ▼                    │
│     ┌─────────────┐  ┌────────────┐  ┌──────────┐              │
│     │  Authelia   │  │agentgateway│  │  Redis   │              │
│     │ /auth/*     │  │  /mcp/*    │  │ sessions │              │
│     │ OIDC+TOTP   │  │ CEL rules  │  │          │              │
│     └──────┬──────┘  └─────┬──────┘  └──────────┘              │
│            │               │                                    │
│            │  JWKS ◄───────┤                                    │
│            │               │                                    │
│            │               ▼                                    │
│            │    ┌─────────────────────┐                        │
│            │    │    MCP Servers      │                        │
│            │    │  ┌───────────────┐  │                        │
│            │    │  │ Obsidian MCP  │  │                        │
│            │    │  │ Home Asst MCP │  │                        │
│            │    │  │ Code Sandbox  │  │                        │
│            │    │  └───────────────┘  │                        │
│            │    └─────────────────────┘                        │
└────────────┼────────────────────────────────────────────────────┘
             │
    Issues JWT with scopes:
    read:notes, execute:home, etc.
```

### Why This Works

The gateway pattern moves authorization enforcement from the OAuth server to the gateway:

| MCP Spec Requirement | Standard OAuth 2.1 | Gateway Pattern |
|---------------------|-------------------|-----------------|
| RFC 8707 Resource Indicators | Authorization server binds tokens to resources | agentgateway CEL rules scope tools |
| RFC 7591 Dynamic Client Registration | Required for arbitrary clients | Not needed - Claude.ai is pre-configured |
| Token audience binding | Multiple resources need `aud` binding | Single gateway = single audience |

**Key insight:** agentgateway's CEL rules replace RFC 8707 resource indicators with policy-as-code.

### Component Configuration

#### Authelia OIDC Client

```yaml
# authelia configuration.yml
identity_providers:
  oidc:
    clients:
      - client_id: 'claude-mcp-gateway'
        client_secret: '$pbkdf2-sha512$...'
        authorization_policy: 'two_factor'
        redirect_uris:
          - 'https://mcp-gateway.YOUR_TAILNET.ts.net/auth/callback'
        scopes:
          - 'openid'
          - 'profile'
          - 'read:notes'
          - 'write:notes'
          - 'execute:home'
        audience:
          - 'https://mcp-gateway.YOUR_TAILNET.ts.net'
        requested_audience_mode: 'explicit'
        pkce_challenge_method: 'S256'
```

#### agentgateway JWKS Configuration

```yaml
# agentgateway config
auth:
  # Authelia JWKS endpoint (via proxy)
  jwksUrl: https://mcp-gateway.YOUR_TAILNET.ts.net/auth/api/oidc/jwks
  issuer: https://mcp-gateway.YOUR_TAILNET.ts.net/auth
```

**Note:** Authelia's JWKS endpoint is `/api/oidc/jwks`, not `/jwks.json`. Through the proxy routing `/auth/*` to Authelia, the full path becomes `/auth/api/oidc/jwks`.

#### agentgateway CEL Authorization Rules

```yaml
# agentgateway config
mcpAuthorization:
  rules:
    # Obsidian tools - require read:notes or write:notes
    - 'mcp.tool.name == "obsidian.search" && jwt.scope.contains("read:notes")'
    - 'mcp.tool.name == "obsidian.read" && jwt.scope.contains("read:notes")'
    - 'mcp.tool.name == "obsidian.write" && jwt.scope.contains("write:notes")'
    - 'mcp.tool.name == "obsidian.delete" && jwt.scope.contains("write:notes")'

    # Home Assistant tools - require execute:home
    - 'mcp.tool.name.startsWith("home.") && jwt.scope.contains("execute:home")'

    # Catch-all deny (implicit, but explicit is clearer)
    # - 'false'  # Deny anything not matched above
```

**CEL variable bindings in agentgateway:**

- `mcp.tool.name` - The requested tool name
- `jwt.scope` - Token scopes (use `.contains()` method)
- `jwt.sub` - Token subject (user ID)
- `jwt.aud` - Token audience

### Request Flow

1. Claude.ai initiates OAuth → redirects to Authelia
2. User authenticates (password + TOTP)
3. Authelia issues JWT with granted scopes (`read:notes`, `execute:home`)
4. Claude calls `/mcp` with bearer token
5. agentgateway validates JWT signature via Authelia's JWKS
6. CEL rules check: `mcp.tool.name` matches allowed pattern AND `jwt.scope.contains()` required scope
7. If authorized, request routes to appropriate MCP server
8. Response flows back through the same path

### Security Properties

| Layer | Protection |
|-------|------------|
| Transport | Tailscale Funnel - outbound-only tunnel, TLS at edge |
| Authentication | Authelia - OIDC + TOTP, credentials never touch LLM |
| Authorization | agentgateway CEL - per-tool scope enforcement |
| Network | Backend MCPs on private network, only gateway reaches them |

### Trade-offs vs Standard MCP OAuth 2.1

| Aspect | Gateway Pattern | Standard OAuth 2.1 |
|--------|-----------------|-------------------|
| External dependencies | Zero (all self-hosted) | Logto/Auth0 or self-hosted Logto |
| Dynamic client registration | Not supported | Full RFC 7591 |
| Arbitrary MCP clients | Manual config per client | Automatic discovery |
| Authorization granularity | CEL rules (flexible) | OAuth scopes (standard) |
| Complexity | Higher (more components) | Lower (fewer moving parts) |
| Best for | Existing Authelia users, homelab | New deployments, multi-client |

### When to Use Gateway Pattern

**Use this pattern if:**

- You already run Authelia for other services
- Single known client (Claude.ai) - no DCR needed
- Want zero external auth dependencies
- Comfortable with CEL policy rules
- Running on home infrastructure with Tailscale

**Use standard Logto approach if:**

- Starting fresh without existing IdP
- Need to support multiple MCP clients
- Want simpler architecture (fewer components)
- Deploying to cloud (Railway, Fly.io)

---

## Detailed Analysis

### What Authelia Does Well

Authelia is an excellent **reverse proxy authentication portal** with:

1. **OpenID Certified™** - Complies with OIDC specifications
2. **PKCE Support** - Full RFC 7636 with S256 (since Beta 3, v4.34.0)
3. **Bearer Token Authorization** - RFC 6750 support for API access
4. **JWT Access Tokens** - RFC 9068 support (since Beta 6, v4.38.0)
5. **Pushed Authorization Requests** - RFC 9126 (since Beta 6)
6. **Fine-grained RBAC** - User/group and network-based policies
7. **Multiple MFA options** - TOTP, WebAuthn, Duo, mobile push

### Critical MCP Gaps

#### Gap 1: No RFC 8707 Resource Indicators

MCP requires RFC 8707 to:
- Prevent token mis-redemption attacks
- Bind access tokens to specific MCP servers
- Support multi-resource authorization

Authelia's current approach:
- Uses custom `audience` whitelist per client
- Requires explicit `requested_audience_mode: explicit`
- No standard `resource` parameter in authorization requests

**Impact:** Cannot properly scope tokens to MCP server resources. Tokens could potentially be used at unintended servers.

**Workaround potential:** Configure audience whitelist to match MCP server URL, but this is non-standard and MCP SDK may not support the `audience` parameter.

#### Gap 2: No Dynamic Client Registration

MCP uses DCR (RFC 7591) or CIMD for client registration. Authelia:
- Has DCR on roadmap (Beta 8, no ETA)
- Currently requires static client configuration in YAML
- Would need manual client provisioning for each MCP client

**Impact:** Every new MCP client (Claude Desktop, VS Code, etc.) would require manual server configuration. This breaks the MCP discovery flow.

---

## Authelia OIDC Roadmap

| Beta Stage | Version | Features | Status |
|------------|---------|----------|--------|
| Beta 1 | v4.29.0 | Authorization Code Flow, Discovery | ✅ Complete |
| Beta 2 | v4.30.0 | Userinfo, public clients | ✅ Complete |
| Beta 3 | v4.34.0 | PKCE (RFC 7636) | ✅ Complete |
| Beta 4 | v4.35.0 | Persistent storage, CORS | ✅ Complete |
| Beta 5 | v4.37.0 | X509 JWKs, consent modes | ✅ Complete |
| Beta 6 | v4.38.0 | JWT tokens, PAR, client credentials | ✅ Complete |
| Beta 7 | v4.39.0 | Custom scopes, device auth (RFC 8628), JWE | ✅ Complete |
| Beta 8 | v4.40.0 | **Dynamic Client Registration (RFC 7591)** | In Progress |
| Beta 9 | Future | Session management, logout, CIBA | Not Started |
| Future | TBD | **Resource Indicators (RFC 8707)** | On roadmap |

**Key insight:** RFC 8707 is on the "miscellaneous" roadmap with no specific beta target.

---

## Comparison: Authelia vs Logto for MCP

| Feature | Authelia (Direct) | Authelia + Gateway | Logto |
|---------|-------------------|-------------------|-------|
| RFC 8707 Resource Indicators | ❌ No | ✅ Via CEL rules | ✅ Native |
| RFC 7591 Dynamic Client Registration | ❌ Beta 8 (TBD) | ❌ Not needed | ✅ Yes |
| PKCE S256 | ✅ Yes | ✅ Yes | ✅ Yes |
| RFC 8414 AS Metadata | ✅ Yes | ✅ Yes | ✅ Yes |
| Custom Scopes | ✅ Yes | ✅ Yes | ✅ Yes |
| JWT Access Tokens | ✅ Yes | ✅ Yes | ✅ Yes |
| RBAC | ✅ Built-in | ✅ CEL policies | ✅ Built-in |
| MCP Official Documentation | ❌ No | ❌ No | ✅ Yes |
| Self-hosted | ✅ Yes | ✅ Yes | ✅ Yes |
| Open Source | ✅ Apache 2.0 | ✅ Apache 2.0 | ✅ MPL 2.0 |
| External dependencies | None | None | PostgreSQL |
| Primary Use Case | Reverse proxy SSO | Homelab MCP | Cloud MCP |
| Complexity | Low | High | Medium |

---

## When to Use Authelia

Authelia remains excellent for:

1. **Reverse proxy authentication** - Protecting web apps behind traefik/nginx
2. **Single Sign-On portal** - Unified login for internal services
3. **Multi-factor authentication** - Adding 2FA to existing apps
4. **Access control rules** - Network and user-based policies

### Example Valid Use Case

```
[User] → [Authelia Portal] → [traefik] → [Internal Service]
                ↓
         MFA + SSO + Access Rules
```

### Why Not for MCP

MCP is an **API authorization** use case, not a **web portal SSO** use case:

```
[Claude/LLM] → [MCP Client] → [OAuth Server] → [MCP Server]
                    ↓                ↓
              Dynamic Client    Resource-scoped
              Registration      Access Tokens
```

Authelia is optimized for the first pattern, not the second.

---

## Potential Workaround (Not Recommended)

If you must use Authelia with MCP:

### 1. Static Client Configuration

```yaml
# authelia configuration.yml
identity_providers:
  oidc:
    clients:
      - client_id: 'claude-desktop'
        client_secret: '$pbkdf2-sha512$...'
        authorization_policy: 'two_factor'
        redirect_uris:
          - 'http://localhost:8765/callback'
        scopes:
          - 'openid'
          - 'profile'
          - 'disney:read'
          - 'disney:sync'
        audience:
          - 'https://mouse-mcp.example.com'
        requested_audience_mode: 'explicit'
        pkce_challenge_method: 'S256'
```

### 2. Token Audience Validation

In MCP server, validate `aud` claim matches server URL:

```typescript
function validateToken(token: JWT): boolean {
  // Authelia uses 'aud' instead of RFC 8707 resource binding
  const expectedAudience = 'https://mouse-mcp.example.com';
  return token.aud.includes(expectedAudience);
}
```

### 3. Manual Client Onboarding

Each MCP client would need:
1. Manual registration in Authelia YAML config
2. Server restart to pick up new clients
3. Client ID/secret distribution to users

**This defeats MCP's goal of seamless client discovery and registration.**

---

## Recommendation

### For MCP OAuth 2.1: Use Logto

Based on our [authorization server comparison](./authorization-server-comparison.md):

1. **Full RFC 8707 support** - Standard `resource` parameter
2. **Built-in DCR** - RFC 7591 ready
3. **Official MCP documentation** - Proven integration path
4. **Same self-hosting benefits** - PostgreSQL + Railway/Fly.io
5. **Similar cost** - ~$15-20/mo infrastructure

### For Web App SSO: Keep Authelia

If you're already using Authelia for:
- Traefik/nginx reverse proxy auth
- Internal service portal
- MFA for web applications

Continue using it for those purposes. Authelia and Logto can coexist:

```
                    ┌─────────────┐
                    │   Authelia  │ ← Web SSO, MFA
                    │   Portal    │
                    └─────────────┘
                          ↓
[User] → [traefik] → [Internal Apps]

                    ┌─────────────┐
[Claude] → [MCP] → │    Logto    │ ← MCP OAuth 2.1
                    │   Auth      │
                    └─────────────┘
                          ↓
              [mouse-mcp Server]
```

---

## Future Considerations

Monitor Authelia for:

1. **Beta 8 release** - DCR support (no ETA announced)
2. **RFC 8707 implementation** - Check GitHub issues/roadmap
3. **MCP community guides** - May emerge if demand increases

If Authelia adds RFC 8707 + DCR, it could become a viable MCP option.

---

## References

- [Authelia OpenID Connect 1.0 Provider Roadmap](https://www.authelia.com/roadmap/active/openid-connect-1.0-provider/)
- [Authelia OIDC Provider Configuration](https://www.authelia.com/configuration/identity-providers/openid-connect/provider/)
- [Authelia OIDC Client Configuration](https://www.authelia.com/configuration/identity-providers/openid-connect/clients/)
- [Authelia OAuth 2.0 Bearer Token Usage](https://github.com/authelia/authelia/blob/master/docs/content/integration/openid-connect/oauth-2.0-bearer-token-usage.md)
- [Authelia DCR Discussion](https://github.com/authelia/authelia/discussions/7304)
- [Authelia OpenID Certification](https://www.authelia.com/blog/we-are-now-openid-certified/)
- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [RFC 8707: Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707.html)
- [RFC 7591: OAuth 2.0 Dynamic Client Registration](https://www.rfc-editor.org/rfc/rfc7591)
- [Logto MCP Auth Implementation Guide](https://blog.logto.io/mcp-auth-implementation-guide-2025-06-18)
- [Keycloak RFC 8707 Discussion](https://github.com/keycloak/keycloak/discussions/35743)
- [agentgateway - MCP Gateway with CEL Authorization](https://github.com/agentgateway/agentgateway)
- [Tailscale Funnel Documentation](https://tailscale.com/kb/1223/funnel)
