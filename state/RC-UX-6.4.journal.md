# RC-UX-6.4 run journal

Base: `7dc67b3f` at start; the operator rebased the branch onto `c61d8cdb`. Headroom tools were not used; exact
command output was read directly.

## Implementation

- **Default tier** (`packages/core/src/state/onboarding.ts`): `DEFAULT_FEATURE_TIER` is now
  `intermediate`. Every reader goes through it: `readTier()` (Settings, shell, Command Center,
  Help, telemetry) and `resolveOnboarding`. Onboarding's `readStoredTier` already defaulted to
  `intermediate`, so it needed no change. The constant carries the migration note, and so does
  `CHANGELOG.md`: a device that never stored a tier moves from Beginner to Standard, and a stored
  choice, including an explicit Beginner, is never rewritten.
- **Reveal lists** (core): `TIER_SUMMARY_GATE_IDS` names the complexity-map gates a card may list,
  and `tierHiddenSections(tier)` returns those its tier cannot see. Beginner: Extensions, Community,
  New widget, Custom widget code, Plugins, Extensions & systems, Permissions, AI & tools, Local
  backup, Diagnostics. Standard: Permissions, AI & tools, Local backup, Diagnostics (all advanced
  Settings sections). Expert: nothing. A gate may carry an optional `summaryKey` for the cards when
  its `labelKey` is ambiguous there (`builder.step.advanced` would read "Advanced";
  `settings.about.export` was long enough to overflow the onboarding step). The Settings › Appearance cards
  (`Experience.tsx`) and the onboarding step (`ExperienceStep.tsx`) both read it. The old Settings
  list (`visibleFeatures`) printed the same core features on every card.
- **New gate** `home.create.widget` (intermediate, surface `/`) for the Command Center's New widget
  launcher. `docs/reference/FEATURE_COMPLEXITY.md` was regenerated with
  `pnpm exec tsx scripts/feature-complexity.ts`.
- **Primary surfaces**: `sections.ts` gains `SECTION_TIER_GATES` (`extensibility → nav.extensions`,
  `community → nav.community`) and `isSectionShown(id, state, tier)`. The phone More sheet and the
  desktop More group (`Sidebar.tsx`) filter through it. The tablet rail does not; that edit was
  reverted (see Scope notes). Both keep the section you are currently on, as the Settings rail does. The routes themselves stay open,
  so a bookmark or the command palette still reaches them. The Command Center Create launchers
  filter New widget through `featureGateVisible` (new, `Experience.tsx`). Manage already hid
  Permissions through `settings.nav.permissions`. A Permissions deep link still lands on the
  RC-UX-5.2 gate page with "Show advanced settings".
- **Recommended badge**: Settings and onboarding both use the DS `Badge` with `whiteSpace: nowrap`
  and `flexShrink: 0` inside a wrapping flex row, so the badge moves to its own line as a whole.
  Onboarding's "{tier} (recommended)" string was replaced by the name plus the badge, and the
  `onboarding.v3.recommended` key was removed.
- Copy: `settings.experience.hides` / `hidesNone` added (en, es). `onboarding.v3.hidesNone` now
  reads "Hides nothing." because the list covers more than tabs. The pseudo catalog was regenerated.

## Scope notes

- Outside the original Owns, kept because the acceptance e2e needs them. The operator brief of
  2026-10-06 widened Owns to both files:
  - `apps/gm-react/src/app/shell/Sidebar.tsx`: the desktop More group _is_ the "Extensions entry"
    a Beginner must not see. Its `visiblePlatform` is a `useMemo` over `runtime.state` alone, so
    no change to an owned or companion file (`sections.ts`, `nav.ts`) can hide the row, or bring it
    back after a switch to Expert without a reload. The edit swaps the filter for `isSectionShown`
    and adds `tier` and `active` to the memo deps.
  - `apps/gm-react/src/screens/CommandCenter.tsx`: the New widget launcher is declared inline in
    that file's `create` array. The criterion "a Beginner sees no New widget launcher" can only be
    met there. The edit tags the entry with gate `home.create.widget` and filters it.
