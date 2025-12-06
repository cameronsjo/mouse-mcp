# MCP OAuth 2.1 Authorization Research

Research for implementing MCP authorization in mouse-mcp for cloud deployment.

## Status

- **Status:** Decided
- **Priority:** P1
- **Blocking:** Cloud deployment, multi-tenant support
- **Decided:** 2025-12-06

---

## Key Specs to Implement

| Spec | Purpose | Required? |
|------|---------|-----------|
| OAuth 2.1 | Core authorization framework | MUST |
| PKCE (RFC 7636) | Proof Key for Code Exchange - prevents interception | MUST (S256 method) |
| RFC 9728 | Protected Resource Metadata - discovery | MUST |
| RFC 8707 | Resource Indicators - prevents token mis-redemption | MUST |
| RFC 8414 | Authorization Server Metadata | MUST |
| RFC 7591 | Dynamic Client Registration | MAY (was SHOULD, now optional) |
| CIMD | Client ID Metadata Documents | RECOMMENDED (new default) |

---

## Research Questions

| Item | Priority | Question | Status |
|------|----------|----------|--------|
| CIMD vs DCR decision | p1 | Should we implement CIMD (new default), DCR (legacy), or both? | **Decided** |
| Authorization server choice | p1 | Self-hosted (complex) vs delegated (Auth0, Cognito, Logto)? | **Decided** |
| Scope design | p1 | What scopes should mouse-mcp define? | **Decided** |
| Token storage | p1 | How to securely store tokens on server side? Memory vs encrypted DB | **Decided** |
| Step-up authorization | p2 | How to handle insufficient_scope (403) and request additional permissions? | **Decided** |
| Enterprise SSO | p2 | Should we support Cross App Access / ID-JAG for enterprise deployments? | **Decided** |
| Token introspection | p2 | Use `/introspect` endpoint or validate JWTs locally? Tradeoffs? | **Decided** |
| Refresh token handling | p2 | How long should sessions last? Rotation policy? | **Decided** |
| SSRF protection for CIMD | p2 | How to safely fetch client metadata URLs without SSRF vulnerabilities? | **Decided** |
| localhost redirect security | p3 | How to handle desktop clients with localhost redirects securely? | **Decided** |

---

## Implementation Decision Log

### DCR vs CIMD (Decision Needed)

**Dynamic Client Registration (RFC 7591):**

- Pros: Established standard, widely supported
- Cons: Database bloat, orphaned registrations, operational complexity at scale
- Status in Nov 2025 spec: Changed from SHOULD to MAY

**Client ID Metadata Documents (CIMD):**

- Pros: Decentralized (DNS-based trust), no registration DB, simpler
- Cons: Newer (Oct 2025), fewer implementations, requires client to host metadata
- Status in Nov 2025 spec: New default approach

**Recommendation:** Start with CIMD as primary, support DCR as fallback for legacy clients.

### Client Registration Priority (per Nov 2025 spec)

1. Pre-registration (if available)
2. CIMD-based approach
3. DCR-based approach
4. User-provided client details

### Authorization Server Decision

**Decision:** Use **Logto (self-hosted)** on Fly.io.

**Comparison Summary:**

| Factor | Auth0 | AWS Cognito | Logto (Self-Hosted) |
|--------|-------|-------------|---------------------|
| Free tier | 7,500 MAU | 50,000 MAU | Unlimited |
| MCP OAuth 2.1 | Excellent | Good | Excellent |
| PKCE S256 | ✅ | ✅ | ✅ |
| Resource Indicators | ✅ | ❌ (workaround) | ✅ |
| Self-hosted option | ❌ | ❌ | ✅ |
| Vendor lock-in | High | Medium | None |
| Monthly cost | ~$23+ | ~$0-15 | ~$15-20 (infra) |

**Rationale:**

- $0 licensing cost, only pay for infrastructure (~$15-20/month on Fly.io)
- Full RFC 8707 Resource Indicators support (required by MCP spec)
- No vendor lock-in - portable if needs change
- Built-in PKCE, JWKS, token introspection
- Docker deployment = easy Fly.io integration

### Token Storage Decision

**Decision:** In-memory with optional Redis for multi-instance.

**Rationale:**

- Access tokens are short-lived (15-30 min) - memory is fine for single instance
- Refresh tokens stored client-side per OAuth 2.0 spec
- For horizontal scaling, add Redis session store
- No need to persist tokens server-side if using JWT validation

### Token Validation Decision

**Decision:** Local JWT validation with JWKS caching.

**Rationale:**

- Faster than token introspection (no network call)
- JWKS from Logto cached locally (refresh on 401)
- Short token lifetimes (15-30 min) mitigate revocation delay
- Use introspection only for high-security operations

### Scope Design Decision

**Decision:** Adopt proposed scopes as-is.

| Scope | Tools | Notes |
|-------|-------|-------|
| `disney:read` | disney_entity, disney_attractions, disney_dining, disney_destinations | Default scope |
| `disney:sync` | disney_sync | Refresh data from APIs |
| `disney:status` | disney_status | Health/status checks |
| `disney:admin` | (future) | Reserved for admin ops |

### Step-Up Authorization Decision

**Decision:** Implement standard 403 + WWW-Authenticate flow.

**Flow:**

1. Client requests tool requiring `disney:sync` but only has `disney:read`
2. Server returns 403 with `WWW-Authenticate: Bearer scope="disney:sync"`
3. Client initiates new auth flow requesting additional scope
4. User consents to additional scope
5. Client retries with new token

### Enterprise SSO Decision

**Decision:** Defer to Phase 4+. Not needed for initial release.

**Rationale:**

- Cross App Access / ID-JAG adds complexity
- No enterprise customers yet
- Logto supports SAML/OIDC federation when needed

