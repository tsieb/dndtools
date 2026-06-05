# SYNC-local-first-operation-model — Completion Evidence

Epic: `SYNC-local-first-operation-model` — SYNC: Local-first operation model
Requirement IDs: SYNC-001, SYNC-002, SYNC-011
Architecture contracts: Contract 2 (Cloud Sync & Offline Model — Local-First Invariant + Sync Unit); Contract 3 (Role, Visibility & Permission Grant Model)

This epic FORMALIZES the local-first operation model the codebase already runs on — it does not fork a
parallel system. The `SyncOperation` shape already exists (`apps/v2/packages/core/src/sync/operation-log.ts`),
every durable command already emits an op through `apps/v2/packages/core/src/commands/helpers.ts`
(`appendOperationDraft`) and `apps/v2/packages/core/src/commands/dispatch.ts`, the local-first IndexedDB
adapter already persists with no network (`apps/v2/app/src/lib/platform/storage/scene-store.ts`), and the
PERM visibility/grant engine + migration schema-version model already exist. This epic adds: (1) the
canonical-shape conformance + idempotency MODEL with a cross-command structural guard (SYNC-002), (2) the
fail-closed REPLAY-TIME validator for queued/remote ops that reuses PERM + migration + dependency/target
checks WITHOUT touching the in-process dispatch path (SYNC-011), and (3) the local-first invariant model +
a zero-network workflow proof (SYNC-001). All new logic is pure Processing-Core policy (deterministic
functions over plain data); the GUI dispatches command intents and renders computed models; nothing new
touches raw storage (ADR-014, Contract 1).

## Demo

Surface: the existing `/scenes/` and `/knowledge/` routes (no new GUI was needed — SYNC-001 is proven
against the live local-first surfaces). SYNC-002/SYNC-011 are pure-core policy proven by tests (they are
the seam a future sync transport plugs into; per ADR-014 the live transport is deferred).

1. Open `/scenes/`, create a Scene ("Offline Lair"). The Scene persists locally.
2. Put the device offline (browser DevTools → Network → Offline, or `context.setOffline(true)`).
3. SYNC-001 (zero-network): with no network, create another Scene ("Offline Encounter"). The durable write
   is accepted and the command lifecycle reports `success` — local command execution is not blocked. Both
   Scenes remain readable in the local list. On `/knowledge/`, create + edit + save + search a note while
   offline; the local content index serves the search hit. No network call is made (the Processing Core +
   IndexedDB adapter perform no I/O).
4. SYNC-002 (canonical op): every durable mutation above appended an entity-scoped op carrying actor,
   target (`entityType`/`entityId`), path, dependencies, before/after revisions, issue time, and schema
   version — the op log is the durable substrate the SYNC status/lineage surfaces already render.
5. SYNC-011 (replay validation): a queued/remote op is validated fail-closed before apply — a bad
   dependency defers; an incompatible schema version, missing target, unknown actor, invisible target, or
   unpermitted write rejects; a valid op applies.

Requirement IDs exercised by the demo: SYNC-001, SYNC-002, SYNC-011.

## Traceability

### SYNC-001 — open/read/search/edit/run core workflows with zero network for on-device content

- Code:
  - `apps/v2/packages/core/src/sync/local-first.ts` — the pure LOCAL-FIRST invariant model.
    `LOCAL_FIRST_WORKFLOWS` declares the offline-required core workflows; `evaluateWorkflowAvailability`
    computes per-workflow offline availability (content never synced to a device reports `unavailable`
    rather than blocking the whole vault — AC2); `deriveLocalFirstStatus` reports collaboration as
    `unavailable` offline and the count of queued local operations held until sync resumes (AC3);
    `findNetworkDependencies` / `hasNoNetworkDependency` / `assertNoNetworkDependency` are the fail-closed
    guards that prove the offline path carries no fetch/XHR/socket/URL handle.
  - `apps/v2/packages/core/src/index.ts` — public exports for the local-first model.
  - Reused (unchanged): `apps/v2/app/src/lib/platform/storage/scene-store.ts` (local IndexedDB adapter,
    no network) and `apps/v2/app/src/lib/canvas-runtime/runtime.svelte.ts` (dispatch → pure core →
    local persist; no fetch in the path).
- Tests:
  - `apps/v2/packages/core/tests/sync-local-first.test.ts` — the keystone zero-network test stubs global
    `fetch`/`XMLHttpRequest` to throw, then runs open → edit → read → search → run-session entirely through
    the Processing Core and asserts NO network call was made; plus the no-network-dependency guard, the
    offline-availability model (AC1/AC2), and the collaboration-unavailable-offline + queued-ops status (AC3).
  - `apps/v2/app/tests/e2e/sync-local-first.spec.ts` — END TO END: with the browser context OFFLINE, a Scene
    create (edit) → list (read) workflow and a note create → edit → save → search workflow each succeed with
    zero network, on BOTH desktop-chromium and mobile-chromium.