- Reverted to base after the ownership gate (2026-10-05): `RailNav.tsx` (the tablet rail filter)
  and `GettingStartedBody.tsx` (the tile passed no tier to `resolveOnboarding`, so it always printed
  the core default). Neither is required by the acceptance criteria. Both are follow-ups: the tablet
  rail still lists Extensions and Community at Beginner, and the Getting started tile shows the
  default tier ("Intermediate") rather than the device's tier. The `builtin-bodies` snapshot update
  stays: with the new default the tile prints "Intermediate" either way.
- Companion paths: `packages/core/src/index.ts`, i18n catalogs, `CHANGELOG.md`, tests, snapshot.
- Widget builder (review fix, see below): two files outside Owns stay changed,
  `widgetBuilder/BuilderPanes.tsx` (the rail takes a `steps` prop) and
  `screens/extensions/WidgetBuilder.tsx` (reads the tier, passes the steps, renders the gate note,
  "Step N of M" and Back/Next follow the shown steps). The step filter and the gate note live in the
  owned `Experience.tsx`. See "Ownership gate" below for why they are kept.

## Validation

All runs are local; Playwright used `DNDTOOLS_E2E_PORT=41449`.

- Core `vitest run`: 286 files, 5234 tests passed. `tests/unit/feature-complexity.test.ts` (includes
  the new pairwise-different / real-section-id test): 9/9 passed.
- `pnpm test:app` (before the rebase): 2029/2030. The one failure was the `builtin-bodies`
  getting-started snapshot ("Depth Core" became "Depth Intermediate", the intended default change).
  Snapshot updated. After the revert: `builtin-bodies` plus `src/app/shell` passed 69/69.
  `pnpm test:tooling`: 248/248.
- `pnpm typecheck`, `pnpm lint:boundary`, ESLint and Prettier on the changed files: pass.
- E2E before the rebase, desktop and mobile Chromium:
  - onboarding-consent, settings, settings-tiers and settings-polish: 62/62 passed.
  - a11y-axe-gate, command-palette, `community-*`, extensions-polish, golden-path, `help-*`,
    hub-templates, map-onboarding, phone-navigator, responsive, shell-pin-bounds and shell-polish:
    450 passed, 2 skipped.
- E2E after the rebase onto `c61d8cdb` and the two reverts, desktop and mobile Chromium:
  onboarding-consent, settings, settings-tiers, settings-polish and shell-polish passed 82/82.
  This includes the new RC-UX-6.4 tests: Beginner shows no New widget, Extensions or Permissions;
  Expert shows all three without a reload, checked with a window marker; the three cards list
  different hidden sections.
- Visual (2026-10-06, pinned container, `c61d8cdb` + this candidate):
  - Compare mode: golden-routes `/` and `/settings` failed on desktop and rail in all three themes,
    12 captures, 0.01–0.02 of the pixels each. Phone passed. Inspected actual and diff images:
    - `/`: Manage now shows Players and Vault connections at Standard, which pushes Library down.
    - `/settings`: Standard is selected, the rail has the intermediate tabs, and the cards show
      "Hidden at this level" lists.

    These are the intended default-tier changes.

  - Re-baselined only those 12 (`--update-snapshots=changed`; 18 passed). Losslessly re-deflated
    them with `pol19-png-redeflate.py` (1,881,344 → 1,788,065 B).
  - `check-baseline-budget.mjs`: 768 files, 33,598.0 of 34,816.0 KiB.
  - `--update-snapshots=none` over golden-routes `/` and `/settings`, settings-polish and
    shell-polish: 48/48 passed.
  - Full visual suite (`run-in-container.sh --update-snapshots=none --workers=2`) on `29bcc2e9`:
    513/513 passed in 11.2 min, exit 0.

- No agents, dispatcher-state edits, push, promotion or loop launches.

## Visual gate retry — 2026-10-07

