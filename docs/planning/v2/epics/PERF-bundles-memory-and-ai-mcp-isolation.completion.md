# PERF-bundles-memory-and-ai-mcp-isolation — Completion Evidence

Epic: `PERF-bundles-memory-and-ai-mcp-isolation` — PERF: Bundles, memory, and AI/MCP isolation
Requirement IDs: PERF-005, PERF-006, PERF-009
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 2 (Cloud Sync &
Offline Model); Contract 3 (Role, Visibility & Permission Grant Model)

This epic delivers the three remaining PERF concerns as PURE Processing-Core policy that COMPOSES the
infrastructure the prior epics already built — it does NOT invent parallel systems:

- It DECLARES its bundle/memory budgets in the PERF-001 registry shape and MEASURES them through the
  existing PERF-007 `measureBudget` API (`apps/v2/packages/core/src/perf/budget-registry.ts`,
  `apps/v2/packages/core/src/perf/measurement.ts`). There is exactly one measurement API in the
  codebase; every new size/footprint/
  isolation grade flows through it and inherits its fail-closed semantics
  (unknown-budget → `error`; no-samples → `unknown`; exactly-at-threshold → pass).
- It COMPOSES the MCP-001 default-off optionality
  (`apps/v2/packages/core/src/state/mcp-policy.ts` — `isMcpEnabled` / `EMPTY_MCP_POLICY_STATE`) and the
  AI-boundary contract (`apps/v2/packages/core/src/mcp/ai-boundary.ts`): the AI/MCP isolation proof
  grades a core measurement under MCP-enabled vs MCP-disabled and across every AI capability state,
  proving the core path is INDEPENDENT of AI/MCP.
- It COMPOSES the diagnostics REDACTION guard (`apps/v2/packages/core/src/diagnostics/redaction.ts` —
  `redactValue` / `containsSensitiveData`) and the SEC-010 stream-privacy needle scanner
  (`apps/v2/packages/core/src/collab/stream-privacy.ts` — `findStreamPrivacyLeaks`) for the
  privacy-preserving diagnostics — the same scrubber/scanner the support-bundle, content-export, and
  replication-stream paths already use.

All new logic is deterministic over plain data — no DOM/Node/Svelte/storage/clock/entropy/network.
Every size, footprint, snapshot, sample, and flag is an EXPLICIT input. The modules obey ADR-014: they
live in `@dndtools/v2-core`, import no Svelte/DOM/platform/v1-runtime code, and boundary lint stays
green.

Per ADR-014, LIVE measurement is deferred: this owns DECLARED budgets + DETERMINISTIC measurement +
the ISOLATION/PRIVACY policy guards. The bundler build-stats, the runtime heap-snapshot capture, the
concurrent-scheduler timing capture, and the real AI runtime feed real numbers in later — exactly as
`measureBudget` already takes sample timings as explicit inputs. This is stated as a known/deferred gap
below.

## Demo (programmatic)

This is a pure-core capability (no route/Svelte/visible flow/build file is touched), so the demo path
is programmatic, exercised through the public `@dndtools/v2-core` API and proven by tests:

1. PERF-005 BUNDLES + MEMORY — path-aware gate + size/memory grading, fail closed:

   ```ts
   import {
     analyzeBundleComposition, measureCoreBundleSize,
     analyzeMemoryFootprint, detectUnboundedMemoryGrowth,
   } from '@dndtools/v2-core';

   // AC1: a disabled/off-by-default feature in the CORE bundle is a breach; the AI/MCP subsystem must
   // be lazy/excluded so a default (MCP-off) vault pays zero core-bundle cost for it.
   analyzeBundleComposition(
     [{ id: 'ai-mcp', label: 'AI/MCP', loadStrategy: 'core', enabledByDefault: false }],
     'web',
   ); // [{ kind: 'off-by-default-in-core', ... }]

   measureCoreBundleSize(3_000_000).result; // 'breach' (oversized core bundle)
   measureCoreBundleSize(null).result;      // 'unknown' (unmeasured — never a confident pass)

   // AC2: an over-budget snapshot reports the major retained categories biggest-first; an unbounded
   // (never-evicting) cache across snapshots is a breach.
   analyzeMemoryFootprint(snapshot).topCategories;      // [{ category: 'Search index', ... }, ...]
   detectUnboundedMemoryGrowth([snap1, snap2, snap3], bound); // [{ category: 'Search index', ... }]
   ```

