# CONTENT-visibility-and-embeds — Completion Evidence

Epic: `CONTENT-visibility-and-embeds` — CONTENT: Visibility and embeds
Requirement IDs: CONTENT-009, CONTENT-010
Architecture contracts: Contract 1 (Processing / Display Decoupling); Contract 3 (Role, Visibility &
Permission Grant Model); Contract 4 (Scene and Widget Contract) + the standing v2 architecture
contracts and ADR-014.
Workpack status: `complete` after `pnpm v2:workpack:complete -- --epic CONTENT-visibility-and-embeds`.

## Summary

This epic delivers the VISIBILITY + EMBEDS capability branch ENTIRELY on top of the EXISTING content
model, the EXISTING PERM visibility-filter precedence engine, and the EXISTING widget binding model. It
introduces NO parallel visibility, precedence, or embed system, and NO clone of target data anywhere:

- **CONTENT-009 (granular visibility, dm-only default):** the DM authors visibility at ENTITY, SECTION,
  and FIELD granularity for notes and structured objects. The entity-level default already existed
  (`content.set-item-visibility`); this adds SECTION and FIELD overrides. Read-time precedence is the
  REUSED PERM-002/003 engine: field > section > entity, with hidden-ancestor-wins. Default/unspecified
  visibility fails closed to the entity default, which itself fails closed to `dm-only`.
- **CONTENT-010 (embeds BY REFERENCE — security crux):** an authorized editor embeds OBJECT CARDS, NOTE
  SECTIONS, and ENTITY RENDER BLOCKS in note content, and the same content-item entities back Scene
  widgets — WITHOUT cloning the target's data into the host. The embed stores ONLY a reference (target
  id + projection + optional section id). The embedded content is RESOLVED AT READ against the LIVE
  target through the actor-filtered query, so it always reflects the target's CURRENT data AND the
  VIEWER's OWN permission to the TARGET (not the host note's visibility). A player viewing a note that
  embeds a `dm-only` object/section sees the generic fail-closed UNAVAILABLE placeholder with zero leak.

All policy is PURE deterministic Processing-Core code; durable writes funnel through new `content.*`
commands (op-log + lifecycle), so the durable write re-checks authorization fail-closed. The GUI
dispatches intents and renders the actor-resolved visibility/embed models; it never touches storage
(Architecture Contract 1). Boundary lint stays green; no v1 imports.

## Reused existing building blocks (no re-implementation)

- **PERM visibility-filter precedence (CONTENT-009 IS this applied to content):**
  `apps/v2/packages/core/src/permissions/visibility-filter.ts` — `filterEntityForActor`,
  `evaluateVisibility`, `EntityVisibilityMetadata` (field > section > entity, hidden-ancestor-wins,
  `dm-only` fail-closed default, `shared` delivery via `sharedWith`/viewer grant). The new
  `contentItemVisibilityMetadata` bridge maps a content item into this engine; precedence is NOT
  reinvented.
- **The MAP-008 embed-BY-REFERENCE + generic "unavailable" pattern:**
  `apps/v2/packages/core/src/state/map-nesting.ts` (`MapEmbed` reference + transform; hidden child →
  generic unavailable; NO cloning). `ContentEmbed` mirrors this one-for-one (reference + projection).
- **The widget binding model (entity-backed Scene widgets):**
  `apps/v2/packages/core/src/queries/binding.ts` (`resolveWidgetBinding`, `WidgetDataEnvironment`,
  `EntityBindingRecord`, `hidden`/`missing`/`conflicted` states) and
  `apps/v2/packages/core/src/queries/scene.ts` (`getSceneForActor`). The new
  `buildContentWidgetDataEnvironment` lets a content-item-bound Scene widget resolve through the SAME
  binding model — a scene widget is an embed in scene context (Contract 4).
- **The content model + actor-filtered query + authorized-editor write model:**
  `apps/v2/packages/core/src/state/content.ts`, `apps/v2/packages/core/src/queries/content-query.ts`,
  `apps/v2/packages/core/src/commands/content.ts` (the `actorMayEditItem` rule, the `content.*` op +
  invalidation-event envelope, the soft-delete tombstone).
- **The consistency audit (CONTENT-009 AC4):**
  `apps/v2/packages/core/src/permissions/consistency.ts` (`auditEntityPermissionConsistency`,
  `write-grant-on-hidden-content`).

## Files changed

### Core (Processing Core — pure policy)

