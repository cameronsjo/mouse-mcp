# OAuth Authorization Server Comparison for MCP

Detailed comparison of OAuth 2.1 authorization server options for mouse-mcp deployment on Railway/Fly.io.

## Executive Summary

**Recommendation: Logto (self-hosted)**

For a Disney parks MCP server deployed on Railway or Fly.io, **Logto** provides the best combination of:

- **Zero recurring auth costs** (self-hosted open source)
- **Native MCP OAuth 2.1 support** with PKCE, RFC 8707, DCR
- **Fast setup** with Railway one-click deploy
- **Production-ready** RBAC, JWKS, custom scopes
- **No vendor lock-in** with full control over auth infrastructure

**Cost Impact:** Logto self-hosted = $0/mo auth costs vs Auth0 ($35-240/mo) vs Cognito ($2.75-27.50/mo for 500-5000 MAU)

---

## Comparison Matrix

| Feature | Auth0 | Logto (Self-Hosted) | AWS Cognito |
|---------|-------|---------------------|-------------|
| **OAuth 2.1 with PKCE** | ✅ Yes (S256) | ✅ Yes (S256) | ✅ Yes (S256 only) |
| **RFC 8707 Resource Indicators** | ⚠️ Uses `audience` param (non-standard) | ✅ Full RFC 8707 support | ✅ Added Oct 2025 (Essentials/Plus only) |
| **RFC 8414 AS Metadata** | ✅ Yes | ✅ Yes | ✅ Yes |
| **RFC 7591 Dynamic Client Registration** | ✅ Yes | ✅ Yes | ❌ No (requires custom Lambda) |
| **JWKS Endpoint** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Custom Scopes** | ✅ API Resources + Permissions | ✅ API Resources + Permissions | ✅ Resource Servers + Scopes |
| **RBAC** | ⚠️ Professional tier only | ✅ Free (OSS) | ⚠️ Via custom claims/groups |
| **MCP-Specific Docs** | ✅ Official MCP guide | ✅ Official MCP guide | ⚠️ Community example only |
| **Setup Complexity** | 🟢 Low (15-30 min) | 🟡 Medium (1-2 hours with DB) | 🔴 High (confusing docs) |
| **Railway/Fly.io Deployment** | N/A (SaaS) | 🟢 One-click Railway template | ⚠️ N/A (AWS-only SaaS) |
| **Free Tier** | 25k MAU (B2C), 500 MAU (B2B) | ♾️ Unlimited (self-host) | 50k MAU |
| **Cost at 500 MAU** | $35/mo (Essentials B2C) | $0/mo + infra (~$10-20/mo) | ~$2.75/mo |
| **Cost at 5k MAU** | $240/mo (Professional B2C) | $0/mo + infra (~$10-20/mo) | ~$27.50/mo |
| **Vendor Lock-In** | 🔴 High | 🟢 None (OSS) | 🔴 High (AWS) |
| **Multi-Tenancy** | ✅ Organizations (paid) | ✅ Organizations (free) | ⚠️ Via groups/custom logic |

---

## Detailed Analysis

### 1. Auth0

**Summary:** Premium managed service with excellent docs but expensive at scale.

#### Setup Complexity: 🟢 Low

- **Estimated Time:** 15-30 minutes
- **Steps:**
  1. Create Auth0 tenant (free)
  2. Create API resource with identifier (e.g., `https://mouse-mcp.railway.app`)
  3. Define custom scopes (`disney:read`, `disney:sync`, etc.)
  4. Enable PKCE in application settings
  5. Configure callback URLs
  6. Get JWKS endpoint: `https://{tenant}.auth0.com/.well-known/jwks.json`

- **Pros:** Extensive documentation, in-context guides, fast setup
- **Cons:** Confusing for beginners without reading guides carefully

#### MCP OAuth 2.1 Support

| Requirement | Support | Notes |
|-------------|---------|-------|
| PKCE (RFC 7636) | ✅ Full | S256 method required |
| RFC 8707 Resource Indicators | ⚠️ Partial | Uses proprietary `audience` param instead of standard `resource` param |
| RFC 8414 AS Metadata | ✅ Full | `.well-known/oauth-authorization-server` |
| RFC 7591 DCR | ✅ Full | Dynamic Client Registration supported |
| JWKS | ✅ Full | RS256 signing, automatic key rotation |