### SYNC-002 — every durable mutation is an entity-scoped, idempotent op with actor/target/path/dependencies/revisions/issue time

- Code:
  - `apps/v2/packages/core/src/sync/operation-model.ts` — the canonical-shape conformance + idempotency
    model. `REQUIRED_OPERATION_FIELDS` declares the Contract 2 Sync Unit field set;
    `validateSyncOperationShape` is the pure structural conformance check (fails closed, naming every
    missing/malformed field, a self-dependency, or an unsupported schema version);
    `assertDurableOperationConforms` is the throw-if-bad guard the cross-command test asserts against;
    `isOperationApplied` / `applyOperationIdempotent` / `dedupeOperationsById` express idempotent re-apply
    (re-applying the same op id is a no-op — AC2).
  - Reused (unchanged): `apps/v2/packages/core/src/sync/operation-log.ts` (the `SyncOperation` type +
    `SYNC_OPERATION_SCHEMA_VERSION`) and `apps/v2/packages/core/src/commands/helpers.ts`
    (`appendOperationDraft`, the single op-emission seam every command handler uses). No command behavior
    changed; the shape already carried every required field, so the audit found no gaps to backfill.
  - `apps/v2/packages/core/src/index.ts` — public exports for the operation model.
- Tests:
  - `apps/v2/packages/core/tests/sync-operation-conformance.test.ts` — the CONFORMANCE GUARD: dispatches
    durable commands across SCENE / WIDGET / CHARACTER / CONTENT / MAP / SESSION / DICE / GRANT through the
    same `dispatchCommand` the GUI uses, collects EVERY emitted op, and asserts each conforms (a future
    command that drops a required field fails this test closed). AC1: an accepted character HP change records
    actor id, entity id, path, before/after revisions, and the op id (idempotency anchor). AC2: applying the
    same op id twice is a no-op; an op stream dedupes by id. Plus the fail-closed shape rejections.

### SYNC-011 — replay validates dependencies, schema version, actor authority, visibility, permission, and target existence before applying

- Code:
  - `apps/v2/packages/core/src/sync/replay-validation.ts` — the fail-closed REPLAY-TIME validator.
    `validateReplayOperation` checks, in order: shape conformance (SYNC-002), schema-version compatibility
    (fail closed on a future version), dependencies satisfied (an unsatisfied dependency DEFERS with the
    structured `unsatisfied-dependency` reason + the missing ids — AC1), target existence (resolved through
    the live state OR caller-supplied recorded identity metadata so a renamed entity still resolves — AC2;
    a missing target rejects fail-closed), actor authority (unknown actor rejects), visibility (reuses the
    PERM `evaluateVisibility` engine), and write permission (reuses the PERM `hasGrantedCapability` grant
    model; the DM bypasses capability-set restrictions inherently; an unclassified write fails closed to
    DM-only). `validateReplayBatch` threads the applied-id set so an op can satisfy a later op's dependency
    and applies idempotently. CRITICAL: this is a replay-time guard for queued/remote ops only; it does NOT
    touch the in-process dispatch path (which already validates inside each reducer).
  - Reused (unchanged): `apps/v2/packages/core/src/permissions/visibility-filter.ts` (`evaluateVisibility`),
    `apps/v2/packages/core/src/permissions/grants.ts` (`hasGrantedCapability`), and the
    `SYNC_OPERATION_SCHEMA_VERSION` migration-version stance.
  - `apps/v2/packages/core/src/index.ts` — public exports for the replay validator.
- Tests:
  - `apps/v2/packages/core/tests/sync-replay-validation.test.ts` — proves EACH dimension rejects/defers a
    bad op fail-closed and a valid op applies: malformed op rejects; future schema version rejects;
    unsatisfied dependency DEFERS (with the missing ids) and applies once satisfied; missing target rejects;
    recorded identity metadata resolves a renamed target (AC2); unknown actor rejects; a non-DM op against an
    invisible target rejects (visibility); a visible-but-ungranted write rejects (permission); a non-DM write
    with no declared required capability fails closed to DM-only; the batch validator threads dependencies,
    applies idempotently, and rejects a bad op without blocking the good ops around it.

## Tests run

- `pnpm lint` (FULL: `eslint . && lint:navigation && lint:tokens && audit:repo`): PASS (navigation 132
  files, tokens 132 files, repo-boundary + ci-guardrails 5 tests passed).
- `pnpm docs:validate`: PASS (see below).
- `pnpm v2:typecheck`: PASS (0 errors; core `tsc` + app `svelte-check` 759 files, 0 errors/warnings).
- `pnpm v2:lint` (boundary): PASS (v2 boundary lint passed).
- `pnpm v2:gates`: PASS (7 gates owned, budgeted, wired).
- Core unit suite (`@dndtools/v2-core` vitest): PASS — 102 files, 1420 tests (includes the 3 new SYNC test
  files: `sync-operation-conformance.test.ts`, `sync-replay-validation.test.ts`, `sync-local-first.test.ts`).