- `apps/v2/packages/core/src/state/content.ts` — added `ContentEmbed`/`ContentEmbedKind`, the granular
  visibility fields (`sectionVisibility`, `fieldVisibility`, `fieldSections`) and `embeds` to
  `ContentItem`; the `contentItemVisibilityMetadata` bridge to the PERM engine; pure reducers
  `setContentSectionVisibility`, `setContentFieldVisibility`, `addContentEmbed`, `removeContentEmbed`;
  fail-closed hydration backfill in `ensureVaultContentState` for older persisted records.
- `apps/v2/packages/core/src/queries/content-query.ts` — added `getContentItemDetailForActor` (the
  granular SECTION/FIELD actor-filtered detail read, reusing `filterEntityForActor`) and the
  `CONTENT_FIELD_PATH_PREFIX` / `contentFieldPath` field-path convention.
- `apps/v2/packages/core/src/queries/content-embed.ts` — NEW. `resolveContentEmbedForActor` /
  `resolveContentEmbedsForActor` (the actor-filtered embed-by-reference resolver: live target,
  per-viewer permission, generic non-leaking `unavailable` placeholder) and
  `buildContentWidgetDataEnvironment` (content-item-backed Scene widget binding environment).
- `apps/v2/packages/core/src/commands/content-visibility-embeds.ts` — NEW. The four command handlers
  (`content.set-section-visibility`, `content.set-field-visibility`, `content.add-embed`,
  `content.remove-embed`): fail-closed authorized-editor authority, target-exists validation (no
  dangling reference), durable op-log writes, invalidation events.
- `apps/v2/packages/core/src/schemas/commands.ts` — added the Zod request schemas
  (`setContentSectionVisibilityInputSchema`, `setContentFieldVisibilityInputSchema`,
  `addContentEmbedInputSchema`, `removeContentEmbedInputSchema`).
- `apps/v2/packages/core/src/commands/types.ts` — added the four command-type union members, the
  `content.embed-changed` event, and the `content-embed-not-found` rejection code.
- `apps/v2/packages/core/src/commands/dispatch.ts` — wired the four handlers into `dispatchCommand`.
- `apps/v2/packages/core/src/index.ts` — exported the new content state types/reducers, the granular
  detail view + field-path helpers, and the embed resolver + widget-data-environment builder.
- `apps/v2/packages/core/src/state/content-import.ts` — carry granular visibility + embeds across an
  import overwrite (mirrors the existing dateFields/timelineRefs preservation).

### App (GUI — dispatches intents, renders the actor-resolved model)

- `apps/v2/app/src/lib/gui/ContentVisibilityEmbeds.svelte` — NEW. The granular-visibility + embeds
  surface: the DM seeds a dm-only target object + a player-visible host note, authors a dm-only
  section + field on the host, and embeds the target as an object card. Renders the actor-filtered
  detail (visible sections/fields) and the actor-resolved embeds (card or non-leaking "unavailable").
- `apps/v2/app/src/routes/knowledge/+page.svelte` — mounted `ContentVisibilityEmbeds` and updated the
  section requirement-coverage comment.

### Tests

- `apps/v2/packages/core/tests/content-granular-visibility.test.ts` — NEW. CONTENT-009 unit coverage.
- `apps/v2/packages/core/tests/content-embeds.test.ts` — NEW. CONTENT-010 unit coverage.
- `apps/v2/packages/core/tests/content-export.test.ts` — updated the test item builder for the new
  `ContentItem` fields.
- `apps/v2/app/tests/e2e/content-visibility-and-embeds.spec.ts` — NEW. CONTENT-009/010 e2e on both
  Playwright projects.

### Generated planning (via workpack commands only — not hand-edited)

- `docs/planning/v2/workpack-state.yaml`, `docs/planning/v2/status.yaml`,
  `docs/planning/v2/epics/CONTENT-visibility-and-embeds.yaml`.

## Traceability — requirement → code → tests

### CONTENT-009 — granular visibility, dm-only default