### Refresh Token Decision

**Decision:** 7-day refresh tokens with rotation.

**Policy:**

- Access token: 30 minutes
- Refresh token: 7 days
- Rotation: Issue new refresh token on each use
- Absolute lifetime: 30 days (re-auth required)

### SSRF Protection Decision

**Decision:** Allowlist-based URL validation for CIMD.

**Implementation:**

```typescript
const ALLOWED_CIMD_HOSTS = [
  "claude.ai",
  "anthropic.com",
  // Add trusted MCP clients as needed
];

function validateCimdUrl(url: string): boolean {
  const parsed = new URL(url);
  // Block private IPs
  if (isPrivateIP(parsed.hostname)) return false;
  // Check allowlist (or implement trust-on-first-use)
  return ALLOWED_CIMD_HOSTS.some(host => parsed.hostname.endsWith(host));
}
```

### Localhost Redirect Decision

**Decision:** Allow localhost redirects for development/desktop clients with port validation.

**Policy:**

- Allow `http://localhost:*` and `http://127.0.0.1:*` redirects
- Validate port is in valid range (1024-65535)
- Production deployments MUST use HTTPS redirects
- Document security implications in client developer guide

---

## Protected Resource Metadata (RFC 9728)

Must expose at `/.well-known/oauth-protected-resource`:

```json
{
  "resource": "https://mouse-mcp.example.com",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["disney:read", "disney:sync"],
  "bearer_methods_supported": ["header"]
}
```

### Discovery Flow

1. Client attempts to call tool without valid credentials
2. Server responds with 401 + `WWW-Authenticate` header with `resource_metadata` URL
3. Client fetches `/.well-known/oauth-protected-resource`
4. Client discovers authorization server and required scopes
5. Client initiates OAuth 2.1 flow with PKCE
6. Client obtains and presents access token

---

## Proposed Scopes

| Scope | Description | Tools |
|-------|-------------|-------|
| `disney:read` | Read-only access to entities | disney_entity, disney_attractions, disney_dining, disney_destinations |
| `disney:sync` | Sync/refresh data from APIs | disney_sync |
| `disney:status` | Health/status checks | disney_status |
| `disney:admin` | Administrative operations | (future) |

### Scope Selection Strategy (per Nov 2025 spec)

- Servers SHOULD include `scope` parameter in `WWW-Authenticate` headers
- `scopes_supported` represents minimal set for basic functionality
- Additional scopes requested incrementally via step-up authorization

---

## Token Validation Checklist

Per MCP spec, servers MUST validate:

- [ ] Token signature (via JWKS from authorization server)
- [ ] Issuer (`iss`) matches expected authorization server
- [ ] Audience (`aud`) matches this server (RFC 8707)
- [ ] Expiration (`exp`) not passed
- [ ] Scopes sufficient for requested operation
- [ ] Token not revoked (if using introspection)

### Validation Approach Options

| Approach | Pros | Cons |
|----------|------|------|
| **Local JWT validation** | Fast, no network calls | Can't check revocation |
| **Token introspection** | Real-time revocation check | Network latency, AS dependency |
| **Hybrid** | Best of both | More complex |

**Recommendation:** Local JWT validation with short token lifetimes (15-30 min), refresh tokens for sessions.

---

## Security Considerations

1. **PKCE Required:** All clients must use S256 challenge method
2. **Resource Indicators:** Clients must specify target resource in token requests (RFC 8707)
3. **No Token Passthrough:** Explicitly forbidden - don't forward client tokens to Disney API
4. **Step-Up Auth:** Handle 403 `insufficient_scope` by requesting additional permissions
5. **SSRF Protection:** Validate CIMD URLs before fetching (allowlist domains, block private IPs)
6. **localhost Security:** Special handling for desktop clients with localhost redirects

### November 2025 Security Additions

- New CIMD Security section addressing SSRF risks
- `localhost` redirect URI vulnerabilities documented
- Trust policies for client metadata validation

---

## Implementation Plan

### Phase 1: Foundation

- [ ] Add Streamable HTTP transport (required for OAuth)
- [ ] Implement `/.well-known/oauth-protected-resource` endpoint
- [ ] Add 401 response with `WWW-Authenticate` header
- [ ] Choose and configure authorization server (Auth0/Logto)

### Phase 2: Token Validation

- [ ] Implement JWT validation middleware
- [ ] Add JWKS fetching and caching
- [ ] Implement scope checking per tool
- [ ] Add 403 insufficient_scope responses

### Phase 3: Client Registration

- [ ] Implement CIMD support (fetch and validate client metadata)
- [ ] Add SSRF protection for metadata fetching
- [ ] Optional: Add DCR fallback support

### Phase 4: Advanced Features

- [ ] Step-up authorization flow
- [ ] Token refresh handling
- [ ] Enterprise SSO (Cross App Access) - if needed

---

## References

- [MCP Authorization Spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [RFC 9728 Protected Resource Metadata](https://www.gentoro.com/blog/how-mcp-leverages-oauth-2-1-and-rfc-9728-for-authorization)
- [CIMD in November 2025 Spec](https://aaronparecki.com/2025/11/25/1/mcp-authorization-spec-update)
- [November 2025 Auth Spec Changes](https://den.dev/blog/mcp-november-authorization-spec/)
- [MCP OAuth 2.1 Complete Guide](https://dev.to/composiodev/mcp-oauth-21-a-complete-guide-3g91)
- [Scalekit OAuth Implementation](https://www.scalekit.com/blog/implement-oauth-for-mcp-servers)
- [Logto MCP Auth Guide](https://blog.logto.io/mcp-auth-implementation-guide-2025-06-18)
- [Auth0 MCP Introduction](https://auth0.com/blog/an-introduction-to-mcp-and-authorization/)
