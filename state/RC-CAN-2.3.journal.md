# RC-CAN-2.3 run journal

## Scope

Note tile depth levels: `app/widgets/builtin/Note.tsx`, the note widget's `configFields`
(`depth: title|summary|full`), a depth badge in edit mode. Full depth uses the shared markdown
renderer and virtualizes over 200 lines (IntersectionObserver sentinels). Acceptance: e2e toggles
depth; perf test renders a 2,000-line note tile under the `widget-update` budget. No agents,
dispatcher mutations, push or promotion.

## Ownership (resolved)

The first attempt was fenced out ("candidate changes paths outside its claim") because the task's
`owns` was `["app/widgets/builtin/Note.tsx"]` only and the manifest had no companion paths. Both are
fixed outside this branch. `owns` now lists `WidgetFrame.tsx`, `Note.tsx`, `NoteBody.tsx`,
`NotesBody.tsx`, `builtin/index.tsx` and `widget-package-state.ts`. `manifests/dndtools.json`
`companion_paths` grants the rest of this diff: `i18n/messages/*.ts`, `tests/e2e/*.spec.ts`,
`*.test.tsx`, `*/__snapshots__/*` and `scripts/eslint-rules/*.allow.js`. This journal matches
`journal_paths` (`state/{id}.journal.md`). Checked each changed path against the engine's fence
expression (`dispatcher/engine.py` ~line 625): none fall outside. No source change was needed for
the retry.

## Progress

- Read the fence, the note definition (`EMPTY_OBJECT_SCHEMA` config, so a new key validates on add
  and configure), the Inspector (flat `FieldControl`s; a select is label-associated through DS
  `Field`), the markdown parser and the `widget-update` capture scenario.
- Edit-mode signal: only `Board.tsx` and `sceneEditor/index.tsx` host the canvas and both pass
  `onWidgetCommand`, which `WidgetFrame` drops while editing. "No `onCommand`" is therefore edit
  mode, the convention `builtin/index.tsx` already documents for the operate chips.
- Chunking safety: a `[!Secret]` callout runs over consecutive `>` lines only. A cut at a blank
  line outside a fence is parse-equivalent; a forced cut between two `>` lines would render the tail
  of a secret as a plain quote on a projected board, so that cut is forbidden.
- `57efbffe` implemented `Note.tsx` (`NoteTile`: title/summary/full, edit-mode depth badge only for
  widgets that declare `depth`, full depth in a labelled focusable scroll region that keeps wheel and
  scroll keys from reaching the canvas; >200 lines → ~100-line windows, each an IntersectionObserver
  sentinel with `rootMargin: 100% 0px`, released windows keep their measured `offsetHeight`, a
  window holding focus is never released, no-IO platforms mount everything). Core note definition
  gained `selectField('depth', …, 'full', 'display')`; `full` stays the default so placed notes are
  unchanged. EN/ES keys added. The old `NoteBody.tsx` body and its one raw-style allowance went.
- `6179e05d` restored `NoteBody.tsx` as a 12-line shim over `NoteTile` and moved the canvas badge
  into the `WidgetFrame` header (`note-depth-badge`, edit mode, notes that declare `depth`).
  `WidgetFrame` wraps its render slot in `NoteFrameContext` so a framed note body does not draw a
  second badge; standalone hosts (`builtin-bodies.test.tsx`, no `onCommand`) keep the body's badge.
  `builtin/index.tsx` passes `editing={!onCommand}`.
- Tests: `Note.test.tsx` (depths, secret withheld at every depth, badge, chunker losslessness,
  no cut between `>` lines or inside a fence, one window mounted for 2,000 lines, IO mount/release,
  focus retention, no-IO fallback). `tests/e2e/note-depth.spec.ts` (Inspector toggles depth on
  both projects; 2,000-line tile p95 vs the `widget-update` target read from `budget-registry.ts`,
  windowing, scroll to the end).

## Validation results

### First attempt (before `6179e05d`)

- `pnpm --filter @dndtools/gm-react typecheck` and `pnpm --filter @dndtools/core typecheck`: exit 0.
- `vitest --config vitest.app.config.ts` on `app/widgets/builtin` + `i18n`: the only failure was the
  note snapshot in `builtin-bodies.test.tsx` (that test renders without `onCommand`, i.e. edit
  mode, so the badge now shows: `Depth: Full noteEmpty note — …`). Intended; updated with `-u`,
  30/30 pass after.
