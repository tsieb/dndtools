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

## Central browser-gate repair (2026-09-26)

- Read the original central browser log at
  `/home/trinkle/Programming/agent-dispatcher/.state/attempts/1f1582af-1fea-4141-bd5c-09a1f17ee4be/output.log`.
  Candidate `30d5c18d` had 8 failures, 1 flaky, 30 skipped and 1,557 passes. The other eight central
  gates passed, including full app tests and the pinned visual gate. Headroom remains unavailable.
- Failures are the three-tile keyboard journey and move/undo/redo on both profiles, plus phone
  one-finger navigation at both phone sizes on both profiles. The standalone-player skip-link
  case passed on retry and is not counted among the eight failures.
- Root causes under investigation: every region currently adds `tabindex=0`, so Enter's first-control
  search focuses the new region even in layout-edit mode; its arrow handler then takes the move key.
  The inner region also uses `overscroll-behavior: contain`, stopping native board scroll chaining.
- Reproducing the exact failing tests without retries before the correction. Intended fix keeps
  overflowing view-mode regions keyboard-scrollable, excludes them from edit-mode focus entry,
  and restores native scroll chaining. No detector/test assertions will be weakened.
- Before the fix, the exact filtered reproduction failed **all 8 cases** without retries
  (`/tmp/can55-r2-before.log`); original failures match the central diagnostics.
- `WidgetFrame` now explicitly disables region keyboard entry while editing. `WidgetRegion` uses
  tabindex -1 in that mode and leaves keys alone; view mode retains tabindex 0 and keyboard
  scrolling. This preserves Enter's existing content-group fallback and canvas move/undo shortcuts.
- Removed inner scroll containment so native phone swipes chain to the board on exhausted/inactive
  scroll axes. No scroll extents, touch gestures or test expectations were bypassed.
- Extended both Prep/Initiative recovery cases to switch Edit → Done and verify the region's tab
  stop changes from -1 back to 0. The original eight failing tests are unchanged.
- App TypeScript, targeted ESLint, `pnpm gates`, `git diff --check` and the 70 frame/render-slot unit
  tests pass (`/tmp/can55-r2-{typecheck,lint,gates,unit}.log`). Frame is 799 lines (limit 800).
- Targeted repaired run: **18 passed**, no retries (`/tmp/can55-r2-targeted.log`): all eight original
  failures plus all ten overflow cases, including the new edit/view transitions.
- Full neighbouring canvas-keyboard, canvas, phone-navigator and responsive specs: **263 passed,
  1 failed**, no retries (`/tmp/can55-r2-neighbours.log`, 8.7m). The sole failure is the standalone
  `/play` skip-link assertion at responsive.spec.ts:1544 (`Skip to content` was not focused after
  Tab). This is the same assertion already recorded as flaky in the original central log.
- Six isolated skip-link repetitions: **5 passed, 1 failed**, no retries
  (`/tmp/can55-r2-skiplink.log`). It is not included in the eight fixed failures. No skip-link code,
  test assertion, retries, exclusion or timeout has been changed. Checking the pre-task tile source
  to distinguish this remaining failure from the tile implementation.
- Baseline isolation: temporarily restored all five owned product files from pre-task `9cf8265e`
  and ran ten isolated skip-link repetitions: **10 passed** (`/tmp/can55-r2-skiplink-base.log`).
  A Python `finally` restored every working file byte-for-byte and asserted the restoration. This
  bounded check did not reproduce the intermittent failure, so it does not prove the broad gate is
  green or establish the flake's root cause. The original central run already records it as flaky;
  it remains a separate validation caveat. No unrelated player-view change is included.
- First pinned comparison after scroll-chaining repair: **15 passed, 3 failed**, all three rail
  board images (`/tmp/can55-r2-visual.log`). Read original pixel diagnostics and inspected actual/diff
  images: small text-raster differences in Dice/Audio, with unchanged geometry/content. Refreshing
  only those three companion baselines and then comparing with updates disabled.
- Final pinned board/scene comparison with updates disabled: **18 passed**, exit 0
  (`/tmp/can55-r2-visual-final.log`). Only the three reviewed rail-board PNGs were refreshed.
- Final intended delta: two owned source files, the existing task regression spec, three companion
  visual baselines and this journal. No assertions were relaxed and no retries increased. All eight
  central hard failures are fixed; the separate intermittent `/play` skip-link failure is recorded
  above rather than represented as a clean full browser gate. Central full rerun/review remains the
  operator's responsibility. No push, promotion, agents, loop or dispatcher-state mutation.

## Review round 3 — overflow must not cost fitting tiles (2026-09-29)

Independent review of `efbc55da` rejected: the ~17px footer was a flex sibling shown whenever
`scrollHeight > clientHeight`, so tiles that overflowed by padding lost space. That cut
Initiative's "Next turn" and Timer's "Add a minute" at the rail tier, hid Quick Reference's count,
and hid Initiative's empty copy. Grow did not converge for Timer. Every region was a tab stop. The
change also deleted frame comments and put `aria-label` on a generic span.

- Measured first (`/tmp/can55-r3-probe1.log`): body regions were 73px with the footer and 90px
  without. Base (`/tmp/can55-r3-probe-base.log`, owned files temporarily restored and then
  copied back): Initiative's empty copy was already cut at 1280 and 834. Timer "Add a minute" was
  already 37/44 at 834, so the rail baseline was not whole there either. Map's zoom buttons are
  clipped inside Map's own viewport on base and candidate. Map.tsx is not in scope; see below.
