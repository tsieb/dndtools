# PLAT-persistence-and-boundaries — Completion Evidence

Epic: `PLAT-persistence-and-boundaries` — PLAT: Persistence and boundaries
Requirements: PLAT-006, PLAT-007, PLAT-011, PLAT-012, PLAT-018
Branch: `epic/PLAT-persistence-and-boundaries` (cut from prior epic HEAD `23fc56f`, not master)

## Summary

A foundational boundary-enforcement epic. The value is in rules that FAIL CLOSED and are
mechanically enforced by the project's existing boundary tooling (`scripts/v2-boundary-lint.ts`,
extended in place) plus negative/regression tests that plant violations and prove the rules fire.

Key additions:

- A reusable platform-service boundary contract in `@dndtools/v2-core` (named methods, runtime
  schemas, payload size limits, enum allowlist, structured errors) wired into the real storage
  adapter (PLAT-007).
- Extended the existing `scripts/v2-boundary-lint.ts` (the `pnpm v2:lint` entry point) to catch
  GUI/route components reaching IndexedDB/Dexie/localStorage/native bridges directly, with an
  explicit, owned, scoped exception manifest (PLAT-006/PLAT-012).
- A type-only contract module path enforced by lint + tests, with runtime constructors/validators
  in separate modules (PLAT-011).
- A durable command lifecycle state machine (pending/success/failure/retry/cancel/undo), exposed
  only where the command contract supports it, wired into the runtime and surfaced in the UI
  (PLAT-018).

## Demo path / notes

Visible behavior (PLAT-018):

1. `pnpm v2:dev`, open `/scenes/`.
2. Enter a Scene name and click **Create Scene**. While the durable write is in flight the button
   reads "Saving…"; on commit a status line (`data-testid="create-lifecycle"`,
   `data-status="success"`) reports "Scene saved." No partial success is shown before the write
   commits. The Scene then appears in the list and survives reload (existing CANVAS-001 behavior).
3. The lifecycle state is owned by the runtime/Processing Core (`runtime.lastLifecycle`), not an
   ad-hoc UI flag. On a durable-write failure the same surface shows a `failure` status with
   retry guidance and rolls back in-memory state.

Boundary enforcement (PLAT-006/011/012) is developer-facing and demonstrated by tests:

- `pnpm v2:lint` passes on the clean tree and fails closed on a planted violation
  (`apps/v2/app/tests/unit/boundary-lint.test.ts`).

## Requirement traceability

| Req      | Statement (abridged)                                                                                                              | Implementation                                                                                                                                                                                                                                                                                                                                                                             | Tests                                                                                                                                                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PLAT-006 | All persistence routes through typed storage adapters; no direct FS/IndexedDB/cloud/native from GUI                               | `apps/v2/app/src/lib/platform/storage/scene-store.ts` (`storagePort`, the single Dexie/IndexedDB module); `runtime.newId()` replaces a direct `crypto.randomUUID` in `routes/scenes/+page.svelte`; `routes/settings/+page.svelte` now uses `lib/platform/capabilities.ts` instead of raw `indexedDB`/`navigator`; lint rules in `scripts/v2-boundary-lint.ts` (`PLATFORM_PRIMITIVE_RULES`) | `apps/v2/app/tests/unit/boundary-lint.test.ts` (planted Dexie/indexedDB/localStorage/Capacitor violations caught; comment/string mentions ignored); `apps/v2/app/tests/unit/storage-boundary.test.ts` (port exposes only named methods)                                                                     |
| PLAT-007 | Every IPC/platform-service boundary needs named methods, runtime schemas, payload size limits, enum allowlists, structured errors | `apps/v2/packages/core/src/platform/service-boundary.ts` (`createPlatformServiceRegistry`, `validatePlatformRequest`, `PLATFORM_SERVICE_METHODS`, `DEFAULT_MAX_PAYLOAD_BYTES`); `apps/v2/packages/core/src/schemas/platform-service.ts`; wired into `scene-store.ts#persistFullState` with a structured `PlatformBoundaryRejectionError`                                                   | `apps/v2/packages/core/tests/platform-service-boundary.test.ts` (unknown method, malformed payload, oversized payload incl. UTF-8 byte counting, non-serializable, size-before-schema order); `apps/v2/app/tests/unit/storage-boundary.test.ts` (real path rejects malformed before writing)                |
| PLAT-011 | Type-only contracts vs runtime constructors/validators in separate modules, enforced by lint + tests                              | `apps/v2/packages/core/src/contracts/platform-boundary.contract.ts` (type-only); runtime in `platform/service-boundary.ts` + `schemas/platform-service.ts`; lint rule `scanTypeOnlyModule` flags runtime exports under `contracts/` or `*.contract.ts`                                                                                                                                     | `apps/v2/packages/core/tests/type-runtime-split.test.ts` (contract modules export only types; contract namespace yields no runtime values; runtime module exports constructors); `boundary-lint.test.ts` (planted `export const`/`export function` in a contract module caught)                             |
| PLAT-012 | Direct platform/FS access exceptions explicit, scoped, owned, linted, regression-tested                                           | `apps/v2/app/platform-access-exceptions.json` (owner, rationale, allowed primitives, removal criteria per entry) + `platform-access-exceptions.schema.json`; lint loads/validates the manifest and only allows allowlisted files                                                                                                                                                           | `boundary-lint.test.ts` (same file fails closed without the exception, passes with it; manifest missing-owner rejected; real manifest entries complete, owned, and point at existing files)                                                                                                                 |
| PLAT-018 | User-visible durable commands expose pending/success/failure/retry/cancel/undo where the contract supports them                   | `apps/v2/packages/core/src/lifecycle/command-lifecycle.ts` (state machine + `UNDOABLE_COMMAND_TYPES` mapping forward→inverse command); wired into `runtime.svelte.ts#dispatch` and surfaced in `routes/scenes/+page.svelte`                                                                                                                                                                | `apps/v2/packages/core/tests/command-lifecycle.test.ts` (AC1 failure clears pending/no partial success/retry; AC3 cancel appends no op; AC2 undo only for undoable types, no fabricated undo for append-only/transition commands); `apps/v2/app/tests/e2e/scene-create.spec.ts` (visible success lifecycle) |

