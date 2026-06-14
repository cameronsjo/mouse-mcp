# Test Strategy — Untested Surface (post-audit)

> Generated 2026-06-14. Companion to `docs/test-audit-report.md`.
> Scope: every high+medium-risk component testable **without** source refactoring.
> This document is the contract for the write phase (`write-tests` / `test-author`).

## Overview

The audit found 18.46% coverage with the entire auth/crypto/transport/handler surface near 0%. This strategy plans tests for everything reachable **now** — i.e. without first running `make-testable`. Two components stay deferred: `transport/http-server.ts` (private handlers + `createServer` coupled into `start()`) and the **browser-driven** path of `clients/session-manager.ts` (instantiates Playwright backends internally).

### Conventions (apply to every cluster)

- **Vitest**, ESM, `*.test.ts` co-located beside the source file. Match the style of the existing strong suites (`pii-sanitizer.test.ts`, `tracing.test.ts`).
- **Tests only — do NOT edit source files.** If a target can't be tested without a source change, skip it and note it under "make-testable candidates." (Exception: none this pass.)
- **No real clock, no real sleep, no `Math.random` left to chance.** Use `vi.useFakeTimers()` or inject options that disable nondeterminism (e.g. `jitter:false`). Avoid the P1 anti-pattern the audit flagged.
- **Determinism for dates:** functions using `Date.now()`/`new Date()` (jwt expiry, cache TTL, session expiry) → use fake timers with a fixed `setSystemTime`, or pass explicit timestamps. Never assert exact `new Date()` output; assert shape/relative.
- **Singletons reset between tests:** `resetConfig()` (config), `closeDatabase()` (db), `resetDisneyFinderClient()` (client), `resetEncryptionKey()` (secrets), `clearAllJWKSCaches()` (jwks), `resetSessionManager()` (session mgr). Use `beforeEach`/`afterEach`.
- **Test doubles:** prefer real objects (Chicago) for pure logic; fakes at I/O seams (London) — fake `global.fetch`, in-memory sql.js DB, `vi.mock` the Disney client module. Avoid deep mock chains.

---

## Cluster A — Pure logic (no doubles, Chicago)

Deterministic functions; highest ROI, zero infra. Property-style tables encouraged.

### `src/embeddings/similarity.ts` — Pure logic / Data transformer
- **Level:** Unit · **Doubles:** none
- **Scenarios:**
  - [ ] `cosineSimilarity`: identical vectors → 1; orthogonal → 0; opposite → -1; **dimension mismatch → throws** (assert message); zero-vector → 0 (denominator guard).
  - [ ] Boundary: empty vectors (`[]` vs `[]`) → 0; single-element.
  - [ ] `topKSimilar`: returns k sorted desc; k > length → all; k=0 → []; ties stable.
  - [ ] `normalizeScore`: below threshold → 0; at threshold → 0; at 1 → 1; rescale midpoint.
  - [ ] Property: cosineSimilarity symmetric `f(a,b)==f(b,a)`; result always in [-1,1].

### `src/shared/fuzzy-match.ts` — Pure logic (wraps Fuse.js)
- **Level:** Unit · **Doubles:** none (real Fuse, real entity fixtures)
- **Scenarios:**
  - [ ] `fuzzySearch`: exact name → top result, score near 1 (score inversion: Fuse 0 → returned 1); typo still matches; no match → []; respects `limit`; respects `threshold` (strict excludes weak).
  - [ ] Empty entity list → []; empty query.
  - [ ] `findBestMatch`: returns best or null when none meet threshold.
  - Use a small fixture of `DisneyEntity` objects (name is the only searched key).

### `src/shared/errors.ts` — Pure logic (error hierarchy + formatter)
- **Level:** Unit · **Doubles:** none
- **Scenarios:**
  - [ ] Each subclass sets `code`, `name`, and class-specific fields (`ApiError.statusCode/endpoint`, `ValidationError.field/value`).
  - [ ] `formatErrorResponse`: `DisneyMcpError` → `{error, code}` with the subclass code; generic `Error` → code `UNKNOWN_ERROR`; non-Error (string) → `String(error)`, code `UNKNOWN_ERROR`; result always `{content:[{type:'text',text}], isError:true}` and `text` parses as JSON.

