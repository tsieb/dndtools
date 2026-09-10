# RC-DSN-1.1 unblock journal

- Inherited commits 57331f98, 6c434b3e, a5a22ada: grouped token map, per-file raw-style ratchet, tokenized widget placeholder spacing, debt status.
- Reviewed original browser acceptance log 02710099-2f8d-4c9c-bcc7-c5474f968f4c: 1039 passed, 11 skipped, eight failures involving quick-map drag, equipment preview, board touch targets, and combat hit-point pointer interception. These remain unverified; no browser gate success claimed.
- Found acceptance gap: lint suppressed allowed findings without printing a current count. Added a source-derived count using the configured rule without allowances, run by pnpm lint.
- Fixed malformed context.report payloads so new violations include actual property/value diagnostics; added regression coverage for growth, stale allowances, and token usage.
- Regression tests also exposed an ESLint 10 incompatibility in stale-allowance reporting; replaced the removed getSourceCode method with context.sourceCode.
- Confirmed built-in widget bodies contain no raw hex/rgba colors; the old map placeholder has been replaced by the shared MapCanvas.
- Focused regression suite: 3 passed. Source count: 2130 findings across 255 files. Full lint passed (0 errors, 15 existing warnings), including boundary and non-text contrast gates.
- pnpm test:tooling: 21 files / 134 tests passed.
- Starter widget browser acceptance on isolated port 5387: desktop and mobile Chromium both passed (2 tests).
- Full browser acceptance was not rerun; the eight failures in the prior operator run remain unresolved. No application rendering changes were made by this unblock pass.

## Second unblock pass

- Operator log efccf1b1-c968-4285-b96a-2ce95374dfb4 repeated eight browser failures at cb1839cd; all other gates passed.
- Reproduced quick-map drag on both profiles. Temporary pointer-event instrumentation showed pointerdown hitting a reopened sheet scrim. Split selection-driven sheet opening from tool changes; removed the diagnostic instrumentation.
- Reproduced compact combat HP failure. Screenshot showed the compensated Next turn header consuming the short tile; the flex list had no visible height. Scroll the compact body as a whole so rows remain reachable.
- Map tile controls now compensate for scene scale using the existing density target, including the native select and zoom buttons.
- Equipment assertion updated to the existing RC-CHR-4.3 read-only preview contract: inventory visible, form absent during preview, restored after exit. Core owner/DM/stranger authorization assertions preserved.
- After the drag fix, quick-map reached the import wizard and exposed SVG imports blocked by required raster calibration despite intentionally lacking raster dimensions. SVG now uses source/preview/result; raster calibration remains intact. The test uses Next from source and retains fingerprint, import commit, and asset-count checks.
- Map control sizes use a shared inline style, consistent with existing board operation controls and overriding the global Android minimum before canvas scaling.
- App suite passed: 103 files / 1095 tests (before the SVG follow-up). Final typecheck and lint passed; lint still reports 2130 raw values across 255 files, 0 errors / 15 existing warnings, with boundary and contrast gates passing.
- Six-spec browser regression run: 176 passed / 5 skipped / 3 failed. Two failures were the SVG calibration blocker fixed above; the third showed compensated zoom buttons clipped in a short mobile map tile. Changed the zoom controls to a horizontal row and reserved their minimum height.
- Final original-failure plus raster-import rerun: 11 passed / 1 intentional desktop skip. Covers all eight operator failures, SVG commit/preservation, and raster grid/scale/wall commit on both profiles (`/tmp/rc-dsn-acceptance-final.log`).
- Final map-layout follow-up: 20 passed, including pointer/keyboard zoom, rebinding, projection, fog, board axe, Android touch bounds, and compact map builder (`/tmp/rc-dsn-map-final.log`).
- Formatting and diff whitespace checks passed. The complete repository browser suite remains for the central operator; no full-suite pass is claimed.

## Third unblock pass — lint coverage defects

