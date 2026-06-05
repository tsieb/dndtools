# SYNC-conflict-lifecycle — Completion Evidence

Epic: `SYNC-conflict-lifecycle` — SYNC: Conflict lifecycle
Requirement IDs: SYNC-006, SYNC-013
Architecture contracts: Contract 2 (Cloud Sync & Offline Model — Conflict Model)

This epic GENERALIZES the existing per-entity/per-path conflict handling (the CHAR-004 same-scalar-path
conflict + DM resolution in `apps/v2/packages/core/src/state/character-collaboration.ts`, surfaced by the
SYNC-010 status view in `apps/v2/packages/core/src/queries/sync-status.ts`) into ONE durable, vault-wide
conflict LIFECYCLE — it does NOT fork a parallel conflict system. Characters (and any later MAP/CONTENT
slice) keep recording conflict-shaped ops on the same op-log substrate; the new lifecycle DERIVES the
durable, entity-agnostic conflict records from those ops, models per-entity ISOLATION + the publication
gate, and adds the DM-authorized administrative resolution command + audit. All new logic is pure
Processing-Core policy (deterministic functions over plain data); durable writes go through the
op-log/command lifecycle; the GUI dispatches command intents and renders computed models and never
touches raw storage (ADR-014, Contract 1/2).

## Demo

Surface: the PLAT-owned Settings route (`/settings/`), in the existing Sync status panel
(`apps/v2/app/src/lib/gui/SyncStatusPanel.svelte`), new "Conflict lifecycle" section beneath the
structural conflicts list.

1. Produce a real conflict (the established CHAR-004 flow on `/characters/`):
   - DM quick-creates a player-visible character and grants ownership to Demo Player.
   - The DM starts an HP edit (based on the original revision) but does not save; the owner edits the
     SAME field and saves first; the DM then saves the now-stale edit. This produces a durable
     `same-scalar-path` conflict — not silent last-write-wins.
2. Inspect on `/settings/`:
   - SYNC-006 (DISPLAY): as the DM, the "Conflict lifecycle" section shows the durable conflict for the
     `character` entity with its diverging values and `conflicted` publication status; the unresolved
     count is 1. Switch "View as" to Demo Player: the player sees ONLY structural facts
     (entity/path/reason/status, "awaiting DM resolution") — never the diverging values, and no
     resolution controls (non-leak + fail-closed).
   - SYNC-013 (RESOLVE): as the DM, type an optional resolution note and click "Use <value>" (or
     "Keep <value>"). The DM-authorized `conflict.resolve` command runs; the entity becomes
     non-conflicted (unresolved count → 0), and the row reports "resolved by local-dm • selected
     <value>" with the note — the durable audit.
   - ISOLATION: a clean fresh vault shows "No conflicts. Unrelated entities edit and publish freely."

Requirement IDs exercised by the demo: SYNC-006, SYNC-013.

## Traceability

### SYNC-006 — detect, persist, display, resolve conflicts as durable records without blocking unrelated entities

- Code:
  - `apps/v2/packages/core/src/state/conflict-lifecycle.ts` — the pure, entity-agnostic conflict
    lifecycle policy. `deriveVaultConflicts` reconstructs the durable `VaultConflictRecord` set (shaped
    on Contract 2's `ConflictRecord`: entity ref, path, reason, ancestor + both diverging sides with
    revisions/values, status, resolution audit) from the op-log substrate (DETECT → PERSIST → DISPLAY).
    Per-entity ISOLATION primitives: `isEntityConflicted`, `conflictedEntityKeys`,
    `publicationStatusForEntity`, `entityIsEditableDespiteOtherConflicts` — all scoped strictly to one
    `${entityType}:${entityId}`, so a conflict on A never affects B (AC2). `publicationStatusForEntity`
    blocks/represents a conflicted revision as `conflicted` for non-DM viewers until resolved (AC3).
  - `apps/v2/packages/core/src/queries/conflict-lifecycle.ts` — `getConflictLifecycle`, the
    actor-filtered DISPLAY view: the DM sees full records (diverging values + audit); a non-DM sees only
    structural entries (no conflicting values). `conflictLifecycleIsStructuralOnly` is the non-leak
    self-check; `entityPublicationStatus` is the per-entity gate.
  - `apps/v2/packages/core/src/state/character-collaboration.ts` — generalization fidelity: each
    `CharacterFieldConflict` side now carries its diverging `revision` so a vault resolution can
    reference the actual source revisions. No behavior change to the CHAR-004 reducer otherwise.
  - `apps/v2/packages/core/src/index.ts` — public exports for the lifecycle state + query APIs.
  - `apps/v2/app/src/lib/gui/SyncStatusPanel.svelte` — renders the computed conflict-lifecycle view
    (DM detail + resolution controls; non-DM structural list) and dispatches the resolution intent.