### `src/shared/retry.ts` — Pure logic / control flow (fake timers)
- **Level:** Unit · **Doubles:** `vi.useFakeTimers()`; pass `{jitter:false}` for deterministic delay.
- **Scenarios:**
  - [ ] Succeeds first try → no delay, returns value.
  - [ ] Fails then succeeds → retries, returns value (advance timers).
  - [ ] All attempts fail → throws last error after `maxRetries+1` calls.
  - [ ] **Non-retryable status code** (e.g. error with `statusCode:400` in `NON_RETRYABLE_STATUS_CODES`) → throws immediately, no retry.
  - [ ] Network-error message (`ECONNRESET`, `timeout`) → IS retried.
  - [ ] Backoff is exponential and capped at `maxDelayMs` (assert delay arg with jitter off).
  - Note: `calculateDelay`/`isNonRetryable` are private → test through `withRetry`.

### `src/shared/timeout.ts` — Pure logic / control flow (fake timers)
- **Level:** Unit · **Doubles:** `vi.useFakeTimers()`
- **Scenarios:**
  - [ ] `withTimeout`: fast op resolves → returns result, timer cleared.
  - [ ] Op exceeds timeout → rejects `TimeoutError` (assert `.operation`, `.timeoutMs`, message).
  - [ ] External `signal` aborts → propagates AbortError; combined-signal path.
  - [ ] `withToolTimeout`: wraps a handler, applies default `TIMEOUTS.DEFAULT`, passes args through.
  - [ ] `TimeoutError` shape.

### `src/embeddings/text-builder.ts` — Data transformer
- **Level:** Unit · **Doubles:** none (entity fixtures)
- **Scenarios:** happy (full entity → expected text), empty/optional fields omitted, each entity type variant, large input. Read the file for exact field assembly.

### `src/shared/file-security.ts` — I/O boundary (low risk)
- **Level:** Unit · **Doubles:** real temp dir (`fs.mkdtemp` in `os.tmpdir()`), or `vi.mock('node:fs/promises')`.
- **Scenarios:** sets 0600/0700 on a temp file/dir (Unix) → returns true and `fs.stat` shows mode; non-existent path → returns false (caught); Windows branch → mock `process.platform='win32'` → returns false without calling chmod.

---

## Cluster B — Crypto + secrets + config validation (security; Opus)

### `src/shared/crypto.ts` — Pure logic (AES-256-GCM) — **HIGHEST VALUE**
- **Level:** Unit · **Doubles:** none (use a fixed 32-byte key `Buffer.alloc(32, 1)`)
- **Scenarios:**
  - [ ] **Round-trip:** `decrypt(encrypt(p)) === p` for ASCII, unicode/emoji, long strings.
  - [ ] `encrypt`: wrong key length (≠32) → throws; empty plaintext → throws; output `iv`/`authTag`/`ciphertext` are base64, IV is 12 bytes, tag 16 bytes; **two encryptions of same plaintext differ** (random IV).
  - [ ] `decrypt`: **tampered ciphertext → throws** ("Decryption failed"); **tampered authTag → throws**; wrong key → throws; bad IV length → throws; bad tag length → throws; missing fields → throws.
  - [ ] `isEncrypted`: valid EncryptedData JSON → true; plain string → false; partial object → false; non-JSON → false.
  - [ ] Property: round-trip holds for arbitrary non-empty strings.

### `src/config/validation.ts` — Input parser + PII
- **Level:** Unit · **Doubles:** none
- **Scenarios:**
  - [ ] `validateOpenAIKey`: valid `sk-` and `sk-proj-` (≥20 chars) → no throw; empty/whitespace → throws "empty"; no `sk-` prefix → throws (and message contains **masked** key, not raw); <20 chars → throws "too short".
  - [ ] `maskApiKey`: long key → `sk-...last4`; <8 chars → `***`; never returns the full key (assert raw key not a substring of output).
  - [ ] `validateOpenAIKeyIfProvided`: undefined → no throw; provided invalid → throws.