**RFC 8707 Limitation:** Auth0 uses its own `audience` parameter rather than the RFC 8707-standard `resource` parameter. This works for MCP but is non-standard. Feature request exists in Auth0 community to add proper RFC 8707 support.

#### Custom Scopes Setup

1. Create API Resource in Auth0 dashboard (Console → APIs)
2. Add permissions (scopes): `read:entities`, `sync:data`, etc.
3. Scopes appear in access token as space-separated string in `scope` claim
4. Validate scopes in MCP server middleware

**Example Access Token Claims:**

```json
{
  "iss": "https://mouse-mcp.us.auth0.com/",
  "sub": "auth0|123456",
  "aud": "https://mouse-mcp.railway.app",
  "scope": "disney:read disney:sync",
  "exp": 1735689600
}
```

#### Pricing (2025)

| Tier | B2C Price | B2B Price | MAU Included | Key Limits |
|------|-----------|-----------|--------------|------------|
| **Free** | $0/mo | $0/mo | 25,000 (B2C), 500 (B2B) | No MFA, No RBAC, 1 tenant |
| **Essentials** | $35/mo | $150/mo | 500 | Basic MFA, RBAC per org, 10 orgs |
| **Professional** | $240/mo | $800/mo | 1,000 | Full MFA, attack protection, longer logs |
| **Enterprise** | Custom | Custom | Custom | 99.99% SLA, private cloud |

**Overage:** If you exceed MAU limit, Auth0 automatically upgrades you to next tier (sudden cost increase).

**"Growth Penalty":** Auth0 pricing increases disproportionately with growth. Example: 1.67x user growth caused 15.54x cost increase for one company.

**Startup Program:** Free for 1 year (contact sales).

#### Pros

- ✅ Comprehensive MCP documentation and guides
- ✅ Fast, easy setup (15-30 min)
- ✅ Extensive SDK support (30+ frameworks)
- ✅ Managed service (no infrastructure)
- ✅ Automatic JWKS key rotation
- ✅ Advanced features (anomaly detection, breached password detection)
- ✅ 99.99% SLA (Enterprise)

#### Cons

- ❌ Expensive at scale ("growth penalty")
- ❌ Vendor lock-in
- ❌ Non-standard RFC 8707 implementation (uses `audience` not `resource`)
- ❌ RBAC requires Professional tier ($240+/mo)
- ❌ Automatic tier upgrades on MAU overage
- ❌ No control over infrastructure
- ❌ Free tier limited to 500 MAU for B2B

#### Recommendation

**Use If:**

- Need fastest time-to-market (< 1 hour)
- Budget allows $35-240/mo
- Don't want to manage auth infrastructure
- Need enterprise SSO/SAML immediately

**Avoid If:**

- Budget-conscious or hobby project
- Expect rapid user growth
- Want infrastructure control
- Need RBAC without $240/mo cost

---

### 2. Logto (Self-Hosted)

**Summary:** Open source OAuth 2.1 server with excellent MCP support and zero licensing costs.

#### Setup Complexity: 🟡 Medium

- **Estimated Time:** 1-2 hours (including PostgreSQL setup)
- **Railway Deployment:** One-click template available
- **Steps:**
  1. Deploy PostgreSQL database on Railway
  2. Deploy Logto (Auth + Admin Console) via Railway template
  3. Create Logto admin account
  4. Create API Resource with identifier
  5. Define permissions (scopes)
  6. Create roles and assign permissions
  7. Configure application client

- **Pros:** Railway one-click deploy, excellent docs, modern UI
- **Cons:** Requires PostgreSQL setup, initial configuration time

#### MCP OAuth 2.1 Support

| Requirement | Support | Notes |
|-------------|---------|-------|
| PKCE (RFC 7636) | ✅ Full | S256 method required |
| RFC 8707 Resource Indicators | ✅ Full | Standard `resource` parameter supported |
| RFC 8414 AS Metadata | ✅ Full | `.well-known/oauth-authorization-server` |
| RFC 7591 DCR | ✅ Full | Dynamic Client Registration built-in |
| JWKS | ✅ Full | RS256 signing, `/.well-known/jwks.json` |

