# RC-CAN-5.2 run journal

## Scope

Floating session action bar on the phone board while the session is live. Owns
`app/canvas/SessionActionBar.tsx` (new), `screens/Board.tsx`, `app/shell/SessionRail.tsx`,
`app/shell/session-posture.ts`. d20/d6 roll buttons, Next turn (only while combat is running, combat
accent), Handout. `role="toolbar"`. Acceptance: e2e. No agents, dispatcher mutations, push or
promotion.

## Constraints found

- Previous attempt stopped on a provider allowance limit before committing anything; the branch
  started at `fad0cf60` (= `loop/rc`).
- `Board.tsx` is 790 lines against the 800-line hard gate → the bar lives in its own file and Board
  only mounts it.
- `dsn/no-raw-style-values`: a new file has no allowance → token-only styles.
- `i18n/no-literal-jsx-text` → new strings go through EN/ES catalogs (catalogs are manifest
  `companion_paths`, as are `tests/e2e/*.spec.ts`).
- No `--color-combat` token exists. "Combat accent" = `--color-tile-combat`, the combat tile's
  identity colour (already gated at 3:1 non-text contrast by `pnpm a11y:contrast`).
- Next turn / dice / handout dispatch the same core commands as RC-SES-1.2's `SessionQuickPanel`
  (`combat.advance-turn`, `dice.roll`, `session.deliver-handout`), with the same fail-closed rules
  (preview disables writes, handout needs an active scene and a player).

## Progress

- Context gathered (roadmap, Board, StackedBoard, QuickPanel/QuickSheet, session-posture, AppShell,
  Footer, session-posture/combat e2e specs).
- Design: `app/canvas/SessionActionBar.tsx` — a DS `Toolbar` (`role="toolbar"`, "Session actions",
  arrow/Home/End roving) mounted by Board on the phone tier outside edit mode; renders nothing unless
  `useSessionPosture().live`. d20/d6 dispatch `dice.roll` and toast "Rolled 1d20: N" off the
  accepted `nextState`; Next turn exists only while the actor-scoped tracker is `running`, bordered
  in `--color-tile-combat`; Handout opens a bottom `Sheet` with the title form (`Push a handout`),
  push disabled with the reason when there is no active scene or no player. In flow at the foot of
  the board (never covers the last panel; stays below a full-screen tile). One row at every phone
  width: dice fixed, labelled controls shrink and wrap between words only; below 360px while combat
  runs, Handout drops to its glyph (accessible name kept).
- Board.tsx +3 lines (793/800). 3 EN/ES catalog keys (`session.actionBar.*`); the rest reuses
  `session.quick.*` / `projection.*` copy. No change was needed in `SessionRail.tsx` or
  `session-posture.ts` (the posture hook already answers "live").
- Tests: new `tests/e2e/session-action-bar.spec.ts` — absence idle/desktop, dice through the Core,
  Next turn (combat accent = computed `--color-tile-combat`, advances the turn, gone after
  `combat.end`), Handout sheet pushes `session.deliver-handout` (seed has 3 players), keyboard
  roving, player preview removes it, scoped axe on bar + sheet, geometry at 320×640/360×640 (inside
  `<main>`, one row, 48px targets, no overlap with the quick-panel trigger, no horizontal overflow).
  12/12 applicable pass; ×3 repeat 27/27 before the axe/one-row additions.
- Committed `006fb955` (feature) and `2cfaea07` (e2e). A broad two-profile regression run was
  killed at 97/476 when the previous session ended (no failures logged; not evidence). Re-run
  after resume: mobile-chromium `session-action-bar`, `session-posture`, `combat-tile`,
  `responsive`, `a11y-axe-gate`, `canvas` → 166 passed, 2 skipped, 0 failed; desktop-chromium
  `session-action-bar`, `session-posture`, `combat-tile` → 6 passed, 12 skipped (phone-only).
  `pnpm gates`, `pnpm lint` (incl. emphasis + non-text contrast), gm-react `tsc --noEmit`, and the
  i18n/styles vitest files (42/42) pass.

## Handoff / flags

- The quick-panel trigger (`SessionQuickSheet`, AppShell `bottomOffset={92}` on phone) sits ~14px
  INSIDE `<main>` while live (measured: main bottom 523.5, trigger top 510 at 640 tall), because the
  live footer grew a status strip and a help row after the offset was chosen. The bar's bottom
  margin (`--space-5`) clears it and the e2e asserts no overlap, but the offset itself belongs to
  AppShell/QuickPanel (not owned here) and still overlaps other screens' last row by ~14px.
