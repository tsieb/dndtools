# Technical Debt Register

Long-lived refactors and deferred architectural work. Each entry carries an ID, severity, impact,
owner, resolution window, targets, and status. Reference IDs in PR descriptions when deferring work;
a `TODO(APP)` that survives a quarter gets an entry here before merge.

## Open

### DEBT-2026-004 — Design-system P2 polish

- Severity: low · Owner: platform · Resolution window: 2026 Q4
- Impact: remaining inconsistencies are limited to secondary configuration and picker surfaces.
- Status: re-scoped to non-primary surfaces — (a) and (d) resolved by RC-DSN-1.1; (b) resolved
  by RC-ENG-8.11. Atlas now composes `LayerRow` inside `LayerPanel`, retaining actor filtering,
  reorder buttons, visibility chips and the focus-preserving enabled switch. The editor dock
  already uses `LayerRow`.
- Import conformance: `app/map/ImportMapDialog.tsx` deliberately composes DS `Dialog`, `Stepper`,
  `SegmentedControl`, fields and navigation buttons. DS `ImportWizard` fixes three pages, owns
  source/adapter state internally and exposes neither file-selection nor calibration hooks;
  the production native flow needs Source/Align/Scale/Walls/Preview/Result. `useImportMap.ts`
  performs pure previews with the asset-size cap and adapter registry; only explicit import
  dispatches writes. `ImportMapSteps.tsx` gates commit on a successful preview, reports dropped
  elements and shows storage/follow-up errors. This conforms to the wizard safety contract
  without replacing the working flow with the three-page demonstration component.
- Remaining (c), by file (paths relative to `apps/gm-react/src/`):
  - `app/map/generate/GeneratePanel.tsx`: optional generator category/preset pickers.
  - `app/map/dock/AssetsPanel.tsx`: asset category/filter pickers in the secondary editor dock.
- These remain low-priority DS consolidation work; primary Atlas/import source and calibration
  selectors, editor mode/tool options, Compendium and Theme Studio already use DS controls.
  Tool rails, map/POI/combatant selection, the widget definition disclosure, favorites and
  multi-select declarations are not single-choice segmented groups and are not part of this debt.

### DEBT-2026-009 — every content command copies every content item

- Severity: medium · Owner: core · Resolution window: 2026 Q4
- Impact: the content reducers open with `ensureContentStateSlice(state.content)`, which runs the
  hydration backfill `ensureVaultContentState` and returns a shallow copy of every item (and a
  re-migrated calendar map) even when nothing needed backfilling. On a 2,000-note vault one
  `content.create-item` hands back 2,010 new item objects with identical fields. Nothing that keys
  on item identity can then reuse work across a command: the persistence boundary re-measures every
  item (RC-ENG-3.2 memoizes by identity), and every memo downstream starts cold. The work is
  proportional to the vault, per command.
- Targets: `packages/core/src/state/content.ts` (`ensureVaultContentState`: keep an item, and the
  item map, when no field needs a default), `packages/core/src/commands/helpers.ts`.
- Status: open — measured by RC-ENG-3.2 (`tests/perf/RC-ENG-3.2-journal.md`), whose owned paths do
  not include the content state module.

## Resolved

- DEBT-2026-007 — built-in system vocabulary translations: resolved by RC-ENG-8.10.
  `vocabularyValues()` localizes the shipped 5e and Generic vocabularies for Spanish, keyed by the
  active package id (passed by `AppSystemProvider`), including regional Spanish locales. A
  `custom:` package keeps its authored words, even an unedited fork whose words equal a built-in's.
  Spanish phrasing accommodates both conjuros and habilidades; provider tests render all fourteen
  affected strings for both packages and cover custom words, forks and locale changes.

- DEBT-2026-008 — parchment's accent text on the accent tint: resolved by RC-ENG-8.9.
  `--color-accent` darkened from `#9a5418` to `#945016` against the unchanged `--color-accent-subtle`
  (`#f0e0c8`), raising the pair from 4.43:1 to 4.74:1; the phase `Seg`, accent `Button`, widget-kit
  `Chip`, `Avatar` initials and accent `Badge` inherit it with no component overrides.
  `scripts/token-contrast-lint.ts` asserts the pair at 4.5:1 or more in all five themes, the Session
  and Extensions theme scans dropped their parchment exceptions, and the parchment captures were
  re-baselined in the pinned Playwright container.

- DEBT-2026-001 — typed platform-preferences layer: resolved by RC-UX-4.1
  (`apps/gm-react/src/platform/preferences.ts`; the exception manifest went from 21 entries to 3).
- DEBT-2026-002 — `any` in runtime and view-model seams: resolved by RC-ENG-4.1 (72 → 11 sites, all
  in `app/compendium/*`). RC-DSN-2.1 then converted the design system to typed `.tsx`, deleted
  the permissive `ds/index.d.ts` facade (every export was `any`-propped) and left `src/ds` with zero
  `any`; the typed barrel `ds/index.ts` publishes `DSChangeEvent`, `DSKeyboardEvent`, `DSBadgeStatus`.
- DEBT-2026-003 — port the Svelte e2e corpus: resolved; the React suite is now 70+ specs on both
  profiles.
- DEBT-2026-005 — preview ("view as") edges: resolved by RC-CHR-4.3.
- DEBT-2026-006 — a guided PC cannot be built from rolled ability scores: resolved by RC-ENG-8.8.
  `character.create-draft` takes an optional DM-only `abilityScorePool` (one score per attribute of
  the active package), recorded on `CharacterDraft`; the abilities step is then valid as a
  permutation of the pool and point buy does not apply. The builder passes the standard array, a
  roll or manual scores as the pool and offers Roll to PCs. The same story applies the ancestry bonus
  the builder names (`DRAFT_ANCESTRY_OPTIONS`, added at finalize after the point-buy check).
