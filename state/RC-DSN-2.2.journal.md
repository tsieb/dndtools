# RC-DSN-2.2 run journal

## Scope

Resume preserved missing-primitives implementation. No agents, dispatcher mutations, push or promotion.

## Progress

- Inspected preserved edits and design source map; no Headroom tools available.
- Completed primitive behavior and accessibility, exports, production screen integrations and tests.
- Screen consumers: ScenesCreator (ListItem, TagInput, Figure), Settings Tools (RadioCard, HelpTip, FeatureSpotlight), Settings Accessibility (Kbd), Board (Menu, Toolbar, Callout), SystemBuilder (Stepper).
- Validation completed; results below.

## Completed implementation

- All eleven primitives have colocated `.test.tsx` coverage and production screen consumers.
- Added public runtime/type exports and component reference entries in `docs/design-package/components/missing-primitives.md`, linked from the package readme.
- Repaired preserved duplicate imports/props, TagInput callback corruption, missing exports and invalid selection attributes. TagInput uses controlled values with deduplication and limits; menu/toolbar keyboard navigation is covered.
- Stepper supports vertical layout, sizes, connectors and bounded progress indices.
- Added a browser regression proving scene tag entry, save-on-blur and persistence after reload.

## Validation results

- `pnpm test:app`: 114 files, 1,112 tests passed on final component tree. First run caught undeclared `--space-2-5` usage; replaced with existing `--space-2`, then reran the full suite successfully.
- Typechecking: core and cloud passed the root command; app passed after fixing preserved test prop declarations, and passed again with the browser regression added.
- `pnpm lint`: passed, including boundary lint and non-text contrast. Fifteen warnings remain in unrelated existing files; no warnings in task files.
- Playwright Settings and shortcuts: 22 passed across desktop/mobile Chromium, isolated port 15473.
- Playwright missing-primitives scene-tag regression: 2 passed across desktop/mobile Chromium, isolated port 15474.
- `git diff --check`: passed.
- No push, promotion, additional loop, agent delegation or dispatcher control changes.

## Browser gate follow-up

- Central gate at `064d3e12`: typecheck, lint, app tests, build and requirements audit passed; full browser suite reported 8 failures, 11 skipped, 1,041 passed.
- Read original browser gate diagnostics from attempt `e2546ec3-4056-4e58-be87-4e7570b0bca4/output.log`.
- Targeted reproduction (port 15475): six failures reproduce; Android safe-area checks pass in isolation. Comparing the parent commit in an isolated temporary worktree before changing product code.
- Verified parent `75c76bd1` with the same dependency/font assets and an isolated Vite server (port 15476): exactly the same six failures, one skip, three passes. Read original diagnostics and completion output for both runs.
- Added `state/RC-DSN-2.2.browser-baseline.md` with commands, per-test comparison, diagnostics and disposition. The implementation remains intact; no evidence links these reproducible failures to the primitive changes.
- Browser acceptance remains failed. Two Android bounds failures from the broad gate pass on both revisions in isolation and need suite-order investigation by the central operator.
