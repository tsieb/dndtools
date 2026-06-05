# PERM-visibility — Completion Evidence

Epic: `PERM-visibility` — PERM: Visibility
Requirement IDs: PERM-002, PERM-003, PERM-012
Architecture contracts: Contract 1 (Processing/Display Decoupling), Contract 3 (Role, Visibility &
Permission Grant Model), Contract 4 (Widget/Canvas — binding visibility).

This epic builds the visibility-filtering engine — the security keystone every non-DM read path
passes through. It is pure Processing-Core policy; no GUI surface was added, so the GUI continues to
consume a computed/filtered model and never filters client-side.

## What was built

### PERM-002 — visibility levels + pre-read evaluation (single choke-point)

`apps/v2/packages/core/src/permissions/visibility-filter.ts`

- Three levels: `dm-only`, `player-visible`, `shared`. `shared` is delivery-ONLY: readable solely
  through a Player View assignment / handout delivery (both reduced to `sharedWith` membership by the
  delivery layer) or a viewer-capable grant (`hasGrantedCapability(... 'viewer')`, reusing
  `grants.ts` inheritance). `shared` with no delivery channel is hidden exactly like `dm-only`.
- `filterEntityForActor(meta, content, actor, permission)` is THE sanctioned non-DM read
  choke-point. Every non-DM query / subscription / sync stream / MCP response / widget-binding payload
  must produce its actor-facing data through it (or through the binding resolver / scene query that
  delegate to the same policy). A non-DM hidden entity returns the empty hidden result — no section
  ids, no field keys, no counts — indistinguishable from not-found.
- `evaluateVisibility` / `isEntityVisibleToActor` expose the underlying decision.
- Fail closed: absent/unknown/malformed visibility ⇒ `dm-only` via `normalizeVisibilityLevel`
  (allowlist of the three known strings; anything else, including `public`, casing variants,
  numbers, objects, `null`/`undefined`, collapses to `dm-only`).

### PERM-003 — granularity + specificity precedence

Same module. Visibility is authorable at entity / section / field granularity
(`EntityVisibilityMetadata` with `entity`, `sections`, `fields`, and a `fieldSections`
field→section attribution map).

- Precedence: field overrides section overrides entity for the MOST SPECIFIC rule.
- Hidden-ancestor-wins: a hidden entity hides every section/field below it; a hidden section hides
  its attributed fields — even when a narrower rule re-grants. A child rule can only NARROW, never
  WIDEN, what an ancestor permits. The deciding `scope` is reported on every denial
  (`'entity' | 'section' | 'field'`), and ancestor denials surface reason `hidden-ancestor`.

### PERM-012 — revoke/change + invalidation (reuses the capability-cache pattern)

`apps/v2/packages/core/src/permissions/visibility-invalidation.ts`

- `computeVisibilityMetadataFingerprint` — actor-independent fingerprint over every granular rule;
  ANY entity/section/field edit changes it.
- `computeActorVisibilityFingerprint` — per-actor fingerprint folding the actual access decision
  (visible / hidden+reason+scope) for each tracked surface plus the actor's `shared`-delivery/grant
  state, so revoking a viewer grant on `shared` content also re-fingerprints.
- `buildVisibilityCache` / `invalidateVisibilityCache` / `isVisibilityCacheEntryValid` mirror the
  existing `capability-cache.ts` fingerprint-diff engine (whose trigger list already names
  "visibility"). Narrowing a section/field/entity invalidates EXACTLY the affected actors'
  subscriptions, sync streams, cached data, and widget bindings. A stale entry reads invalid, so a
  previously-cached now-hidden surface is never served (fail closed). Reconnect re-evaluates before
  catch-up: a missing entry is invalid; a departed actor is dropped.
- `toConsistencyEntityRecords` bridges entity-level granular metadata to the existing
  `ConsistencyEntityRecord` shape so entity-level visibility changes flow into the EXISTING
  capability-cache invalidation without duplicating that engine. Section/field narrowing is tracked
  by the visibility cache.

Both modules are exported from `apps/v2/packages/core/src/index.ts`.

## Reuse (no duplication)

- Delivery / viewer-grant resolution reuses `permissions/grants.ts` (`hasGrantedCapability`,
  inheritance via `capability-sets.ts`).
- Invalidation reuses the `capability-cache.ts` fingerprint-diff pattern and bridges into it via
  `toConsistencyEntityRecords` rather than re-implementing cache invalidation.
- `ConsistencyEntityRecord` type reused from `consistency.ts`; the existing `binding.ts` resolver and
  `access-audit.ts` denial paths remain the non-leaking surfaces for widget bindings and audits and
  are consistent with this engine's semantics.

## Traceability

| Requirement                                                                             | Implementation                                                                                                                                               | Tests                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERM-002 (levels, shared=delivery-only, pre-read choke-point, fail-closed)              | `visibility-filter.ts`: `filterEntityForActor`, `evaluateVisibility`, `normalizeVisibilityLevel`, `DEFAULT_VISIBILITY`                                       | `apps/v2/packages/core/tests/visibility-filter.test.ts` describe blocks "PERM-002: …" (AC1 dm-only no-content+non-leak; AC4 shared A vs B; shared via viewer/editor grant; shared with no channel; default fail-closed; unknown-actor)                                                                               |
| PERM-003 (entity/section/field granularity, field>section>entity, hidden-ancestor-wins) | `visibility-filter.ts`: `evaluateVisibility` precedence + `resolveEffectiveRule`, `EntityVisibilityMetadata`                                                 | `apps/v2/packages/core/tests/visibility-filter.test.ts` "PERM-003: …" (AC1 hidden field in visible entity; AC2 field-vs-section conflict both directions; visible field in hidden entity; hidden field in visible section in visible entity; section dm-only hides attributed fields; exhaustive 3×3 nesting matrix) |
| PERM-012 (revoke/change + invalidation at all granularities)                            | `visibility-invalidation.ts`: fingerprints, `buildVisibilityCache`, `invalidateVisibilityCache`, `isVisibilityCacheEntryValid`, `toConsistencyEntityRecords` | `apps/v2/packages/core/tests/visibility-invalidation.test.ts` (AC1 section narrow invalidates players not DM; now-hidden disappears; stale cache not served; field narrowing; shared revoke; AC2 reconnect re-eval + departed-actor drop; entity-level bridge into existing capability cache)                        |

