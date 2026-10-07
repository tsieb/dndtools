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
  New widget, Plugins, Extensions & systems, Permissions, AI & tools, Local backup, Export
  diagnostics bundle. Standard: Permissions, AI & tools, Local backup, Export diagnostics bundle
  (all advanced Settings sections). Expert: nothing. The Settings › Appearance cards
  (`Experience.tsx`) and the onboarding step (`ExperienceStep.tsx`) both read it. The old Settings
  list (`visibleFeatures`) printed the same core features on every card.
- **New gate** `home.create.widget` (intermediate, surface `/`) for the Command Center's New widget
  launcher. `docs/reference/FEATURE_COMPLEXITY.md` was regenerated with
  `pnpm exec tsx scripts/feature-complexity.ts`.
- **Primary surfaces**: `sections.ts` gains `SECTION_TIER_GATES` (`extensibility → nav.extensions`,
  `community → nav.community`) and `isSectionShown(id, state, tier)`. The phone More sheet, the
  desktop More group (`Sidebar.tsx`) and the tablet rail (`RailNav.tsx`) filter through it. Each one
  keeps the section you are currently on, as the Settings rail does. The routes themselves stay open,
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
- Not done: the widget builder's advanced steps are not gated by tier anywhere (`widgetBuilder/*`
  never reads it). Listing them on the Beginner card would repeat the defect this story fixes, so
  `TIER_SUMMARY_GATE_IDS` leaves them out. Enforcing builder-step gating is follow-up work.

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
  - The full visual suite was not rerun to completion; it is listed below if it finishes.

- No agents, dispatcher-state edits, push, promotion or loop launches.
