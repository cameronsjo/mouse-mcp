# Test Audit Report — mouse-mcp (full scope)

> Generated 2026-06-14. Scope: `full` (all `src/` source + tests).
> Coverage measured with `@vitest/coverage-v8` (v8 provider, installed transiently `--no-save`).

## Summary

- **Source files:** 74 | **Test files:** 8 | **Ratio:** ~9:1 (only 8 source files have a direct test)
- **Tests:** 177 passing, 8 files, all green (~1.7s)
- **Overall coverage:** **18.46% statements · 22.63% functions · 18.46% lines** (branch shows 75.94% but that is misleading — v8 only counts branches inside executed code, and most code never executes)
- **Untested functions:** ~50 of ~74 files at <50% (high risk: 7 files, medium: ~12, low: ~6, skip: ~15)
- **Quality issues:** P0: 0 · P1: 1 · P2: 4 · P3: 2
- **Infrastructure:** no `vitest.config.ts`, no coverage provider in `package.json`, no thresholds, no coverage gate in CI

**The headline:** the *tested* code is genuinely high quality — `pii-sanitizer` and `tracing` are exemplary (table-driven, negative cases, edge cases, fake-based integration). The problem is **breadth, not depth**: the entire **auth, crypto, transport, and tool-handler surface is at ~0%**. The security boundary of the server is untested.

---

## Coverage Gaps (by risk)

### High Risk Untested

| Function(s) | File | Classification | Why It Matters |
|---|---|---|---|
| `JWTValidator.validate()` + `hasRequiredScopes` / `hasAnyScope` | `src/auth/jwt-validator.ts` (0%) | Input parser + signature verify | The token trust boundary. Alg allowlist (rejects `none` / alg-confusion), `kid` lookup, RSA/EC signature verify, issuer/audience (RFC 8707)/expiry/`nbf`. A bug here = auth bypass. Scope helpers are pure logic — trivial to test. |
| `authenticate()`, `checkToolScopes()`, `sendUnauthorized`/`sendForbidden` | `src/auth/bearer-auth.ts` (0%) | API handler + authz | RFC 6750 bearer extraction; `checkToolScopes` has bypass branches (`allowUnauthenticated`, unknown-tool default → `disney:read`). `WWW-Authenticate` header construction must be spec-correct. |
| `encrypt`, `decrypt`, `isEncrypted` | `src/shared/crypto.ts` (0%) | Pure logic (crypto) | AES-256-GCM at rest. Needs round-trip, **tamper detection** (auth-tag mutation → throws), wrong-key-length and wrong-IV-length rejection. **Pure + deterministic = the single highest-value, lowest-effort test target in the repo.** |
| `JWKSClient` (getKey/getAllKeys/refresh/cache) + `getJWKSClient` | `src/auth/jwks.ts` (0%) | I/O boundary + cache state machine + input parser | Fetches signing keys over the network, caches by `kid`, validates response shape. TTL clamp (`MAX_CACHE_TTL_MS`), expiry, `kid` miss → forced refresh, fetch failure, malformed JWKS. Feeds the validator above. |
| `getEncryptionKey`, `generateEncryptionKey`, `isEncryptionKeyConfigured` | `src/config/secrets.ts` (0%) | Configuration + crypto | PBKDF2 key derivation from env; ephemeral-key fallback path (security-relevant — silent downgrade). `resetEncryptionKey` already exists for test isolation. |
| `handleRequest` (router), `handleMcpRequest`, `parseJsonBody` | `src/transport/http-server.ts` (0%) | API handler + input parser | The cloud transport. Routing, the auth gate, session lifecycle (create/lookup/DELETE), and `parseJsonBody` (malformed JSON → null → 400). **Needs `make-testable` first** — handlers are private and `createServer` is coupled into `start()`. |
| `validateOpenAIKey`, `maskApiKey`, `validateOpenAIKeyIfProvided` | `src/config/validation.ts` (22%) | Input parser + PII | Key-format/length validation (fail-fast) and masking that **must not leak** the key. Pure, no deps — quick win. |

### Medium Risk Untested

