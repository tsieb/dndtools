# RC-WID-6.4 run journal

## Implementation

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

## Validation

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