- Review of bf3c2356 reported two medium defects in the enforcement/counting rule. Reproduced both
  with in-memory probes against the rule, plus two adjacent gaps in the same resolution path:
  - **Traversal-order dependence.** Style buckets were collected into a name map by a
    `VariableDeclarator` visitor, so `style={s}` resolved only when `const s = {...}` appeared
    _before_ the JSX. A bucket declared at the bottom of the file scored zero findings; the same
    file with the declaration moved above the component scored two. Ordering, not content, decided
    whether the debt was counted.
  - **Multi-value spacing shorthands escaped detection.** `isPureNumericValue` matched a single
    token, so `padding: '8px 12px'` and `padding: '7px 0'` were invisible. 570 such literals exist
    in the scoped trees.
  - `style={styles.row}` (member access) and `style={compact ? a : b}` / `padding: on ? 8 : 4`
    (conditionals) resolved to nothing. 15 conditional style attributes exist in the scoped trees.
- Rewrote resolution to use ESLint scope analysis rather than a traversal-order name map, so
  bindings resolve regardless of declaration position and shadowed names resolve to the inner
  binding. Added member access, conditional/logical branches, and spread targets. Findings are now
  deduplicated by node so a bucket shared across several JSX sites counts once.
- Widened raw color detection from inline style objects to any string or template literal in the
  scoped trees, matching the story's wording. This catches canvas fill styles, gradient template
  strings and the `sceneCardMood` palette table. `.test.ts` joins `.test.tsx` in `ignores` so test
  fixtures are not counted as product debt.
- `scripts/raw-style-count.js` gained `--write` to regenerate the ratchet from real counts; the
  allow-list header now names that command instead of describing hand edits.
- Count moves 2130 → **2599 findings across 261 files** (was 255) — the 469 newly visible values are
  the coverage the defects were hiding, not new debt.
- Verified unchanged: the five `T` groups still map to existing CSS tokens, and built-in widget
  bodies still contain zero raw hex/rgba, so DEBT-2026-004(a),(d) remain resolved.
- Gates run for this pass: `pnpm lint` passed (0 errors, 15 pre-existing warnings; boundary and
  non-text contrast gates green) and the rule's unit suite passed 9/9. No application rendering
  changes were made; browser acceptance is unchanged from the prior pass.

## Fourth pass — rebase onto the moved integration base (2026-09-10)

- Rebased onto `loop/rc` at `fe023479`. It had moved past the `23309972` named in the task, so the
  branch now also carries RC-ENG-2.4/2.5 (Android preflight, setup-e2e).
- Dropped `1111f0fb` with `rebase --skip`; it duplicates `23309972`. The only hunk the upstream copy
  lacks is in `tools/loop/run-loop.sh`, which upstream has since retired to a
  dispatcher-redirect stub. Nothing was lost.
- `12c170fd` (browser-acceptance unblock) conflicted in four files. Upstream `64ea76e7` and
  `3026e0b1` had fixed the same four regressions independently during the v0.3.7 promotion.
  Resolved per file, taking upstream wherever both fixed the same thing:
  - `MapEditor.tsx`: took upstream's transition-only dock trigger. My split effect keyed on the
    `editor.selection` array identity, so it could still reopen the sheet on a re-render.
  - `widgets/builtin/Map.tsx`: took upstream's `scene-board-operation` class. My inline
    `mapOperationStyle` applied the scale compensation on every platform, and `3026e0b1`
    deliberately removed exactly that, because it pushed the zoom cluster under the neighbouring
    tile on a phone. Keeping mine would have undone their fix, so the style constant, the
    zoom-row change and the reserved canvas min-height were dropped along with it. The only
    surviving hunk is the RC-DSN token swap `borderRadius: T.radius.sm`.
  - `ImportMapDialog.tsx` and `android-quick-map.spec.ts`: took upstream. Upstream now reads SVG
    dimensions from the markup so SVGs can be calibrated. My SVG-skips-calibration branch would
    have bypassed that. The spec walks upstream's calibration steps.
  - `InitiativeTracker.tsx`: took upstream's root-cause fix (`dense` Next-turn chip, centred
    header). My whole-body scroll was redundant with it.
  - `equipment.spec.ts`: kept upstream's comment and added my two stronger assertions: inventory
    stays visible during preview, and the Item field returns after the preview ends.