- The branch was rebased onto `382e1d81` (head `b7e81687`). The gate's visual run
  (`.state/attempts/a5ee9410-…/output.log`) had 514 passed and 2 failed: golden-routes
  `Audio polish — scholar › /audio Playback` (desktop) and
  `Audio polish — parchment › /audio named deletion` (phone). Both failed with
  `toHaveScreenshot` "Timeout 5000ms exceeded" while waiting for fonts to load, with no pixel
  diff. That is the shared visual-container stall the base commit `382e1d81` journals for
  Community, not a rendering change. `/audio` renders the same at Standard as it did at the old
  Beginner default: the More group listed Extensions and Community there before too.
- Re-ran all `Audio polish` captures in the pinned container (`--update-snapshots=none
--repeat-each=3`): 225/225 passed, including the two that had failed.
- Full visual suite on `b7e81687` (`run-in-container.sh --update-snapshots=none --workers=2`):
  516/516 passed in 11.2 min, exit 0.
- No code, baseline, assertion or timeout changes in this retry; journal only. No agents,
  dispatcher-state edits, push, promotion or loop launches.

## Review fix: widget builder Advanced step (2026-10-06)

The independent review of `a4004500` passed every gate but rejected the candidate because the
Beginner card left out the widget builder's advanced steps and the builder never read the tier
(Beginner could open `/#/extensions` → Build a widget → Advanced and edit custom code).

- Core (`onboarding.ts`): `builder.step.advanced` moves from `advanced` to `intermediate`. The
  story puts the builder's advanced steps on the Beginner list and keeps Standard's list to advanced
  Settings sections, and Standard is the default the builder ran at before. The gate joins
  `TIER_SUMMARY_GATE_IDS`. `SectionFeatureGate` gains an optional `summaryKey` for the cards:
  "Custom widget code" for the builder step (its `labelKey` must stay `builder.step.advanced`;
  the RC-UX-5.1 inventory test matches UI step keys) and "Diagnostics" for
  `settings.about.export`. With the extra Beginner entry, the old "Export diagnostics bundle" pushed
  the onboarding Experience step one line taller than its content box on desktop, so
  `onboarding-consent.spec.ts:136` failed 3/3 until the shorter label went in.
  `docs/reference/FEATURE_COMPLEXITY.md` regenerated. The other builder gates (data, config,
  commands, review at `advanced`) stay unenforced and stay off the cards; enforcing Review would
  stop a Standard GM from installing anything.
- Builder (outside the original Owns, the minimum the requirement needs):
  - (moved, see "Ownership gate") pure `shownSteps(draft, advancedAllowed, current, issues)`. Advanced
    is left out below the gate unless the draft already uses custom code, host permissions or
    network destinations, has an issue on that step, or is open on it. Hiding work that exists
    would leave it unreachable.
  - `widgetBuilder/BuilderPanes.tsx`: the rail takes a `steps` prop. New `AdvancedStepGate` shows
    the RC-UX-5.2 gate copy ("Advanced is part of the Standard toolkit…") and a
    "Switch to Standard" button that raises the tier in place, the same write the gate page does.
  - `screens/extensions/WidgetBuilder.tsx`: reads the tier, builds the steps, and uses them for the
    rail, "Step N of M" and Back/Next. The note lives in `BuilderPanes.tsx` because inlining it put
    `WidgetBuilder.tsx` at 810 lines, over the 800-line file-size gate.
- Copy: `builder.step.advancedGate` and `settings.about.exportSummary` (en, es); pseudo catalog
  regenerated. CHANGELOG entry extended.

### Validation

Local runs; Playwright on `DNDTOOLS_E2E_PORT=41467`.

- `tests/unit/feature-complexity.test.ts` 9/9 (Beginner list now asserts `builder.step.advanced`).
  `pnpm test:app` 2092/2092 (includes new `shownSteps` tests in `draft.test.ts`). Core
  `vitest run` 5279/5279. `pnpm test:tooling` 249/249 (first run failed the file-size gate at 810
  lines; fixed as above).
- `tsc --noEmit` (gm-react, core), `pnpm lint:boundary`, ESLint and Prettier on every changed file:
  pass.
