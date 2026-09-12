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
