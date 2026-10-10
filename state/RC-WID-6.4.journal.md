# RC-WID-6.4 run journal

## Initial implementation (before claim repair)

- Identity starts with Name, Description and Icon. Advanced identity holds ids, version, category,
  devices and surfaces. Untouched ids derive independently from the name across disclosure closure
  and step remount; explicit ids and installed/generated package identities remain stable.
- Full always presents eight steps. Style and Advanced are summary disclosures for template runtime;
  custom code opens them. Layout retains template defaults, with Change size beside the preview
  opening the size editor. Automatic widths fit a phone; user-sized drafts retain their size.
- Definition is a header toggle, off by default, stored through the device preference adapter.
  Hidden JSON is unmounted; Select all still focuses/selects the complete read-only definition.
- Compact tiers have a tappable step summary and collapsed preview strip under the header.
  Back/Next/Install stay outside the scrolling editor, including reduced usable viewport heights.
  Step changes reset the editor scroll. Desktop footer precedes preview controls in tab order.
- Icon radios speak vocabulary meanings and keep one roving tab stop. Search accepts meanings/keys.
- Required companion changes: ReviewStep suppresses its old inline submit in Full; the typed platform
  preference key provides device persistence; EN/ES/generated pseudo copy; browser helpers updated
  to open the new disclosures rather than reaching hidden controls; unit/e2e/visual acceptance files.
- Thirty pinned PNGs cover Identity and Review in all five themes and all three viewport tiers.
  Every intermediate step receives axe coverage. Existing baselines occupied 34,576.6 KiB of the
  34 MiB budget before this work. The aggregate cap increases to 37 MiB for ~2.1 MiB of new captures;
  the 320 KiB per-image cap is unchanged. No existing screenshot is changed.

## Initial validation (before claim repair)

- Headroom tools unavailable; original command output retained in /tmp/wid64-\*.log and read directly.
- Builder unit suite: 87 passed across 8 files, including real DOM disclosure/remount ID derivation.
- Builder regression + initial acceptance e2e: 23 passed, 1 desktop-only keyboard case skipped on
  mobile. Real install, every-step axe, <=12 actual tabs, and Definition persistence/Select all pass.
- Related widget browser sweep: 41 passed initially; five failures investigated. Three Quick tests
  coincided with editing the locale catalogue/HMR, one legacy assertion queried the now-hidden rail,
  and one exposed a real table default wider than the phone after placement. Fixed the assertion and
  automatic size. Fresh Quick/author-trust/draft-recovery sweep: 20 passed across desktop/mobile.
- App typecheck, scoped ESLint and boundary lint have passed. Quality gates passed with existing
  file-size warnings; WidgetBuilder remains below the 800-line hard limit.
- Initial full App tests: 2182 passed; 2 pseudo-catalogue checks failed. Regenerated the catalogue
  using the repository generator. Fresh full rerun: 2184 passed across all 178 files, exit 0.
- Visual generation: 15 cases / 30 final PNGs. Original full-compare output: 13 passed, 2 timed out
  during initial application boot under concurrent suites; no pixel mismatch. Fresh final comparison: 15 passed, all 30 PNGs matched, updates disabled.
- Final height-aware acceptance: 7 passed, 1 intentional mobile skip for the desktop-only keyboard
  case. Includes an eight-step mobile install at normal and reduced heights, every-step axe with
  zero violations, <=12 actual desktop tabs, derived ids, persisted Definition/Select all, explicit
  size retention, and custom-runtime disclosures.
- Typecheck, scoped ESLint, boundary lint, quality gates, Prettier and git diff whitespace checks pass.
  Final screenshot budget: 36,653.2 KiB of 37,888 KiB. Pinned final comparison passes (15 cases, all 30 PNGs, updates disabled).

## Reproduction

- `pnpm test:app`
- `pnpm --filter @dndtools/gm-react typecheck`
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/widget-full-disclosure.spec.ts tests/e2e/widget-builder.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2`
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/widget-author-trust.spec.ts tests/e2e/widget-quick-builder.spec.ts tests/e2e/widget-edit-fork.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2`
- `bash apps/gm-react/tests/visual/run-in-container.sh tests/visual/widget-full-builder.spec.ts --update-snapshots=none --workers=2`
- `node apps/gm-react/tests/visual/check-baseline-budget.mjs`
- `pnpm lint:boundary` and `pnpm gates`