- E2E, desktop and mobile Chromium: settings-tiers, onboarding-consent, settings, settings-polish,
  widget-builder and widget-settings: 86/86. The new settings-tiers test: at Beginner the builder
  rail has Identity and Review but no Advanced and no custom-code controls; the gate note says why;
  "Switch to Standard" brings Advanced back without a reload and it opens. settings-tiers plus
  onboarding-consent with `--repeat-each=2`: 60/60.
- Visual, pinned container: full compare (`--update-snapshots=none --workers=2`) had 513 passed and
  3 failed, all golden-routes `/settings` on visual-rail (tavern, parchment, high-contrast,
  1120–1393 px, ratio 0.01). Actual vs diff checked: only the cards' hidden lists changed (Beginner
  adds "Custom widget code", "Export diagnostics bundle" → "Diagnostics"). Desktop `/settings` did
  not move. Re-baselined those 3 (`--update-snapshots=changed`), losslessly re-deflated
  (494,468 → 474,528 B). Budget: 771 files, 33,330.8 of 34,816.0 KiB. Compare re-run over
  golden-routes, settings-polish and extensions-polish settings/extensions captures: 69/69.
- No agents, dispatcher-state edits, push, promotion or loop launches.

## Ownership gate (2026-10-06)

The gate refused `9f1fa41d` for `widgetBuilder/BuilderPanes.tsx`, `widgetBuilder/draft.ts` and
`extensions/WidgetBuilder.tsx`.

- `draft.ts` and `draft.test.ts` are reverted to `382e1d81`. The filter is now
  `shownBuilderSteps(draft, tier, current, issues)` in the owned `screens/settings/Experience.tsx`,
  beside `featureGateVisible`, and `AdvancedStepGate` moved there too. Its tests moved to the
  companion `Experience.test.tsx`.
- Kept, and blocked for the operator to decide on widening the claim:
  - `BuilderPanes.tsx` (+4/−2): `BuilderStepRail` draws `STEP_IDS` itself. Without a `steps` prop
    no owned file can take Advanced out of the rail.
  - `WidgetBuilder.tsx` (+14/−9): the only place that knows the draft, the current step and the
    issues, and that drives "Step N of M" and Back/Next. Without it Next still walks a Beginner
    into Advanced.
  - The requirement: the story's "What to build" puts "the widget builder's advanced steps" on the
    Beginner list. The independent review of `a4004500` rejected the candidate for leaving that out
    and reproduced a Beginner editing custom code. The formal acceptance list doesn't name it, so
    reverting these two files and dropping the gate from the cards is the alternative. That would
    bring back the review's finding.
- Validation after the move: `tsc --noEmit` (gm-react), ESLint, Prettier, `pnpm lint:boundary`
  pass. `pnpm test:app` 2092/2092, `pnpm test:tooling` 249/249 (file-size gate:
  `WidgetBuilder.tsx` 779 lines). E2E desktop and mobile Chromium: settings-tiers,
  onboarding-consent, settings, settings-polish, widget-builder, widget-settings 86/86. Visual compare
  (pinned container) over golden-routes, settings-polish and extensions-polish settings/extensions
  captures: 69/69. No baseline changes in this step.
- No agents, dispatcher-state edits, push, promotion or loop launches.

## Claim widened (2026-10-07)

The operator brief of 2026-10-07 widened Owns to `widgetBuilder/BuilderPanes.tsx` and
`extensions/WidgetBuilder.tsx`. The branch now sits on `98fdb866`. Against that base every changed
source file is owned or a companion (tests, i18n catalogs, snapshot, baselines, `core/src/index.ts`,
`CHANGELOG.md`, this journal). No code, test or baseline changes in this step.

Check on the rebased head: `tsc --noEmit` (gm-react, core) clean;
`tests/unit/feature-complexity.test.ts` 9/9; gm-react settings, widgetBuilder, extensions and
shell unit tests 117/117; e2e settings-tiers, onboarding-consent and settings on desktop and mobile
Chromium 46/46. No agents, dispatcher-state edits, push, promotion or loop launches.
