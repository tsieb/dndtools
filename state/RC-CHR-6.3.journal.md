# RC-CHR-6.3 run journal

## Implementation

- Separate public PC summary permission from full-sheet sharing; preserve observer ceiling and NPC visibility.
- Explicit identity/vitals projection, including portrait asset ID and level. Restrict companion resource enrichment to sheet readers.
- EN/ES sharing explanations; no schema change.
- Headroom tools unavailable in this session; native command output used.
- Focused core isolation suite: 23 passed. Companion projection suite: 11 passed.
- Core and app TypeScript checks passed. Targeted ESLint passed.
- Real two-context WebRTC joined-companion e2e passed: three PCs with sheets shared to another player, live DM HP propagation.
- First e2e attempt omitted the host-start button; corrected test setup and reran successfully.
- Initial app-config test invocation excluded net tests; used the cloud config. Typechecking caught an overbroad edit in the separate own-PC read; corrected and reran typecheck and projection tests.
- Broader character core suite: 174 tests / 10 files passed (`pnpm --filter @dndtools/core exec vitest run character`). An initial glob filter matched no tests; the character filter ran the intended suite.
- Final acceptance e2e: 6 passed across desktop and mobile (`party-summary.spec.ts`): real joined companion, three private-sheet PCs, DM HP change, EN/ES copy.
- Mobile test setup initially tried the desktop host control in a phone viewport; now the host is desktop and the joined companion uses the project viewport.
- Boundary lint and raw-style-count gate passed (966 values / 118 files).
- Initial full pinned-container visual run stopped after expected /play diffs and an audio loading/failure test failure; not a passing full gate. Narrowed to relevant character/player routes.
- Focused visual comparison found exactly nine intended /play diffs (three themes × three tiers), with 54 other checks passing. Inspected desktop/phone captures, fixed the compact You badge wrapping, and updated only those nine baselines inside the pinned container.
- Final pinned-container comparison: **63 passed** (1.2 minutes), no snapshot updates:
  `bash apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --workers=2 -g '(/play|characters|character builder|play stage)' --output=test-results-party-summary`.
- Final acceptance browser command: `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/party-summary.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=1` (6 passed).
- Formatting and `git diff --check` passed. The central operator retains full-gate/independent-review responsibility.
- Portrait summaries carry the existing content-addressed asset ID; rendering uses the existing asset resolver with initials when local asset bytes are absent. This task adds no asset-transfer protocol.
- Integration-path additions outside the listed production paths: companion adapter, shared party panel, locale catalogs, and tests are necessary to carry/render public summaries safely. No dispatcher state edits, push, promotion or additional agents.