### `src/config/secrets.ts` — Configuration + crypto
- **Level:** Unit · **Doubles:** env manipulation + `resetEncryptionKey()` in beforeEach/afterEach (save/restore `process.env.MOUSE_MCP_ENCRYPTION_KEY`).
- **Scenarios:**
  - [ ] `getEncryptionKey`: with env set → returns 32-byte Buffer, deterministic (PBKDF2 of same input → same key across calls); cached (second call === first).
  - [ ] Without env → still returns 32-byte Buffer (ephemeral path), and differs from the env-derived key.
  - [ ] `isEncryptionKeyConfigured`: true iff env var set.
  - [ ] `generateEncryptionKey`: returns 64-char hex (32 bytes), unique across calls.
  - [ ] Integration with crypto: `decrypt(encrypt(p, key), key)` round-trips with a `getEncryptionKey()` key.

---

## Cluster C — Auth flow (security; Opus)

**Shared infra (build once, e.g. `src/auth/__test-helpers__/jwt.ts`):** generate an RSA keypair with `node:crypto.generateKeyPairSync('rsa', {modulusLength:2048})`; export the public key as JWK (`createPublicKey(...).export({format:'jwk'})`) with a `kid`; sign test JWTs (`base64url(header).base64url(payload)` + `createSign('RSA-SHA256')`). Provide a `makeToken(claims, {kid, key})` helper. Optionally an ES256 variant.

### `src/auth/jwt-validator.ts` — Input parser + signature verify — **CRITICAL**
- **Level:** Unit · **Doubles:** stub `JWKSClient.getKey` (inject via `getJWKSClient`/`clearAllJWKSCaches`, or `vi.mock('./jwks.js')` to return the test JWK).
- **Scenarios (`validate`):**
  - [ ] Happy: well-formed RS256 token, correct iss/aud/exp → returns `{claims, scopes, subject, clientId}`.
  - [ ] **Structure:** not 3 parts → `invalid_format`; non-base64url JSON header/payload → `invalid_format`.
  - [ ] **Algorithm:** `alg:"none"` → rejected `invalid_format`; unsupported alg → rejected; missing `kid` → `invalid_format`.
  - [ ] **Key:** `kid` not in JWKS → `invalid_signature`.
  - [ ] **Signature:** tampered payload (valid structure, wrong signature) → `invalid_signature`.
  - [ ] **Claims:** wrong issuer → `invalid_issuer`; audience not included (string and array `aud`) → `invalid_audience`; expired beyond clock tolerance → `expired`; `nbf` in future → `expired`; within clock tolerance → passes.
  - [ ] `parseScopes`: filters to SUPPORTED_SCOPES, drops unknown, empty/undefined → [].
- **Scenarios (`hasRequiredScopes`/`hasAnyScope`):** every/any semantics, empty required → true (every) / false (any), superset, disjoint.

### `src/auth/jwks.ts` — I/O boundary + cache state machine + input parser
- **Level:** Unit · **Doubles:** fake `global.fetch` (`vi.fn`), `vi.useFakeTimers()` for TTL.
- **Scenarios:**
  - [ ] `getKey`: cache miss → fetches, indexes by kid, returns key; cache hit (within TTL) → no second fetch; expired → refetch; unknown kid → forces one refresh then null.
  - [ ] `refresh`: non-ok response → throws; malformed JSON / missing `keys` array → throws "Invalid JWKS response"; keys without `kid` skipped.
  - [ ] TTL clamp: `cacheTtlMs` capped at `MAX_CACHE_TTL_MS`.
  - [ ] Fetch timeout: aborts after `FETCH_TIMEOUT_MS` (advance timers, assert abort).
  - [ ] `clearCache`/`isCacheValid`; `getJWKSClient` returns same instance per URI; `clearAllJWKSCaches` empties registry.

### `src/auth/bearer-auth.ts` — API handler + authorization
- **Level:** Unit · **Doubles:** construct with `OAuthConfig`; stub `JWTValidator.validate` via `vi.mock('./jwt-validator.js')` or a fake validator; fake `IncomingMessage` = `{headers:{authorization:'...'}}`; fake `ServerResponse` = capture `writeHead`/`end`.
- **Scenarios:**
  - [ ] `authenticate`: OAuth disabled → `{authenticated:true}`; enabled + no header + allowUnauthenticated → authenticated; enabled + no header (strict) → `missing_token`; malformed header (no `Bearer `) → `invalid_format`; valid token → `{authenticated:true, token}`; validator throws `TokenValidationError` → `{authenticated:false, errorType}`; validator throws generic → `invalid_format`/"Authentication failed"; enabled but no validator configured → error.
  - [ ] `checkToolScopes`: disabled → true; allowUnauthenticated + no token → true; no token (strict) → false; known tool → checks `TOOL_SCOPES`; unknown tool → defaults to require `disney:read`.
  - [ ] `sendUnauthorized`: writes 401 with `WWW-Authenticate: Bearer realm=...`, includes `resource_metadata` when authServer set, includes `scope` when provided, `error=`; body is JSON-RPC error shape.
  - [ ] `sendForbidden`: 401? no — writes 403, `error="insufficient_scope"`, includes scope list.
  - [ ] `getProtectedResourceMetadata`: returns resource, authorization_servers (issuer when set), scopes_supported, bearer_methods_supported.