**RFC 8707 Implementation:** Logto fully implements RFC 8707 with standard `resource` parameter. Supports multiple resource indicators in single request. Tokens include proper `aud` claim with resource identifier.

**Default Resource:** Can set tenant-level default API resource for apps without RFC 8707 support (e.g., ChatGPT plugins).

#### Custom Scopes Setup

1. Console → API Resources → Create (e.g., `https://mouse-mcp.railway.app`)
2. Add permissions: `disney:read`, `disney:sync`, `disney:status`
3. Console → Roles → Create global role → Assign permissions
4. Assign roles to users or M2M apps
5. Request tokens with `resource` parameter and scopes

**Example Access Token Claims:**

```json
{
  "iss": "https://auth.mouse-mcp.railway.app/oidc",
  "sub": "usr_abc123",
  "aud": "https://mouse-mcp.railway.app",
  "scope": "disney:read disney:sync",
  "client_id": "app_xyz789",
  "exp": 1735689600
}
```

#### Architecture for Railway/Fly.io

```
┌─────────────────────────────────────────┐
│  Railway Project: mouse-mcp-auth       │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────┐  ┌──────────────┐ │
│  │ PostgreSQL DB   │  │ Logto Auth   │ │
│  │ (Railway)       │◄─┤ Service      │ │
│  │                 │  │              │ │
│  │ - Users         │  │ Port: 3001   │ │
│  │ - Roles         │  └──────────────┘ │
│  │ - Resources     │                   │
│  │ - Sessions      │  ┌──────────────┐ │
│  └─────────────────┘  │ Logto Admin  │ │
│                       │ Console      │ │
│                       │              │ │
│                       │ Port: 3002   │ │
│                       └──────────────┘ │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Railway Project: mouse-mcp             │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ MCP Server (Node.js)                ││
│  │                                     ││
│  │ - Validates JWT from Logto          ││
│  │ - Checks scope claims               ││
│  │ - Enforces RBAC                     ││
│  │                                     ││
│  │ JWKS: https://auth.../oidc/.well-   ││
│  │       known/jwks.json               ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

#### Infrastructure Requirements

| Component | Resource | Railway Cost (Est.) |
|-----------|----------|---------------------|
| PostgreSQL | 1 vCPU, 1GB RAM, 5GB disk | $5-10/mo |
| Logto Auth | 1 vCPU, 512MB RAM | $5/mo |
| Logto Admin Console | 1 vCPU, 512MB RAM | $5/mo |
| **Total** | | **~$15-20/mo** |

**Note:** Railway provides $5 free credit/month. Fly.io has similar pricing.

#### Pricing (2025)

| Deployment | Cost | MAU Limit | Notes |
|------------|------|-----------|-------|
| **Self-Hosted (Railway/Fly.io)** | $15-20/mo | Unlimited | Infrastructure only, no auth licensing fees |
| **Logto Cloud (Free)** | $0/mo | 50,000 | Managed service alternative |
| **Logto Cloud (Pro)** | Pay-as-you-go | Unlimited | Managed with SLA |

**Self-Hosted Advantages:**

- No per-MAU fees
- All features (SSO, RBAC, Organizations) included
- No feature paywalls
- Full control over data

#### Pros

- ✅ **Zero auth licensing costs** (OSS)
- ✅ Official MCP implementation guide
- ✅ Full RFC 8707 support (standard `resource` param)
- ✅ RBAC included (no paywall)
- ✅ Organizations/multi-tenancy included
- ✅ Railway one-click deploy template
- ✅ Modern, developer-friendly UI
- ✅ Active development (8k+ GitHub stars)
- ✅ In-context integration guides
- ✅ 30+ framework SDKs
- ✅ No vendor lock-in
- ✅ Can migrate to Logto Cloud later if needed

#### Cons

- ❌ Requires PostgreSQL database management
- ❌ Longer initial setup (1-2 hours)
- ❌ You manage infrastructure (updates, backups)
- ❌ No built-in SLA (DIY monitoring)
- ❌ Smaller community vs Auth0
- ❌ Need to handle scaling yourself

#### Recommendation

**Use If:**

- Budget-conscious (hobby, startup, bootstrapped)
- Deploying on Railway/Fly.io already
- Want full control over auth infrastructure
- Need RBAC without $240/mo cost
- Comfortable managing PostgreSQL
- Want to avoid vendor lock-in

**Avoid If:**

- Need enterprise SLA immediately
- Don't want to manage databases
- Need < 1 hour setup time
- Prefer fully managed service

---

### 3. AWS Cognito

**Summary:** AWS-native service with good pricing but poor developer experience and AWS lock-in.

#### Setup Complexity: 🔴 High

- **Estimated Time:** 2-4 hours (first-time users)
- **Steps:**
  1. Create User Pool
  2. Configure domain (required for OAuth)
  3. Create Resource Server with scopes
  4. Create App Client with client secret
  5. Configure OAuth flows, callback URLs
  6. Enable PKCE (S256 only)
  7. Configure JWKS validation

- **Pros:** Integrates seamlessly with AWS services (Lambda, API Gateway)
- **Cons:** Confusing documentation, limited UI customization, complex setup

#### MCP OAuth 2.1 Support

| Requirement | Support | Notes |
|-------------|---------|-------|
| PKCE (RFC 7636) | ✅ Full | S256 only (plain not supported) |
| RFC 8707 Resource Indicators | ✅ Added Oct 2025 | Essentials/Plus tiers only; single resource binding |
| RFC 8414 AS Metadata | ✅ Full | `.well-known/oauth-authorization-server` |
| RFC 7591 DCR | ❌ No | Requires custom Lambda + API Gateway |
| JWKS | ✅ Full | RS256 signing, `/.well-known/jwks.json` |

**RFC 8707 Limitations:**

- Only available on Essentials/Plus tiers (not free tier)
- Single resource binding per token (can't specify multiple resources)
- Not supported for M2M client credentials grants

**DCR Workaround:** Community has built Lambda-based DCR implementations. Example: [empires-security/mcp-oauth2-aws-cognito](https://github.com/empires-security/mcp-oauth2-aws-cognito)

#### Custom Scopes Setup

1. Console → User Pools → Your Pool → Resource Servers
2. Create Resource Server (e.g., `solar-system-data`)
3. Define scopes: `sunproximity.read`, `asteroids.add`
4. Scope format: `{resourceServerIdentifier}/{scopeName}`
5. App Client must enable custom scopes
6. Request with full scope identifier

**Example via AWS CLI:**

```bash
aws cognito-idp create-resource-server \
    --user-pool-id us-west-2_EXAMPLE \
    --identifier mouse-mcp \
    --name "Disney Parks MCP" \
    --scopes ScopeName=disney.read,ScopeDescription="Read entities" \
            ScopeName=disney.sync,ScopeDescription="Sync data"
