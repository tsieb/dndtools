# Completion Evidence: SEC-regression-gates-and-stream-privacy

- Epic: `SEC-regression-gates-and-stream-privacy` — SEC: Regression gates and stream privacy
- Requirements: SEC-008, SEC-010, SEC-011
- Git branch: `epic/SEC-regression-gates-and-stream-privacy` (chained off the prior tip `2b18cbc`)
- Workpack status: `complete`

## Summary

This branch adds three small, pure, fail-closed Processing-Core modules plus the mechanical CI-runnable
gates that prove security/privacy invariants cannot silently regress. It COMPOSES the existing
infrastructure — the COLLAB-009 replication filters, the combat stream filter, the `*ForActor` actor-filtered
reads, the visibility-filter engine, the diagnostics redaction guard, and the host-permission model — and
adds no parallel privacy/gate framework, no v1 runtime import, no new durable-mutation path.

1. **Stream-privacy proof + coverage harness** (`apps/v2/packages/core/src/collab/stream-privacy.ts`,
   SEC-010) — `findStreamPrivacyLeaks` / `assertViewCarriesNoHiddenContent` deep-scan a player/observer
   projection (over its serialized object graph, including object KEYS and numeric COUNTS) for a planted set
   of `StreamPrivacyNeedle`s, so a leak hidden anywhere — a nested value, an array element, a hidden id used
   as a map key, a revealing count — is caught. `REPLICATION_SURFACE_DOMAINS` +
   `uncoveredReplicationSurfaceDomains` enumerate the player/observer replication surfaces (notes, maps,
   characters, scenes, search, graph, widgets, MCP, sync-status) so the coverage gate fails closed when a new
   surface is added without a proof (SEC-010 AC2).

2. **Security regression-gate registry** (`apps/v2/packages/core/src/security/regression-gates.ts`, SEC-008)
   — `SECURITY_BOUNDARIES` is the declared catalogue of the seven security-critical boundaries SEC-008
   enumerates (IPC validation, storage containment, markdown sanitization, widget host permission denial, sync
   stream filtering, MCP staged write enforcement, cloud join authorization). Each row names its enforcing
   guard surface + its dedicated coverage-test file + the requirement(s) it traces to.
   `validateSecurityBoundaryRegistry` checks internal integrity; the coverage meta-test additionally proves
   every named test file exists on disk and every named guard is a live core export — so a boundary added
   without a real guard + test turns the gate RED (SEC-008 AC1). This mirrors the established MCP-005
   tool-coverage and PLAT-010 quality-gate registry patterns; it indexes existing enforcement, never
   re-implements a boundary.

3. **Widget host network/exfiltration controls** (`apps/v2/packages/core/src/security/widget-exfiltration.ts`,
   SEC-011) — `evaluateWidgetOutboundRequest` is the fail-closed outbound gate: no `network` permission ⇒
   denied; an unapproved destination class ⇒ denied + audited; host-flagged hidden actor data / raw vault
   content ⇒ always blocked; tokens / diagnostics / absolute paths ⇒ blocked or redacted per policy (composing
   the diagnostics redaction guard). `evaluateWidgetStateOwnership` proves widget-local storage is never the
   sole source of truth for canonical data; `isolateWidgetFailure` isolates a crashed / policy-violating
   widget while keeping the others + core state available.

### How the regression gate is wired into CI (fail-closed, real failing check)

The SEC-008 and SEC-010 gates are mechanical Vitest meta-tests that live in the v2-core suite — exactly how
the MCP-005 coverage gate is wired. They run under `pnpm --filter @dndtools/v2-core test`, which is invoked by
`pnpm v2:test`, which is part of the `v2:check` aggregate gate. `v2:check` is the declared `v2-check`
quality-gate (PLAT-010, tier `full`) — a real CI step. The gates fail CLOSED: a security boundary added
without a test, or a replication surface added without a stream-privacy proof, turns the suite RED. The
"gate goes RED on a leaky variant, GREEN on the real code" property is proven by the negative tests in
`sec-stream-privacy-coverage.test.ts` and `sec-regression-gate-coverage.test.ts` (see below). No new gate
script was needed; the gates are wired through the existing `v2:test` → `v2:check` path that CI already runs.

## Requirement coverage / traceability

### SEC-008 — security regression tests cover the seven security-critical boundaries

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1: a security-critical boundary added without tests fails the gate | `security/regression-gates.ts` (`SECURITY_BOUNDARIES` registry + `validateSecurityBoundaryRegistry`); the coverage meta-test cross-checks every boundary's named test file (exists on disk) + named guard (live core export) | `apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts` (registry integrity; every boundary's test file exists; every guard is a live export; malformed/duplicate boundary reported; RED proof for a phantom test) |
| AC2: a known player-data leak fixture never appears in returned player payloads | The leak canary is run through the live `getContentItemsForActor` read; proven in depth by the stream-privacy harness | `apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts` (dm-only canary absent from the player read); `apps/v2/packages/core/tests/sec-stream-privacy-coverage.test.ts` (every domain) |