- e2e run 1 (port 15531, load ≈ 6): depth toggle passed on desktop + mobile. The perf test failed
  on both, not on timing: `PlatformBoundaryRejectionError: Payload of 5390278 bytes exceeds the
5242880 byte limit for storage.persistFullState`. Each configure op carries the whole ~120 KB
  body and ~20 of them cross the 5 MB boundary. Spec lines shortened (~45 KB body, still 2,000
  lines × 25 samples).
- e2e run 2 (port 15531): `note-depth.spec.ts` 4/4 passed (desktop + mobile). JSON-reporter rerun
  of the perf test: desktop first render 36.6 ms, p95 50 ms, max 50.1 ms; mobile first render
  37.9 ms, p95 50 ms, max 50 ms; 25 samples each vs the 100 ms `widget-update` target. The 50 ms is
  frame-quantised: each sample waits for the new text and then one more rAF, about three 60 Hz
  frames, so it is one frame more conservative than the single-rAF span in
  `scripts/perf/capture.ts`.
- `pnpm test:critical` (core): 272 files, 4,760 tests passed. `pnpm test:app`: 119 files, 1,260
  tests passed.
- `pnpm test:tooling`: 160 passed, 1 failed, NOT from this change: `file-size-gate.test.ts` reports
  `apps/gm-react/src/screens/Campaign.tsx` at 994 lines against its RC-STB-2.7 baseline of 988.
  This tree has zero diff on that file (RC-UX-3.1's `3211404f`). Left alone.

### Retry (HEAD `6179e05d`, 2026-09-11)

- gm-react and core `typecheck`: exit 0.
- `npx vitest run --config vitest.app.config.ts apps/gm-react/src/app/widgets/builtin
apps/gm-react/src/app/canvas`: 5 files, 128 tests passed.
- ESLint on all seven touched source/test files: exit 0. `pnpm lint:raw-style-count`: 2,593 across
  260 files.
- e2e: `DNDTOOLS_E2E_PORT=49551 npx playwright test tests/e2e/note-depth.spec.ts
--project=desktop-chromium --project=mobile-chromium` (load ≈ 7): 4/4 passed, exit 0 — the
  Inspector depth toggle (badge in the frame header) and the 2,000-line perf test on both projects.
- `loop/rc` is 17 commits past this branch's base; none touch this branch's paths, so the engine's
  rebase applies cleanly.

### Second retry (2026-09-12, feedback "allowance unknown or stale")

- That text is a scheduler eligibility reason, not a gate result: `dispatcher/scheduler.py:104-108`
  adds it when the provider usage pool has no reading (`known` false) or the reading is older than
  `allowance_max_age`. It does not inspect the candidate, and the usage probe is dispatcher state
  this task must not touch. It is unrelated to `scripts/eslint-rules/no-raw-style-values.allow.js`.
  No source change.
- The engine rebased the branch onto `f543ec9d` (new SHAs `08b722cf`, `c507afbd`, `74674d48`).
  `loop/rc` has 7 more commits since (PRs #70/#71/#72 and the main merge); none touch this
  branch's paths.
- Re-validated on the rebased tree: gm-react and core `typecheck` exit 0; ESLint on the seven
  touched files exit 0; widget + canvas vitest 5 files, 128 tests passed; `note-depth.spec.ts` on
  desktop-chromium + mobile-chromium, `DNDTOOLS_E2E_PORT=39987` (load ≈ 8–12): 4/4 passed, exit 0.

### Third retry (2026-09-12, review: ordered list split at a window boundary)

- Reviewer's probe (a 201-line tight `1. … 201.` list) rendered two `<ol>`s, the second restarting
  from one. Cause: the hard cut (≥ 200 lines with no blank line) was only barred between two `>`
  lines and two `|` rows. `parseBlocks` continues a list over consecutive item lines, and a paragraph over
  consecutive plain lines, so the cut split those blocks too.
- Fix in `splitNoteChunks`: flip the blacklist to an allow-list. A hard cut now happens only where
  the parser starts a new block whatever preceded it: after a closing fence, or before an opening
  fence or a heading without a `|` (a table takes any `|` line as a row). A run with none of those
  stays in one window, as before. The `>` and table rules are subsumed.
- The reviewer also saw per-window heading anchors (`repeated` instead of `repeated-3`). The renderer
  takes no anchor offset and `render.tsx`/`plugins.ts` are outside this claim. Nothing in the app
  navigates to a heading `id` (routing is the hash), so this is documented on `splitNoteChunks` and
  excluded from the equivalence test, not changed.
- Tests: the 201-step list stays one chunk and renders as one `<ol>` of 201 items; a no-blank body
  still cuts, only before headings/fences; a seeded property test (40 bodies × 400 lines of every
  block type, target 5, >100 cuts) asserts `chunks.flatMap(parseBlocks)` equals `parseBlocks(body)`
  modulo anchors. Against the old chunker, the three `splitNoteChunks` tests fail (3 failed / 21
  passed); against the fix all pass.
- Validation: `Note.test.tsx` 25 tests pass; widget + canvas vitest 5 files, 132 tests passed;
  gm-react `typecheck` exit 0; ESLint + Prettier on both files exit 0;
  `DNDTOOLS_E2E_PORT=47713 npx playwright test tests/e2e/note-depth.spec.ts
--project=desktop-chromium --project=mobile-chromium` (load ≈ 2): 4/4 passed, exit 0.

## Finding for follow-up (outside this story)

- A very large note edited many times in one session can exhaust the 5 MB `persistFullState`
  boundary (`platform/storage/coreStore.ts:502`), because every `scene.configure-widget` op
  persists the full configuration. Not caused by depth levels; it applies to the note body as
  shipped. Worth a look alongside op-log compaction.

### Fourth retry (2026-09-16, feedback: rebase conflict on `55c6a466`)

- The gate feedback was a rebase failure, not a review finding. `loop/rc` moved 20 commits past this
  branch's base and five of them touch `WidgetFrame.tsx` (RC-CAN-2.4's tile action menu, then
  `83cb216f` "visibility badges by exception"), so `55c6a466` no longer applied.
- Rebased onto `32d9ed73`. One conflicted file, two hunks, both in the import/opening lines of
  `WidgetFrame.tsx`; resolved in `loop/rc`'s favour and re-added only what this story needs:
  - imports: kept `LayoutHistory`, `useRef` and `VisibilityChip`, dropped the now-unused
    `visibilityChip` helper, and merged `Badge` into the `ds` import beside the note imports.
  - body: kept `const { t } = useI18n();` and dropped `const chip = visibilityChip(w.visibility);`
    — `83cb216f` replaced that inline chip with `<VisibilityChip byException>`.
    The depth badge, the `NoteFrameContext.Provider` around the render slot and the header markup
    auto-merged; the badge still sits beside `w.typeLabel` in the metadata row, which the new
    visibility chip does not occupy.
- New gate on the rebased base: RC-ENG-8.4's emphasis lint (`f4575229`) fails a file whose count
  rises above `scripts/emphasis-baseline.json`, and the baseline may only shrink. `Note.tsx:161`
  tripped `display-face-below-24px` at 13px. The style is not new — it came across verbatim from the
  old `NoteBody.tsx`, whose baseline entry of 1 is now unspent — but a moved finding still reads as a
  regression on a new file, and the baseline is outside this claim. Fixed in `Note.tsx` with the
  rule's own prescription: the note heading is `700 var(--text-sm) var(--font-sans)`. The stale
  `NoteBody.tsx` entry is left for whoever owns the baseline (the lint warns, it does not fail).
- Validation on the rebased tree: gm-react and core `typecheck` exit 0; ESLint on all nine touched
  source/test files exit 0; Prettier `--check` clean; `pnpm lint:raw-style-count` 2,580 across 259
  files; `pnpm lint:emphasis --quiet` exit 0, no regressions.
- Tests: widgets + canvas vitest 5 files / 132 tests passed (includes `WidgetFrame.test.tsx`'s 67,
  whose header snapshots `8b582677` had just rewritten). `pnpm test:app` 127 files / 1,364 tests.
  `pnpm test:critical` 273 files / 4,779 tests. `pnpm test:tooling` 25 files / 187 tests — all pass
  now, including the `file-size-gate` case that failed on the old base for an unrelated file.
- e2e (`DNDTOOLS_E2E_PORT=53211`, load ≈ 7): `note-depth.spec.ts` 4/4 on desktop-chromium +
  mobile-chromium, exit 0, re-run after the font change. Because `WidgetFrame` is shared canvas
  chrome, also ran `canvas.spec.ts`, `starter-widgets.spec.ts` and `scene-cards.spec.ts` on both
  projects: 112 passed, exit 0 — including the new "visibility badges mark exceptions" case.