```

**Example Access Token Claims:**

```json
{
  "sub": "abc123...",
  "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXAMPLE",
  "aud": "mouse-mcp",
  "token_use": "access",
  "scope": "mouse-mcp/disney.read mouse-mcp/disney.sync",
  "exp": 1735689600
}
```

#### Pricing (2025)

| Tier | MAU Included | Price/MAU (Direct) | Price/MAU (SAML) | Notes |
|------|--------------|-------------------|------------------|-------|
| **Free** | 50 | $0 | $0 | Essentials & Lite eligible |
| **Essentials** | 51-50,000 | $0.0055 | $0.015 | RFC 8707 supported |
| **Plus** | 50,001+ | Variable | Variable | RFC 8707 supported |

**Cost Examples:**

- 500 MAU: ~$2.75/mo (direct login) or ~$7.50/mo (SAML)
- 5,000 MAU: ~$27.50/mo (direct login) or ~$75/mo (SAML)

**M2M Pricing:** Client credentials grants add extra costs (previously free until May 2025).

**Grandfathering:** Accounts with 1+ MAU before Nov 22, 2024 can use Essentials tier at old pricing until Nov 30, 2025.

#### Railway/Fly.io Deployment: ⚠️ N/A

- Cognito is AWS-managed SaaS only
- Cannot self-host
- MCP server on Railway/Fly.io would call Cognito APIs
- No infrastructure cost, but AWS lock-in

#### Pros

- ✅ **Very low cost** ($0.0055/MAU)
- ✅ Free tier: 50 MAU
- ✅ Native AWS integration (Lambda, API Gateway, S3)
- ✅ RFC 8707 support (as of Oct 2025)
- ✅ JWKS endpoint for JWT validation
- ✅ Managed service (no infrastructure)
- ✅ Scales automatically

#### Cons

- ❌ **Poor developer experience** (confusing docs)
- ❌ Complex setup (2-4 hours)
- ❌ No native DCR (requires custom Lambda)
- ❌ RFC 8707 only on paid tiers (Essentials/Plus)
- ❌ Single resource binding limitation
- ❌ Limited UI customization (must build custom)
- ❌ AWS ecosystem lock-in
- ❌ Poor outside AWS (extra dev work)
- ❌ M2M costs added (used to be free)

#### Recommendation

**Use If:**

- Already heavily invested in AWS
- Using Lambda, API Gateway, DynamoDB
- Need very low per-MAU cost
- Have AWS expertise on team

**Avoid If:**

- Deploying on Railway/Fly.io (non-AWS)
- Want fast setup (< 1 hour)
- Need DCR without custom Lambda
- Prioritize developer experience
- Want to avoid cloud vendor lock-in

---

## MCP-Specific Feature Comparison

| Feature | Auth0 | Logto | Cognito |
|---------|-------|-------|---------|
| **MCP Official Docs** | ✅ Yes | ✅ Yes | ⚠️ Community only |
| **PKCE S256** | ✅ Yes | ✅ Yes | ✅ Yes (S256 only) |
| **RFC 8707 Resource Indicators** | ⚠️ `audience` (non-standard) | ✅ `resource` (standard) | ✅ `resource` (Essentials+) |
| **DCR (RFC 7591)** | ✅ Built-in | ✅ Built-in | ❌ Requires Lambda |
| **CIMD Support** | ⚠️ Unknown | ⚠️ Unknown | ❌ No |
| **Protected Resource Metadata (RFC 9728)** | ⚠️ Must implement in MCP server | ⚠️ Must implement in MCP server | ⚠️ Must implement in MCP server |
| **Step-Up Authorization** | ✅ Supported | ✅ Supported | ⚠️ Manual implementation |

**Note:** `/.well-known/oauth-protected-resource` must be implemented in the MCP server itself, not the authorization server.

---

## Railway/Fly.io Deployment Considerations

### Logto on Railway

**Deployment Steps:**

1. Create Railway project
2. Add PostgreSQL database (from template)
3. Add Logto Auth service (Docker)
4. Add Logto Admin Console (Docker)
5. Configure environment variables:

```bash
DB_URL=postgresql://user:pass@postgres.railway.internal:5432/logto
ENDPOINT=https://auth.mouse-mcp.railway.app
ADMIN_ENDPOINT=https://admin.mouse-mcp.railway.app
```

6. Set port to 3001 (Logto Auth)
7. Access admin console, create account, configure API resources

**Railway Template:** [Deploy Logto](https://railway.com/deploy/logto)

### Auth0 on Railway

- N/A (Auth0 is SaaS, no deployment needed)
- MCP server on Railway calls Auth0 APIs
- Zero infrastructure, pure SaaS

### Cognito on Railway

- N/A (Cognito is AWS SaaS, no deployment needed)
- MCP server on Railway calls Cognito APIs
- AWS lock-in concern for non-AWS deployment

---

## Cost Projection (3-Year Analysis)

Assumes: 500 MAU Year 1, 2,000 MAU Year 2, 5,000 MAU Year 3

| Year | MAU | Auth0 (B2C) | Logto (Railway) | Cognito |
|------|-----|-------------|-----------------|---------|
| **Year 1** | 500 | $420 ($35/mo) | $180-240 ($15-20/mo infra) | $33 ($0.0055/MAU) |
| **Year 2** | 2,000 | $2,880 ($240/mo Pro tier) | $180-240 (same infra) | $132 ($0.0055/MAU) |
| **Year 3** | 5,000 | $2,880+ (overage fees) | $240-360 (scaled infra) | $330 ($0.0055/MAU) |
| **Total (3 years)** | | **$6,180+** | **$600-840** | **$495** |

**Key Insights:**

- **Cognito** is cheapest at scale due to low per-MAU cost
- **Logto** is cheapest for hobby/startup projects (no MAU fees)
- **Auth0** becomes very expensive after 1,000 MAU
- **Logto** costs stay flat until you need horizontal scaling

---

## Final Recommendation

### For Railway/Fly.io Disney MCP Server: **Logto (Self-Hosted)**

**Rationale:**

1. **Cost:** $15-20/mo flat (vs $35-240/mo Auth0, ~$33+/mo Cognito)
2. **MCP Support:** Official guide, full RFC 8707 support
3. **Railway Integration:** One-click deploy template
4. **Features:** RBAC, Organizations, DCR all free
5. **Flexibility:** No vendor lock-in, can migrate to Logto Cloud later
6. **Control:** Own your auth infrastructure and data

**Tradeoffs:**

- Requires managing PostgreSQL (mitigated by Railway managed DB)
- Longer setup (1-2 hours vs 30 min for Auth0)
- DIY monitoring/SLA (acceptable for hobby/startup)

### Alternative Recommendations

**If Setup Speed is Critical:** **Auth0**

- 15-30 min setup
- Comprehensive docs
- Accept $35-240/mo cost

**If Already on AWS:** **Cognito**

- Lowest per-MAU cost
- Native AWS integration
- Accept poor developer experience

**If Need Enterprise SLA Immediately:** **Auth0 Enterprise**

- 99.99% SLA
- Premium support
- Custom pricing

---

## Implementation Checklist

### Logto on Railway (Recommended Path)

- [ ] Deploy PostgreSQL on Railway
- [ ] Deploy Logto (Auth + Admin) via template
- [ ] Create admin account in Logto Console
- [ ] Create API Resource: `https://mouse-mcp.railway.app`
- [ ] Define scopes: `disney:read`, `disney:sync`, `disney:status`
- [ ] Create global role: `disney-user` with read/sync scopes
- [ ] Test OAuth 2.1 flow with PKCE
- [ ] Implement JWT validation in MCP server
- [ ] Add `/.well-known/oauth-protected-resource` endpoint
- [ ] Test token validation with JWKS
- [ ] Implement scope-based access control
- [ ] Configure backup strategy for PostgreSQL
- [ ] Set up monitoring (Railway metrics + custom)