---

## Cluster D — Data/persistence + tool handlers (Sonnet)

**Shared infra:** in-memory sql.js DB via the real `getDatabase()` pointed at a temp file:
`beforeEach`: set `process.env.MOUSE_MCP_DB_PATH = join(mkdtempSync(...), 'test.db')`, `resetConfig()`, `closeDatabase()`. `afterEach`: `closeDatabase()`, remove temp dir, restore env. sql.js creates a fresh in-memory DB + schema on first `getDatabase()`. Seed via the module's own `saveEntity`/`cacheSet`/`saveSession`.

### `src/db/entities.ts` — I/O boundary (parameterized SQL — good)
- **Level:** Integration (real in-memory DB) · **Doubles:** none beyond the temp DB
- **Scenarios:**
  - [ ] `saveEntity`/`getEntityById`: round-trip; missing id → null; **corrupt stored JSON → null** (insert raw bad data, assert graceful null).
  - [ ] `getEntities`: filter by destination/type/parkId combos; ORDER BY name; empty → []; **corrupt row skipped** (logged, others returned).
  - [ ] Type helpers (`getAttractions`/`getDining`/`getShows`/`getShops`/`getEvents`) pass correct `entityType`.
  - [ ] `searchEntitiesByName`: filters then fuzzy-matches; limit; no candidates → [].
  - [ ] `deleteEntitiesForDestination`: returns count, removes rows.
  - [ ] `getLastEntityUpdate` (null when empty), `getParkCount`, `getEntityCounts` (all types present, zeros).
  - [ ] Behavioral: `saveEntity` emits `entity:saved` (spy on the emitter); emitter throw doesn't fail the save.

### `src/db/cache.ts` — I/O boundary + TTL
- **Level:** Integration · **Doubles:** temp DB, `vi.useFakeTimers()` for expiry
- **Scenarios:** `cacheSet`/`cacheGet` round-trip; **expired entry → null** (advance time past TTL); corrupt JSON → null + auto-delete; `cacheDelete` (true/false); `cachePurgeExpired` count; `cacheClear`; `getCacheStats` (total/expired/sources grouping); custom `ttlHours`/`source`.

### `src/db/sessions.ts` — I/O boundary + 1 pure fn
- **Level:** Integration + Unit · **Doubles:** temp DB; fake timers for `isSessionExpired`
- **Scenarios:** save/load round-trip (cookies/tokens JSON); missing → null; corrupt JSON → null; `loadAllSessions` (multiple, skip corrupt); `deleteSession` (true/false); `updateSessionError` increments + flips state to `error` at error_count≥2; `resetSessionErrors` clears; **`isSessionExpired`** (pure): expired, within buffer, far future — fixed dates.

### `src/clients/disney-finder.ts` — I/O boundary (extend existing test)
- **Level:** Unit · **Doubles:** existing tests cover static `getDestinations`; add normalization/error paths that don't require the browser. Read the file; the live-scrape paths needing Playwright are deferred to make-testable.

### `src/clients/themeparks-wiki.ts` — I/O boundary + input parser
- **Level:** Unit · **Doubles:** fake `global.fetch` (or `tracedFetch`); feed sample API JSON.
- **Scenarios:** parses a well-formed response into entities; non-ok response → error/empty; malformed JSON → handled; field normalization. Read the file for exact shape.