Original local logs: `/tmp/wid64-app.log`, `/tmp/wid64-final-e2e.log`,
`/tmp/wid64-regression.log`, `/tmp/wid64-recheck.log`, `/tmp/wid64-visual-final.log`,
`/tmp/wid64-typecheck.log`, `/tmp/wid64-lint.log`, `/tmp/wid64-last-lint.log`,
`/tmp/wid64-boundary.log`, `/tmp/wid64-gates.log`, `/tmp/wid64-budget.log`.
These are local validation records, not remote/central completion evidence.

No push, promotion, extra agents, loop launch or dispatcher-control mutation. Central gates and
independent review remain the operator's responsibility. Work is committed only on this task branch.

## Claim feedback repair against 7f11cf3a0a737057bab4016396ec937009a530e4

The central ownership gate rejected ReviewStep.tsx, platform/preferences.ts and the visual budget.
No unrelated changes were present at the start of this repair. Headroom tools remain unavailable.

- Restored ReviewStep.tsx byte-for-byte to the requested base and removed the hideSubmit prop from
  its owned caller. Review retains its existing inline install/save action; the owned BuilderFooter
  still supplies the persistent navigation action. Browser tests target that footer explicitly.
  The exact base comparison exits 0. Review snapshots will reflect the restored inline action.
- Retained platform/preferences.ts as a required claim exception: its only change is the new typed
  device preference key. The acceptance explicitly requires Definition visibility remembered per
  device. Existing keys all describe unrelated preferences, session storage is only tab-scoped,
  and direct storage access from an owned screen violates the existing platform boundary. A cast
  to circumvent the closed PreferenceKey union would undermine that contract.
- Retained tests/visual/check-baseline-budget.mjs as a required claim exception: before this repair,
  the base's other PNGs total 35,406,398 bytes, leaving only 245,186 bytes under its 34 MiB cap.
  The requested builder coverage in five themes and three tiers adds 30 PNGs totaling 2,126,434
  bytes. The 37 MiB cap is narrowly sized for those captures and preserves the 320 KiB per-file cap.
  Removing coverage, clipping away the layout, or deleting unrelated snapshots would weaken the
  acceptance evidence. Regenerated Review images may slightly change these totals.

These two retained paths require an operator decision to widen the claim. The commit message
explicitly requests that decision; the claim has not been widened and this is not a claim-gate pass.
Fresh validation of the Review restoration:

- Full disclosure + builder regression + author trust: 31 passed, one intentional mobile skip of
  the desktop keyboard test. Every-step axe, viewport-contained footer navigation, actual install,
  <=12 desktop tabs and persisted Definition/Select all still pass with Review restored.
- Typecheck, boundary lint, scoped ESLint, quality gates, formatting and whitespace checks pass.
- Pinned visual regeneration: 15 cases passed; only the ten rail/phone Review captures changed.
  Inspected the phone Review capture: the original inline action and persistent footer both remain
  readable. Identity captures and desktop Review captures are unchanged.
- Pinned comparison with updates disabled: 15 passed, all 30 snapshots matched. Final aggregate
  screenshot size is 36,678.8 KiB of the proposed 37,888 KiB cap.

Current logs: /tmp/wid64-claim-e2e.log, /tmp/wid64-claim-typecheck.log,
/tmp/wid64-claim-boundary.log, /tmp/wid64-claim-lint.log, /tmp/wid64-claim-gates.log,
/tmp/wid64-claim-format-check.log, /tmp/wid64-claim-visual-update.log,
/tmp/wid64-claim-visual-compare.log and /tmp/wid64-claim-budget.log.
No push, promotion, other agents or dispatcher-state edits.

## Self-heal round 1: claim widened (2026-10-09)

The dispatcher widened the claim to include apps/gm-react/src/platform/preferences.ts and
apps/gm-react/tests/visual/check-baseline-budget.mjs. Both changes are kept unchanged: the typed
builderDefinition device key and the 37 MiB aggregate cap. The two claim exceptions above are now
inside the claim. No source changes were made in this round.

loop/rc has moved to 1028592b (RC-CAN-8.2, canvas resize); `git merge-tree` against it is clean.
Fresh local re-validation on 346fdaaf:

- `pnpm --filter @dndtools/gm-react typecheck`: exit 0 (/tmp/wid64-r2-typecheck.log).
- Builder unit suite (`vitest run src/app/widgetBuilder`): 87 passed in 8 files (/tmp/wid64-r2-unit.log).
- widget-full-disclosure + widget-builder on desktop-chromium and mobile-chromium: 25 passed and
  1 intentional mobile skip of the desktop-only keyboard case (/tmp/wid64-r2-e2e.log).