| Acceptance criterion | Code | Tests |
| --- | --- | --- |
| AC1 player-visible note + dm-only section ⇒ section omitted for player | `apps/v2/packages/core/src/state/content.ts` (`setContentSectionVisibility`, `contentItemVisibilityMetadata`), `apps/v2/packages/core/src/queries/content-query.ts` (`getContentItemDetailForActor`) | `apps/v2/packages/core/tests/content-granular-visibility.test.ts` ("a player-visible note with one dm-only section omits that section"), `apps/v2/app/tests/e2e/content-visibility-and-embeds.spec.ts` ("a player sees only the player-visible section/field") |
| AC2 no metadata ⇒ non-DM treated as dm-only | `apps/v2/packages/core/src/permissions/visibility-filter.ts` (`DEFAULT_VISIBILITY`), `apps/v2/packages/core/src/state/content.ts` (`buildContentItem` defaults) | `apps/v2/packages/core/tests/content-granular-visibility.test.ts` ("an item with NO granular metadata is dm-only for a non-DM") |
| AC3 section shared with Player A ⇒ A only, not B | `apps/v2/packages/core/src/permissions/visibility-filter.ts` (`shared` rule + `sharedWith`), `apps/v2/packages/core/src/state/content.ts` (`setContentFieldVisibility`/`setContentSectionVisibility`) | `apps/v2/packages/core/tests/content-granular-visibility.test.ts` ("a section shared with Player A is delivered to A and not to B") |
| AC4 write grant on hidden section ⇒ consistency error + still no read/write | `apps/v2/packages/core/src/permissions/consistency.ts` (`auditEntityPermissionConsistency`, `write-grant-on-hidden-content`), `apps/v2/packages/core/src/queries/content-query.ts` (read still denied) | `apps/v2/packages/core/tests/content-granular-visibility.test.ts` ("surfaces a write-grant-on-hidden-content error and the player still cannot read or write") |

Additional CONTENT-009 unit coverage: field>section>entity precedence with hidden-ancestor-wins,
clearing a section override re-inherits the entity, fail-closed coercion of a malformed level, and
observer authoring rejection — all in `apps/v2/packages/core/tests/content-granular-visibility.test.ts`.

### CONTENT-010 — embeds by reference (no clone, no leak)

| Acceptance criterion | Code | Tests |
| --- | --- | --- |
| AC1 embed reflects target current data after change | `apps/v2/packages/core/src/queries/content-embed.ts` (`resolveContentEmbedForActor` resolves the live target) | `apps/v2/packages/core/tests/content-embeds.test.ts` ("the resolved embed reflects the target CURRENT data after the target changes"), e2e ("the DM sees ... the embedded target card") |
| AC2 target hidden from actor ⇒ non-leaking unavailable placeholder | `apps/v2/packages/core/src/queries/content-embed.ts` (`UnavailableEmbed`, coarsened reason, no target id/title/fields), `apps/v2/packages/core/src/queries/binding.ts` (Scene-widget `hidden`) | `apps/v2/packages/core/tests/content-embeds.test.ts` ("a player ... gets unavailable, no leak"; "entity-backed Scene widget" hidden), e2e ("a player viewing the host sees the embed as unavailable — no target leak") |
| AC3 note references a Scene widget ⇒ stores only a link/embed reference, no widget instance outside a Scene | `apps/v2/packages/core/src/state/content.ts` (`ContentEmbed` stores only a reference), `apps/v2/packages/core/src/commands/content-visibility-embeds.ts` (op-log records only the reference) | `apps/v2/packages/core/tests/content-embeds.test.ts` ("the stored host content carries ONLY a reference, never the target data" — HARD serialize-and-assert on the host item AND the op-log) |

Additional CONTENT-010 unit coverage: a broken (deleted-target) reference resolves `unavailable`
without throwing; embedding a non-existent target is rejected; a `note-section` embed requires a
section id; an observer cannot embed; removing an embed never deletes the target — all in
`apps/v2/packages/core/tests/content-embeds.test.ts`.

## Demo

Path: start the v2 app (`pnpm v2:dev`), open `/knowledge/`, scroll to the "Granular visibility &
embeds" section (`data-testid="visibility-embeds"`).

