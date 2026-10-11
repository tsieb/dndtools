# RC-UX-6.7 run journal

- Inspected the Core spotlight queue, per-vault persistence, responsive shell controls, complexity map, and shared canvas registry. No Headroom tools are available in this run.
- Added five primary-path triggers, explicit control targets and complexity gates. The host checks real target visibility at idle time; canvas editing and modal sheets suppress tips and dismiss an already shown tip.
- Added stable target attributes and EN/ES/pseudo copy as implementation companions to the owned files. Actions use existing controls; tips do not start sessions or project maps automatically.
- Validation results are recorded below. No push, promotion, dispatcher-state edits or additional agents.

## Verification

- Core: `pnpm --filter @dndtools/core exec vitest run tests/onboarding.test.ts tests/primary-path-spotlights.test.ts` — 34 passed. Includes one positive/negative case for each trigger, edit/sheet suppression, hidden responsive targets, and all tiers checked against `SECTION_FEATURE_GATES`.
- App catalog: `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/i18n/index.test.ts` — 28 passed. Initial hyphenated translation-key segments failed the catalog naming rule; replaced them with camelCase and reran successfully.
- Session controls: `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/screens/session/standby-controls.test.tsx` — 21 passed. Project now uses the DS soft-disabled contract so the tip can focus its explanatory control in Standby without enabling projection.
- `pnpm --filter @dndtools/gm-react typecheck` — exit 0.
- Initial fixture command arguments were reversed; corrected to the established `(state, environment, command)` order before the successful core run. An explicit fallback after the exhaustive trigger switch satisfies ESLint's fallthrough rule.
- Browser regression now leaves the canvas Add panel open through the idle window, then exits editing and confirms the earned tip appears. The campaign-chip case opens the real vault switcher and verifies no repeat across reload and later idle windows; phone coverage verifies the hidden chip does not produce a tip. Existing persistence/cooldown/dialog cases remain isolated from the new queue entries.
- Full central gates, pinned visual coverage and independent review remain the central operator's follow-up; these local checks do not claim those gates.
- Final full spotlight browser run: **13 passed, 1 skipped** (34.5s). The skipped case is the desktop-specific Add-panel edit regression on the mobile project; the mobile hidden-chip, persistence, dialog and cooldown cases all pass.
- Targeted ESLint for changed runtime/tests: exit 0. Prettier check for all changed files: exit 0. `git diff --check`: clean.
- Strengthened the Add-panel regression by focusing Done instead of a text input, proving edit-mode suppression independently of text-focus suppression. Reran that desktop case: **1 passed** (6.2s).
