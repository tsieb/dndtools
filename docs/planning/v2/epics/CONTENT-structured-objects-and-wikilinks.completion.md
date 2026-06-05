# CONTENT-structured-objects-and-wikilinks — Completion Evidence

Epic: `CONTENT-structured-objects-and-wikilinks` — CONTENT: Structured objects and wikilinks
Requirement IDs: CONTENT-005, CONTENT-006, CONTENT-013
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 2 (Cloud Sync &
Offline Model — Sync Source Contract, Obsidian/Google Docs rules); Contract 4 (Scene and Widget
Contract — a Scene is NOT a Vault Object) + the standing v2 architecture contracts and ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CONTENT-structured-objects-and-wikilinks`.

## Summary

This epic delivers the STRUCTURED OBJECTS + WIKILINK capability branch on top of the EXISTING CONTENT
model — it adds NO parallel storage model:

- **CONTENT-013 (subtype schema registry):** a typed REGISTRY/CATALOG of the ten initial v2 Vault
  Object subtypes (`note`, `character`, `map`, `handout`, `calendar-event`, `timeline-event`,
  `dice-table`, `encounter`, `audio-preset`, `widget-package-ref`). It REFERENCES the already-built
  models (`character`/`map`/`calendar`) by entity type + schema version rather than re-implementing
  them, and it NEVER registers a `scene` subtype — a Scene stays in `SceneState` (Contract 4).
- **CONTENT-005 (structured Vault Objects):** a Vault Object is a note-backed `ContentItem`
  (`kind: 'object'`) with SCHEMA-VALIDATED frontmatter (fail closed — an invalid object never commits)
  and a deterministic frontmatter ↔ body SYNC rule.
- **CONTENT-006 (wikilink lifecycle):** pure CREATE / RESOLVE / RENAME-propagation / REPAIR over
  `[[wikilinks]]`, PRESERVING per-source conventions (reuses the CONTENT-012 source constraint
  descriptors), all ACTOR-FILTERED and fail-closed (never resolves/renames/suggests a hidden target;
  never a destructive offline rewrite).

All policy is PURE deterministic Processing-Core code; durable writes go through the op-log/lifecycle;
the GUI dispatches intents and renders computed models and never touches storage (Architecture
Contract 1). The character/map/calendar/Scene models are referenced, not modified. Boundary lint stays
green; no v1 imports.

## Reused existing building blocks (no re-implementation)

- The note/frontmatter substrate: `apps/v2/packages/core/src/state/content.ts` (the `ContentItem`
  model + reducers) and `apps/v2/packages/core/src/state/markdown.ts` (`parseMarkdownNote`,
  `serializeMarkdownNote`, `extractWikilinks`).
- The single actor-filtered read path: `apps/v2/packages/core/src/queries/content-query.ts`
  (`getContentItemsForActor`) and the existing wikilink suggestion source
  `apps/v2/packages/core/src/queries/content-search.ts`.
- The per-source constraint descriptors: `apps/v2/packages/core/src/state/content-constraints.ts`
  (`featureSupportForSource`, `ContentSourceId`) — reused for wikilink CREATE source-convention
  handling.
- The existing models REFERENCED (not modified): `apps/v2/packages/core/src/state/character-state.ts`,
  `apps/v2/packages/core/src/state/map-state.ts`, `apps/v2/packages/core/src/state/calendar.ts`,
  `apps/v2/packages/core/src/state/scene-state.ts`.
- The command + durable-write plumbing: `apps/v2/packages/core/src/commands/helpers.ts`,
  `apps/v2/packages/core/src/commands/types.ts`, `apps/v2/packages/core/src/commands/dispatch.ts`,
  and the command lifecycle `apps/v2/packages/core/src/lifecycle/command-lifecycle.ts`.

## CONTENT-013 — Vault Object subtype schema registry

`apps/v2/packages/core/src/state/vault-object-schema.ts`: the typed catalog. `VAULT_OBJECT_SUBTYPES`
enumerates exactly the ten subtypes; each `VaultObjectSchema` declares its frontmatter fields,
fail-closed `dm-only` visibility default, and a `modelReference` pointing at the canonical model. The
`character`/`map`/`calendar-event`/`timeline-event` entries reference
`apps/v2/packages/core/src/state/character-state.ts`, `apps/v2/packages/core/src/state/map-state.ts`,
and `apps/v2/packages/core/src/state/calendar.ts` by entity type + that model's schema version — so the
registry tracks the canonical model rather than duplicating it. Deferred subtypes
(`handout`/`timeline-event`/`dice-table`/`encounter`/`audio-preset`/`widget-package-ref`) carry a
validated frontmatter contract with `modelImplemented: false`. `SCENE_ENTITY_TYPE` + `isSceneEntityType`
let callers assert a Scene is routed back to `SceneState`; there is no `scene` subtype (Contract 4 /
CONTENT-013 AC4).

- AC1 (subtype schema, required fields, visibility defaults, source/revision metadata): the schema set +
  `validateObjectFrontmatter` enforce required fields/types; new objects fail closed to `dm-only`;
  revision/createdAt/updatedAt are enforced by the underlying `ContentItem` model on every accepted op.
- AC2 (unknown subtype rejected, not partially interpreted): `validateObjectFrontmatter` returns
  `unknown-subtype`; the create command rejects fail-closed.
- AC3 (actor-filtered projection omits hidden fields/relationships/revealing metadata):
  `dmOnlyFieldKeys` + `projectObjectFieldsForRole` omit dm-only fields from non-DM projections.
- AC4 (Scene validated through SceneState, not as an object): `isSceneEntityType` +
  `validateObjectFrontmatter('scene', …)` rejects with `scene-not-an-object`; the schema enum in
  `apps/v2/packages/core/src/schemas/commands.ts` rejects a `scene` subtype outright.

## CONTENT-005 — structured Vault Objects (schema-validated frontmatter + body sync)

`apps/v2/packages/core/src/state/vault-object.ts`:

- `validateObjectFrontmatter` — fail-closed validation against the subtype schema (missing required
  field, wrong type, undeclared field, unknown subtype, Scene). Diagnostics are NON-LEAKING (they name
  the field + expectation, never raw values).
- `syncObjectToNote` / `syncNoteToObject` — the deterministic frontmatter ↔ body SYNC rule: the
  frontmatter block is the canonical serialization of the structured fields (reusing
  `serializeMarkdownNote`), the body is the prose beneath. `note → object → note` and
  `object → note → object` are stable fixed points for a valid object.
- `projectObjectFieldsForRole` — the actor-filtered field projection (CONTENT-013 AC3).
- `readObjectSubtype` — reads the namespaced `dndtools.objectSubtype` envelope key.

Durable commands in `apps/v2/packages/core/src/commands/vault-object.ts`
(`handleCreateVaultObject` / `handleUpdateVaultObject`), wired in
`apps/v2/packages/core/src/commands/dispatch.ts`, with payload schemas
`createVaultObjectInputSchema` / `updateVaultObjectInputSchema` in
`apps/v2/packages/core/src/schemas/commands.ts`. Create is DM-only; update allows the DM or an
authorized editor (a player with a write-capable grant). Frontmatter is validated BEFORE any state
change (AC1) and the merged frontmatter is RE-VALIDATED on update, so no invalid revision is committed
(AC2). Each accepted write appends a `content.create-object` / `content.update-object` op and emits a
`content.object-changed` event carrying the cross-surface invalidation audience.

## CONTENT-006 — wikilink lifecycle (create / resolve / rename / repair)

`apps/v2/packages/core/src/state/wikilink-graph.ts` (pure engine):

- `resolveWikilink` — resolves `[[Target#Section]]` against a candidate index, matching title/aliases
  and flagging a present/missing section (AC1).
- `createWikilink` — renders a native `[[…]]` token for sources that preserve wikilinks; a
  non-destructive plain-text fallback for Google Docs (reuses `featureSupportForSource`; AC2 — preserve
  source conventions / avoid destructive rewrite).
- `renamePropagateInBody` — deterministic, idempotent rewrite of every matching link, preserving
  `#section`/`|alias`/surrounding text.
- `detectBrokenLinks` / `applyLinkRepair` — repair detection + apply; a `source-unavailable` broken link
  is reported and NOT rewritten offline (AC3); a fix that does not resolve is refused.

`apps/v2/packages/core/src/queries/wikilink-graph.ts` (actor-filtered surface): builds the candidate
index from `getContentItemsForActor` (visible + live items only), so resolution
(`resolveWikilinkForActor`), broken-link detection (`detectBrokenLinksForActor`), repair
(`applyLinkRepairForActor`), and rename-propagation (`propagateRenameForActor`) operate ONLY over
targets the editor may see — a hidden target is never resolved, renamed, suggested, or rewritten.
Per-item source/availability are read from the namespaced `dndtools.source` /
`dndtools.sourceUnavailable` fields (the durable per-source registration is deferred per ADR-014).

Durable commands in `apps/v2/packages/core/src/commands/vault-object.ts`
(`handleRenameWikilinkTarget` / `handleRepairWikilink`), wired in
`apps/v2/packages/core/src/commands/dispatch.ts`, with schemas `renameWikilinkTargetInputSchema` /
`repairWikilinkInputSchema`. Rename renames the target note's title AND applies the computed
referring-note rewrites; repair rewrites a broken target to a chosen visible/available fix or rejects
(`wikilink-source-unavailable` / `wikilink-fix-unresolved`) without touching the draft (AC3). Events
`content.wikilink-target-renamed` / `content.wikilink-repaired` record exactly what propagated.

## GUI / demo path

`apps/v2/app/src/lib/gui/VaultObjects.svelte`, mounted in `apps/v2/app/src/routes/knowledge/+page.svelte`.

Demo (DM): go to `/knowledge/`.
1. CONTENT-013 — expand "Vault Object subtypes" to see the ten subtypes (no `scene`; `character`/`map`
   show "references …").
2. CONTENT-005 — pick a subtype, fill title + JSON frontmatter + body. A valid object shows
   "Frontmatter is valid." and "Create object" succeeds; dropping a required field shows the invalid
   preview and the core rejects with a schema-validation error (fail closed).
3. CONTENT-006 — seed two notes in the Notes workbench (e.g. `Highmoor` and a `Travel Log` containing
   `[[Highmoor]]`), then "Rename a wikilink target" → rename `Highmoor` to `Castle Highmoor`: the
   summary reports the propagation. "Repair a broken wikilink" detects a typo'd `[[Higmoor]]` and
   rewrites it to a visible note; a non-resolving fix is refused.
Switch the header "view as" to `actor-player`: the entire structured-objects/wikilink authoring surface
disappears (fail closed).

## Tests run

- `pnpm lint` — PASS (full: `eslint .` + `lint:navigation` (132 files) + `lint:tokens` (132 files) +
  `audit:repo` (5 tests)).
- `pnpm docs:validate` — PASS (runs the v2 workpack validator; full repo-relative paths in this doc).
- `pnpm v2:typecheck` — PASS (0 errors; core `tsc --noEmit` + app `svelte-check` 0 errors/0 warnings).
- `pnpm v2:lint` (boundary) — PASS.
- `pnpm v2:gates` — PASS (7 gates owned, budgeted, wired).
- Core unit suite — PASS (79 files, 1088 tests). New: 40 tests across
  `apps/v2/packages/core/tests/content-vault-object-schema.test.ts`,
  `apps/v2/packages/core/tests/content-vault-object.test.ts`,
  `apps/v2/packages/core/tests/content-wikilink-lifecycle.test.ts`.
- App unit suite — PASS (12 files, 55 tests).
- Playwright FULL on BOTH projects (desktop-chromium AND mobile-chromium) — PASS (326 passed, 18
  intentional project-scoped skips, 0 failed). New spec
  `apps/v2/app/tests/e2e/content-objects-and-wikilinks.spec.ts` (5 tests × 2 projects = 10) passes on
  both. One unrelated pre-existing flake in
  `apps/v2/app/tests/e2e/character-party-and-player-records.spec.ts` (CHAR-011) appeared once and passed
  on re-run; the final full run was green on both projects.
- `pnpm v2:workpack:validate` — PASS before AND after `complete` (no drift).

## Traceability (requirement → code → tests)

- CONTENT-013 → `apps/v2/packages/core/src/state/vault-object-schema.ts` →
  `apps/v2/packages/core/tests/content-vault-object-schema.test.ts` +
  `apps/v2/app/tests/e2e/content-objects-and-wikilinks.spec.ts`.
- CONTENT-005 → `apps/v2/packages/core/src/state/vault-object.ts` +
  `apps/v2/packages/core/src/commands/vault-object.ts`
  (`handleCreateVaultObject`/`handleUpdateVaultObject`) →
  `apps/v2/packages/core/tests/content-vault-object.test.ts` +
  `apps/v2/app/tests/e2e/content-objects-and-wikilinks.spec.ts`.
- CONTENT-006 → `apps/v2/packages/core/src/state/wikilink-graph.ts` +
  `apps/v2/packages/core/src/queries/wikilink-graph.ts` +
  `apps/v2/packages/core/src/commands/vault-object.ts`
  (`handleRenameWikilinkTarget`/`handleRepairWikilink`) →
  `apps/v2/packages/core/tests/content-wikilink-lifecycle.test.ts` +
  `apps/v2/app/tests/e2e/content-objects-and-wikilinks.spec.ts`.

## Quality review

- **Correctness:** every mapped acceptance criterion (CONTENT-005 AC1/AC2; CONTENT-006 AC1/AC2/AC3;
  CONTENT-013 AC1–AC4) is implemented and covered by unit + e2e tests, including fail-closed negatives.
- **Architecture:** pure Processing-Core policy; durable writes via op-log; GUI dispatches intents and
  renders computed models (Contract 1). Scene stays in `SceneState` (Contract 4). Source conventions
  reuse the CONTENT-012 descriptors (Contract 2). No parallel storage model; the
  character/map/calendar/Scene models are referenced, not modified. Boundary lint green; no v1 imports.
- **Tests:** unit (subtype validation valid/invalid; body-sync round-trips; registry coverage incl.
  Scene-absent; wikilink create/resolve/rename-propagation/repair + actor-filtering + offline
  fail-closed) + e2e on both profiles.
- **A11y:** the GUI uses labeled form controls, `role="alert"` for errors, and a `<details>` registry —
  consistent with the existing Knowledge surfaces; navigation/token lint pass.
- **Performance:** all operations are O(n) over the actor-visible content set; pure functions, no I/O.
- **Security / permissions:** create is DM-only; update/rename/repair require the DM or an authorized
  editor; observers never qualify; non-leaking diagnostics.
- **Persistence / sync-offline:** every accepted mutation appends a durable, replayable `content.*` op;
  reads are local-first; the offline `source-unavailable` guard refuses destructive rewrites (AC3).
- **UX:** valid/invalid/empty/error states are surfaced; the player view is fail-closed (no affordances).
- **Maintainability:** small typed modules mirroring the existing CONTENT modules; no speculative
  abstractions; transports remain deferred per ADR-014.
- **Docs:** this completion doc + the generated workpack updates.

## Files changed

New:
- `apps/v2/packages/core/src/state/vault-object-schema.ts`
- `apps/v2/packages/core/src/state/vault-object.ts`
- `apps/v2/packages/core/src/state/wikilink-graph.ts`
- `apps/v2/packages/core/src/queries/wikilink-graph.ts`
- `apps/v2/packages/core/src/commands/vault-object.ts`
- `apps/v2/packages/core/tests/content-vault-object-schema.test.ts`
- `apps/v2/packages/core/tests/content-vault-object.test.ts`
- `apps/v2/packages/core/tests/content-wikilink-lifecycle.test.ts`
- `apps/v2/app/src/lib/gui/VaultObjects.svelte`
- `apps/v2/app/tests/e2e/content-objects-and-wikilinks.spec.ts`
- `docs/planning/v2/epics/CONTENT-structured-objects-and-wikilinks.completion.md`

Modified:
- `apps/v2/packages/core/src/commands/types.ts` (new command types, events, rejection codes)
- `apps/v2/packages/core/src/commands/dispatch.ts` (wire the four new handlers)
- `apps/v2/packages/core/src/schemas/commands.ts` (new payload schemas)
- `apps/v2/packages/core/src/index.ts` (export the new modules)
- `apps/v2/app/src/routes/knowledge/+page.svelte` (mount `VaultObjects`)
- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/CONTENT-structured-objects-and-wikilinks.yaml` (generated workpack status).

## Known gaps / deferred items

- The Obsidian / Google Docs TRANSPORTS themselves remain deferred per ADR-014; this epic delivers the
  pure wikilink lifecycle + source-convention handling. Per-item source/availability are read from
  namespaced `dndtools.*` fields until the durable sync-source registration lands.
- The deferred subtypes (`handout`/`timeline-event`/`dice-table`/`encounter`/`audio-preset`/
  `widget-package-ref`) get a validated frontmatter schema entry only; their full feature models are
  owned by later epics.
- No stop condition was hit.

## Git

- Branch: `epic/CONTENT-structured-objects-and-wikilinks` (created from
  `epic/CONTENT-source-specific-constraints` HEAD `fd171cf`).
- Commit: recorded in the follow-up docs commit after `pnpm v2:workpack:complete`.
- Final `git status --short`: clean (recorded below).

```
(clean — to be confirmed after the final commit)
```