## Tests run

- `pnpm --filter @dndtools/v2-core test` (vitest): **47 files, 555 tests passed**, including the 2 new
  files (**30 new tests**). Adversarial non-leak cases are primary evidence: a dm-only entity returns
  no titles/values/counts (serialized payload asserted free of secret strings); `shared` is not
  readable except via the sanctioned channels; precedence holds across all nesting combinations
  (including a 3×3 entity×field matrix); a stale cache never serves a now-hidden surface.
- `pnpm v2:lint` (boundary lint): **passed**.
- `pnpm --filter @dndtools/v2-core typecheck` + `pnpm --filter @dndtools/v2-app typecheck`:
  **passed** (app svelte-check 594 files, 0 errors).
- `pnpm v2:gates`: **passed** (7 gates).
- `pnpm v2:workpack:validate`: **passed**.
- Playwright e2e: **not run / not required.** No visible GUI surface was added (pure Processing-Core
  policy); no app files changed. The suite remains as at the base branch (132 passed, 18
  project-scoped skips, 0 failed).

## Demo notes

- User-visible path: none added in this epic (policy engine only). Demo is via the core API:
  1. `filterEntityForActor({entity:{level:'dm-only'}}, content, PLAYER)` ⇒ `{ visible:false }`,
     empty fields/sections — indistinguishable from not-found.
  2. Set entity `player-visible` with field `note.dmNotes: dm-only` ⇒ player sees the entity and all
     fields except `note.dmNotes`; `redactedFieldPaths` reports the omission to DM tooling only.
  3. Set entity `shared`, `sharedWith:[A]` ⇒ A reads it; B gets `{visible:false, hiddenReason:'not-shared'}`.
  4. Narrow a section `player-visible`→`dm-only` ⇒ `invalidateVisibilityCache` returns the affected
     players (not the DM); `isVisibilityCacheEntryValid` for the old cache now returns false, and the
     section is gone from `filterEntityForActor`.
- Requirement IDs exercised: PERM-002, PERM-003, PERM-012.

## Quality review

- Correctness: every mapped acceptance criterion has a passing test, including both directions of the
  field-vs-section conflict and the hidden-ancestor cases.
- Architecture: pure Processing-Core; no DOM/Svelte/platform imports; boundary lint green; no v1
  runtime imports; the GUI receives only computed/filtered models.
- Tests: unit + adversarial non-leak (primary), precedence matrix, invalidation/fail-closed, reuse
  bridge into the existing capability cache.
- a11y / UX: no surface added; existing hidden/unavailable states (binding resolver, deep-link
  fail-closed) remain the consistent player-facing representation.
- Perf: pure synchronous fingerprint diff; O(actors × surfaces); no timers/background work.
- Security/permissions: fail-closed default `dm-only`; `shared` is delivery-only; denials carry no
  titles/values/counts; redaction reports stay DM-side.
- Persistence/sync/offline: visibility metadata is applied before reads; invalidation re-evaluates
  before catch-up on reconnect (PERM-012 AC2); entity-level changes feed the existing
  capability-cache invalidation.
- Maintainability: two cohesive modules, fully typed, no speculative abstractions, no unrelated
  refactors.
- Docs: this completion file + thorough module/JSDoc headers; index export comments.

## Known gaps / deferred

- The choke-point operates on a declarative `EntityVisibilityMetadata` + `FilterableContent` pair.
  Wiring real `VaultState`/`SessionState` entity stores to source that metadata and route ALL
  concrete query/subscription/MCP code paths through `filterEntityForActor` is owned by the
  respective content/session/sync epics; the existing `binding.ts` resolver and `access-audit.ts`
  already enforce the same semantics for widget bindings and denial audits.
- No DM visibility-authoring GUI control was added (out of scope for this policy epic); when one is
  added, the full Playwright e2e on both projects must run per the epic emphasis.
- MCP response filtering shares the same choke-point contract; the MCP sidecar wiring lands with the
  MCP epic.

## Stop conditions

None hit. The v2 stack ADR is present and consistent; no v1 runtime imports were required; hidden
behavior was specified by Contract 3; the workpack validates; `git status` showed no unrelated
overlapping changes.

## Status command

- `pnpm v2:workpack:set-status -- --epic PERM-visibility --status active` (at implementation start).
- `pnpm v2:workpack:complete -- --epic PERM-visibility` (after evidence existed).
- Workpack status: `complete`.
- `pnpm v2:workpack:validate`: passed with no drift after completion.

## Git evidence

- Branch: `epic/PERM-visibility` (from `epic/PERM-grants-and-capability-sets` HEAD `d7fc1d7`).
- Commit: recorded at handoff (see final report).
- Final `git status --short`: clean after the epic commit (recorded at handoff).