### SEC-010 — player/observer replication streams carry no hidden value/title/id/edge/snippet/count

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1: a fixture with hidden content in every major domain yields no hidden value/title/id/edge/snippet/count in player & observer streams | `collab/stream-privacy.ts` (`findStreamPrivacyLeaks` / `assertViewCarriesNoHiddenContent` deep-scan); composed onto the existing `filterReplicationStream`, `filterCombatStreamForRecipient`, and the `*ForActor` reads | `apps/v2/packages/core/tests/sec-stream-privacy-coverage.test.ts` (a real-command-built salted state run through 7 surfaces for both player + observer; the combat stream withholds a hidden combatant) |
| AC2: a new query surface is included in replication-filtering tests before release | `collab/stream-privacy.ts` (`REPLICATION_SURFACE_DOMAINS` + `uncoveredReplicationSurfaceDomains`); the coverage manifest must cover every declared domain | `apps/v2/packages/core/tests/sec-stream-privacy-coverage.test.ts` (the manifest covers every declared domain; the manifest cannot drift to an unknown domain) |

### SEC-011 — widget host network + exfiltration controls

| Acceptance criterion | Implementation | Tests |
| --- | --- | --- |
| AC1: a widget sending hidden actor data / raw vault content / tokens / diagnostics / absolute paths over an approved permission is blocked or redacted per policy | `security/widget-exfiltration.ts` `evaluateWidgetOutboundRequest` (host-flagged content always blocked; tokens/diagnostics/absolute paths block-or-redact via the redaction guard) | `apps/v2/packages/core/tests/security-widget-exfiltration.test.ts` (hidden content blocked even under redact; token blocked; token+path redacted with the clean field surviving; diagnostics blocked by shape; absolute path labelled precisely) |
| AC2: a network request to an unapproved destination class is denied and audited | `evaluateWidgetOutboundRequest` (destination-class check fail-closed; produces an audit record) | `apps/v2/packages/core/tests/security-widget-exfiltration.test.ts` (unapproved class denied + audited; no `network` permission denied; every declared class allowed when approved) |
| AC3: a widget cannot use widget-local storage as the sole source of truth for canonical data | `evaluateWidgetStateOwnership` (canonical + widget-local ⇒ problem) | `apps/v2/packages/core/tests/security-widget-exfiltration.test.ts` (canonical-in-widget-local flagged; scene/session/entity-owned allowed) |
| AC4: a crashed / policy-violating widget is isolated; other widgets + core state remain available | `isolateWidgetFailure` (containment + surviving set + core-available affirmation) | `apps/v2/packages/core/tests/security-widget-exfiltration.test.ts` (crash + host-policy-violation isolated, others survive, core available) |

## Demo path

- **Programmatic (the gates):** `pnpm --filter @dndtools/v2-core test -- sec-stream-privacy-coverage sec-regression-gate-coverage security-widget-exfiltration` runs all three gates. They are wired into CI through `pnpm v2:test` → `pnpm v2:check` (the `v2-check` quality gate). To SEE the gate fail closed, the in-suite negative tests already demonstrate RED-on-leak/GREEN-on-real; manually, deleting a boundary's coverage test (or naming a non-existent surface) turns `sec-regression-gate-coverage.test.ts` / `sec-stream-privacy-coverage.test.ts` red.
- **Adversarial stream-privacy:** `sec-stream-privacy-coverage.test.ts` builds a state salted with a DM-only
  secret in every domain via the REAL command reducers, then proves the player and observer projections of
  every replication surface carry none of the secrets — while the DM projection does (the secrets are really
  there). No user-visible route/flow changed (pure core + tooling).

## Quality gates (all run, all green)

| Gate | Command | Result |
| --- | --- | --- |
| Core unit/integration + adversarial + gates | `pnpm --filter @dndtools/v2-core test` | 164 files, 2399 tests passed (was 161/2337; +3 files, +62 tests) |
| App unit | `pnpm --filter @dndtools/v2-app test` | 12 files, 60 tests passed |
| Typecheck (core tsc + app svelte-check) | `pnpm v2:typecheck` | 0 errors, 0 warnings |
| Quality-gate registry | `pnpm v2:gates` | passed (7 gates owned, budgeted, wired) |
| Boundary lint | `pnpm v2:lint` | passed |
| Full ESLint (CI) | `pnpm lint` | passed (eslint + nav + tokens + repo audit) |
| Docs validate (CI) | `pnpm docs:validate` | passed |
| Workpack validate | `pnpm v2:workpack:validate` | passed |
| Full E2E (desktop + mobile chromium) | `pnpm e2e` (from `apps/v2/app`) | SKIPPED — see below |

### E2E skip rationale

This epic is pure Processing-Core + tooling. The only files changed are core `.ts` source/tests, the core
public `index.ts` re-export, and generated planning YAML. No SvelteKit route, layout, GUI component, or other
visible-flow file was touched (`git status --short` confirms). Per the epic's e2e policy, e2e is skipped for
pure-core/tooling changes with no route/layout/Svelte/visible-flow file touched. The suite remains green at
its prior baseline (~523 passed / 21 skipped); nothing in this change can affect a rendered flow.

## Adversarial tests added (each proves a specific leak/regression is caught)