- Commit `096428ee` keeps the title "unblock browser acceptance for board controls and map
  workflows", but after the resolution its only content is the Map.tsx token swap, the
  equipment assertions and this journal. Its board and map fixes live upstream now.
- The acceptance still holds on the rebased tree, and upstream did not already satisfy it (no
  upstream commit adds the `T` groups or the ratchet). `pnpm lint` passed: it printed "Raw style
  values: 2599 across 261 files", with 0 errors, the 15 pre-existing warnings, and boundary and
  contrast green. The per-file allow-list needed no regeneration. A grep of `widgets/builtin`,
  `WidgetPlaceholder.tsx` and `widget-body-kit.tsx` finds no raw hex or rgba, so
  DEBT-2026-004(a),(d) remain resolved.
- Other gates run: `pnpm typecheck` passed; `pnpm test:app` passed 103 files and 1098 tests;
  Prettier and `git diff --check` are clean on the branch delta. The rule's own suite
  (`tests/unit/no-raw-style-values.test.ts`) passed 9/9 when run directly.
- `pnpm test:tooling` first failed 10 cases, all in upstream's `check-android.test.ts`, with
  `ERR_MODULE_NOT_FOUND: saxes`. Upstream added that dependency in the new base, and this
  worktree's `node_modules` predated it. My only `package.json` change adds the
  `lint:raw-style-count` script. After `pnpm install --frozen-lockfile` (lockfile unchanged), it
  passed 24 files and 161 tests.
- Session teardowns cut off both of my local runs of the affected specs, on both profiles: at
  about 125 of 218 tests, then at 31. Neither had a failure before it stopped. The operator's full
  run below supersedes them.

## Fifth pass — browser acceptance at `66066d5b`

- Operator run `61835210`: 1046 passed, 11 skipped, 1 failed. Every spec this branch touches or
  depends on passed on both profiles, including equipment, android-quick-map, map-tile,
  combat-tile, canvas, map-editor, starter-widgets and custom-widgets.
- The one failure is `combat-audio-automation.spec.ts:57` on mobile, and the same test passed on
  desktop in that run. The error is `page.evaluate: Execution context was destroyed, most likely
because of a navigation`, thrown at the first `evaluate` in `goLiveAndStartCombat` (line 12).
- I conclude this is a pre-existing upstream flake, not a regression from this branch:
  - The identical failure appears in operator run `859bdabe`, on 2026-09-09 on worktree
    `034f475f`. That worktree belongs to a different task and predates this rebase; the failure is
    at the same line, on the same profile and at the same test index (691).
  - Across the 16 real Playwright gate logs under `.state/attempts` that ran this test, it failed
    twice: in `859bdabe` and here. Agent transcripts that merely quote gate output were excluded
    from the count.
  - The spec never touches this branch's app delta against `loop/rc`: the `screen-kit` `T` groups,
    the `WidgetPlaceholder` spacing and the `Map.tsx` radius token.
  - Locally it passed 10/10 (5 repeats on each profile) and then 25/25 on mobile at
    `--workers=2`.
- Causes ruled out, from inside and outside my owned paths:
  - The service-worker reload: in dev it registers only with `?sw=dev`, which the e2e specs never
    pass.
  - `App.tsx`'s reload: it fires only after a backup restore.
  - A Vite reload caused by source edits: every source mtime in this worktree is 09:01–09:03,
    before the commit at 09:08 and the gate start at about 09:10.
  - A Vite dependency-optimizer reload: `apps/gm-react/node_modules/.vite` was last written at
    09:08, and nothing was added to it during the run.
- The root cause of the navigation is still unknown. The gate's `webServer` doesn't capture
  Vite's stdout, so the log cannot show more. I did not change the spec or the app to mask it.
  Hardening it blind could hide a real navigation bug, and the reload triggers live outside this
  story's owned paths. Recommended follow-up for the RC-AUD-3.1 owner: capture `webServer` stdout
  and trace the navigation on the mobile project.
