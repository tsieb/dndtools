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
