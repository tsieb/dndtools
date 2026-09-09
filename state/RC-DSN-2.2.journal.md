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

## Gate repair follow-up

- Latest broad gate repeated the same eight failures. Proceeding with narrow fixes to the inherited gate blockers.
- Map tile action controls now use the existing board-scale compensation token, preserving touch hit areas when zoomed out.
- Compact initiative tile scrolls its full content instead of collapsing the combatant list beneath the header.
- Quick-map tool changes no longer reopen a dismissed details sheet; only a new selection or generation opens it.
- Equipment preview test now asserts the existing read-only contract and checks that edit controls return after exiting preview; command-level owner/DM/stranger authority assertions remain intact.
- Targeted browser revalidation running.
- First repair run: all board touch/axe checks, compact HP interaction and equipment preview tests passed (7 passes, one existing desktop skip); quick-map movement passed and exposed a stale later import step in the same test.
- Updated quick-map import test to traverse the actual raster alignment, scale and wall-tracing steps before preview, retaining fingerprint, durable import and preservation checks.
- The raster wizard exposed another inherited blocker: SVG dimensions were explicitly skipped, making its alignment Next button permanently disabled. SVG files now decode through an Image object and a revoked object URL, preserving the image-only rendering boundary and supplying intrinsic dimensions.

## Gate repair validation

- Quick-map full workflow: 2/2 passed on desktop/mobile, including movement, fog, generation, SVG alignment/import and preservation.
- Full browser run with `DNDTOOLS_E2E_PORT=15475 pnpm e2e --workers=2`: 1,048 passed, 11 existing skips, one failure. All eight original gate failures passed in this run.
- The one newly exposed failure was mobile map-tile zoom clipping after enlarging its action hit areas. Fixed by scrolling the map tile content and reserving enough map height for all three scale-compensated zoom controls.
- Final map-layout browser run (port 15477): 16/16 passed across desktop/mobile, covering the previously failing zoom control, map rebinding, overlay toggling, projection, fog, board axe and Android safe-area/touch bounds.
- Full app suite before the final map-layout adjustment: 114 files, 1,112 tests passed. Final map-tile/token tests, typecheck, lint and production build rechecked after that adjustment.
- Original full and targeted browser logs retained at `/tmp/rc-dsn-browser-full.log` and `/tmp/rc-dsn-map-layout.log`. The full suite was not rerun after the final layout fix; the final affected suite passed. The central operator retains the full final-tree gate.
- Changes are limited to four UI implementation files, two existing browser tests, and this journal/baseline note. No test skips or timeout increases added. Equipment command-authority checks remain intact; the preview UI assertion now matches its explicit read-only contract and checks edit controls return after preview.