2. PERF-006 AI/MCP ISOLATION — core perf is provably off the critical path:

   ```ts
   import {
     proveCorePerfIndependentOfMcpState, proveCorePerfIndependentOfAiCapability,
     proveCorePerfIsolatedFromAi, classifyAiTaskOutcome, EMPTY_MCP_POLICY_STATE,
   } from '@dndtools/v2-core';

   const enabled = { ...EMPTY_MCP_POLICY_STATE, enabled: true };
   proveCorePerfIndependentOfMcpState('widget-update', samples, enabled, EMPTY_MCP_POLICY_STATE)
     .result;        // 'isolated' (the grade does not move when MCP is toggled) — mcpDefaultOff: true
   proveCorePerfIndependentOfAiCapability('widget-update', samples).result; // 'isolated' (AC3)
   proveCorePerfIsolatedFromAi('widget-update', idleSamples, busySamples).result; // 'not-isolated' on slowdown (AC1)

   // AC2: an over-limit or cancelled AI/MCP task's output is discarded or clearly marked partial.
   classifyAiTaskOutcome({ budget, usage, cancelled: true, hasOutput: true }).disposition; // 'partial'
   ```

3. PERF-009 PRIVACY — exported traces omit hidden content/secrets/paths by default; UX stays local:

   ```ts
   import {
     sanitizePerfTrace, certifyPerfTraceExport,
     recordLocalDiagnostic, markExportedByUser, EMPTY_PERF_DIAGNOSTICS_STORE,
   } from '@dndtools/v2-core';

   const safe = sanitizePerfTrace(rawTrace, { hiddenContentNeedles });  // paths/secrets redacted, hidden content omitted
   certifyPerfTraceExport(safe, hiddenContentNeedles).clean;            // true (boundary self-check)
   sanitizePerfTrace(rawTrace, { includeRawContext: true });            // raw kept ONLY on explicit DM opt-in (AC1)

   let store = recordLocalDiagnostic(EMPTY_PERF_DIAGNOSTICS_STORE, { metricId: 'time-to-first-value', value: 850 });
   store.samples[0].residency;                  // 'local' (AC2 — stays local until exported)
   markExportedByUser(store, ['time-to-first-value']); // the ONLY way a sample leaves local
   ```

Requirement IDs exercised by the demo: PERF-005, PERF-006, PERF-009.
Deferred out of this epic: live build-stats / heap-snapshot / concurrent-scheduler / AI-runtime
capture (the gates take sizes/snapshots/samples/usage as explicit inputs; producing them on real
hardware + a real bundler is a later PERF slice, per ADR-014).

## Traceability

### PERF-005 — bundle, memory, and startup budgets with path-aware gates; no disabled/out-of-scope systems in core bundles

- Code: `apps/v2/packages/core/src/perf/bundle-budget.ts`
  - `BUNDLE_BUDGETS` — declares `core-bundle-size` and `session-memory-footprint` as ordinary
    `PerformanceBudget`s (graded by the SAME `measureBudget`), provisional + fully qualified
    (dataset/device-class/review-date). `invalidBundleBudgetIds` + the canonical
    `validateBudgetRegistry` confirm they are well-formed.
  - AC1 (disabled-by-tier/platform code is lazy-loaded or excluded): `analyzeBundleComposition`
    fails closed — an off-by-default or profile-disabled feature in the `core` bundle is a breach
    (`off-by-default-in-core` / `disabled-feature-in-core`); an out-of-scope feature merely `lazy`
    (still shipped) rather than `excluded` is a breach (`out-of-scope-not-excluded`). The AI/MCP
    subsystem is the canonical lazy + off-by-default feature in the test catalog, composing MCP-001
    default-off so a default vault pays zero core-bundle cost. `measureCoreBundleSize` grades an
    observed core-bundle size fail closed (oversized → breach; `null`/empty → unknown).
  - AC2 (memory profiling over budget reports major retained categories): `analyzeMemoryFootprint`
    grades a snapshot's total against the memory budget and returns the retained categories sorted
    biggest-first (deterministic, ties broken by name); `detectUnboundedMemoryGrowth` flags a
    monotonically-growing, never-evicting category past a bound — an unbounded cache is a breach even
    if a single snapshot is under budget.
