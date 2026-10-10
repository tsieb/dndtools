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
