# RC-DSN-2.3 — Component documentation site

## Implementation

- Read the app route structure, production guard, DS facade and component contracts. No Headroom tools are available in this run. No AGENTS.md files were found in the worktree or checked parent instruction locations.
- Added a literal gallery registry covering all 77 public DS components, synthetic fixtures, composable variant/state controls, native interactions, isolated overlay launches and temporary theme/density controls.
- Added a DEV-guarded lazy route outside app onboarding at `#/__ds`.
- Extended the production guard to reject the route, gallery name/chunk and unique marker alongside `__rt`.
- Added the root guard entry point with `--write-docs` / `--check-docs`; documentation is generated from the registry and coverage is compared against the DS facade.
- Validation in progress. No push, promotion, additional agents, new loops or dispatcher control-state changes.

## Validation and final review

- `pnpm --filter @dndtools/gm-react typecheck` and targeted ESLint on the four changed JS/TS source files passed, exit 0. The gallery has a documented file-local exemption from `i18n/no-literal-jsx-text`: it is developer documentation eliminated from production, and its fixtures intentionally contain literal component copy. No production translation allowance or lint configuration changed.
- `node scripts/check-prod-bundle.mjs --check-docs` passed: 77 public DS components registered exactly once and generated Markdown is current. An intentional temporary Markdown drift was rejected with the expected `COMPONENTS.md is stale` diagnostic; the original file was restored in `finally`.
- Final `pnpm --filter @dndtools/gm-react build` passed, exit 0. Original log: `/tmp/rc-dsn23-build-complete.log`. The post-build guard confirms runtime seam and gallery absence across all 86 JS assets. Existing Vite dependency annotation and large-chunk warnings remain. The root guard entry point also passed against the generated app distribution.
- Synthetic guard probes accepted `__rtl` and rejected `__rt`, `/__ds`, `lamplight-ds-gallery`, a `DsGallery-hash.js` filename and a nested `.mjs` route leak. Each probe asserted its exit code; temporary directories were removed.
- Chromium used this worktree's Vite server at isolated port 15643. `/tmp/rc-dsn23-browser.cjs` rendered all 77 components and 124 named examples, opened overlays and reported no page/console errors (exit 0; `/tmp/rc-dsn23-browser-final.log`). Earlier exploratory sweeps caught fixture contract errors (navigation keys, condition keys, system-card chips) and callbacks passed to unrelated overlays; those were corrected before the clean sweep. Initial temporary harness locator errors were fixed with explicit select labels and an assertion requiring exactly 77 components.
- `/tmp/rc-dsn23-matrix.cjs` on the final source rendered 633 axis choices without page/console errors. It checked all six theme/density combinations at widths 1280 and 393, with no page overflow and no serious/critical axe violations on the gallery containing the Button specimen. It also verified controlled checkbox state, modal Escape dismissal and focus return. Exit 0; original log `/tmp/rc-dsn23-matrix-complete.log`. This is not a claim of an axe scan of every component or every Cartesian combination.
- An initial immediate theme-switch axe measurement reported a contrast failure; a stationary parchment probe reported none. The final matrix waits 350 ms for the shipped color transitions before measuring, and all 12 scans pass. No component or token contrast behavior was changed or excluded.
- `/tmp/rc-dsn23-restore.cjs` verified all 77 default specimens at mobile width. Three intrinsically wide specimens (InitiativeRow, ImportWizard, Toast) originally overflowed the page; the gallery now gives them named keyboard-focusable horizontal scroll regions. Final result: zero page overflow, theme/density restored after exit, and localStorage unchanged (exit 0; `/tmp/rc-dsn23-restore-final.log`). Gallery-created toast IDs are dismissed on specimen unmount without clearing other application toasts.
- Screenshots of all theme/density/viewport combinations are in `/tmp/rc-dsn23-*.png`; the parchment mobile capture was visually inspected. `git diff --check` passed. Full repository gates and independent review remain with the central operator as requested.
- Changes are confined to the five owned implementation/documentation paths plus this required run journal. No push, promotion, new loop, subagents or dispatcher control-state edits.