- Tests: `apps/v2/packages/core/tests/perf-bundle-budget.test.ts`
  - Budgets declared + registry-valid; path-aware gate (well-formed catalog clean; off-by-default in
    core → breach; profile-disabled in core → breach; out-of-scope lazy → breach; excluded → clean;
    determinism); `measureCoreBundleSize` (pass/at-ceiling/OVERSIZED-breach/UNKNOWN-when-null);
    memory footprint (over-budget breach + categories biggest-first; maxCategories cap; within-budget
    pass; negative total → unknown; tie ordering); unbounded growth (monotonic-past-bound → finding;
    a dip proves eviction → no finding; within-bound → no finding; released category → no finding;
    < 2 snapshots → empty; sorted by net growth).

### PERF-006 — AI/MCP must not block deterministic commands; bounded context, cancellation, progress

- Code: `apps/v2/packages/core/src/perf/ai-isolation.ts`
  - AC1 (session commands stay responsive while AI runs): `proveCorePerfIsolatedFromAi` compares a
    core workflow measured idle vs while the AI/MCP subsystem is busy; a verdict flip (pass→breach) or
    a degradation beyond `DEFAULT_AI_ISOLATION_TOLERANCE` (5%) is `not-isolated` — the AI/MCP subsystem
    is on the critical path. Fail closed: missing samples → `unknown`; unknown budget → `error`.
  - The strongest direct proof: `proveCorePerfIndependentOfMcpState` grades the SAME samples against
    two states differing ONLY in `mcp.enabled` and asserts the verdict is identical (the core path
    never consults MCP); it also reports `mcpDefaultOff` (the disabled state reads MCP off — MCP-001).
  - AC3 (deterministic commands stay in budget without waiting on AI when AI is offline/absent):
    `proveCorePerfIndependentOfAiCapability` asserts the core verdict is the SAME across
    absent/present-but-disabled/available/unavailable AI.
  - AC2 (an over-limit AI/MCP task is cancelled; partial output discarded or clearly marked partial):
    `classifyAiTaskOutcome` maps a task's bounded-context budget + reported usage + cancellation +
    output presence to a disposition — `complete` only for an in-budget, non-cancelled task;
    `discarded` (no output) or `partial` (output retained, `mustMarkPartial: true`) for a cancelled
    task; a non-cancelled OVER-budget task is a breach (`completed-over-budget`) whose output is
    treated as partial, never final.
- Tests: `apps/v2/packages/core/tests/perf-ai-isolation.test.ts`
  - AC1 isolation (unchanged timing → isolated; material slowdown → not-isolated; verdict flip →
    not-isolated; missing samples → unknown; unknown budget → error; determinism); MCP independence
    (identical grade enabled/disabled; MCP default-off confirmed incl. `EMPTY_MCP_POLICY_STATE.enabled
    === false`; unknown/no-samples fail closed); AC3 AI-capability independence (same verdict across
    all states for pass AND breach; fail closed); AC2 task outcome (complete; cancelled+output →
    partial+marked; cancelled+no-output → discarded; completed-over-budget → breach+partial;
    over-budget+cancelled → within contract; single exceeded bound is enough).

### PERF-009 — privacy-preserving diagnostics; no hidden content/secrets/raw paths/note bodies by default