### PLAT-018 command lifecycle coverage (which commands expose which states)

All durable commands expose draft/pending/success/failure/retry/cancel. Undo is exposed only where
a deterministic inverse command exists in the core command model (no fabricated undo):

| Forward command                                | Undo via                     | Undoable |
| ---------------------------------------------- | ---------------------------- | -------- |
| `scene.add-widget`                             | `scene.destroy-widget`       | yes      |
| `session.project-player-view`                  | `session.revoke-player-view` | yes      |
| `widget.package.install`                       | `widget.package.remove`      | yes      |
| `widget.package.enable`                        | `widget.package.disable`     | yes      |
| `widget.package.disable`                       | `widget.package.enable`      | yes      |
| `session.record-dice` (append-only)            | —                            | no       |
| `session.set-workflow` (state transition)      | —                            | no       |
| `session.update-combat` (state transition)     | —                            | no       |
| `scene.set-sections` (no recorded inverse yet) | —                            | no       |
| all other commands                             | —                            | no       |

## Tests run (all pass)

- `pnpm v2:check` (workpack validate + boundary lint + typecheck + core/app unit tests): PASS.
  - `pnpm v2:workpack:validate`: PASS.
  - `pnpm v2:lint`: PASS (clean tree).
  - `pnpm v2:typecheck`: 0 errors (core `tsc --noEmit`; app `svelte-check` 562 files, 0 errors/warnings).
  - `@dndtools/v2-core` Vitest: 31 files, 326 tests PASS (was 294; +32 added).
  - `@dndtools/v2-app` Vitest: 10 files, 44 tests PASS (was 28; +16 added).
- Playwright `apps/v2/app/tests/e2e/scene-create.spec.ts` (desktop-chromium): 6 passed (incl. new PLAT-018
  lifecycle test).
- Playwright regression smoke `widget-library` + `diagnostics` + `command-center`
  (desktop-chromium): 11 passed, 1 pre-existing slim-profile skip. No regressions.

## Quality review

- Correctness: every mapped acceptance criterion is implemented and has at least one negative test
  proving the gate fails on a real violation.
- Architecture: obeys ADR-014 and the architecture contracts. Core has no GUI/platform/v1 imports
  (existing core boundary lint still passes). The GUI dispatches commands and calls named storage
  port methods; it never mutates durable state directly. No v1 runtime imports were added or needed.
- Tests: unit (core boundary, lifecycle, type-runtime split, platform-service), integration
  (storage adapter boundary against the real Dexie path), boundary regression (planted violations),
  and e2e (visible lifecycle). UTF-8 byte counting and rule-ordering edge cases covered.
- a11y: the new lifecycle status uses `aria-live="polite"` and `role="status"`/`role="alert"`.
- Performance: validation is O(payload) JSON serialize + Zod parse on the persistence path only;
  the size check short-circuits before schema parsing. No hot-loop additions.
- Security: the platform-service boundary fails closed on unknown methods, oversized,
  non-serializable, and malformed payloads before any business logic — directly addressing the
  PLAT-007 IPC injection/type-confusion source defect class.
- Permissions/persistence/sync: no changes to permission, visibility, or sync semantics. The
  storage adapter's existing "no durable change without an accepted operation" invariant is
  preserved and now sits behind the validated boundary. Local-first behavior unchanged.
- Maintainability: small typed modules; the lint was extended in place (not a parallel system);
  the exception manifest is data-driven, schema-validated, and regression-tested.
- Docs: this completion file; inline rationale comments on every new boundary/exception.

## Known gaps / deferred items

- The platform-service boundary currently guards the browser-local storage adapter (the only
  cross-boundary surface in the prototype per ADR-014). Electron/MCP IPC channels are out of scope
  for the prototype; the contract is the seam they will reuse unchanged when those shells enter v2
  scope.
- Cancel/undo are modeled in the lifecycle state machine and proven by tests, but the only
  user-visible lifecycle surface wired in the GUI this epic is the Scene-create success/failure
  path. Wiring visible undo affordances onto each undoable command's GUI control is left to the
  owning feature epics (the contract and inverse mappings are in place for them to consume).
- `scene.set-sections` has no recorded inverse command yet, so it is intentionally not marked
  undoable rather than fabricating one.

## Stop conditions

None hit. The v2 stack ADR (014) is Accepted and consistent with the approach; no v1 runtime
imports were required; no hidden visibility/permission/sync/persistence behavior was ambiguous; the
generated workpack validates; `git status --short` showed no unrelated overlapping changes.

## Git evidence

Workpack status: `complete` after running
`pnpm v2:workpack:complete -- --epic PLAT-persistence-and-boundaries` (re-validated clean).

- Branch: `epic/PLAT-persistence-and-boundaries`
- Base: `23fc56f` (prior completed epic HEAD)
- Commit: recorded at handoff (this file is committed with the epic work).
- Final `git status --short` after the epic commit: clean (empty) — no untracked or unstaged
  files caused by this epic. The full output is captured in the handoff report.