- A sibling footer oscillated. Removing it lets a centred 100%-height body (Timer) move down, and
  that re-triggers the footer. Replaced it with an **overlaid** footer (absolute, 22px, opaque).
  The body layout never depends on it. It appears only when real content is hidden or the tile is
  grown. When content is hidden, a spacer inside the content lets the last line scroll clear of it.
- "Hidden" is measured from text line boxes and controls (the ENG-8.1 detector's selector), in
  layout px (divided by canvas zoom), clipped at any inner overflow box. `scrollHeight` is not
  used, so trailing padding never earns a footer.
- Grow adds `extent + footer clearance - view` and then re-measures. It repeats (at most 8 passes)
  while content is still short, which converges for bodies that grow with the tile.
- Region `tabIndex` is 0 only when it actually scrolls (−1 while editing, absent otherwise). Scroll
  keys are stopped only when the region itself is focused.
- Frame: restored every deleted comment (the file now equals base plus the fit wiring, 793 lines).
  Grow state lives in `useTileFit` and the title in `TileTitle` (sans face, `title` tooltip, no
  `aria-label`), both in `WidgetRenderSlot.tsx`.
- Bodies: Initiative puts the stat pills and Next turn on one wrapping row, so the empty copy fits.
  List and Notes rows use `--space-1` gaps (3 rows plus the count needed 92.4px of 90).
- Crossed ownership into `TimerBody.tsx` (minimal, required for "render whole"). The canvas keeps
  touch targets at 44 screen px, so at Fit zoom two stacked controls need about 102 layout px in a
  90px region, and they can never fit. The controls are now a wrapping row that drops under the
  clock when the tile is narrow. The root uses `minHeight` so a too-tall body cannot overflow
  upward, where scrolling never reaches.
- Probe after the rework (`/tmp/can55-r3-probe7.log`, 1280/834/900/1440): Initiative, Dice, Timer,
  Audio and Quick Reference have no clipped text or controls, no footer and no tab stop. Prep shows
  the fade, "3 more lines" and Grow.
- Spec rewritten. Initiative now renders whole, so it is asserted whole at 1280 and 834 instead of
  being grown. Prep covers keyboard scroll, End clears the footer, Grow makes it whole, then
  Restore and the edit/view tab stop. A new case shrinks the Timer with `scene.resize-widget` and
  asserts that Grow converges. It was mutation-checked: `GROW_PASSES = 0` fails with 9px still
  hidden (`/tmp/can55-r3-spec-mut.log`). With the real value, full spec: **14 passed** on both
  profiles (`/tmp/can55-r3-spec3.log`, `/tmp/can55-r3-spec5.log`).
- `pnpm test:app` 1699/1699 (`/tmp/can55-r3-testapp.log`); tsc and targeted eslint clean;
  `pnpm gates` passed; `format:check:changed -- --base 6992b502` clean.
- Focus: Grow and Restore are one button, so focus stays on it. Restore keeps the footer mounted
  until the next measure, so focus never drops to `<body>`. Entering edit mode clears the grown size.
  The spec asserts focus through both clicks: **14 passed** (`/tmp/can55-r3-spec6.log`).
- Neighbouring e2e (a11y-axe-gate, canvas, canvas-keyboard, canvas-arrange, flow-layout,
  phone-navigator, golden-path, starter-widgets, widget-kit, custom-widgets, session-quick-timer,
  tile-content-recovery), both profiles, no retries: **294 passed, 2 skipped**
  (`/tmp/can55-r3-neighbours.log`).
- Visual: reset every baseline to base `6992b502` and compared in the pinned container
  (`/tmp/can55-r3-visual1.log`). The session ended at 386/408. There were exactly 12 differences,
  all desktop/rail `/board` and `/scene/:id` (sans titles and the new layouts, inspected). Phone
  images were unchanged. Regenerated only those 12 with `-g "golden routes .* (/board|/scene/:id)"
  --update-snapshots=changed` (`/tmp/can55-r3-visual-update.log`, 18 passed). Baseline budget:
  32636.6 of 32768 KiB.
- Not fixed, outside owned scope: the home Map tile's zoom buttons are clipped by Map's own
  viewport (pre-existing, identical on base). The ENG-8.1 detector does not flag them.

## Rebase onto 7fab0ebd and claim fix (2026-10-02)

- Rebased onto `7fab0ebd`. The only conflicts were the 12 board/scene baselines, resolved to the
  integration branch's images (to be regenerated, below). Upstream added Screens (RC-CAN-7.3,
  `/board` → `/screen/:id`; a screen is a scene, ADR-041) and a generated pseudo-locale catalog.
- The detector spec now also visits each scene's `/screen/:id` surface. 6/6 detector cases pass.
- Claim feedback: `TimerBody.tsx` is now claimed. `qps-ploc.ts` is not, and it must equal `en.ts`
  key for key (`pseudo.test`, and `catalogCoverage('qps-ploc') === 1` in `index.test`). Any new
  `en.ts` key therefore forces an unclaimed edit. The six overflow strings now live in an
  English-only `TEXT` const in `WidgetRenderSlot.tsx`, the pattern TileActionMenu and the frame's
  `RESIZE_HELP` already use for canvas chrome. `en.ts`, `es.ts` and `qps-ploc.ts` match the base.
  The diff against `7fab0ebd` is now the six claimed source files, the recovery spec, this
  journal, and the visual baselines.
- On `70297f9d`: tsc clean, `pnpm lint` 0 errors (the only warning in this area is
  `CharacterBody.tsx:62`, which this task does not touch), `pnpm test:app` 1721/1721
  (`/tmp/can55-r5-testapp.log`), recovery spec 14/14 on both profiles (`/tmp/can55-r5-spec.log`).
