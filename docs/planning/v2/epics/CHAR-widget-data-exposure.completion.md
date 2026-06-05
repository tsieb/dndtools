# CHAR-widget-data-exposure — Completion Evidence

Epic: `CHAR-widget-data-exposure` — CHAR: Widget data exposure
Requirement IDs: CHAR-006
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 4 (Scene and Widget Contract)
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CHAR-widget-data-exposure`.

## Summary

CHAR-006 EXTENDS the existing character→widget binding exposure into a STABLE, STRUCTURED, ENUMERABLE
data-exposure contract a widget binds to — it does NOT build a parallel binding system. The work is
built entirely on the prior v2 surfaces:

- the existing widget binding model + resolver with explicit `available`/`hidden`/`conflicted`/`missing`
  states (`apps/v2/packages/core/src/queries/binding.ts` `resolveWidgetBinding`),
- the existing character→widget binding bridge
  (`apps/v2/packages/core/src/queries/character-bindings.ts` `buildCharacterDataEnvironment`),
- the character model field groups: combat (`apps/v2/packages/core/src/state/character-state.ts`),
  resources/spell-slots (`apps/v2/packages/core/src/state/character-resources.ts`), ability scores and
  the open `data` sheet block (skills / equipment / notes),
- the PERM visibility model that the resolver already enforces per actor (entity visibility +
  field-level `dmOnlyFields`).

The new module `apps/v2/packages/core/src/queries/character-exposure.ts` defines:

1. A COMPREHENSIVE, actor-independent bindable value (`characterExposureValue`) covering EVERY CHAR-006
   field group — HP, resources, conditions, spell slots, abilities, skills, equipment, and visible
   notes — derived from the canonical character model (with derived spell-slot/class-resource
   availability). The existing `characterBindingRecord` now sources its value + hidden-selectors from
   this module, so there is a SINGLE bindable-value source (no parallel model).
2. An ENUMERABLE, typed contract of the supported binding selectors per field group
   (`CHARACTER_EXPOSURE_PATHS`, grouped by `CharacterExposureFieldGroup`). Widgets bind to a documented
   selector rather than reaching into raw character internals.
3. An actor-filtered resolver wrapper (`resolveCharacterExposure`) that validates the selector against
   the published contract FIRST — an unknown/unsupported selector on an existing character FAILS CLOSED
   to `missing` (indistinguishable from a deleted target) — then delegates to the existing resolver so
   visibility filtering, field redaction, conflict, and missing detection are unchanged. A non-DM
   binding to a hidden character still resolves to `hidden` BEFORE the unsupported-selector check, so an
   unsupported selector never reveals existence.

Pure Processing-Core policy (Contract 1): the exposure value, the contract, the hidden-selector
expansion, and the resolver wrapper are deterministic functions over plain data. No GUI reaches raw
character state; the GUI dispatches the selector and renders the resolver's computed state (Contract 4
Widget Data Contract). Boundary lint stays green; no v1 imports.

The work also closes a latent gap in the prior bridge: `Character.dmOnlyFields` declared as
`data.<key>`/`combat.<key>` are now expanded (`characterHiddenSelectors`) so the resolver redacts the
DM-only value in BOTH its namespaced and flat-key forms.

## Demo path

1. `pnpm v2:dev`, open `/characters/`.
2. As the DM (default actor), quick-create a `player-visible` character "Aria" (HP 8, AC 14) and a
   `dm-only` character "Hidden Horror" (HP 99). The **Character data exposure** panel lists the
   published binding-path contract grouped by field group (HP, resources, conditions, spell slots,
   abilities, skills, equipment, notes).
3. In the panel, select "Aria" and the `combat.hp` binding path: the state shows **available** and the
   value `8`. Select the `combat.secretPlan (unsupported)` path: the state shows **missing** — the
   path is not in the contract (fail closed).
4. Select "Hidden Horror" + `combat.hp`: as the DM, the state is **available** with value `99`.
5. Use the header **view as** control to switch to `Test Player`: the dm-only "Hidden Horror" is no
   longer a bind target (the picker omits it), and its secret HP `99` appears nowhere on the page
   (actor-filtered non-leak, AC2). Only "Aria" remains bindable.
6. Switch to `Test Observer`: the exposure panel shows the empty state — no characters are bindable.

## Implementation → requirement traceability

### CHAR-006 — structured, stable, enumerable data-exposure API (S01 T01/T02)

- THE exposure contract + comprehensive bindable value + fail-closed resolver wrapper:
  `apps/v2/packages/core/src/queries/character-exposure.ts`
  (`CHARACTER_EXPOSURE_PATHS`, `CharacterExposureFieldGroup`, `CharacterExposurePath`,
  `SUPPORTED_EXPOSURE_SELECTORS`, `isSupportedExposureSelector`, `exposurePathsForGroup`,
  `characterExposureValue`, `characterHiddenSelectors`, `resolveCharacterExposure`,
  `ExposedSpellSlotLevel`, `ExposedClassResource`).
- The existing character→widget binding bridge now sources its value + hidden-selectors from the
  exposure module (single source, no parallel system):
  `apps/v2/packages/core/src/queries/character-bindings.ts` (`characterBindingRecord`).
- Public API exports: `apps/v2/packages/core/src/index.ts`.
- GUI demonstration surface (renders the contract + resolves per active actor; dispatches/renders only,
  Contract 1): `apps/v2/app/src/lib/gui/CharacterDataExposure.svelte`, mounted in
  `apps/v2/app/src/routes/characters/+page.svelte`.

### CHAR-006 AC1 — a bound HP value updates after a command

- Proven in the unit suite ("a bound HP value updates after a command mutates it"): an
  `character.update-combat-resource` HP command changes the resolved `combat.hp` exposure value from 18
  to 13 in `apps/v2/packages/core/tests/character-widget-data-exposure.test.ts`. The exposure value is
  recomputed from durable state after the command, so the widget receives the updated actor-scoped HP.

### CHAR-006 AC2 — a hidden character field is omitted in a player context

- Proven in the unit suite ("a player gets the visible groups but the DM-only field is omitted"): a
  player resolving `combat.hp` on a player-visible character gets the value, but the DM-only `dmNotes`
  field never appears (in EITHER addressable form), and binding directly to `data.dmNotes` resolves to
  `hidden`/`field-hidden` with the secret text absent from the serialized result. A `dm-only` character
  resolves to `hidden`/`dm-only` for player AND observer (indistinguishable from missing). Enforced in
  the e2e by the player picker omitting the dm-only character entirely.

## Tests (T03)

- New core unit suite (13 tests, all passing):
  `apps/v2/packages/core/tests/character-widget-data-exposure.test.ts` — contract stability +
  enumerability across all field groups; every field group resolving through the exposure API for the
  DM; the HP-updates-after-command AC1; actor-filtered non-leak for DM-only fields and dm-only
  characters (player AND observer), with hard "secret value absent from serialized output" assertions;
  unknown-selector-on-hidden-character still resolves to `hidden` (no existence probe); conflicted
  (same-path unresolved conflict) and missing (deleted/never-known target) states; unknown/unsupported
  selector fail-closed to `missing`; and parity with the existing resolver for a supported selector.
- New e2e suite (5 tests × 2 projects = 10, all passing on desktop-chromium AND mobile-chromium):
  `apps/v2/app/tests/e2e/character-widget-data-exposure.spec.ts`.

## Quality gate results

- `pnpm lint` (eslint + lint:navigation + lint:tokens + audit:repo) — PASS.
- `pnpm docs:validate` — PASS.
- `pnpm v2:typecheck` — 0 errors (core + app).
- `pnpm v2:lint` (boundary) — PASS.
- `pnpm v2:gates` — PASS (7 gates owned/budgeted/wired).
- Core unit suite — 906 passed (68 files), including the 13 new tests.
- App unit suite — 55 passed (12 files).
- `pnpm --filter @dndtools/v2-app exec playwright test` — full run on BOTH desktop-chromium and
  mobile-chromium: 274 passed, 18 skipped (intentional project-scoped skips), 0 failed (the prior green
  base of 264 passed + the 10 new exposure tests).
- `pnpm v2:workpack:validate` — passed before and after `complete`.

## Quality review

- Correctness: every mapped acceptance criterion (AC1 HP-updates-after-command; AC2 hidden-field
  omitted) is covered by unit and e2e tests; each field group resolves; non-leak negative cases assert
  the secret value is absent from serialized output and the player picker.
- Architecture: pure Processing-Core exposure contract + value transform + resolver wrapper; the GUI
  dispatches a selector and renders the resolver's computed state; no GUI reaches raw character state;
  no v1 imports; boundary lint green (ADR-014, Contract 1, Contract 4).
- Tests: unit (13) + e2e (5 × 2 profiles) with hard non-leak assertions across field groups, DM-only
  fields, dm-only characters, conflicted, missing, and unknown-path fail-closed.
- Accessibility: the demo panel is a stacked `section`/`form`/`ul` with labelled `select` controls,
  `optgroup`-grouped binding paths, and explicit hidden/conflicted/missing status text; renders
  identically on desktop and compact profiles (e2e on both); navigation + token lints pass.
- Performance: pure O(field groups + characters) projection; derived availability computed without
  extra storage; no new heavy work.
- Security / permissions: the exposed value is ALWAYS filtered for the binding's actor through the
  existing resolver (visibility before value); an unknown/unsupported selector fails closed; a non-DM
  binding to a hidden character resolves to `hidden` before the unsupported-selector check, so existence
  is not probeable; the latent dmOnlyFields-redaction gap (namespaced vs flat key) is closed.
- Persistence / sync: no new durable state — the exposure API is a read transform over the existing
  durable character document; the AC1 HP update flows through the existing combat-resource command +
  op-log; older vaults hydrate safely (resources/data default to empty).
- Offline: pure local-first transform/resolution; no network dependency introduced.
- UX: empty (no bindable characters) / hidden / conflicted / missing / available states are all
  rendered; the published contract is shown so the binding surface is discoverable.
- Maintainability: one small typed module that EXTENDS the binding bridge (no parallel model), reusing
  the existing resolver, character model, and PERM visibility; the bindable value now has a single
  source; no unrelated refactors.
- Docs: this completion file; generated planning files updated via the workpack commands.

## Gaps / deferred

- The exposure contract surfaces the canonical field groups the model carries today. Richer per-skill /
  per-equipment structured shapes remain on the open `data` block (text/array) for the prototype; a
  future CHAR/inventory epic can promote those to first-class structured state without changing this
  contract's addressing scheme.
- `degraded` (denied host permissions) remains a widget-host state decided by the GUI host, not this
  data-layer resolver, exactly as documented in `binding.ts` — unchanged by this epic.
- Live subscription/sync-stream delivery of updated bound values is deferred to the sync/collaboration
  epics per ADR-014 (single-device, local-first first prototype); the data-layer guarantee (the
  resolved value recomputes from durable state, never serving a stale or now-hidden value) is complete.

## Stop conditions

- None hit. The v2 stack ADR (ADR-014) supports the approach; no v1 runtime imports were required;
  visibility/permission behavior was unambiguous (reused the existing resolver + PERM model); the
  generated workpack validates; `git status --short` showed no unrelated overlapping changes.

## Git

- Branch: `epic/CHAR-widget-data-exposure` (created from the prior epic HEAD
  `761246862929f367eae6653da20adc0546c1e1b1` — `epic/CHAR-party-and-player-records`, not master).
- Commit: `31db9b0` (`feat(v2): complete CHAR-widget-data-exposure epic`). This follow-up docs commit
  records the exact SHA.
- Final `git status --short`: clean (empty) after the completion commit.
