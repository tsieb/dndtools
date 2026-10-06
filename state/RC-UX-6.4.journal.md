# RC-UX-6.4 run journal

Base: `7dc67b3f` (task branch head at start; worktree clean). Headroom tools were not used; exact
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

- Outside Owns (minimal): `Sidebar.tsx` (the More group, named by the story), `RailNav.tsx` (tablet
  rail, the same filter so the tier does not leak there), and `CommandCenter.tsx` (the launcher
  filter, named by the story). Companion paths: `packages/core/src/index.ts`, i18n catalogs,
  `CHANGELOG.md`, tests.
- Not done: the widget builder's advanced steps are not gated by tier anywhere (`widgetBuilder/*`
  never reads it). Listing them on the Beginner card would repeat the defect this story fixes, so
  `TIER_SUMMARY_GATE_IDS` leaves them out. Enforcing builder-step gating is follow-up work.

## Validation