- Code: `apps/v2/packages/core/src/perf/diagnostics-privacy.ts`
  - AC1 (exported traces omit raw content/secrets/hidden titles/absolute paths unless the DM
    explicitly includes them): `sanitizePerfTrace` keeps timing samples verbatim (numbers are safe)
    and, BY DEFAULT, scrubs the optional human context — hidden content (any planted stream-privacy
    needle) is OMITTED, and absolute paths / secrets are REDACTED by the shared `redactValue`. Raw
    context survives ONLY on the explicit `includeRawContext: true` DM opt-in (mirroring the
    support-bundle `includeSecrets` opt-in). `certifyPerfTraceExport` is the fail-closed boundary
    self-check: it re-scans a default-mode trace with `containsSensitiveData` + `findStreamPrivacyLeaks`
    and refuses export if any secret/path/needle survived.
  - AC2 (local UX diagnostics stay local unless the user explicitly exports them):
    `PerfDiagnosticsStore` + `recordLocalDiagnostic` store a sample `local` (fail closed: a sample is
    born local regardless of caller input); `markExportedByUser` is the ONLY transition to `exported`;
    `localOnlySamples` is the default view; `assertNoUnexportedLeavesDevice` throws if any still-local
    sample is in an outbound set.
- Tests: `apps/v2/packages/core/tests/perf-diagnostics-privacy.test.ts`
  - AC1 (samples kept verbatim; hidden title omitted; absolute path + bearer + secret-key redacted,
    safe value survives; default-mode trace certifies clean; explicit opt-in keeps raw + skips
    certification; certification FAILS CLOSED when a secret/path survives; FAILS CLOSED when a needle
    survives; determinism; no-context → no context field); AC2 (recorded sample is local; only
    explicit export flips residency; unknown metric is a no-op; boundary guard throws on a local
    sample / allows exported-only; a sample can never be born exported).

## Quality gates (all run; exact results)

- `pnpm --filter @dndtools/v2-core test` — PASS: 175 files, 2588 tests passed (was 2529; this epic
  adds 3 perf test files = 59 new tests, plus a strengthened boundary test). No test weakened.
- `pnpm --filter @dndtools/v2-app test` — PASS: 13 files, 65 tests passed.
- `pnpm v2:typecheck` — PASS: core `tsc --noEmit` clean; app `svelte-check` 0 errors / 0 warnings.
- `pnpm v2:lint` (boundary) — PASS: "v2 boundary lint passed".
- `pnpm lint` (full eslint CI gate) — PASS: eslint clean; navigation lint (132 files), token lint
  (132 files), repo-boundary audit + CI guardrails (5 tests) all passed.
- `pnpm docs:validate` (CI gate) — PASS: "docs validation passed".
- `pnpm v2:workpack:validate` — PASS: "v2 workpack validation passed".
- `pnpm v2:gates` (quality-gate registry runner) — PASS: "quality-gate check passed: 7 gate(s) owned,
  budgeted, and wired to package scripts."
- Playwright e2e (`pnpm e2e`, desktop-chromium + mobile-chromium) — NOT RUN, justified: this epic is
  genuinely pure-core/tooling. The only changed files are `apps/v2/packages/core/src/perf/*` (new),
  `apps/v2/packages/core/src/index.ts` (export wiring), `apps/v2/packages/core/tests/boundary.test.ts`
  (a PRECISION fix to the existing boundary test so a relative dot-dot-mcp intra-core import is judged
  by resolving its target inside `apps/v2` rather than by substring — strengthening, not weakening, the
  v1-path ban), and the generated planning files. No route, layout, `.svelte`, `apps/v2/app/**`
  runtime, build config, or e2e spec was touched, so no visible flow changed and the existing e2e
  suite (~523 passed / 21 skipped) is unaffected.

## Changed files

- `apps/v2/packages/core/src/perf/bundle-budget.ts` (new) — PERF-005 bundle/memory budgets +
  path-aware gate + memory-category + unbounded-growth diagnostics.
- `apps/v2/packages/core/src/perf/ai-isolation.ts` (new) — PERF-006 AI/MCP isolation proofs +
  bounded-task outcome classifier.
