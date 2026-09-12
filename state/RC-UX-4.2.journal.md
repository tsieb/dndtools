# RC-UX-4.2 run journal

## Scope

Mobile primary-action audit (UX-002 contract): one primary top-bar action per compact screen,
overflow sheets, keyboard-safe confirmations. Owned: `app/shell/TopBar.tsx`, `app/shell/MoreSheet.tsx`,
`app/nav.ts`, `tests/e2e/responsive.spec.ts`, `docs/architecture/NAVIGATION.md`. Per-screen fixes
belong to the POL stories. Acceptance: `responsive.spec` extended per screen. No agents, dispatcher
mutations, push or promotion.

## Findings before implementing

- Phone top bar (≤640px): `<h1>` + Search icon + "Table controls" icon. The table utilities (Host,
  View as, Go live / End session, Account) already live in a bottom sheet. The trigger carried no
  `aria-haspopup` / `aria-expanded`, so a screen reader heard a plain button, not an overflow.
- Rail / compact desktop (641–1279px): Search + the inline icon utilities; the only primary-weight
  control is Go live (`Button variant="primary"`).
- End session is confirmed by a `Dialog` opened from inside the sheet on a phone.
- `docs/architecture/NAVIGATION.md` §7 stated the rule in one sentence but never defined "compact",
  the budget, or what counts as the overflow.

## Audit (throwaway probe spec, deleted; 375x812 and 800x700, all 15 shell routes)

- Phone top bar: exactly Search + Table controls on every route, both 44x44, title 251px wide.
- Filled (Button primary/danger) actions in the first phone screenful of `#main-content`:
  `/session` 2 (Go live, soft-disabled Build encounter); every other route ≤ 1. Below the fold:
  `/scenes` (Create scene card, Next card), `/upgrade` (two plan-card previews), `/session` (Push to
  players, Set date). The board's filled "Fit" is a selected zoom segment (state, not an action).
- Rail top bar: Search, Host, View as, Go live on every route; Go live is the only filled control.

## Implementation

- `TopBar.tsx`: the phone "Table controls" trigger now carries `aria-haspopup="dialog"` and
  `aria-expanded={controlsOpen}`.
- `MoreSheet.tsx`: `gridAutoRows: 'minmax(44px, auto)'` on the row grid. The Settings row (no
  subtitle) was 36px tall, under the 44px touch floor; the track floor stretches every row's
  button without touching the shared `SideRow` (`rows.tsx`, not owned).
- `nav.ts`: no change needed. The audit found nothing in the IA data to fix within scope (the Scenes
  gap below is an IA change for RC-POL-1.23).
- `NAVIGATION.md`: §4 per-tier top-bar action budget table; new §8 "Compact primary actions (UX-002)"
  with the four rules and the gap ledger with owners.
- `responsive.spec.ts`: one test PER SCREEN (15 routes) at 375x812: exact top-bar controls, no filled
  control in the bar, title ≥ half width, 44px targets; first-screenful filled-action budget (≤ 1,
  `/session` ceiling 2 → RC-POL-1.4); Table controls overflow: `aria-haspopup`/`aria-expanded`,
  keyboard open, focus inside, Go live is its one filled action, every control reachable, Escape
  restores focus; All sections sheet: reachable, rows ≥ 44px, `aria-current` on the screen's row iff it
  is a More route, Escape restores focus to More. Plus: End session asks first and Escape unwinds one
  layer (375x812); End session keyboard-safe at 360x360, plain + Android insets (`test.fail`, see
  below); rail and compact-desktop top bars keep exactly one filled action (Go live) on every screen.

## Validation results

- Red first (desktop-chromium, 19 new tests): 17 failed. Every per-screen test failed on the 36px
  Settings row in All sections; both 360px confirmation tests failed with "Stay live" at viewport
  ratio 0 (screenshot: the confirmation shows title + body, no footer at all).
- After the MoreSheet fix: 19 passed, 1 failed. `/graph` expected no current row, but the seeded vault
  already reveals Graph (RC-UX-3.5) so its row is correctly current; the spec's route set was wrong.
- Final Playwright run, desktop-chromium + mobile-chromium, worktree-derived port: full
  `responsive.spec.ts` plus `ux-audit`, `maturity-signals`, `combat`, `collab` and `a11y-axe-gate`
  (the other specs that drive the Table controls or All sections sheets): 262 passed, 0 failed,
  0 flaky (4.8m). The two 360px confirmation tests count as passed because they are `test.fail` and
  failed as expected.
- `tsc --noEmit -p apps/gm-react/tsconfig.json`: exit 0. ESLint on TopBar.tsx, MoreSheet.tsx and
  responsive.spec.ts: exit 0. Prettier `--check` on all four changed files: clean.
- File-size gate (`scripts/quality-gates.ts`, RC-STB-2.7) scans `apps/gm-react/src/**/*.tsx` only, so the
  spec (now ~1,450 lines) is outside it; TopBar.tsx and MoreSheet.tsx remain small.
- No vitest test or snapshot renders TopBar or MoreSheet, so the unit suite was not re-run.
- Also corrected NAVIGATION.md §1: `/scenes` and `/scene/:id` render inside the shell (the probe and
  the existing bounded-canvas test both measure them in `#main-content`), not chrome-less.
- Not run by me: the complete Playwright suite, Android/Electron builds, `pnpm build`. The central
  operator's gates are the evidence for the rest.

## Known defects recorded, not fixed (outside Owns)

- End session confirmation at 360px tall (software keyboard / any landscape phone): the DS `Dialog`
  renders `description` in its header, which never yields height, so the footer is clipped out of the
  panel. Fix belongs in `ds/components/overlay/Dialog.jsx` (RC-UX-2.3, still open). The spec pins it
  with `test.fail` so it flags as "unexpectedly passed" once fixed.
- `/scenes`: the phone tab bar marks More current, but no All sections row exists for Scenes and the
  rail has no Scenes entry; only the desktop sidebar reaches it (IA differs by tier). RC-POL-1.23.
- Phone tab bar "More" has no `aria-haspopup` / `aria-expanded`; `BottomTabBar` has no prop for it.
  RC-POL-1.23.
