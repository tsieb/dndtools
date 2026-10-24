# RC-ENG-8.15 run journal

## 2026-10-24 — implementation

- Starting branch already includes the prior audit's thin overflow footer and leading Next turn action. Baseline `tile-overflow-controls.spec.ts` passed 4 desktop-profile cases, but explicitly allowed 17 clipped controls across the three widths. EARLY_ACCESS.md lines 274–280 records that full acceptance is still open.
- Headroom tools are unavailable in this session; commands use native execution with original output.
- Moving Countdown actions ahead of the wrapping clock removes the rail Timer pair from the exception list. Strengthening the regression to scroll only the containing page/tile frame, never the button or body; assert content scroll offsets remain zero; inspect offscreen tiles rather than silently skip buttons; activate Next turn and Timer Start using coordinate clicks.
- Map controls and phone combat-row actions remain audited exceptions; no claim that full every-button acceptance passes. Changes outside the task's owned source paths are not authorized. No dispatcher state edits, publication, promotion, or additional agents.

## Validation and remaining blockers

- Initial combined functional run: 98 passed, 2 failed (`/tmp/rc-eng-8.15-e2e.log`). Both failures were desktop golden-path boot timeouts waiting 20 seconds for `window.__rt.loaded`, before interaction. All tile overflow/recovery cases and detector cases passed. A final focused run repeats both boot failures and the changed acceptance/detector cases.
- Pinned visual command: `bash apps/gm-react/tests/visual/run-in-container.sh tests/visual/board-polish.spec.ts tests/visual/board-layouts.spec.ts --workers=2 --update-snapshots=none`. Final original output: `/tmp/rc-eng-8.15-visual-final.log`; exit 1, 8 passed and 10 screenshot differences (five desktop and five rail themes). Inspected the tavern actual/diff images: the Timer actions precede the clock when wrapped. Phone screenshots and Layouts panel cases pass. Baselines are outside the owned paths and were not rewritten. This is not a green visual gate.
- The strengthened audit now inspects every rendered tile button, including four phone Map controls previously skipped because their centres were outside the viewport. Remaining clipped centres total 19 across widths: 3 desktop Map, 6 rail Map, 6 phone Map, and 4 phone combat-row actions. These remain explicit exceptions, not fulfilled acceptance. Map's body implementation is outside the owned paths; fixing the compact combat rows also needs a layout with enough room for the order and primary action.
- An additional exploratory check after starting the Timer showed Add a minute wraps below the body at rail and phone when Reset appears. The committed check covers the requested default live-home state (Start/Add), not all running Timer actions. That limitation is unresolved.
- No screenshot baselines, unrelated source files, or dispatcher control state changed. Full task acceptance remains **incomplete**; this commit provides the default Timer fix and stronger evidence, not task completion.

- Final focused command: `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/tile-overflow-controls.spec.ts tests/e2e/golden-path.spec.ts --workers=1 -g 'centre taps|restoring|detector|first run to|prep a character'`: **56 passed (31.5s)**, exit 0 (`/tmp/rc-eng-8.15-final-check.log`). This includes both earlier boot-timeout cases, both profiles, all three widths, and ENG-8.1 detector fixtures. The known-clipped exception assertions remain in force; this does not certify every-button acceptance.
- Final app typecheck, targeted ESLint, changed-file Prettier, and `git diff --check` passed. Original typecheck output: `/tmp/rc-eng-8.15-typecheck-final.log`.