---

## References

- [Auth0 MCP Spec Updates](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
- [Auth0 Pricing Explained](https://securityboulevard.com/2025/09/auth0-pricing-explained-and-why-startups-call-it-a-growth-penalty/)
- [Logto Documentation](https://docs.logto.io/)
- [Logto MCP Auth Guide](https://blog.logto.io/mcp-auth-implementation-guide-2025-06-18)
- [Logto RBAC Documentation](https://docs.logto.io/authorization/role-based-access-control)
- [AWS Cognito Resource Indicators](https://aws.amazon.com/about-aws/whats-new/2025/10/amazon-cognito-resource-indicators-protection-oauth-2-0-resources/)
- [AWS Cognito Pricing](https://aws.amazon.com/cognito/pricing/)
- [Cognito Custom Scopes](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html)
- [Logto vs Auth0 Comparison](https://blog.logto.io/logto-auth0-comparison)
- [AWS Cognito vs Auth0](https://www.infisign.ai/blog/aws-cognito-vs-auth0)
- [MCP OAuth2 AWS Cognito Example](https://github.com/empires-security/mcp-oauth2-aws-cognito)
- [Stytch MCP OAuth Example](https://stytch.com/blog/oauth-for-mcp-explained-with-a-real-world-example/)
- [Scalekit OAuth for MCP](https://docs.scalekit.com/mcp/quickstart/)
- [RFC 8707 Resource Indicators](https://www.scalekit.com/blog/resource-indicators-for-oauth-2-0)
- [Deploy Logto on Railway](https://railway.com/deploy/logto)
