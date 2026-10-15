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

### DEBT-2026-008 — parchment's accent text on the accent tint is 4.43:1

- Severity: medium · Owner: design system · Resolution window: 2026 Q4
- Impact: in the parchment theme, `--color-accent` (#9a5418) on `--color-accent-subtle` (#f0e0c8)
  measures 4.43:1, under WCAG AA's 4.5:1 for small text. Everything that paints that pair fails axe
  `color-contrast` on parchment: the DS `Button variant="accent"` (Done on the scene editor and the
  GM Screen) and the widget-body kit's accent `Chip` (the Dice and Character tiles). The per-surface
  fix would drift from the tokens; the pair itself needs a darker accent or a lighter tint, which
  re-baselines every parchment capture.
- Targets: `apps/gm-react/src/styles/tokens/colors.css` (parchment block),
  `apps/gm-react/src/app/widget-body-kit.tsx`, `scripts/token-contrast-lint.ts` (add the pair).
- Status: open — found by RC-POL-1.3, whose axe spec (`scene-editor-polish.spec.ts`) names this one
  pair as its only exception, on parchment only. RC-POL-1.17 (Settings) moved every inline use of
  the pair to primary ink; on parchment the selected screen-kit `Seg` option, the DS `Avatar`
  initials and the accent role `Badge` on the Players roster still paint it. RC-POL-1.4 (Session)
  inks the initiative avatars' initials, takes the accent tint off the active combat row and makes the
  dice Roll and quick-panel Next turn `primary`; its theme scan (`session-polish.spec.ts`) lets through
  only the session phase `Seg`'s selected option, the one use left on that surface.

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
