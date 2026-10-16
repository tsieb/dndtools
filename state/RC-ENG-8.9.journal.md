# RC-ENG-8.9 run journal

- Scope: parchment accent AA, shared token regression gate, removal of spec exceptions,
  parchment visual captures and DEBT-2026-008 resolution.
- Headroom tools unavailable; native original command output used. No agents or dispatcher edits.
- Initial worktree clean. Shared components already consume the pair; no component override needed.
- Added the pair check first: `pnpm tokens:contrast` failed exactly on parchment, 4.43:1 < 4.5:1.
- Changed accent to #945016; validation and pinned visual refresh in progress.

## Validation

- New pair measures 4.739687572172305:1. `pnpm tokens:contrast`: exit 0, 106 checks,
  five themes. The new check rejected the original token before the fix.
- Focused ESLint, Prettier and `git diff --check`: exit 0.
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/session-polish.spec.ts
tests/e2e/extensions-polish.spec.ts --workers=2`: exit 0, 28 passed (2.4m), desktop and mobile.
  Original output: `/tmp/rc-eng-8.9-e2e.log`. Both five-theme scans include parchment.
- Repository test search finds no 4.43:1 exception or old pair filter. Extensions retains its
  pre-existing Theme studio sample exclusion for separate DS/tertiary-text coverage.
- Visual refresh uses `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh
-g parchment --update-snapshots=all`; original output: `/tmp/rc-eng-8.9-visual-update.log`.
  Comparison pending. Inspected the refreshed desktop board capture for layout and accent chips.

- Pinned refresh finished: exit 0, 126 passed (4.4m). Retained 170 parchment PNG changes.
  Restored two unrelated projector PNG rewrites: that surface pins tavern regardless of theme.
- Original projector baselines verified with pinned `-g /display`: exit 0, 15 passed (53.5s),
  all five themes and three tiers. Original output: `/tmp/rc-eng-8.9-display-compare.log`.
- Inspected refreshed board and component gallery images. ImageMagick comparison located the
  unrelated projector rewrites; an optional Pillow inspection was unavailable (module absent).
- Broadened comparison to `-g 'parchment|wiki|community'` because Wiki/Community contain nested
  parchment content; original output: `/tmp/rc-eng-8.9-visual-compare.log`. Run in progress.

- Expanded visual comparison finished exit 1: 167 passed, 1 failed (5.4m). Original log lines
  174–205 show rail board `Edit layout` readiness timed out before the screenshot assertion;
  this is not a pixel-diff failure. Focused board recheck across all tiers is in progress.
  The overlapping projector run removed the transient error-context artifact; the original
  comparison log retains the full assertion and stack. No tolerance or readiness code changed.

## Final result

- Focused pinned board comparison: exit 0, 3 passed (17.9s), desktop/rail/phone. Original output:
  `/tmp/rc-eng-8.9-board-recheck.log`. The earlier readiness timeout did not reproduce; the
  expanded run remains recorded as 167 passed / 1 failed, with this successful focused recheck.
- Final intended changes: shared accent token (4.74:1), all-theme 4.5:1 lint assertion,
  removed Session/Extensions pair exceptions, 170 parchment baselines, resolved debt and journal.
- Committed on the current task branch. No push, promotion, dispatcher control mutation or agents.
  Central operator gates and independent review remain outstanding.

## Central gate retry

- Current implementation HEAD: `e2d5d3addf101e2276c4222259759dd2ba2345e5`; worktree clean.
  Headroom tools remain unavailable. Read original central gate output directly:
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/0b749777-a208-44f0-ba34-92efed954ff5/output.log`.
- Central quality and changed-format gates passed. Full pinned visual gate: 585 passed,
  3 failed (20.2m). Original log lines 594–695 identify readiness/capture timeouts:
  desktop dungeon board and phone scholar vault loading timed out waiting for screenshot
  stability; phone scholar marketplace timed out waiting for its three discovery buttons.
  No pixel-difference assertion or parchment failure was reported.