- `check-baseline-budget.mjs`: 846 files, 36,678.8 KiB of 37,888.0 KiB, exit 0.

These are local records only. Central gates and independent review still belong to the operator.
No push, promotion, extra agents or dispatcher-state edits.

## Lint gate repair (head 19f42a18)

The central Lint gate failed in `pnpm lint:emphasis`: `WidgetBuilder.tsx multiple-accent-primaries
2 > 0`. The Full dialog could show three gold primaries: ReviewStep's inline Install (unowned, kept
byte-for-byte) and BuilderFooter, whose Next/Install was always primary, at its desktop and phone
sites. On Review that was a real double gold action, not only a static-analysis artefact.

- BuilderFooter now takes its forward action as children. WidgetBuilder picks the step body and
  that action in one conditional: Review gets the secondary footer Install next to ReviewStep's
  primary Install, and every other step gets the primary Next. Tab order and footer placement are
  unchanged, and the footer's accessible names are the same.
- The preview column moved into BuilderPanes as BuilderPreviewPane (sharing a `changeSize` handler
  with the phone strip). WidgetBuilder is 784 lines, under the 800-line limit.
- Emphasis baseline untouched; `pnpm lint` (full gate command) exit 0 (/tmp/wid64-r3-lint.log).
- Typecheck exit 0; builder unit suite 87 passed (/tmp/wid64-r3-unit.log).
- e2e desktop+mobile: full-disclosure, builder, author-trust, commands, edit-fork, quick-builder
  51 passed + 1 intentional mobile skip (/tmp/wid64-r3-e2e.log); intents, honest-previews,
  query-sources 20 passed (/tmp/wid64-r3-e2e-more.log).
- Pinned visual: only the 15 Review captures changed (footer Install now secondary); inspected the
  phone tavern capture — one gold action. Compare with updates disabled: 15 passed
  (/tmp/wid64-r3-visual-compare.log). Budget 852 files, 36,780.8 KiB of 37,888 KiB.
- `format:check:changed --base loop/rc`, `pnpm gates` and `git diff --check` exit 0.

Local records only; central gates and review remain the operator's. No push, promotion, extra
agents or dispatcher-state edits.

## Browser acceptance repair (head 11444078)

The central full e2e run (`pnpm e2e --workers=2 --retries=2`) failed 7 tests on every retry. I had
not run these builder-adjacent specs locally before. One `tile-resize.spec.ts:119` mobile flake
passed on retry; that spec belongs to RC-CAN-8.2 and is untouched here.

- **Real regression, fixed in product code:** `settings-tiers.spec.ts:169` (both profiles). The
  initial 6.4 implementation had replaced `shownBuilderSteps(draft, tier, step, issues)` with
  `STEP_IDS` and dropped `AdvancedStepGate`, so a Beginner's builder showed Advanced again
  (RC-UX-6.4). Restored both in WidgetBuilder; the step summary now reads "Step n of 7" for a
  Beginner and "of 8" otherwise. The gate renders with the rail (open it on a phone).
- **Specs written for the old layout, updated:** `hub-templates.spec.ts:81/:95`,
  `widget-generate.spec.ts:153`, `extensions-polish.spec.ts:45` (mobile) and the settings-tiers
  phone path. They clicked rail buttons hidden behind the phone step summary, used the removed
  Edit/Preview radios, picked Presentation inside Layout's closed size disclosure, or hit the
  intended second Install (footer vs Review). They now use `_widget-builder.ts` helpers: new
  `openBuilderRail`, `builderStep` (also opens Layout's disclosure, any step count) and
  `builderPane`, and scope Install to `builder-footer`.

Fresh local validation:

- The 4 failing specs, desktop+mobile: 42 passed, 4 intentional skips (/tmp/wid64-r4-e2e.log).
- Sweep `tests/e2e/widget-*`, `settings*`, `onboarding*`, desktop+mobile: 161 passed, 1 intentional
  skip (/tmp/wid64-r4-sweep.log).
- Pinned visual compare, updates disabled: 15 passed, no snapshot change (default tier keeps all
  eight steps) (/tmp/wid64-r4-visual-compare.log).
- Unit (`src/app/widgetBuilder`, `src/screens/settings`): 121 passed in 12 files.
- Typecheck, `pnpm lint`, `format:check:changed --base loop/rc`, `pnpm gates`, `git diff --check`
  exit 0. WidgetBuilder is 790 lines.

Local records only. I did not re-run the full 1,900-test suite. Central gates and review remain
the operator's. No push, promotion, extra agents or dispatcher-state edits.
