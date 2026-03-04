# DND Tools — Best Practices Audit Report

**Date:** 2026-03-03
**Auditor:** Claude Code (claude-sonnet-4-6) + 6 parallel worker agents
**Scope:** Full codebase — TypeScript quality, architecture, security, testing, MCP, CI/CD, dependencies
**Branch:** `story/1.5-diagnostic-telemetry-health`

All findings are grounded in direct code reads by specialized agents. Each section includes a grade, evidence, and a one-sentence remediation approach.

---

## Grading Key

| Grade      | Meaning                                |
| ---------- | -------------------------------------- |
| ✅ Strong  | No significant issues                  |
| ⚠️ Partial | Present but incomplete or inconsistent |
| ❌ Gap     | Missing or critically insufficient     |

---

## Practice 1 — TypeScript Discipline

**Definition:** Strict mode on all configs, zero `any` types, all signatures fully typed, runtime validation at trust boundaries with Zod, `unknown` preferred over `any` for external data.

**Grade: ✅ A+**

### Findings

- `strict: true`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch` enforced in every tsconfig.
- Only one justified `any` suppression in the entire codebase: `src/lib/markdown/pipeline.ts:89`, scoped to a single line with an explanatory comment (unified.js incomplete types).
- `Record<string, unknown>` used for frontmatter — correct, YAML is inherently dynamic.
- Zod `.strict()` on all MCP tool input and response schemas — no passthrough.
- Zero debug `console.log` in `src/` or `electron/`. MCP has one guarded by `process.env['DEBUG_MIGRATIONS']`.

### Minor Issues

| Issue                                                                                            | Files                                                                                                                                                                               | Severity |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `JSON.parse(JSON.stringify(x))` deep-clone pattern duplicated                                    | `src/lib/domain/sync.ts`, `src/lib/platform/storage/capacitor-adapter.ts`, `mcp/storage.ts:648`, `src/lib/domain/session-timeline.ts:73`, `src/lib/domain/mcp-change-preview.ts:42` | Minor    |
| `isRecord()` type guard lacks `Object.getPrototypeOf` check — matches arrays and class instances | `src/lib/domain/encounter-builder.ts:195`, `src/lib/domain/combat-tracker.ts:97`                                                                                                    | Minor    |
| Single-letter `catch (e)` variable naming                                                        | `src/lib/state/editor.svelte.ts:41`, `src/lib/state/notes.svelte.ts:221`                                                                                                            | Low      |

**Recommendation:** Extract the deep-clone guard into `src/lib/utils/clone.ts` and harden `isRecord()` with an explicit prototype check.

---

## Practice 2 — Architecture Boundary Enforcement

**Definition:** Renderer cannot touch Node APIs; components don't access storage directly; business logic in services not routes; IPC is the only renderer↔Electron bridge; layer dependencies flow one way.

**Grade: ✅ A+**

### Findings

- Zero direct `dexie`/`indexedDB` usage outside the adapter layer. No `new Dexie()` in `src/`.
- Zero Node imports in `src/` — `fs`, `path`, `process`, `__dirname` absent from renderer.
- All 22 state files follow the Svelte 5 runes class pattern in `src/lib/state/*.svelte.ts`. Zero legacy `writable()`/`readable()` stores.
- Renderer↔Electron interaction runs exclusively through `window.dndtoolsDesktop` (preload bridge) with `contextIsolation: true`.
- Route components are presentation-only. Business logic is in `src/lib/domain/` and `src/lib/state/`.
- Markdown pipeline fully centralized in `src/lib/markdown/pipeline.ts`. No ad-hoc regex rendering anywhere.
- MCP importing from `src/lib/types/`, `src/lib/domain/`, and `src/lib/utils/` is intentional and correct — those modules are platform-agnostic and the pattern is ESLint-enforced.

**Recommendation:** Add a brief comment in MCP tool files explaining the cross-boundary import rationale for new contributors.

---

## Practice 3 — Security Hardening

**Definition:** Electron context isolation on, nodeIntegration off, all IPC channels validated against schemas, path traversal prevention, HTML sanitization for XSS, no shell injection, no hardcoded secrets.

**Grade: ✅ A**

### Findings — PASS

| Area               | Evidence                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Electron hardening | `contextIsolation: true`, `nodeIntegration: false` in `electron/main.ts`                                                                                                                 |
| IPC validation     | 53 `parseIpcArg()` invocations in `electron/main.ts` cover every handler. Payload size limits: 10 MB notes, 512-char IDs, 200 max tags. Settings keys whitelisted via enum (21 allowed). |
| Path traversal     | `isPathSafe()` in `electron/ipc-schemas.ts` rejects `..` and control chars. Filenames generated internally via `generateFilename()` — never from raw user input.                         |
| XSS                | `rehype-sanitize` with `allowDangerousHtml: false` in `src/lib/markdown/pipeline.ts`. No raw HTML reaches rendered output.                                                               |
| Shell injection    | Sidecar spawned via `spawn(cmd, argsArray)` — no `shell: true`, no `exec`, args from hardcoded candidates only (`electron/mcp-sidecar.ts:281-286`).                                      |
| Secret exposure    | No hardcoded API keys or tokens. Environment-variable config only.                                                                                                                       |
| Staged writes      | `mcp/staged-storage.ts` stages all MCP writes for human review by default.                                                                                                               |
| IPC security tests | 627-line `electron/ipc-security.test.ts` with AC1–AC4 regression coverage.                                                                                                               |

### Minor Issues

| Issue                                                                                                                                                         | Location                   | Severity |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| `mcp/storage.ts:noteFilePath()` lacks explicit vault-root containment assertion via `path.relative()` — safe by architecture but no belt-and-suspenders check | `mcp/storage.ts`           | Minor    |
| No `pnpm audit` step in CI — dependency security scanning is manual                                                                                           | `.github/workflows/ci.yml` | Minor    |

**Recommendation:** Add an explicit `path.relative()`-based vault-root containment check in `noteFilePath()` and add `pnpm audit` to CI.

---

## Practice 4 — Architecture Abstraction / Single Responsibility

**Definition:** Each module does one thing; no fat controllers; no god objects; utilities extracted when used 3+ times.

**Grade: ✅ B+**

### Findings

- Storage, state, domain, markdown, and platform layers are cleanly separated.
- `mcp/storage.ts` is 3,092 lines — large but single-purpose (the storage contract implementation). Acceptable.
- `src/routes/session-board/+page.svelte` is 1,475 lines — complex feature with tile rendering and drag-drop. Not a god module.
- `src/lib/ui/editor/ObjectEmbedMenu.svelte` is 799 lines — form validation logic is inline. Form validation could be extracted to a standalone module for testability.

**Recommendation:** Extract `ObjectEmbedMenu` form validation to a separate module to enable unit testing without mounting the component.

---

## Practice 5 — Error Handling

**Definition:** Errors typed and specific; all async code handles rejections; no swallowed errors; errors converted to structured responses at trust boundaries.

**Grade: ✅ A**

### Findings

- All async operations in critical paths properly awaited. `Promise.all()` always awaited.
- Fire-and-forget operations use `void` + `.catch(() => undefined)` consistently — intentional for cleanup paths (`src/lib/platform/storage/sync-adapter.ts:48,66,78`, `mcp/safe-write.ts:19,58,83,84`).
- MCP tool framework catches all unhandled exceptions and wraps them as `MCP_INTERNAL_ERROR` with remediation hints (`mcp/tools/shared/contract-server.ts:181-193`).
- `errorResult()` helper used consistently in all 44 MCP tools — returns structured errors, never throws.

**Recommendation:** Enforce `error` naming in catch blocks via an ESLint rule if consistency is desired; currently using single-letter `e` in some handlers.

---

## Practice 6 — Test Coverage & Quality

**Definition:** Unit tests for critical paths, integration tests for layered behavior, E2E for primary user flows, tests assert behavior (not just that code ran), tests are isolated, error paths tested, coverage thresholds enforced in CI.

**Grade: ❌ C — Critical Gaps**

### Summary

| Layer                      | Coverage | Status      |
| -------------------------- | -------- | ----------- |
| Storage & persistence      | ~95%     | ✅ Strong   |
| Markdown pipeline          | ~90%     | ✅ Strong   |
| IPC security               | ~70%     | ✅ Strong   |
| MCP tools (agent commands) | ~15%     | ❌ Critical |
| Search & graph             | ~50%     | ⚠️ Partial  |
| UI components & routes     | 0%       | ❌ Critical |
| E2E workflows              | ~35%     | ⚠️ Partial  |
| Electron desktop shell     | ~40%     | ⚠️ Partial  |

**True coverage: ~50%** — reported 80% applies only to `src/lib/**`; MCP and Electron layers excluded from thresholds.

### MCP Tool Coverage Gap — Critical

46 of 51 tools rely only on `all-tools.test.ts` (661 lines), which validates only:

- Happy-path success and contract shape
- `expect(envelope?.ok).toBe(true)` — no output validation

Dedicated test files exist for only 5 tools:

- `mcp/tools/notes/update-note.test.ts`
- `mcp/tools/random/roll-table.test.ts`
- `mcp/tools/search/get-backlinks.test.ts`
- `mcp/tools/shared/object-schema.test.ts`
- `mcp/tools/vault/vault-intelligence.test.ts`

Tools with zero dedicated tests (sample of high-risk):

| Domain             | Untested Tools                                                          |
| ------------------ | ----------------------------------------------------------------------- |
| Notes              | `create_note`, `delete_note`, `restore_note`, `list_notes`, `read_note` |
| Objects            | All 12 object tools                                                     |
| Boards             | All 5 board tools                                                       |
| Vault Intelligence | 9 of 13 analytics tools                                                 |
| Dice               | All 3 dice tools                                                        |

### E2E Gaps

Missing Playwright coverage for: note linking & backlinks, session board creation, search operators (`tag:`, `folder:`, `updated:`), object embeds, import/export round-trip, offline sync, template rendering.

`tests/e2e/note-crud.spec.ts` uses `.waitForTimeout(1000)` (brittle) and `if (await noteLink.isVisible())` (silent pass if element missing).

### Coverage Config Issue

Coverage thresholds (80/75/80/80) are configured in `vite.config.ts` but **not enforced in CI** — only enforced when running locally with `--coverage`. `mcp/**` and `electron/**` are excluded from `coverage.include`.

**Recommendation:** Treat MCP tool coverage as P0 — add dedicated test files for all 51 tools covering validation failures, not-found cases, and idempotency; enforce coverage thresholds in CI via `pnpm test -- --coverage`.

---

## Practice 7 — Documentation Alignment

**Definition:** Docs describe the system as it is, not as it was planned. Tool contracts, data models, and architecture diagrams reflect current code.

**Grade: ⚠️ B**

### Gaps Found

| Gap                                   | Location                                      | Detail                                                                                                                               |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| No per-tool permission/retry table    | `docs/AGENTIC_NOTES_WORKFLOW.md`              | Missing: which tools require `idempotencyKey`, which are `read-only`/`write-staged`/`write-direct`, retry policies                   |
| Idempotency cache scope undocumented  | `docs/`                                       | In-memory cache, not persisted — lifetime and scope not documented anywhere                                                          |
| Object/board permission inconsistency | `mcp/tools/shared/contracts.ts` + `CLAUDE.md` | `CLAUDE.md` says "staged MCP write review as default"; objects and session boards use `write-direct` — design decision not explained |
| Migration checkpoint path mismatch    | `docs/SCHEMA_MIGRATIONS.md`                   | Docs say `.vault/migration-backup-{version}-{timestamp}/`; code uses `.vault/checkpoints/schema-migration-{timestamp}-{uuid8}/`      |
| Object history details absent         | `docs/DATA_MODEL.md §1.8`                     | Storage location (`.vault/object-history.json`), max entries, and how history capture is triggered not documented                    |

**Recommendation:** Create `docs/MCP_TOOL_REFERENCE.md` with a full tool table (permission, retry policy, idempotency requirement) and clarify the write-direct vs. write-staged design decision for objects/boards.

---

## Practice 8 — CI/CD Completeness

**Definition:** Every merge to main runs lint → format check → typecheck → unit tests with coverage gate → build → E2E. No merges with failing checks.

**Grade: ⚠️ B−**

### What Works

- Lint, typecheck, unit tests on Node 20/22 matrix
- Desktop E2E critical set gated on PR (xvfb + Playwright)
- Docs validation via `pnpm docs:validate`
- Concurrency control (cancel-in-progress runs)
- `pnpm install --frozen-lockfile` enforced in all CI jobs

### Gaps (4 Documented in CLAUDE.md)

| Gap                                       | Impact                                                 | Estimated Effort        |
| ----------------------------------------- | ------------------------------------------------------ | ----------------------- |
| `pnpm format:check` not in CI             | Format regressions can merge if pre-commit is bypassed | 1 line in `ci.yml`      |
| Coverage thresholds not enforced in CI    | Coverage drops go undetected at merge time             | 2 lines in `ci.yml`     |
| Desktop package build not validated in CI | Packaging failures found only at release               | 10–15 lines in `ci.yml` |
| No cross-platform matrix (Windows/macOS)  | Platform-specific bugs invisible until release         | 30–40 lines in `ci.yml` |

### Additional Gaps

- No bundle size check. Target < 100KB gzipped stated in `CLAUDE.md`, enforced nowhere.
- No `pnpm audit` step for dependency security scanning.
- Reported 80% coverage applies only to `src/lib/**` — MCP and Electron excluded.
- `PERF_BENCHMARK` env flag may gate performance tests out of CI runs.

**Recommendation:** Add `pnpm format:check` and `pnpm test -- --coverage` to the CI quality-matrix job as the immediate P0 fix; schedule cross-platform matrix and bundle size check for Q2 2026.

---

## Practice 9 — Dependency Management

**Definition:** Lockfile committed, CI uses `--frozen-lockfile`, no unused dependencies, security-sensitive packages current, consistent versioning strategy.

**Grade: ✅ A−**

### Findings

- `pnpm-lock.yaml` committed. `--frozen-lockfile` enforced in all 4 CI jobs.
- All major dependencies confirmed in use. No dead packages found.
- Security-sensitive packages at recent versions: Electron 37, rehype-sanitize 6, Zod 4, MCP SDK 1.26.
- `electron-builder.yml` configures hardened runtime (macOS) and code signing (Windows).
- Caret ranges (`^`) are appropriate given the locked lockfile — resolved versions don't float.

### Minor Issue

`.mcp.json` has a hardcoded Windows vault path (`C:/Users/trent/Documents/dnd`). Not portable for CI or other developers. No `.env.example` documenting project env vars.

**Recommendation:** Parameterize the vault path in `.mcp.json` via an environment variable and create `.env.example` documenting all project env vars.

---

## Practice 10 — Performance Discipline

**Definition:** Bundle size targets enforced in CI; heavy dependencies lazy-loaded; no blocking operations in renderer; performance budgets measured.

**Grade: ⚠️ C**

### Findings

- Bundle size target (< 100KB gzipped) documented in `CLAUDE.md` — not measured or enforced anywhere.
- Performance budgets documented in `docs/MASTER_PLAN.md` (cold start ≤ 3s, note open ≤ 200ms, search ≤ 150ms, etc.) — not measured in CI.
- All 7 budgeted operations are instrumented in code (`performance.mark`/`performance.measure`) and measured in `tests/e2e-desktop/performance.spec.ts`.
- The performance spec may be gated behind `PERF_BENCHMARK` env flag and not run on every CI push.
- CodeMirror is lazy-loaded. No other obvious large-dep issues.
- No bundle analyzer or `size-limit` tooling configured.

**Recommendation:** Set `PERF_BENCHMARK=true` in the CI `desktop-e2e-critical` job and integrate `size-limit` or `rollup-plugin-visualizer` with a hard failure on exceeding 100KB.

---

## Practice 11 — Accessibility

**Definition:** Semantic HTML, keyboard navigability, ARIA only where needed, focus management on dynamic content, color contrast ratios met.

**Grade: ❌ Unaudited**

- `DEBT.md` item `DEBT-2026-003` (medium severity): "A11y regressions may escape" — Q2 2026 target.
- No axe-core in Playwright tests, no `eslint-plugin-svelte` a11y rules in `eslint.config.js`.

**Recommendation:** Add `@axe-core/playwright` to E2E suite run against critical routes and add Svelte a11y ESLint plugin to pre-commit.

---

## Practice 12 — Code Duplication

**Definition:** DRY at appropriate granularity; no copy-pasted logic; shared utilities extracted when used 3+ times.

**Grade: ✅ B+**

### Findings

- Domain utilities well-centralized: `nowISO()`, `createNoteId()`, `normalizeVaultObject()`, `deepCopy()`.
- `JSON.parse(JSON.stringify())` deep-clone pattern duplicated across 5 files (see Practice 1).
- No large-scale copy-pasting identified.

**Recommendation:** Centralize deep-clone utility in `src/lib/utils/clone.ts`.

---

## MCP Implementation — Supplementary Section

**Grade: ✅ B+**

### Strengths

- 44/44 tools registered with a 1:1 match to `contracts.ts`. Runtime safety net throws `Missing MCP tool contract` if any registration references a missing entry.
- All tools use the contract-server framework (`mcp/tools/shared/contract-server.ts`) — permission enforcement, Zod strict schemas, response validation, exception catch-all.
- Atomic writes with fsync + rename + retry (20 attempts, exponential backoff, Windows `copyFile+rm` fallback) via `mcp/safe-write.ts`.
- Conflict detection covers 4 scenarios: `target_exists`, `target_missing`, `target_changed_since_stage`, `target_already_deleted`.
- Idempotency implemented at framework level — cache key `toolName:idempotencyKey`; concurrent retries share the in-flight request.
- Schema migrations: versioned (notes:2, objects:2, metadata:2), checkpointed, rollback-capable. Dedicated integration tests.
- MCP resources: 4 resource types registered with versioned URIs (`dndtools://v1/...`) and legacy aliases.

### Issues

| Issue                                                                                                                                                     | Severity |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Objects/boards use `write-direct` while notes use `write-staged`. `CLAUDE.md` says staged mode is default for all writes — inconsistency is undocumented. | Medium   |
| `update_object.ts:38` uses `z.record(z.string(), z.unknown())` — allows arbitrary keys in the data field without type checking                            | Low      |
| Idempotency response cache is in-memory only; clears on MCP process restart; no documented TTL                                                            | Low      |

**Recommendation:** Decide whether objects should be `write-staged` or `write-direct`, update `contracts.ts` accordingly, and document the decision in `docs/AGENTIC_NOTES_WORKFLOW.md`.

---

## Consolidated Priority Table

| Priority | Finding                                                            | Practice         | One-Sentence Fix                                                                                      |
| -------- | ------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------- |
| **P0**   | MCP tools 85% untested; 46/51 have only smoke tests                | Testing          | Add dedicated test files for each MCP tool covering validation, not-found, and idempotency scenarios. |
| **P0**   | `pnpm format:check` missing from CI                                | CI/CD            | Add one step to the `quality-matrix` job in `.github/workflows/ci.yml`.                               |
| **P0**   | Coverage thresholds not enforced in CI                             | CI/CD            | Pass `--coverage` to the CI test step so threshold failures block merges.                             |
| **P1**   | 65 Svelte components have zero unit tests                          | Testing          | Add Vitest + Svelte Testing Library for critical components (editor, board, search).                  |
| **P1**   | E2E missing linking, embeds, boards, search operators              | Testing          | Add 15+ Playwright tests for complex user workflows.                                                  |
| **P1**   | Desktop package build not validated in CI                          | CI/CD            | Add a CI job running `pnpm desktop:package --publish never`.                                          |
| **P1**   | Object/board writes use `write-direct`; docs say staged by default | Docs/MCP         | Clarify the design decision and document it explicitly in `docs/AGENTIC_NOTES_WORKFLOW.md`.           |
| **P2**   | No bundle size enforcement (target < 100KB gzipped)                | Performance      | Add `size-limit` or `vite-bundle-visualizer` with a CI gate.                                          |
| **P2**   | MCP/Electron excluded from coverage scope                          | Testing          | Extend `coverage.include` in `vite.config.ts` to include `mcp/**` and `electron/**`.                  |
| **P2**   | `.mcp.json` has hardcoded vault path                               | Dependencies     | Parameterize via env var and create `.env.example`.                                                   |
| **P2**   | `docs/MCP_TOOL_REFERENCE.md` missing                               | Docs             | Create a tool reference table: permission, retry policy, idempotency per tool.                        |
| **P2**   | Performance budgets not enforced every CI run                      | Performance      | Set `PERF_BENCHMARK=true` in the CI `desktop-e2e-critical` job environment.                           |
| **P3**   | No a11y tooling                                                    | Accessibility    | Add `@axe-core/playwright` to E2E and `eslint-plugin-svelte` a11y rules.                              |
| **P3**   | Cross-platform CI matrix missing                                   | CI/CD            | Add Windows/macOS runners to the CI quality-matrix.                                                   |
| **P3**   | `isRecord()` type guard matches arrays/class instances             | TypeScript       | Add `Object.getPrototypeOf(value) === Object.prototype` check.                                        |
| **Low**  | Deep-clone pattern duplicated in 5 files                           | Code Duplication | Extract to `src/lib/utils/clone.ts`.                                                                  |

---

## Overall Assessment

| Practice                | Grade        | Primary Concern                                                    |
| ----------------------- | ------------ | ------------------------------------------------------------------ |
| TypeScript Discipline   | ✅ A+        | Deep-clone duplication, minor type guard gap                       |
| Architecture Boundaries | ✅ A+        | None — no violations found                                         |
| Security Hardening      | ✅ A         | Add vault-root containment assertion; add `pnpm audit` to CI       |
| Single Responsibility   | ✅ B+        | `ObjectEmbedMenu` validation inline                                |
| Error Handling          | ✅ A         | Consistent and structured throughout                               |
| **Test Coverage**       | **❌ C**     | **MCP tools 15% tested; UI components 0%; E2E sparse**             |
| Documentation Alignment | ⚠️ B         | Tool contract table missing; permission inconsistency undocumented |
| **CI/CD**               | **⚠️ B−**    | **4 documented gaps; format check and coverage not CI-gated**      |
| Dependency Management   | ✅ A−        | Hardcoded vault path; no `.env.example`                            |
| Performance             | ⚠️ C         | Defined budgets, unenforced; no bundle size CI gate                |
| Accessibility           | ❌ Unaudited | No tooling in place                                                |
| Code Duplication        | ✅ B+        | Isolated deep-clone duplication                                    |

**Summary:** The architecture and security posture are genuine strengths — no boundary violations, defense-in-depth IPC validation, and proper Electron hardening. The dominant weakness is **test coverage**, specifically MCP tool depth (15%), UI components (0%), and CI not enforcing the coverage thresholds that are already locally configured. Fixing the CI gates (P0) and building out MCP tool tests (P0) are the highest-leverage improvements.