- Token lint rerun: exit 0, 106 checks. E2E search still finds no `4.43`, `sharedSegDebt`,
  or `dsActiveChip` exception. No source or baseline edits justified by the central failures.
- Rechecking all three failing case names in all three layout tiers, three repetitions each,
  with the original pinned image, two workers, unchanged timeouts and unchanged baselines:
  `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh
-g 'GM Screen — dungeon|community marketplace — scholar|app shell — scholar' --repeat-each=3`.
  Original output: `/tmp/rc-eng-8.9-retry-visual.log`. Exit 0: 27 passed (1.2m).
- All three central failures failed to reproduce across three repetitions and all layouts.
  No source, baseline, timeout, tolerance or dispatcher changes made during this retry.
  Committed this diagnostic journal update on the task branch. The full 588-test central gate
  remains a recorded failure requiring an operator rerun; the focused pass does not replace it.

## Tooling gate correction

- Read original gate log:
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/ae923017-9a71-4e28-8e21-45bf5214809a/output.log`.
  Tooling result: 273 passed, 1 failed. `feature-audit.test.ts` identified the stale Session
  limitation anchor `4.43:1 — DEBT-2026-008` in `docs/requirements/FEATURE-GAPS.md`.
- Necessary companion path outside the original ownership list:
  `docs/requirements/FEATURE-GAPS.md`. Removed only the resolved Session contrast limitation;
  retained its other limitations. The live inventory must reflect the resolved debt. Restoring
  an obsolete evidence comment or weakening the audit would leave inaccurate documentation.
- Original central visual log:
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/76fa5679-1d58-4162-bb23-8663e4fa0ceb/output.log`:
  all 588 passed (19.2m) at `02b38082c636c551204b315fc30e40e4fc905659`.
- Running the full tooling command with the central gate's three-worker limit after this doc fix.
  No app, baseline, test assertion, or dispatcher control changes.

- Full `pnpm test:tooling --maxWorkers=3`: exit 0, 33 files / 274 tests passed (16.02s).
  Original output read from `/tmp/rc-eng-8.9-tooling-fix.log`.
- Prettier and `git diff --check` passed. The companion edit changes only one inventory row.
  Committed with this journal on the task branch; no push, promotion or dispatcher mutation.

## Browser acceptance swatch correction

- Read original central log:
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/67fba381-1036-401b-ba82-55641d4cf572/output.log`.
  Browser acceptance: 2296 passed, 49 skipped, 1 failure (including two failed retries).
  Parchment's exact-color swatch baseline differs by 576 pixels, one 24x24 token cell.
- First ran the failing check on pre-task base `f02a1bf40` in detached scratch worktree
  `/tmp/rc-eng-8.9-base-swatch`, sharing installed dependency directories:
  `playwright test tests/e2e/themes.spec.ts --project=desktop-chromium