- Tests:
  - `apps/v2/packages/core/tests/sync-conflict-lifecycle.test.ts` — AC1 (a same-scalar-path divergence
    reconstructs a record with ancestor/local/remote/reason/revisions); resolution marks a record
    resolved + attaches audit (idempotent: first wins); AC2 per-entity isolation (A conflicted, B
    unaffected, editable, publishable); AC3 publication gate (`conflicted` until resolved); the
    actor-filtered display + non-leak (DM sees values, non-DM never does).
  - `apps/v2/app/tests/e2e/sync-conflict-lifecycle.spec.ts` — the DM sees the durable conflict on
    `/settings/`; a clean vault shows the isolation baseline; a player sees structural facts only.

### SYNC-013 — DM-authorized conflict resolution (explicit values, source revisions, notes, audit → non-conflicted revision)

- Code:
  - `apps/v2/packages/core/src/state/conflict-lifecycle.ts` — `resolveVaultConflict`, the pure
    resolution policy. It takes the explicit `selectedValue`, the `sourceLocalRevision`/
    `sourceRemoteRevision` being resolved, optional `notes`, and produces the resolved record + a
    `VaultConflictResolutionAudit` (resolver, selected value, source revisions, resulting revision,
    notes, resolution op id, time). Fails closed: `conflict-not-found`, `conflict-already-resolved`
    (idempotent), and `stale-source-revision` when the referenced revisions do not match the actual
    conflict.
  - `apps/v2/packages/core/src/commands/conflict-resolution.ts` — `handleResolveVaultConflict`, the
    `conflict.resolve` administrative command. DM-only (non-DM/observer rejected `actor-not-authorized`,
    conflict remains — AC1); reconstructs the durable record from the op-log; maps the pure resolver's
    fail-closed reasons (stale → `revision-conflict`, already-resolved → `invalid-state`); on success
    appends a durable `<entityType>.resolve-conflict` op carrying the audit and the resulting
    non-conflicted revision (one past both diverging sides). Idempotent replay (AC2): the derived record
    takes the FIRST resolution per conflict id; a second resolve command finds it resolved and is
    rejected without a second revision.
  - `apps/v2/packages/core/src/schemas/commands.ts` — `resolveVaultConflictInputSchema` (validated,
    entity-agnostic `selectedValue`, non-negative source revisions, optional notes ≤ 2000 chars).
  - `apps/v2/packages/core/src/commands/types.ts` — the `conflict.resolve` command and the
    non-leaking `conflict.resolved` event (entity ref + conflict id + resulting revision; never the
    selected value).
  - `apps/v2/packages/core/src/commands/dispatch.ts` — wires `conflict.resolve` to the handler.
  - `apps/v2/app/src/lib/gui/SyncStatusPanel.svelte` — the DM resolution controls (explicit value
    buttons + optional note) dispatch `conflict.resolve`; non-DM actors get no controls (fail-closed).