- `apps/v2/packages/core/src/perf/diagnostics-privacy.ts` (new) — PERF-009 perf-trace sanitizer +
  export certification + local-only UX diagnostics store.
- `apps/v2/packages/core/tests/perf-bundle-budget.test.ts` (new) — PERF-005 coverage.
- `apps/v2/packages/core/tests/perf-ai-isolation.test.ts` (new) — PERF-006 coverage.
- `apps/v2/packages/core/tests/perf-diagnostics-privacy.test.ts` (new) — PERF-009 coverage.
- `apps/v2/packages/core/src/index.ts` (modified) — public exports for the three new perf surfaces.
- `apps/v2/packages/core/tests/boundary.test.ts` (modified) — precise relative-import resolution so a
  legitimate intra-core dot-dot-mcp import is allowed while a genuine v1 top-level mcp import (which
  escapes `apps/v2`) is still forbidden.
- `docs/planning/v2/epics/PERF-bundles-memory-and-ai-mcp-isolation.yaml` (regenerated by set-status).
- `docs/planning/v2/status.yaml` (regenerated by set-status / complete).
- `docs/planning/v2/workpack-state.yaml` (regenerated by set-status / complete).
- `docs/planning/v2/epics/PERF-bundles-memory-and-ai-mcp-isolation.completion.md` (this file).

## Quality review summary

- Correctness: every PERF-005/006/009 acceptance criterion is implemented and test-covered, including
  adversarial edges (oversized bundle → breach; unbounded memory growth → breach; core perf
  independent of MCP state + AI capability + AI load; over-budget/cancelled AI task discarded or marked
  partial; secret/path/hidden-content survival blocks export; un-exported local sample cannot leave).
- Architecture: pure Processing Core; no Svelte/DOM/platform/v1 imports; boundary lint green; obeys
  ADR-014 and Contracts 1/2/3. Composes the PERF-001/007 registry+measurement, MCP-001 optionality,
  the AI-boundary contract, the diagnostics redactor, and the SEC-010 stream-privacy scanner — no
  parallel system.
- Tests: 59 new unit tests + determinism + edge/adversarial coverage; full core suite green; the
  boundary test was strengthened (resolves relative targets) rather than weakened.
- Accessibility / UX: not applicable (no GUI surface in this epic).
- Performance: this epic IS the bundle/memory/isolation performance policy; all grading is
  deterministic and fail-closed (unknown/unmeasured never reports a confident pass).
- Security / permissions: PERF-009 fails closed — by default a perf trace carries no hidden content,
  secret, raw note body, or absolute path; only an explicit DM opt-in includes raw context; local UX
  diagnostics stay on-device until an explicit user export. Composes the established redactor + the
  stream-privacy needle scanner.
- Persistence / sync / offline: no durable state introduced; pure functions over explicit inputs;
  offline-safe (PERF-006 AC3 proves deterministic commands stay in budget without waiting on AI).
- Maintainability: three small, cohesive, typed modules with high comment density matching the repo;
  no speculative abstraction; budgets declared in the single shared registry shape.
- Docs: this completion evidence; the modules' doc comments trace each function to its acceptance
  criterion and name the composed infrastructure.

## Git evidence

- Branch: `epic/PERF-bundles-memory-and-ai-mcp-isolation` (from the v2 epic-chain tip `316de2a`).
- Commits:
  - feature + tests + completion evidence: `383e992` (`feat(v2): complete
    PERF-bundles-memory-and-ai-mcp-isolation epic`).
  - regenerated derived planning files after `v2:workpack:complete`: `e6118c3` (`docs(v2): mark
    PERF-bundles-memory-and-ai-mcp-isolation complete`).
  - this SHA-record follow-up (the HEAD of this branch): `docs(v2): record commit SHAs for
    PERF-bundles-memory-and-ai-mcp-isolation completion`.

Workpack status: `complete`

Final `git status --short` (clean tree at handoff after all three commits):

```
```
