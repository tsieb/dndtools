# RC-CAN-2.5 run journal

- Implementing within the three owned source files and companion browser test.
- Added definition size metadata, S/M/L presets (minimum/default/150% default),
  a focusable resize handle with arrows and Escape, and live size announcements.
  Existing Shift+Arrow uses the same minimum clamp and announcements.
- Pointer resize uses a four screen-pixel drag threshold; a release without a drag
  cycles presets. Cancellation abandons the gesture.
- Validation:
  - Focused Playwright keyboard resize acceptance: 2/2 passed (desktop and mobile
    Chromium). Covers arrow resizing, live status, Escape focus return,
    Shift+Arrow, minimum clamp, S/M/L cycle, drag without preset activation,
    keyboard preset activation, and reload persistence.
  - Existing WidgetFrame unit suite: 67/67 passed.
  - App typecheck: passed. ESLint on all four changed code/test files: passed.
  - Quality gates: 6/6 passed. Shortened the canvas overview comment to remain
    within its existing 800-line limit.
  - Initial browser attempt used the wrong Edit button label; corrected to
    Edit layout. Initial lint issues corrected with local tile-copy convention
    and a radius token.
  - Full operator gates and independent review remain for the central operator.
- No agents, dispatcher changes, push or promotion.

## Gate recovery (2026-09-12)

- Read the original Browser acceptance log for run
  94e699ab-1dfc-4af7-94d6-27933438b652, gated head b6c70b48.
  All four failures were strict-locator collisions in the two canvas history
  tests, on desktop and mobile: the new resize live region introduced a second
  status role. The run also reported three unrelated tests flaky, 11 skipped,
  and 1074 passed.
- Kept the resize region permanently mounted with aria-live=polite and
  aria-atomic=true, without the redundant status role. The existing history
  status remains unambiguous. Resize acceptance now directly checks the live
  region attributes and announcement text.
- Focused browser rerun covers both failing history cases plus keyboard resize,
  on desktop and mobile Chromium. Validation results recorded below.
- No dispatcher state changes, additional agents, push or promotion.
- Results: focused Playwright 6/6 passed (15.5 seconds), changed-code ESLint
  passed, Prettier passed, git diff --check clean, quality gates 6/6 passed.
  The full browser suite remains for the central operator; this rerun targets
  every failed case from its log and the resize acceptance.

## Review fix: bounded clamp announcements (2026-09-12)

- Review of 2780dac8 withheld approval: on `/board` a 320-wide tile at x=472
  (right edge on the 792 bound) announced "size 340 by 200" after ArrowRight,
  while Board's `resize` committed 320. The announcement echoed the request,
  not what the board keeps.
- Added `fitWidgetSize` to board-helpers: minimum floor plus, under the
  bounded policy, the same `clampWidthToColumns` Board applies. The canvas
  uses it for the announcement, the committed size, the pointer draft and the
  S/M/L presets, so a preset clamped onto an existing size collapses into it.
  Clamping the draft also stops a drag past the edge from painting a wider
  draft that the clamped commit never matches.
- A rerun of the existing acceptance exposed a preset race: after a drag,
  Enter could cycle from the core-confirmed size while the draft was still
  on screen (240x160 drawn, cycled from 200x120, jumped to 320x200).
  `nextSizePreset` now cycles from the size on screen (draft, else confirmed).
- SceneBoardCanvas.tsx stays at 799 lines (the 800-line hard gate).
- Validation: new e2e "bounded board resize announces the width its columns
  allow" (keyboard step, clamped L preset, drag past the edge, persisted
  width) plus the keyboard acceptance: 4/4 on desktop and mobile Chromium
  with no retries. canvas.spec.ts + custom-widgets.spec.ts: 90/90. App unit
  (board-layout-guard with new fit/preset/cycle cases, canvas suites): 95/95.
  Typecheck, ESLint on changed files, Prettier, quality gates 6/6 all passed.
- No dispatcher state changes, additional agents, push or promotion.

## Gate recovery: App tests on rebased head b10f8e88 (2026-09-12)

- Read the original App tests log (run fca98f6e-c05a-47bc-8861-8151a48a8e92):
  1 failed, 1337 passed. The single failure is
  `apps/gm-react/src/app/help/changelog.test.ts` › "agree, so the badge and
  the release notes name the same version": expected 'Unreleased' to be
  '0.3.7'. board-layout-guard and every canvas suite passed.
- Cause is the new base, not this story. The branch was rebased onto
  66b7ab7f (RC-DOC-1.4, "docs: add RC release notes and Lamplight marketing
  page"), which filled `CHANGELOG.md`'s `[Unreleased]` section. `latestRelease`
  skips only an EMPTY leading Unreleased section, so it now returns
  'Unreleased', while `apps/gm-react/package.json` is still 0.3.7.
- Proof: `git diff --quiet 66b7ab7f HEAD -- CHANGELOG.md
apps/gm-react/package.json apps/gm-react/src/app/help` reports identical
  inputs, and the test reproduces at HEAD in isolation (1 failed, 6 passed).
  This story's commits touch only SceneBoardCanvas.tsx, board-helpers.ts,
  WidgetFrame.tsx, board-layout-guard.test.ts, custom-widgets.spec.ts and this
  journal.
- Not fixed here: CHANGELOG.md and the changelog parser/test are outside
  RC-CAN-2.5's owned paths, and the fix means choosing between RC-DOC-1.4's
  release copy and the version-agreement rule. Needs an owner decision on the
  base branch (e.g. let `latestRelease` skip `[Unreleased]` entirely, or
  bump/tag the version the preview notes describe).
- Acceptance re-verified on the rebased head: focused resize e2e 4/4 on
  desktop and mobile Chromium, no retries.
- No dispatcher state changes, additional agents, push or promotion.