1. As the DM (default actor), click "Set up the demo briefing". This creates a `dm-only` target object
   ("Lich Phylactery", with a secret `trueName` field), a `player-visible` host note ("Region
   Briefing"), makes the host's `gm-secrets` section and `dmHook` field `dm-only`, and embeds the
   target into the host as an object card.
2. As the DM you see BOTH the `overview` and `gm-secrets` sections, BOTH the `summary` and `dmHook`
   fields, and the embedded "Lich Phylactery" card with its `Azalin` field — the embed resolves the
   live `dm-only` target because the DM may see it.
3. Switch the "View as" header control to "Demo Player". The host note is still visible (it is
   `player-visible`), but the `gm-secrets` section and `dmHook` field are GONE, and the embed now
   renders "This embedded content is unavailable to you." — no target title or secret value appears
   anywhere in the DOM.
4. Reload: the granular visibility and the embed survive (durable IndexedDB write).

Requirement IDs exercised by the demo: CONTENT-009, CONTENT-010.

## Tests run (this epic)

- `pnpm lint` — PASS (full: `eslint .` + `lint:navigation` 132 files + `lint:tokens` 132 files +
  `audit:repo` 5 tests). 0 failures.
- `pnpm docs:validate` — PASS (see Validation below).
- `pnpm v2:typecheck` — PASS, 0 errors (core `tsc` + app `svelte-check` 704 files, 0 errors/warnings).
- `pnpm v2:lint` — PASS (v2 boundary lint; no v1 imports, no core→GUI imports).
- `pnpm v2:gates` — PASS (7 gates owned/budgeted/wired).
- Core unit suite (`vitest run` in `@dndtools/v2-core`) — PASS, 83 files, 1151 tests (includes the two
  new files: `apps/v2/packages/core/tests/content-granular-visibility.test.ts` 8 tests +
  `apps/v2/packages/core/tests/content-embeds.test.ts` 10 tests).
- App unit suite (`vitest run` in `@dndtools/v2-app`) — PASS, 12 files, 55 tests.
- `pnpm --filter @dndtools/v2-app exec playwright test` — PASS on BOTH projects (desktop-chromium AND
  mobile-chromium): 348 passed, 18 intentional project-scoped skips, 0 failed. (Base was 338 passed +
  18 skips; this epic adds 5 specs × 2 projects = 10 passing tests.)
- `pnpm v2:workpack:validate` — PASS before and after `complete` (no drift).

## Quality review

- **Correctness:** every CONTENT-009/010 acceptance criterion is implemented and test-covered, with
  fail-closed negative cases (unknown actor, hidden ancestor, malformed level, broken reference,
  non-existent target, observer authoring).
- **Architecture:** pure Processing-Core policy (visibility precedence reuses `filterEntityForActor`;
  embed resolution is a pure deterministic function over the live target). Durable writes go through
  new `content.*` commands → op-log; the GUI dispatches intents and renders the actor-resolved model
  and never touches storage. Boundary lint green; no v1 imports.
- **Tests:** unit (precedence + dm-only default; embed-by-reference no-clone with HARD serialize
  assertions; actor-resolved non-leak; entity-backed Scene widget) + e2e on both profiles + the
  consistency-error path for AC4.
- **Accessibility:** the GUI surface is a stacked card/list with semantic headings, `dl`/`dt`/`dd`
  for fields, and `role="alert"` errors; renders identically on desktop and compact profiles (both
  Playwright projects pass).
- **Performance:** all new reads are pure, linear in items/embeds, with no new index or storage path;
  no new performance budget surface introduced.
- **Security / permissions (the crux):** the embed is resolved against the LIVE target through the
  PERM filter using the VIEWER's permission to the TARGET, not the host's visibility — so a
  player-visible host that embeds a `dm-only` target/section yields the generic `unavailable`
  placeholder with the reason coarsened for non-DMs (existence not probeable). HARD assertions confirm
  the host item AND the op-log store only a reference (no target body/field/title copied anywhere).
- **Persistence:** the content slice (now carrying granular visibility + embeds) persists through the
  existing storage adapter; older records hydrate fail-closed via `ensureVaultContentState`. The e2e
  reload test proves durability.
- **Sync/offline:** every mutation appends an entity-scoped `content.*` op with before/after revision;
  no remote dependency. Visibility/embed changes carry the cross-surface invalidation audience.
- **UX:** loading/empty (`ve-unseeded`), authored (`ve-host`), hidden-host, and per-embed
  unavailable states are all rendered; the seed affordance is a DM-only ergonomic hint (core re-checks).
- **Maintainability:** small typed modules; reuses the existing precedence/embed/binding patterns
  rather than forking them; no unrelated refactors.
- **Docs:** this completion doc; inline module docs reference the reused contracts/requirements.

## Known gaps / deferred items

- Note "sections" are modeled as named visibility scopes the DM publishes/hides over the single
  markdown body (the granularity the requirement needs), rather than a parsed heading tree; a future
  CONTENT slice can attribute body headings to section ids if richer body-section UX is needed.
- Field-level binding redaction for Scene widgets uses entity/field `dm-only` rules; a `shared` field
  on an otherwise visible content-item binding resolves at the entity level (sufficient for the
  CONTENT-010 AC; finer per-field `shared` binding redaction is deferred until a widget needs it).
- No stop condition was hit.

## Git evidence

- Branch: `epic/CONTENT-visibility-and-embeds` (created from `epic/CONTENT-templates-and-snippets`
  HEAD `d156955`, per the chained-epic workflow — NOT from master).
- Commit: recorded in the follow-up docs commit after this evidence file is committed.
- Final `git status --short`: clean (recorded below after the final commit).

```
(clean)
```
