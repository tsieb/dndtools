# RC-KNW-6.7 run journal

## Implementation (2026-10-10)

- Clean current task branch at start. No Headroom tools exposed; original command output inspected.
- Added the fifth golden journey on both configured Chromium profiles. Fixtures use accepted Core
  commands; capture, body-link navigation, inline faction relationship and palette use real controls.
- Capture budget is New note plus Enter while on Notes during a live session, excluding text entry.
  Body focus prevents a separate Edit action. Body-only search has one two-second deadline.
- Shared assertions have healthy fixture baselines and seeded defects; existing ENG-8.1 console and
  overflow mutants remain in the same spec. Documentation lists the journey and its scope.
- Read the central manifest: Browser acceptance runs `pnpm e2e --workers=2 --retries=2`, selecting
  this spec through the existing Playwright discovery on both profiles. No manifest change needed.
- Targeted browser verification in progress. No agents, push, promotion, loop or control-state edits.

## Verification notes

- Initial run: 14 seeded checks passed, both journey cases failed because faction body links are
  buttons, unlike NPC anchors. Corrected the selector and made the shared link assertion click and
  verify the exact destination; seeded wrong destinations now test that same assertion.
- Next journey run found phone canvas hidden behind Show map, and existing unselected graph controls
  (`Focus neighborhood`, `Refine in Notes`) disabled without reasons. The journey now searches the
  graph for Golden, selects the captured note and opens Show map on phones before inspecting its
  label and health. The unselected-state findings are not repaired by this test-only change.
- Readability checks require the complete title, visible label, minimum 12px type, contained text
  bounds and no overlap with other graph labels. Dead-end checks match cross-screen instruction
  prose and require an embedded action; they are not a general semantic classifier for all copy.
- Targeted ESLint and `git diff --check` passed. Final typecheck and complete spec run in progress.

## Final local evidence and blocker

- `pnpm e2e golden-path.spec.ts --workers=2 --retries=0`: **75 passed, 1 failed**; original output
  `/tmp/rc-knw-6.7-full.log`. All 14 new seeded cases and existing health regressions passed.
  Desktop knowledge journey passed. Mobile completed the domain flow but failed retained health:
  `Body-word palette result: unrecoverable clip (x): span Moonquartz was carried by [[Golden guide]] for [[G…`.
- Isolated confirmation with `--grep 'knowledge:' --project=mobile-chromium --workers=1 --retries=0`
  reproduced the same diagnostic (`/tmp/rc-knw-6.7-mobile-confirm.log`, exit 1). This is not a green
  browser gate. The required overflow assertion remains intact; no skips or shorter fixture text.
- The description span in `apps/gm-react/src/ds/components/command/CommandPaletteRow.jsx` uses
  nowrap/hidden/ellipsis with no full-text alternative. That product path is outside this task's
  owned paths. A follow-up product repair is needed before the new mobile journey can pass.
- Final gm-react `tsc --noEmit` passed (`/tmp/rc-knw-6.7-types-final.log`, exit 0). Targeted ESLint,
  Prettier over the spec/docs/journal and `git diff --check` passed.
- Committing the owned spec and documentation plus this requested journal on the current task
  branch. Full wrapper gates and independent review remain with the central operator. No product
  code, dispatcher state, unrelated files, publication or promotion changed.

## Browser-gate repair (2026-10-11)

- Started clean at `ec599e9a`. Read the original central browser output at
  `.state/attempts/8f2734eb-23fc-4299-9ff2-62bb75976a5c/output.log` in the dispatcher checkout:
  2,011 passed, 43 skipped, one unrelated tile-resize flake, and the knowledge mobile overflow
  failure on all three attempts. Headroom tools are not exposed in this session.
- The gate feedback requires a companion product repair: changed only the palette description
  span in `CommandPaletteRow.jsx` from hidden single-line ellipsis to normal wrapping, including
  long unbroken text. Touch users can now read the search match without hovering. The existing
  golden journey, fixture and overflow assertion are unchanged.
- This narrowly extends the implementation beyond the two original owned paths to resolve the
  blocker they detect; it does not shorten fixture prose, skip the checkpoint or change the detector.
- Targeted ESLint and Prettier passed. Complete golden-path and palette browser specs are running;
  pinned visual palette comparisons follow, without overlapping browser runs.

### Repair verification

- `pnpm e2e golden-path.spec.ts command-palette.spec.ts palette-polish.spec.ts --workers=2 --retries=0`:
  **128/128 passed**, including both knowledge journeys, all seeded assertions, palette navigation,
  keyboard handling, body-word lookup and axe checks (`/tmp/rc-knw-6.7-repair-browser.log`, exit 0).
- gm-react `tsc --noEmit` passed (`/tmp/rc-knw-6.7-repair-types.log`, exit 0). `pnpm gates` passed,
  with existing file-size warnings (`/tmp/rc-knw-6.7-repair-gates.log`, exit 0).
- The full central Browser acceptance run remains for the operator; the unrelated tile-resize
  flake is not claimed repaired. No agents, dispatcher writes, push, promotion or new loop.
- Pinned-container `palette-help.spec.ts --retries=0`: **15/15 passed**, all five themes on desktop,
  rail and phone, with unchanged baselines (`/tmp/rc-knw-6.7-repair-visual.log`, exit 0).
- Final `git diff --check` and formatting passed. The companion repair resolves the previously
  recorded mobile blocker in the local journey; full exact-commit central gates/review are pending.

## Claim review disposition (2026-10-11)

- Claim validation rejected `CommandPaletteRow.jsx`; the claim has not been widened. The earlier
  repair notes explain technical necessity, not authorization to expand ownership automatically.
- Following the explicit feedback's required-change exception, retain this companion path and
  request the operator's claim decision through the commit message. Reverting it to `0de08e09`
  restores the exact mobile overflow that the acceptance criterion requires the journey to detect.
- Re-read the original central log: the same snippet clipping diagnostic appears on the initial
  attempt and both retries (lines 2104, 2127 and 2158). Re-read original repair outputs: 128 browser
  checks and 15 pinned visual checks passed. No application or test changes since those runs;
  this commit adds the claim justification only, so those suites were not rerun.
- Required scope addition: only `apps/gm-react/src/ds/components/command/CommandPaletteRow.jsx`,
  description wrapping. The golden journey must continue exercising the full body snippet on
  mobile with the existing overflow detector. Claim validation remains blocked pending the
  operator's decision; no dispatcher control state was changed to bypass it.
