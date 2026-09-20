# RC-WID-4.4 run journal

## Implementation

- `WidgetRenderSlot.tsx`: every branch (builtin, template, custom frame, placeholder) renders
  inside `WidgetRegion`, a `<section>` labelled with the widget title. Custom hosts now restart
  when the contrast state changes (high-contrast theme or OS forced colours), not only frames that
  declare `host-theme-tokens`.
- `SandboxHost.tsx`: `init` carries `--host-forced-colors` and `--host-high-contrast` to every
  frame (`collectSandboxContrastVariables`). The header comment records the aria contract.
- Builtin bodies: new `builtin/live.tsx` (`LiveReadout`, `LiveStats`, `StateMark`). Stat rows,
  count lines, the timer status line, the map summary and the compact initiative heading are
  `aria-live="polite"` regions mounted with the readout. Done setup steps, pinned searches and the DM's
  playing-audio chip carry an icon with a name. The urgent timer shows a warning glyph, and its
  countdown is `role="timer"`. Timer Reset hands focus to the transport (the Reset button used to
  unmount under the keyboard and drop focus to `<body>`).
- Templates: `TemplateShell` owns a live readout region and a separate `controls` slot. Action
  panel and form panel controls sit outside the region. The active chart and tracker rows say "Now".
- No i18n keys added (catalogues are outside this story's paths); existing keys were reused.
- `WIDGETS.md` §3.1 documents the contract and the known map-marker gap.

## Fixes found by the gates

- Boundary lint (PLAT-006) rejected direct `matchMedia` in `SandboxHost` and `WidgetRenderSlot`.
  Both now read and subscribe through `platform/preferences` (`matchesMedia`, `subscribeMedia`).
- First e2e pass: `canvas.spec.ts` undo/redo tests failed on both profiles. `canvas.getByRole('status')`
  matched the canvas confirmation channel AND the new Audio live region (strict-mode violation). The
  new readouts are now `aria-live="polite"` regions, not `role="status"`. The canvas keeps the one
  status on a board. Pre-existing status regions (dice result, Next turn, compact HP) are unchanged.
- First e2e pass: mobile `/board` axe found `target-size` on the compact initiative tile's
  "More actions" button once combat runs (the existing gate scans an idle vault and never saw it).
  Row icon buttons now take `--density-touch-target`, the size of the HP button beside them.
- Keyboard walk: Timer Reset unmounted itself under focus. Focus now moves to the transport.
- `/board` contract test read the home scene before `command-center.ensure-home` ran. It now waits.

## Validation

- App `tsc --noEmit`, ESLint and Prettier on changed files, boundary lint, raw-style count: pass.
- Widget unit tests: 180/180 (32 new), no snapshot changes. Full app unit suite after the
  aria-live switch: 126 files, 1366 tests passed.
- `pnpm run build` (gm-react): pass, including `check-prod-bundle` (`__rt` and the gallery absent).
  The >650 kB chunk warning predates this story.
- Playwright, desktop-chromium + mobile-chromium, after all fixes: `custom-widgets`, `canvas`,
  `combat-tile`, `map-tile`, `starter-widgets`, `widget-builder`, `a11y-axe-gate` — 185 passed,
  0 failed, 5 skipped (the combat-tile desk/phone profile gates). `custom-widgets.spec.ts` re-run
  after a final rename in the spec: 14/14.
- Not run here: the full Playwright suite and the operator's gates and review.

## Attempt 2 — App tests gate (run `a52ed2c3`)

- The gate ran at `15e4a15c`: this story's commit rebased onto `66b7ab7f` ("docs: add RC release
  notes and Lamplight marketing page"). 1365 of 1366 app tests passed. The one failure is
  `apps/gm-react/src/app/help/changelog.test.ts` › "agree, so the badge and the release notes name
  the same version": `expected 'Unreleased' to be '0.3.7'`.
- Cause: `66b7ab7f` added bullets under `## [Unreleased]` in `CHANGELOG.md`. `latestRelease()`
  skips only an EMPTY Unreleased section, so the latest release is now `Unreleased`, and the test
  compares it with `apps/gm-react/package.json` version `0.3.7`.
- Not caused by this story: between `66b7ab7f` and this commit, `git diff` is empty for all three
  of the test's inputs (`CHANGELOG.md`, `apps/gm-react/package.json`, `apps/gm-react/src/app/help`).
  Reproduced locally at `15e4a15c` with the same assertion.
- Not fixed here: every fix is outside this story's owned paths and is a release-notes decision —
  move the RC notes under a versioned heading, bump the app version, or change `latestRelease()`
  or the test so unreleased notes don't count as the shipped release. No code change in this attempt.

## Attempt 3 — App tests gate (run `b547911a`), same failure

- Gate at `1bec109e` (journal-only commit): the same single failure, `changelog.test.ts`
  `'Unreleased'` vs `'0.3.7'`; 1365 of 1366 app tests passed. The branch is unchanged, and no base
  branch has touched the test's inputs since `66b7ab7f`, so retrying this branch as-is cannot pass.
- Fleet impact: `66b7ab7f` is on local `loop/rc` only (no remote). Every task branch cut from it
  fails App tests the same way; `dispatch/dndtools/70753c938c463ff01702` already contains it.
  RC-DOC-1.4's journal shows it ran `pnpm gates`, which runs no tests, so the break went unseen.
- Owners of the fix, per the roadmap: RC-UX-3.4 (`app/help/*`, the `CHANGELOG.md` parser),
  RC-DOC-1.4 (the changelog RC entry), RC-ENG-7.2 (`CHANGELOG.md`, the version bump).
- Smallest fix, in RC-UX-3.4's paths: make `latestRelease()` in `app/help/changelog.ts` skip the
  `Unreleased` heading, not only an empty one, and add a fixture case for a non-empty Unreleased
  section. The test's own comment says the badge compares against the BUILT version, and unreleased
  notes are not in any built version. Not applied here: outside this story's owned paths.

## Known gap (outside owned paths)

- `app/map/canvas/MapMarkers.tsx` and the DS `POIMarker` always render markers as buttons. On a
  mobile board a bound map with tokens or POIs fails axe `target-size`. The e2e binds the map tile
  to a map with no markers. The fix belongs in the shared marker renderer.

## Attempt 4 — current verification (2026-09-20)

- Read the original supplied App tests log for run `6e685d0d-5263-4257-8877-2ff470e96fa5`.
  It records 1365 passing tests and the same single changelog assertion failure at line 85.
  This is still an unresolved gate failure, not a successful implementation retry.
- Verified at `3a9ff68d` that `git diff 66b7ab7f HEAD -- CHANGELOG.md
apps/gm-react/package.json apps/gm-react/src/app/help` is empty. The current parser still
  chooses the first section with bullets, including `Unreleased`.
- Ran `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/widgets
apps/gm-react/src/app/help/changelog.test.ts`: exit 1, nine widget files pass (180 tests);
  the changelog file has six passes and the reproduced `Unreleased` versus `0.3.7` failure.
  Original output: `/tmp/rc-wid-44-unit.log` (ephemeral local evidence).
- Ran `pnpm --filter @dndtools/gm-react exec playwright test
tests/e2e/custom-widgets.spec.ts --project=desktop-chromium --project=mobile-chromium
--workers=2`: exit 0, 14 passed. This includes both routes' builtin axe checks, keyboard
  operation, and forced-colors forwarding on both profiles. Original output:
  `/tmp/rc-wid-44-e2e.log` (ephemeral local evidence).
- No product changes in this attempt; the implementation remains in `15e4a15c`. No full app
  suite or visual gate rerun: the supplied full app result remains failed, and this attempt
  changes only this journal. The documented populated-map marker gap also remains.
- Operator handoff: repair the changelog parser and add the non-empty Unreleased fixture in
  the owning task, then integrate that prerequisite and rerun the central gates. Repeating
  this unchanged candidate cannot resolve the App tests failure. No dispatcher state,
  ownership-external source, remote branch, or integration branch was modified.