- Tests:
  - `apps/v2/packages/core/tests/sync-conflict-lifecycle.test.ts` — the pure resolver (explicit value +
    matching source revisions + notes → resolved + audit; stale-revision rejected; unknown/already-
    resolved rejected); the command over a REAL character conflict (non-DM player AND observer rejected,
    conflict remains; stale pair → `revision-conflict`; DM resolves with value + source revisions + note
    → non-conflicted + audit records who/what/selected value; AC2 idempotent second resolve →
    `invalid-state`, no second op; isolation over real ops — resolving A leaves B's conflict intact).
  - `apps/v2/app/tests/e2e/sync-conflict-lifecycle.spec.ts` — the DM resolves with a note and the entity
    becomes non-conflicted (audit visible); a player has no resolution controls (fail-closed).

### AC mapping notes

- SYNC-013 AC3 ("a character owner's conflicted field is represented as conflicted and a proposed value
  change is recorded as a NORMAL edit, not a resolution command") is satisfied by the EXISTING CHAR-004
  surface (`character.edit-field` is the normal attributed edit; `conflict.resolve` is the separate
  DM-only administrative command), covered by
  `apps/v2/packages/core/tests/character-collaboration-and-dm-edits.test.ts` and unchanged here. This
  epic adds the vault-wide, entity-agnostic resolution path on top of that surface; the player edit path
  remains the normal validated edit command, never the resolution command.

## Tests run

- `pnpm lint` — PASS (`eslint .` + `lint:navigation` (132 Svelte files) + `lint:tokens` (132 files) +
  `audit:repo` (5 tests)). No eslint-disable; `SvelteMap`/`SvelteSet` convention respected (no new Svelte
  reactive maps introduced).
- `pnpm docs:validate` — PASS (see below).
- `pnpm v2:typecheck` — PASS (0 errors; core `tsc` + app `svelte-check` 755 files, 0 errors/0 warnings).
- `pnpm v2:lint` (boundary) — PASS ("v2 boundary lint passed"); no v1 runtime imports.
- `pnpm v2:gates` — PASS (7 gates owned/budgeted/wired).
- Core unit suite — PASS: 99 files, 1388 tests (was 1370; +18 new in `sync-conflict-lifecycle.test.ts`).
- App unit suite — PASS: 12 files, 55 tests.
- `pnpm --filter @dndtools/v2-app exec playwright test` — full Playwright on BOTH projects
  (desktop-chromium AND mobile-chromium). The new `sync-conflict-lifecycle.spec.ts` passes 5/5 on each
  project; the full run remains green on both (the prior baseline 398 passed / 18 project-scoped skips,
  plus the 10 new cases across the two projects).
- `pnpm v2:workpack:validate` — PASS before and after `complete` ("v2 workpack validation passed").

## Quality review

- Correctness: every mapped AC is implemented and tested (detect/persist/display/isolation/publication
  gate; DM-only resolution with explicit value + source revisions + notes + audit → non-conflicted
  revision; fail-closed negatives: non-DM, observer, stale revision, idempotent re-resolve).
- Architecture: pure Processing-Core policy (`state/conflict-lifecycle.ts`,
  `queries/conflict-lifecycle.ts`) — deterministic, no GUI/storage/clock/entropy. Durable writes go
  through the op-log via the command lifecycle; the GUI renders computed models and dispatches intents.
  Generalizes the existing conflict ops/records rather than forking. Boundary lint green; no v1 imports.
- Tests: unit (pure policy + command + isolation) and e2e (both profiles); negative/fail-closed cases
  are primary evidence.
- Accessibility: the new surface reuses the existing settings panel patterns (labelled `<section>`,
  `<label>`-wrapped note input, `role="alert"` error); navigation + token lints pass over all Svelte
  files.
- Performance: derivation is a single linear pass over the op-log; no new storage or background work.
- Security / permissions: resolution is DM-only and fails closed; the non-DM display is structural-only
  (no conflicting values, proven by `conflictLifecycleIsStructuralOnly` and e2e non-leak assertions);
  the `conflict.resolved` event is non-leaking by shape.
- Persistence / sync-offline: the conflict record is durable as op-log entries (replayable); resolution
  is itself a durable, idempotent op (first resolution per conflict id wins on replay), consistent with
  Contract 2 binding rules 2 and 7. No live transport is implemented (deferred per ADR-014); the model is
  the seam a transport plugs into.
- Maintainability: small typed modules; reuses the op-log substrate, the command helpers, and the
  sync-status panel; no unrelated refactors.
- Docs: this completion file; all referenced files use full repo-relative paths in backticks.

## Files changed

New:
- `apps/v2/packages/core/src/state/conflict-lifecycle.ts`
- `apps/v2/packages/core/src/queries/conflict-lifecycle.ts`
- `apps/v2/packages/core/src/commands/conflict-resolution.ts`
- `apps/v2/packages/core/tests/sync-conflict-lifecycle.test.ts`
- `apps/v2/app/tests/e2e/sync-conflict-lifecycle.spec.ts`
- `docs/planning/v2/epics/SYNC-conflict-lifecycle.completion.md`

Modified:
- `apps/v2/packages/core/src/state/character-collaboration.ts` (per-side revisions on conflict record)
- `apps/v2/packages/core/src/schemas/commands.ts` (`resolveVaultConflictInputSchema`)
- `apps/v2/packages/core/src/commands/types.ts` (`conflict.resolve` command + `conflict.resolved` event)
- `apps/v2/packages/core/src/commands/dispatch.ts` (dispatch wiring)
- `apps/v2/packages/core/src/index.ts` (public exports)
- `apps/v2/app/src/lib/gui/SyncStatusPanel.svelte` (conflict-lifecycle display + DM resolution)
- `docs/planning/v2/epics/SYNC-conflict-lifecycle.yaml` (generated; status)
- `docs/planning/v2/status.yaml` (generated; status)
- `docs/planning/v2/workpack-state.yaml` (status workflow)

## Known gaps / deferred items

- Live remote sync transport, CRDT, and cross-device replay of resolution ops are deferred per ADR-014;
  the lifecycle is operation-shaped so a future transport plugs in without changing call sites. The
  idempotent-replay guarantee (SYNC-013 AC2) is proven at the durable-record/command level (first
  resolution per conflict id wins; second resolve rejected) rather than over a network round-trip.
- MAP/CONTENT slices do not yet emit conflict-shaped ops of their own; the lifecycle is entity-agnostic
  and validated against character conflicts today, ready for those slices to record conflicts on the
  same substrate.

## Git

- Branch: `epic/SYNC-conflict-lifecycle` (from `epic/SYNC-cloud-device-local-storage` HEAD `e4845da`).
- Epic commit SHA: `1d404be257e8e87ac30b555c71a7c43917e73688` (this docs SHA-record commit follows it).
- Final `git status --short`: clean (empty output) after the docs SHA-record commit below.

```
(clean — no untracked or unstaged files caused by this epic)
```

## Status command

- `pnpm v2:workpack:set-status -- --epic SYNC-conflict-lifecycle --status active` (at start).
- `pnpm v2:workpack:complete -- --epic SYNC-conflict-lifecycle` (at completion).
- `pnpm v2:workpack:validate` re-run after complete: PASS (no drift).

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic SYNC-conflict-lifecycle`).

## Stop conditions

None hit. The v2 stack ADR (ADR-014) supports the approach; no v1 runtime imports were needed; the
visibility/permission/sync behavior was unambiguous (Contract 2 Conflict Model + the existing CHAR-004
pattern); the workpack validated throughout; no unrelated overlapping changes.
