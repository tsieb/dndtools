# RC-WID-6.3 run journal

## Initial implementation (superseded by claim repair below)

- Quick is a DS Sheet with recipe, data/configuration and finish panels. The Full builder retains
  ownership of the draft, validation, local draft recovery, installation and trust review.
- Eight presets build ordinary template packages. More options changes only the visible editor
  and step; it retains the same draft. Unique identities prevent a repeated recipe upgrading an
  earlier widget. Query audience and the placed tile visibility are changed together.
- Command Center now consists of template widgets; its New widget intent lands in Board. The
  one-line Board handoff is a required companion path to open Quick immediately. Gallery and scene
  creation select Quick through their existing onInstalled callback. Extensions remains Full.
- The WID-5.5 parity file named by the task does not exist on this branch. Added parameterized
  parity coverage beside draft.test.ts: core JSON install and Full read/build preserve exact bytes
  for all eight recipes, including shared audience. No new renderer or package format.
- Note picker copies actor-filtered note text into the ordinary message setting, explicitly labelled
  as a copy. Counter uses the pre-existing WID-6.8 count/range settings and Configure workflow.
- Companion paths: Board handoff, EN/ES/pseudo catalogues, tests. No dispatcher state changes.

## Initial validation (before rebase and claim repair)

- Builder unit suite: 84 tests passed (7 files). Recipe parity also imports shared-audience variants.
- App typecheck passed; ESLint on changed implementation/tests and boundary lint passed.
- Quality gates passed (file-size warnings remain, no hard-limit breach); docs links passed.
- Quick + author-trust Playwright: 14 tests passed, desktop and mobile Chromium. Both party and
  counter take exactly 6 clicks from the board in reading mode (Edit layout, Add, Build your own,
  recipe, Next, Add to screen). Each Quick panel is axe-clean in both flows. Counter Configure is
  exercised in layout-edit mode while session.workflow remains idle (Standby); reading mode has no
  tile actions menu. Keyboard story uses real Tab/Enter from Command Center through placement.
- Found and corrected: Field help prop; core importer query-key order for byte parity; fixture PC
  creation (reuse a real demo PC through edit-field and set-combat); counter preview overflow
  (larger default tile); platform boundary (runtime.newId); Full step label in the test.
- Shared dialogs extracted to BuilderPanes to keep WidgetBuilder below 800 lines. DefinitionPane
  selects its textarea through the enclosing DOM ref, fixing the existing function-ref warning
  observed while validating the Full handoff.
- Preview scroll regions are keyboard-focusable through an opt-in template context, so larger vaults
  and long notes remain keyboard-scrollable. Companion paths BuilderPreview.tsx and templates/shared.tsx
  are required for the all-recipe axe check; placed widgets keep their existing focus order.
- Extensions Full-builder install/place regression: 2 passed, desktop/mobile.
- All eight recipe pickers additionally pass axe in desktop/mobile (10 Quick e2e tests total).
- Pinned-container visuals: 48 passed across desktop, rail and phone for add-panel, board-layouts,
  command-center-polish and scene-editor-polish. The initial unfiltered 531-test invocation was stopped
  after 35 passing cases in favor of these affected routes; no full-suite pass is claimed.
- Final paired scene-first-render: candidate 1450.1 ms, reference 1387.5 ms (+4.5%); the core
  comparison grades steady at its 20% tolerance. Both are below the 1500 ms absolute target. The capture uses
  seven interleaved batches / 21 samples per revision, a demo scene with 7 painted widgets (not the
  registry's 50-widget fixture), and the Vite dev server. Raw sample evidence is in
  RC-WID-6.3.perf.json; the shared measureCapture / compareToBaseline functions grade the result.
  The reference checkout is detached at task base 9752d983; no baseline file is overwritten.
  Headroom tools are not available in this session; command logs are retained locally.

## Reproduction

- `pnpm exec vitest run --config vitest.app.config.ts apps/gm-react/src/app/widgetBuilder`
- `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/widget-quick-builder.spec.ts tests/e2e/widget-author-trust.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2`
- `bash apps/gm-react/tests/visual/run-in-container.sh tests/visual/add-panel.spec.ts tests/visual/board-layouts.spec.ts tests/visual/command-center-polish.spec.ts tests/visual/scene-editor-polish.spec.ts --update-snapshots=none --workers=2`
- `pnpm exec tsx scripts/perf/capture.ts --only scene-first-render --port 5913 --reference-root /tmp/dndtools-wid63-reference --reference-port 5914 --out /tmp/wid63-perf-candidate.json --reference-out /tmp/wid63-perf-reference.json`

Local implementation and checks only. Central gates, independent review, integration and promotion
are not performed by this task. No push, loop launch, or dispatcher-control mutation.

## Claim repair against 8dc8b3dbb81361ddcca1d0bee4021bcb348a1556

The ownership gate rejected changes to Board.tsx, BuilderPreview.tsx and templates/shared.tsx.
All three are restored byte-for-byte to the specified base. They are not required companion edits:

- AddWidgetGallery captures the existing addWidget route request before Board clears it, then
  invokes its existing onBuild callback after the gallery opens. It consumes each location key once.
  Command Center still reaches Quick directly; subsequent Add opens the ordinary gallery.
- BuilderPanes owns FocusableBuilderPreview, an adapter around the unchanged preview component.
  It makes only preview template scroll regions keyboard-focusable, restoring attributes on cleanup.
  Quick and Full use the adapter; the shared renderer and placed widgets are unchanged.
- The keyboard-only e2e additionally verifies that opening Add after placement does not reopen Quick.
- The rebased tree now contains WID-5.5 parity.test.ts. Extended that existing gate with all eight
  Quick presets using its shared builderRoundTrip/core-export helper, in addition to the draft tests.

Headroom tools are unavailable. Current repair evidence:

- The exact `git diff 8dc8b3dbb81361ddcca1d0bee4021bcb348a1556 --exit-code --` comparison of the
  three rejected paths exits 0; they no longer differ from the claim base.
- Builder + gallery unit suite: 98 passed (8 files), including all eight recipe round trips.
- Quick + author-trust e2e: 16 passed across desktop/mobile. All eight pickers pass axe; six-click
  creation, real vault preview, Standby use and Full handoff remain covered.
- Extended keyboard-only request-consumption test: 2 passed across desktop/mobile.
- Typecheck, scoped ESLint, boundary lint and quality gates pass (existing size warnings only).
- Refreshed paired scene-first-render: 1240.8 ms candidate versus 1281.3 ms base (-3.2%); steady
  within the core comparator tolerance, both below the 1500 ms target. Seven interleaved batches,
  21 samples per side, unchanged demo fixture and dev-server measurement caveats apply.
  `state/RC-WID-6.3.perf.json` now contains this repair capture against the specified claim base;
  previous sample data remains in the initial implementation commit.
- WID-5.5 shared parity gate: 36 passed, including the eight new Quick recipe cases. Combined
  with the builder/gallery suite, 134 unit tests pass across 9 files.
- Pinned-container affected-route screenshots: 48 passed (desktop/rail/phone, no baseline updates).
- Extensions Full-builder install/place regression: 2 passed across desktop/mobile.
- Formatting and git diff whitespace checks pass. No claim widening is required.

Repair capture command: `pnpm exec tsx scripts/perf/capture.ts --only scene-first-render --port 5913 --reference-root /tmp/dndtools-wid63-claim-reference --reference-port 5914 --out /tmp/wid63-claim-perf-candidate.json --reference-out /tmp/wid63-claim-perf-reference.json`.
The temporary reference checkout was detached at the claim base and removed after capture.
