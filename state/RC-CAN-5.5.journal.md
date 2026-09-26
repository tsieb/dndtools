# RC-CAN-5.5 — Tile content recovery

- Inspected the shared frame, render slot, builtin bodies and ENG-8.1 journey detector. Headroom tools are not exposed in this session; original native output/logs are used.
- Implementing a labelled keyboard scroller, overflow fade/count, sans title with full tooltip/name, and one-action content fit. Fit is a reversible view expansion, preserving durable scene positions and locked system sizes; Restore returns to the saved size.
- Notes, Prep lists and Initiative use natural content height so the outer region can recover all body content.
- No agents, push, promotion, loop launch or dispatcher control-state writes.
- Validation in progress.

## Implementation and local evidence

- Tile bodies now have an explicitly named, focusable overflow region. Arrow/Page/Home/End/Space keys stay inside it instead of moving the canvas. An edge fade and measured hidden-text-line count expose overflow. Resize/content observers keep it current.
- List and Notes rows wrap long names, preserve their intrinsic height, and remain reachable inside the scroller. Initiative's empty explanation no longer lives in a clipped flex body.
- Grow measures the current scroll extent at activation; Restore remains in the footer and focus returns to the region. Expansion is local reading state, raised above neighbours, not a durable layout mutation. System-tier resize locks are preserved.
- Added six en/es companion strings as required by the repository i18n lint, plus a browser regression spec. Some frame comments were shortened/removed to stay within its pre-existing 800-line ceiling.
- Initial jsdom run exposed absent ResizeObserver support; the measurement effect now safely skips unsupported environments (native scrolling still works). Existing frame/render-slot tests: **70 passed**, `/tmp/can55-unit2.log`.
- Initial browser health run reported unrelated disabled-button-reason findings for Zoom out / Project to players. This task's test calls the unchanged ENG-8.1 detector and asserts its `unrecoverable clip` results, exactly the requested overflow criterion.
- Growth regression initially followed the next matching Grow button after the first disappeared. Pinning the tile by its actual ID fixed the test. Original diagnostics: `/tmp/can55-browser2.log`, `/tmp/can55-fit-debug2.log`. Current measured growth and restore pass.
- Flow layout plus recovery: **11 passed**, `/tmp/can55-browser3.log`. Targeted recovery (Prep and Initiative separately, both browser profiles, three widths): **10 passed**, `/tmp/can55-browser-final.log`. Captures are attached by the tests.
- App TypeScript and targeted ESLint pass (`/tmp/can55-typecheck-final.log`, `/tmp/can55-lint-final.log`). `pnpm gates` passed (`/tmp/can55-gates.log`).
- Pinned board/scene visual comparison: **6 passed, 12 screenshot differences**, `/tmp/can55-visual.log`; original differences inspected. The new sans titles and overflow affordances intentionally change desktop/rail images; phone images passed. Baselines pending final-layout verification.
- Extended coverage to instantiate all five built-in screen templates at every width. An initial Node-side core import could not load a package JSON; replaced with the same explicit template IDs used by scene-templates.spec.ts. No product workaround or detector change.

## Final validation

- Five built-in templates (combat, social, exploration, town, session-prep), both seeded scenes,
  and `/board`, at 1440/900/375px: **zero unrecoverable clips** on both Chromium profiles.
  Expanded suite: **10 passed** (`/tmp/can55-browser-all-layouts2.log`).
- Final measurement effect also observes immediate body children, so late intrinsic-size changes
  (such as font/image loading) update the affordance even if the viewport size stays fixed.
- Final frame/render-slot unit run: **70 passed**, `/tmp/can55-unit-final.log`.
- Final app TypeScript, targeted ESLint, Prettier, `git diff --check` and repository gates pass:
  `/tmp/can55-typecheck-last.log`, `/tmp/can55-lint4.log`, `/tmp/can55-test-lint.log`,
  `/tmp/can55-gates-final.log`. Gate file-size warnings are advisory; WidgetFrame remains 798 lines.
- Reviewed the new board/scene images and regenerated the 12 affected desktop/rail companion
  baselines in the pinned container. Phone baselines are unchanged. Pinned comparison with
  **updates disabled: 18 passed**, `/tmp/can55-visual-final.log`.
- This is local task validation only. The central operator still owns full gates and independent
  review. No remote publication or integration was performed.
- Final browser acceptance after all source changes and strengthened tooltip/name/count assertions:
  **10 passed**, `/tmp/can55-acceptance-final.log`. Inspected both saved `whole-tile.png` captures:
  Initiative includes its full empty copy; Prep includes five complete rows and its count.
  Captures live in `apps/gm-react/test-results/tile-content-recovery-*/whole-tile.png` and are
  attached by the regression tests for the central runner.