-g 'parchment swatch board' --workers=1`: exit 0, 1 passed (4.9s).
  Original output: `/tmp/rc-eng-8.9-base-swatch.log`. Vite reported font allow-list warnings
  in that scratch checkout; the swatch board explicitly has no text/shadows and passed exactly.
- This failure is caused by our accent change, NOT inherited. The earlier refresh missed the
  separate browser-acceptance snapshot directory. Required companion file outside original claim:
  `apps/gm-react/tests/e2e/themes.spec.ts-snapshots/theme-parchment-desktop-chromium-linux.png`.
  Updating that baseline from the browser; no assertion/tolerance or spec changes.

- Baseline update: exit 0, 1 passed (6.8s), original `/tmp/rc-eng-8.9-swatch-update.log`.
  ImageMagick exact pixel comparison confirms only 576 pixels changed; the updated accent cell
  contains exactly 576 pixels of #945016. All other 91,296 pixels are unchanged.
- Full themes spec on desktop and mobile after update: exit 0, 13 passed / 5 intentional mobile
  swatch skips (21.5s). Original output: `/tmp/rc-eng-8.9-themes-verify.log`.
  The five mobile skips are pre-existing: the board has no responsive layout.
- Only the missing parchment swatch PNG and journal changed. Formatting/diff checks passed.
  No push, promotion, agent spawning or dispatcher control changes.

## Claim-gate response

- Retained the required browser swatch baseline under the explicit exception in the retry
  instructions. The claim gate remains blocked pending an operator decision to widen the claim;
  no claim or dispatcher state was changed.
- Flagged path:
  `apps/gm-react/tests/e2e/themes.spec.ts-snapshots/theme-parchment-desktop-chromium-linux.png`.
- Compared directly with the gate's specified base `365d561486c74cfdd0dfb6d911e7518dba138298`:
  exactly 576 pixels change from #9a5418 to #945016; all other 91,296 pixels are unchanged.
  This is the 24x24 accent swatch painted from the real stylesheet. The existing test requires
  threshold 0 and maxDiffPixels 0. Reverting this PNG would restore the demonstrated browser
  acceptance failure while retaining the requested AA token correction.
- The acceptance criteria require the accent/tint correction and parchment capture refresh.
  This separate E2E snapshot is a necessary companion capture outside the listed visual directory.
  Restoring the old token would undo the fix; relaxing the test would weaken its exact-color gate.
- Re-read original `/tmp/rc-eng-8.9-themes-verify.log`: prior full themes run passed 13 tests with
  5 intentional mobile skips. No new browser run was needed for this journal-only response.
- Committed the required-path rationale for operator review. No push, promotion or new agents.

## Self-heal round 2 (claim widened)

- The claim now includes
  `apps/gm-react/tests/e2e/themes.spec.ts-snapshots/theme-parchment-desktop-chromium-linux.png`;
  the committed baseline is kept unchanged as instructed.
- Re-verified at `2c1ef90df`: `pnpm tokens:contrast` exit 0 (106 checks, parchment 21) with the
  accent-on-tint pair asserted at 4.5:1; no e2e spec contains a `4.43` exception;
  DEBT-2026-008 sits under `## Resolved`.
- Remaining `4.43:1` mentions are explanatory comments in unowned app files (QuickPanel,
  CombatantItem, DiceTray, Settings Tools) and an old RC-POL-1.3 journal, not spec exceptions.
  Left untouched to stay inside the claim.
- `loop/rc` is 5 commits ahead (RC-ENG-8.10 i18n/journals); no overlap with this task's paths.
- No source, baseline, push, promotion, agent or dispatcher-state changes this round.

## Rebase onto 144f5f6cf (DEBT.md conflict)

- Rebased all six task commits onto integration head `144f5f6cf`. Only conflict: `DEBT.md`, where
  RC-ENG-8.10 removed open DEBT-2026-007 and added its bullet at the top of `## Resolved`.
- Resolution keeps both: DEBT-2026-007 and DEBT-2026-008 both leave `## Open`; the Resolved section
  lists 8.10's 007 bullet unchanged, then 008 rewritten in the same bullet style (same facts as before:
  `#9a5418` → `#945016`, 4.43:1 → 4.74:1, lint pair at 4.5:1, spec exceptions removed, captures
  re-baselined). Prettier check on `DEBT.md` passed.
- After rebase: `pnpm tokens:contrast` exit 0 (106 checks, parchment 21);
  `pnpm test:tooling --maxWorkers=3` exit 0, 33 files / 274 tests
  (original `/tmp/rc-eng-8.9-tooling-rebase.log`).
  The other task files were unchanged by the rebase; no source, spec or baseline edits.

## Rebase onto 77ae4c82b (DEBT.md conflict)

- Rebased the seven task commits onto integration head `77ae4c82b`. Only conflict: `DEBT.md`, where
  RC-ENG-8.8 removed open DEBT-2026-006 and appended its bullet to `## Resolved`.