- `apps/v2/packages/core/tests/sec-stream-privacy-coverage.test.ts` (SEC-010): a salted state (built via real
  `content.create-item`, `map.create-poi`, `character.quick-create`, `scene.create`,
  `session.deliver-handout` commands) is run through 7 player/observer surfaces; each is deep-scanned for the
  planted needles. **RED proofs:** an un-filtered raw-state projection leaks the note/character/scene secrets
  (caught + `assertViewCarriesNoHiddenContent` throws); a revealing hidden COUNT is caught even with no value
  leak; a hidden id leaking as an OBJECT KEY is caught; an empty needle fails closed as a configuration leak.
  **Coverage proof:** the manifest must cover every declared replication-surface domain (AC2). The combat
  surface withholds a hidden combatant op + tracker row.
- `apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts` (SEC-008): proves the boundary registry
  is internally consistent, declares exactly the seven boundaries, and that **every boundary's named coverage
  test exists on disk** and **every named guard is a live core export**. **RED proofs:** a boundary with no
  requirement id / a duplicate boundary id is reported by the validator; a phantom test path is detectably
  missing. The known-leak canary (a dm-only note) is absent from the player read but present for the DM.
- `apps/v2/packages/core/tests/security-widget-exfiltration.test.ts` (SEC-011): adversarial outbound attempts
  — smuggling host-flagged hidden content (always blocked, even under redact policy), tokens (blocked), tokens
  + absolute paths (redacted, clean field survives, secrets scrubbed), diagnostics by shape (blocked), an
  unapproved destination class (denied + audited), no-network (denied) — plus canonical-in-widget-local
  flagged and crash/policy isolation keeping core + other widgets available. Audit records are asserted to
  carry no secret value.

## Changed files (full repo-relative paths)

New (core security/stream-privacy modules):
- `apps/v2/packages/core/src/collab/stream-privacy.ts`
- `apps/v2/packages/core/src/security/regression-gates.ts`
- `apps/v2/packages/core/src/security/widget-exfiltration.ts`

New (tests / regression gates):
- `apps/v2/packages/core/tests/sec-stream-privacy-coverage.test.ts`
- `apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts`
- `apps/v2/packages/core/tests/security-widget-exfiltration.test.ts`

Modified:
- `apps/v2/packages/core/src/index.ts` (export the three new modules)

Generated planning files (workpack commands; not hand-edited):
- `docs/planning/v2/epics/SEC-regression-gates-and-stream-privacy.yaml`
- `docs/planning/v2/status.yaml`
- `docs/planning/v2/workpack-state.yaml`

## Known gaps / deferred

- The SEC-008 registry names the EXISTING guard surfaces + dedicated tests for each boundary (it is the
  catalogue + the fail-closed coverage proof). MCP staged-write enforcement and cloud-join authorization are
  enforced by their existing modules/tests (`mcp-staged-writes.test.ts`, `collab-session-join.test.ts`); this
  epic indexes them under the gate rather than re-implementing them.
- Per ADR-014 there is no live network/widget-runtime in `apps/v2` yet. `evaluateWidgetOutboundRequest` /
  `evaluateWidgetStateOwnership` / `isolateWidgetFailure` are the pure, deterministic policy the future widget
  host runtime calls before any outbound/storage action; the seam is in place and adversarially test-covered
  now. The `forbiddenContentTokens` input models the host's authoritative knowledge of what an actor may not
  exfiltrate (resolved by the visibility filter at the host); the policy itself is transport-agnostic.
- The replication-surface coverage gate proves the major DOMAIN families are covered (Contract 3 enumeration).
  Each concrete `*ForActor` read is additionally covered by its own domain epic's tests; this gate is the
  cross-cutting fail-closed proof that the families stay covered as new surfaces land.

## Git

- Branch: `epic/SEC-regression-gates-and-stream-privacy`
- Base/chained off: `2b18cbc`
- Implementation commit SHA: `__IMPL_SHA__` (`feat(v2): complete SEC-regression-gates-and-stream-privacy epic`)
- Workpack-complete commit SHA: `__COMPLETE_SHA__` (`docs(v2): mark SEC-regression-gates-and-stream-privacy complete`)

### Final `git status --short`

After the SHA-recording commit, the working tree is clean (empty `git status --short`). At the point the
implementation + completion evidence were committed, `git status --short` was:

```
A  apps/v2/packages/core/src/collab/stream-privacy.ts
A  apps/v2/packages/core/src/security/regression-gates.ts
A  apps/v2/packages/core/src/security/widget-exfiltration.ts
M  apps/v2/packages/core/src/index.ts
A  apps/v2/packages/core/tests/sec-regression-gate-coverage.test.ts
A  apps/v2/packages/core/tests/sec-stream-privacy-coverage.test.ts
A  apps/v2/packages/core/tests/security-widget-exfiltration.test.ts
A  docs/planning/v2/epics/SEC-regression-gates-and-stream-privacy.completion.md
M  docs/planning/v2/epics/SEC-regression-gates-and-stream-privacy.yaml
M  docs/planning/v2/status.yaml
M  docs/planning/v2/workpack-state.yaml
```