| Area | Files | Classification | Why It Matters |
|---|---|---|---|
| **Tool handlers** | `src/tools/{search 16%, status 17%, destinations 20%, initialize 23%, discover 31%, attractions 34%, dining 40%}.ts` | API handler / state machine | The user-facing behavior of the MCP server. `search.ts` is a multi-stage fallback chain (DB → API fetch → DB reload → fuzzy match) with validation and timeout wrapping — none of that branching is exercised. Current tests cover only the static schema (see P2). |
| **External clients** | `src/clients/{themeparks-wiki 12%, disney-finder 11%, session-manager 10%}.ts` | I/O boundary + input parser | API-response parsing/normalization and session state (20 untested fns in session-manager, which also touches crypto). |
| **Persistence** | `src/db/{entities 6%, database 36%, cache 2%, sessions 2%}.ts` | I/O boundary | SQL is correctly **parameterized** (no injection surface) — good. Untested: the `JSON.parse` corruption-skip paths in `getEntities`/`searchEntitiesByName`, cache TTL expiry, session encryption. |
| **Pure utilities** | `src/shared/{retry 10%, timeout 14%, fuzzy-match 21%, errors 33%, problem-details 0%}.ts` | Pure logic / control flow | `retry` (backoff/attempts), `timeout` (race/abort), `fuzzy-match` (scoring), `problem-details` (RFC 9457 formatting) are deterministic and central — easy, valuable tests. |
| **Embeddings** | `src/embeddings/{similarity 0%, search 1%, text-builder 14%}.ts` | Pure logic + orchestration | `similarity.ts` is cosine-similarity math at 0% — trivial to test, high value. |
| **Vector search** | `src/vectordb/lancedb.ts` (2%) | I/O boundary | The vector store. Its injection defense (`sql-escaping.ts`) is already 98% covered. |

### Low Risk Untested

| Function(s) | File | Classification | Note |
|---|---|---|---|
| `setSecure{File,Directory}Permissions[Sync]` | `src/shared/file-security.ts` (7%) | I/O boundary | Platform branch (Windows no-op) + chmod error handling. Test via temp dir. |
| `buildEntityText` etc. | `src/embeddings/text-builder.ts` (14%) | Data transformer | Builds embedding text from entities; deterministic. |
| entity event wrappers | `src/events/entity-events.ts` (17%) | State machine | Thin EventEmitter wrapper. |

### Not Worth Unit Testing (skipped)

| File(s) | Pattern | Rationale |
|---|---|---|
| `src/index.ts`, `src/instrumentation.ts`, `src/observability/index.ts` | Entry point / framework glue | Bootstrap + OTEL/Sentry SDK wiring. Side-effect orchestration; covered by E2E if at all. |
| `src/**/index.ts` barrels, `src/**/types.ts`, `src/types/*.ts` | Re-exports / type defs | Zero logic. |
| `src/prompts/{dining-scout,park-day,thrill-finder}.ts` | Template builders | Mostly static prompt text (funcs 100%, lines 0% = uncalled templates). Low value. |
| `src/server.ts` (0%, 290 lines) | Framework glue (partial) | Tool/prompt registration + transport connect. The tool-dispatch + auth-check logic inside is testable and could be extracted, but the bulk is wiring. |
| `src/events/example-usage.ts` (0%, 234 lines) | Demo code | **Ships in `src/` but is example code.** Recommend relocating to `docs/examples/` or excluding from coverage — it inflates the denominator. |

---

## Quality Issues

### P0 — Likely Catching Zero Bugs
None found. No assertionless tests, no tautological assertions. 👍

### P1 — Masking Real Issues

| Pattern | Location | Detail & Fix |
|---|---|---|
| **Sleep + real clock in test** | `src/shared/audit-logger.test.ts:137` ("should measure execution duration accurately") | Uses `await new Promise(r => setTimeout(r, 50))` then asserts `durationMs >= 50`. Timer coalescing/rounding can fire at 49.x ms, and slow CI adds jitter → **flaky**. Fix: `vi.useFakeTimers()` and advance the clock, or assert the duration field is recorded and non-negative rather than gating on a wall-clock threshold. |