- App unit suite (`@dndtools/v2-app` vitest): PASS — 12 files, 55 tests.
- Full Playwright (`pnpm --filter @dndtools/v2-app exec playwright test`): PASS on BOTH projects
  (desktop-chromium AND mobile-chromium) — 412 passed (408 base + 4 new in
  `apps/v2/app/tests/e2e/sync-local-first.spec.ts`), 18 intentional project-scoped skips, 0 failed.
- `pnpm v2:workpack:validate`: PASS before and after `complete`.

## Quality review

- Correctness: every mapped acceptance criterion is implemented and test-covered; the canonical shape and
  replay validator are deterministic pure functions verified across every dimension.
- Architecture: pure Processing-Core policy (op shape, replay validation, dependency checks are pure
  functions); reuses the existing op-log substrate, PERM engine, and migration version model rather than
  forking them; no v1 imports; boundary lint green; the GUI never touches raw storage.
- Tests: unit (conformance across all command types, idempotency, fail-closed replay across 7 dimensions,
  zero-network workflow) + e2e (offline core workflow on both profiles) + the full existing suite stays
  green (this is a cross-cutting epic; 1420 core + 55 app + 412 e2e).
- Accessibility: no new GUI; the existing offline-capable surfaces keep their a11y semantics.
- Performance: all new logic is O(n) over op/dependency lists; no new storage or network surface.
- Security/permissions: replay validation enforces visibility + permission + actor authority fail-closed,
  reusing the PERM keystone; an invalid/unauthorized op is rejected, never conflicted (SYNC-002 AC4 / the
  PERM rule that unauthorized remote ops are rejected).
- Persistence: unchanged local IndexedDB adapter; durable writes still flow through the command/op path; the
  zero-network test stubs `fetch`/`XHR` to prove no network I/O.
- Sync/offline: SYNC-001 proves zero-network core workflows on both profiles; the replay validator + canonical
  op model are the provider-agnostic seam a future sync transport plugs into (ADR-014 defers the transport).
- Maintainability: three cohesive, typed, documented modules; no speculative abstractions; no unrelated
  refactors; conventions (`SvelteMap`/`SvelteSet`, no `eslint-disable`) respected.
- Docs: this completion file; planning files regenerated via the workpack commands.

## Status command run

- `pnpm v2:workpack:set-status -- --epic SYNC-local-first-operation-model --status active` (at start).
- `pnpm v2:workpack:complete -- --epic SYNC-local-first-operation-model` (at completion).

Workpack status: `complete` (set via `pnpm v2:workpack:complete -- --epic SYNC-local-first-operation-model`).

## Files changed

- `apps/v2/packages/core/src/sync/operation-model.ts` (new) — SYNC-002 canonical shape + idempotency.
- `apps/v2/packages/core/src/sync/replay-validation.ts` (new) — SYNC-011 fail-closed replay validator.
- `apps/v2/packages/core/src/sync/local-first.ts` (new) — SYNC-001 local-first invariant model.
- `apps/v2/packages/core/src/index.ts` — public exports for the three new modules.
- `apps/v2/packages/core/tests/sync-operation-conformance.test.ts` (new) — SYNC-002 tests.
- `apps/v2/packages/core/tests/sync-replay-validation.test.ts` (new) — SYNC-011 tests.
- `apps/v2/packages/core/tests/sync-local-first.test.ts` (new) — SYNC-001 core tests.
- `apps/v2/app/tests/e2e/sync-local-first.spec.ts` (new) — SYNC-001 e2e on both profiles.
- `docs/planning/v2/workpack-state.yaml` + generated planning files (status active → complete via workpack
  commands), and this completion file.

## Known gaps / deferred items

- The live sync TRANSPORT (cloud/CRDT/websocket, Obsidian/Google Docs adapters) remains deferred per
  ADR-014. SYNC-011's replay validator and SYNC-002's canonical op model are the provider-agnostic seam a
  future transport plugs into; they are proven by tests today without a remote transport.
- The static-preview e2e harness treats the preview server as "the network", so the offline tests assert
  in-page local-first behavior on a single route rather than a hard offline document reload; a real
  installed/cached PWA (service worker) would serve the shell offline (deferred — no service worker in the
  first prototype per ADR-014).

## Git

- Branch: `epic/SYNC-local-first-operation-model` (branched from `epic/SYNC-conflict-lifecycle` HEAD
  `4905a89`, the prior completed v2 epic — not master).
- Commit SHA: recorded in the follow-up docs commit after this file is committed.
- Final `git status --short`: clean (recorded after the final commit).
