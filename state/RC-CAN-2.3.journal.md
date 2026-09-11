# RC-CAN-2.3 run journal

## Scope

Note tile depth levels: `app/widgets/builtin/Note.tsx`, the note widget's `configFields`
(`depth: title|summary|full`), a depth badge in edit mode. Full depth uses the shared markdown
renderer and virtualizes over 200 lines (IntersectionObserver sentinels). Acceptance: e2e toggles
depth; perf test renders a 2,000-line note tile under the `widget-update` budget. No agents,
dispatcher mutations, push or promotion.

## Ownership gap (needs an operator `task.update` before this candidate can pass the fence)

The task record's `owns` is `["app/widgets/builtin/Note.tsx"]`. The engine's fence
(`dispatcher/engine.py`, "candidate changes paths outside its claim") compares repo-relative diff
names against it, so the story cannot meet its own acceptance inside that claim. The note body lives
in `NoteBody.tsx` today (RC-WID-4.1 split), the depth field is core data, and the acceptance names an
e2e and a perf test. Paths this candidate needs:

- `apps/gm-react/src/app/widgets/builtin/Note.tsx` (new; the claimed file)
- `apps/gm-react/src/app/widgets/builtin/NoteBody.tsx` (deleted; moved into `Note.tsx`)
- `apps/gm-react/src/app/widgets/builtin/index.tsx` (route `note`/`handout` to `Note.tsx`)
- `packages/core/src/state/widget-package-state.ts` (the note's `depth` config field)
- `apps/gm-react/src/i18n/messages/en.ts`, `apps/gm-react/src/i18n/messages/es.ts`
- `apps/gm-react/src/app/widgets/builtin/Note.test.tsx` (new)
- `apps/gm-react/src/app/widgets/builtin/__snapshots__/builtin-bodies.test.tsx.snap`
- `apps/gm-react/tests/e2e/note-depth.spec.ts` (new)
- `scripts/eslint-rules/no-raw-style-values.allow.js` (drop the deleted file's allowance)

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
- Implemented `Note.tsx` (`NoteTile`: title/summary/full, edit-mode depth badge only for widgets
  that declare `depth`, full depth in a labelled focusable scroll region that keeps wheel and scroll
  keys from reaching the canvas; >200 lines → ~100-line windows, each an IntersectionObserver
  sentinel with `rootMargin: 100% 0px`, released windows keep their measured `offsetHeight`, a
  window holding focus is never released, no-IO platforms mount everything). Core note definition
  gained `selectField('depth', …, 'full', 'display')`; `full` stays the default so placed notes are
  unchanged. EN/ES keys added. `NoteBody.tsx` deleted (and its raw-style allowance).
- Tests: `Note.test.tsx` (depths, secret withheld at every depth, badge, chunker losslessness,
  no cut between `>` lines or inside a fence, one window mounted for 2,000 lines, IO mount/release,
  focus retention, no-IO fallback). `tests/e2e/note-depth.spec.ts` (Inspector toggles depth on
  both projects; 2,000-line tile p95 vs the `widget-update` target read from `budget-registry.ts`,
  windowing, scroll to the end).

## Validation results

- `pnpm --filter @dndtools/gm-react typecheck` and `pnpm --filter @dndtools/core typecheck`: exit 0.
- `vitest --config vitest.app.config.ts` on `app/widgets/builtin` + `i18n`: the only failure was the
  note snapshot in `builtin-bodies.test.tsx` (that test renders without `onCommand`, i.e. edit
  mode, so the badge now shows: `Depth: Full noteEmpty note — …`). Intended; updated with `-u`,
  30/30 pass after.
- ESLint on every touched file: exit 0. `pnpm lint:raw-style-count`: 2,595 across 260 files (was
  2,596 / 261: the deleted file's one value; `Note.tsx` has none). Prettier `--check`: clean.
- e2e run 1 (port 15531, load ≈ 6): depth toggle passed on desktop + mobile. The perf test failed
  on both, not on timing: `PlatformBoundaryRejectionError: Payload of 5390278 bytes exceeds the
5242880 byte limit for storage.persistFullState`. Each configure op carries the whole ~120 KB
  body and ~20 of them cross the 5 MB boundary. Spec lines shortened (~45 KB body, still 2,000
  lines × 25 samples).
- e2e run 2 (port 15531): `note-depth.spec.ts` 4/4 passed (desktop + mobile), Playwright exit 0.
  JSON-reporter rerun of the perf test, annotations: desktop first render 36.6 ms, p95 50 ms, max
  50.1 ms; mobile first render 37.9 ms, p95 50 ms, max 50 ms; 25 samples each vs the 100 ms
  `widget-update` target. The 50 ms is frame-quantised: each sample waits for the new text and then
  one more rAF, about three 60 Hz frames, so it is one frame more conservative than the single-rAF
  span in `scripts/perf/capture.ts`.
- `pnpm test:critical` (core): 272 files, 4,760 tests passed. `pnpm test:app`: 119 files, 1,260
  tests passed.
- `pnpm test:tooling` (`tests/unit`): 160 passed, 1 failed, and the failure is NOT from this
  change. `file-size-gate.test.ts` reports `apps/gm-react/src/screens/Campaign.tsx` at 994 lines
  against its RC-STB-2.7 baseline of 988. This tree has zero diff on that file; it is already 994
  lines at HEAD, last touched by RC-UX-3.1's `3211404f` (help tip beside the faction visibility
  chip). Left alone: the file is outside this story and belongs to whoever owns that growth.
- Implementation committed before the broad browser run finished, so an interruption cannot strand
  it (the RC-UX-3.1 lesson).

## Finding for follow-up (outside this story)

- A very large note edited many times in one session can exhaust the 5 MB `persistFullState`
  boundary (`platform/storage/coreStore.ts:502`), because every `scene.configure-widget` op
  persists the full configuration. Not caused by depth levels; it applies to the note body as
  shipped. Worth a look alongside op-log compaction.