### P2 — Test Debt

| Pattern | Location | Detail & Fix |
|---|---|---|
| **Shape/existence-only suite** | `src/tools/tools.test.ts` (entire file, 15 tests) | Asserts tool *definitions* have `name`/`description`/`inputSchema` and the right property keys — never invokes a handler. The in-file comment ("Full handler tests would require mocking the Disney client") documents the gap. Net behavioral coverage of tool logic: zero. Fix: add handler tests with a faked Disney client (London-school at the I/O seam). |
| **Hidden real-DB I/O in unit test** | `src/clients/disney-finder.test.ts:93` (`getEntityById` → "should return null for non-existent entity") | Initializes the **real on-disk SQLite DB** (`.data/disney.db`) — confirmed by the `Loaded existing database` log emitted during the run. Environment-dependent; passes only because that DB exists and lacks the id. No seeding/teardown. Fix: inject/fake the DB or move to an integration suite. |
| **Type-only assertion** | `src/shared/query-counter.test.ts:31` ("should return a number") | `expect(typeof getQueryCount()).toBe("number")` checks the type, not a value. Low signal. |
| **Module-global state coupling** | `src/shared/query-counter.test.ts` | Counter is a module-level singleton; tests use baseline-capture to cope. Works under vitest per-file isolation but is fragile, and there's no `resetQueryCount()` export. Note, not a defect. |

### P3 — Note (deeper analysis)

| Pattern | Location | Detail |
|---|---|---|
| **Wiring/implementation assertions** | `src/shared/tracing.test.ts` (several) | Asserts exact call args to `Sentry.startSpan`/`startSpanManual`. Acceptable for a thin observability wrapper (the wiring *is* the contract) but will break on internal refactor. |
| **Log-message-string assertions** | `src/shared/audit-logger.test.ts` | Asserts exact strings ("Tool invocation started/completed/failed"). Couples tests to log wording; acceptable since audit content is contractual, but brittle. |

---

## Infrastructure Gaps

- **No coverage measurement at all.** No `@vitest/coverage-v8` in `devDependencies`, no `vitest.config.ts`, no thresholds, no `test:cover` script. CI runs `validate` (= `check` + `lint` + `format:check` + `test:run`) with no coverage gate — regressions in coverage are invisible.
- **`example-usage.ts` (234 lines) ships in `src/`** and dilutes the coverage denominator.

---

## Recommended Next Steps

1. **`write-tests` — fastest high-value wins (pure, deterministic, no scaffolding):**
   - `src/shared/crypto.ts` — encrypt/decrypt round-trip, tamper → throw, bad key/IV lengths.
   - `src/auth/jwt-validator.ts` — `hasRequiredScopes`/`hasAnyScope` (trivial) + `validate()` branch matrix.
   - `src/config/validation.ts` — `validateOpenAIKey` / `maskApiKey` (no-leak).
   - `src/embeddings/similarity.ts`, `src/shared/{retry,timeout,fuzzy-match,problem-details}.ts`.
2. **`plan-tests`** for the **auth/transport flow** (`jwks` ↔ `jwt-validator` ↔ `bearer-auth` ↔ `http-server`). This needs a coherent strategy — a fake JWKS endpoint + locally-signed RS256/ES256 test tokens — not a per-function pass.
3. **`make-testable`** for `src/transport/http-server.ts` (private handlers, `createServer` coupled into `start()`) and `src/clients/session-manager.ts` before writing their tests.
4. **`write-tests`** for the **tool handlers** (start with `search.ts`'s fallback chain and `discover.ts`) using a faked Disney client — this closes the user-facing behavioral gap that `tools.test.ts` explicitly punted on.
5. **Fix now (cheap):** the P1 flaky timing test in `audit-logger.test.ts`; reclassify/fake the `disney-finder` real-DB test; drop the type-only `query-counter` assertion.
6. **`setup-coverage`** — add `@vitest/coverage-v8`, a `vitest.config.ts` with thresholds, a `test:cover` script, and a CI coverage gate. Exclude (or relocate) `example-usage.ts`. Start the threshold at the current floor and ratchet up as the high-risk gaps close.