- Resolution keeps both: DEBT-2026-006 and DEBT-2026-008 both leave `## Open` (only DEBT-2026-004
  and DEBT-2026-009 stay open); `## Resolved` keeps 8.10's 007 bullet, this task's 008 bullet and
  8.8's 006 bullet unchanged.
- The base changed the character builder's Identity and Review steps without touching captures, so
  the parchment `full-builder--*` baselines refreshed here were re-checked:
  `DNDTOOLS_PW_WORKERS=2 apps/gm-react/tests/visual/run-in-container.sh
tests/visual/widget-full-builder.spec.ts` exit 0, 15 passed (original
  `/tmp/rc-eng-8.9-fullbuilder-rebase2.log`). No other overlap with the base's files.
- After rebase: `pnpm tokens:contrast` exit 0 (106 checks, parchment 21); no `4.43` in
  `apps/gm-react/tests/`; DEBT-2026-008 sits under `## Resolved`; Prettier check on `DEBT.md` and
  this journal passed. No source, spec or baseline edits this round.

## CI recovery b2ddfc1d619a (2026-10-16)

- Read original failed logs for both attempts of GitHub run 38930665290. Both fail before
  browser comparison: 894 visual baselines total 39,406.8 KiB, exceeding the 37 MiB budget
  (37,888.0 KiB). `ci-gate` correctly propagates that failure; all other required legs passed.
- Reproduced with `node apps/gm-react/tests/visual/check-baseline-budget.mjs` on task HEAD
  `b2ddfc1d619a003090cf588b4e326aabb95463ba`: exit 1 with the identical count and sizes.
- Headroom tools are unavailable. Original logs: `/var/tmp/ci-b2dd-failed.log` and
  `/var/tmp/ci-b2dd-attempt1.log`. No additional agents or dispatcher changes.
- Repair: losslessly re-encode only the 170 owned parchment visual PNGs refreshed by RC-ENG-8.9.
  ImageMagick uses RGB PNG, compression level 9, filter 1, and strips ancillary metadata.
  Before accepting each smaller output, compare dimensions and the complete decoded 8-bit RGBA
  byte stream with the original; reject any pixel change. Keep originals if encoding grows.
  Script and original verification output: `/var/tmp/ci-b2dd-optimize.py` and
  `/var/tmp/ci-b2dd-optimize.log`. No application pixels, assertions, budget or workflows change.
- Lossless verification completed: all 170 PNGs passed dimensions/RGBA equality, all shrank,
  saving 1,901,012 bytes. The existing budget regression gate now passes unchanged:
  894 files, 37,550.3 KiB of 37,888.0 KiB. Prettier and `git diff --check` pass.
- Additional pngjs cross-check was unavailable (`MODULE_NOT_FOUND`); the completed ImageMagick
  full-byte comparison is the pixel preservation evidence. Pinned parchment browser comparison
  is running with two workers; original output: `/var/tmp/ci-b2dd-visual.log`.
- Pinned parchment comparison: exit 1, 125 passed / 1 failed (4.7m). Original log read in full
  around the failure: phone `player sheet parchment` timed out at the unchanged 5-second
  screenshot capture, after fonts loaded and before a comparison result. No pixel mismatch
  was reported. This additional failure is distinct from GitHub's deterministic size-budget
  failure. No test assertions, timeouts or unowned player test changed.
- Focused phone player comparison with one worker and three repetitions is running, with
  original output in `/var/tmp/ci-b2dd-player.log`. This does not replace the full-run result.
- Focused phone player comparison: exit 0, 3 passed (16.9s), unchanged assertions and baselines.
  The broader run remains 125 passed / 1 capture timeout; no claim of a fully green visual suite.
- Final size-budget check: exit 0, 894 files / 37,550.3 KiB. All 170 changed images preserve
  original pixels exactly. Existing budget regression coverage fails on the pre-repair candidate
  and passes on this repair, without raising limits or changing workflow protections.
- Retained scope: 170 owned PNG encodings and this journal only. No push, promotion, dispatcher
  edits or agents. Central gates and independent review remain the operator's next stage.