### `src/tools/*.ts` handlers — API handler / state machine
- **Level:** Unit · **Doubles:** `vi.mock('../clients/index.js')` to fake the Disney client; temp DB for the db-backed lookups; the handlers wrap `withTimeout` and return `ToolResult`.
- **Targets & focus:**
  - [ ] `search.ts`: id-found (DB) → result; id-miss → client fallback → still miss → `found:false`; name → fuzzy match → bestMatch+alternatives; **validation: neither id nor name → ValidationError response** (`isError`); client throws → `formatErrorResponse`.
  - [ ] `discover.ts`: required `query`; happy; empty results message.
  - [ ] `attractions.ts`/`dining.ts`: required `destination`; happy via faked client; error path.
  - [ ] `destinations.ts` (`list_parks`): returns destinations.
  - [ ] `status.ts`: status payload shape.
  - [ ] `initialize.ts`: happy + `skipEmbeddings` branch.
  - Assert `ToolResult` shape (`content[0].type==='text'`, JSON-parseable) and `isError` on failures.

### `src/events/entity-events.ts` — State machine (EventEmitter wrapper)
- **Level:** Unit · **Doubles:** none
- **Scenarios:** subscribe → emit → handler called with payload; multiple listeners; `getEntityEmitter` singleton; unsubscribe; handler error isolation if applicable. Read the file.

---

## Intentional Exclusions

| Component | Pattern | Rationale |
|---|---|---|
| **`src/shared/problem-details.ts`** | **Dead code** | 444 lines, RFC 9457 — **zero importers** (grep-confirmed; barrel exports `errors.ts` instead). Do **not** test. **Flag to the user for deletion or wiring-in.** |
| `src/transport/http-server.ts` | Needs make-testable | Private handlers; `createServer` coupled into `start()`. Plan after `make-testable` extracts a routable handler. |
| `clients/session-manager.ts` (browser path) | Needs make-testable | Instantiates Playwright/Lightpanda backends internally; `extractTokens`/`calculateExpiration` are private with real logic — extract them. DB-backed read methods (`getSessionStatus`) testable but low value alone. |
| `index.ts`, `instrumentation.ts`, `observability/index.ts`, `server.ts` | Entry point / framework glue | Bootstrap + SDK wiring; covered by E2E if at all. |
| `**/index.ts` barrels, `**/types.ts`, `types/*.ts` | Re-exports / type defs | Zero logic. |
| `prompts/*.ts` | Static templates | Mostly constant prompt text; low value. |
| `events/example-usage.ts` | Demo code | Should be relocated out of `src/`; exclude from coverage. |
| `embeddings/{openai,transformers,search}.ts`, `vectordb/lancedb.ts` | I/O w/ heavy deps | Real model/vector-store deps; integration-tier, out of this pass (transformers downloads models). `similarity.ts` (the math) IS in scope. |

## Risks & Gaps (surfaced while planning)

- **`problem-details.ts` is dead code** — the richer RFC 9457 error formatter was written but never wired; tools use the plainer `errors.ts` formatter. Decide: delete, or replace `errors.ts`'s formatter with it.
- **`crypto.encrypt` rejects empty plaintext** — confirm callers never pass empty (session tokens). Test documents the contract.
- **`jwt-validator` uses `Date.now()` directly** in `validateClaims` — testable via fake timers, but worth noting as an injected-clock candidate if more time logic accrues.
- **`retry.calculateDelay` uses `Math.random()`** for jitter — tests must pass `{jitter:false}` to be deterministic.
- **OAuth `allowUnauthenticated` defaults to `true` when OAuth disabled** (config:204) — the "open by default" posture deserves an explicit test asserting the documented behavior.

## Infrastructure Needs

- [ ] `@vitest/coverage-v8` as a real devDependency + `vitest.config.ts` + `test:cover` script (currently transient). → `setup-coverage` after this pass.
- [ ] JWT test-helper (keypair gen + token signing) — Cluster C.
- [ ] Temp-DB fixture helper (env + resetConfig + closeDatabase) — Cluster D.
- [ ] Disney-client fake — Cluster D.

## Suggested Execution Order

1. **Cluster A** (pure logic) — fastest, no infra, immediate coverage lift.
2. **Cluster B** (crypto/secrets/validation) — security, pure, high value.
3. **Cluster C** (auth flow) — security; build the JWT helper first.
4. **Cluster D** (data + handlers) — needs the temp-DB + client-fake fixtures.
5. Re-run coverage; then `setup-coverage` to gate; then `make-testable` for http-server + session-manager and a follow-up write pass.
