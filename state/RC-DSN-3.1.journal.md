# RC-DSN-3.1 run journal

## Scope

Empty-state illustration set: inline SVG line drawings under `apps/gm-react/src/ds/illustrations`,
about 24 keys, accent-colored strokes with no fill beyond the accent wash, 160px. `EmptyState` gains
an `illustration` key prop. Acceptance: a gallery page, and each key used once. No agents, dispatcher
mutations, push or promotion.

## Attempt 1 (2026-09-12)

### Findings before writing code

- Write fence (`dispatcher/engine.py`, the `outside its claim` check) = task `owns`
  (`apps/gm-react/src/ds/illustrations`) + this journal + manifest `companion_paths`. The companion
  paths include `apps/gm-react/src/App.tsx`, `apps/gm-react/tests/e2e/*.spec.ts`, `*.test.tsx` and
  `apps/gm-react/src/i18n/messages/*.ts`.
- `apps/gm-react/src/ds/components/system/EmptyState.jsx` is **not** inside the fence. The roadmap's
  Owns line names the prop ("`EmptyState` gains an `illustration` key prop"), but the parser only keeps
  path-shaped tokens, so the component file was dropped from the stored claim.
- Per-screen adoption is assigned elsewhere: line 918 (Board story, `session-board-empty`), line 1060
  (atlas story, `map-library`) and every `RC-POL-1.x` checklist ("illustrated where the key exists").
  So "each key used once" is read as: the gallery renders every key exactly once. This story ships no
  screen adoption.
- `i18n/no-literal-jsx-text` covers `src/ds/**/*.tsx`, so gallery copy goes through the catalogs.
  `dsn/no-raw-style-values` covers only `src/app` and `src/screens`.
- `docs/design-package/components/system/EmptyState.jsx` is a mirror, but no script or test enforces
  that it matches. It is out of the fence and left for RC-DSN-2.4's re-sync.

### Implementation

- `ds/illustrations/frame.tsx`: the 160 × 160 canvas, `INK` (`--color-accent`), `WASH`
  (`--color-accent-subtle`), `Wash` (the only way to fill) and `Hint` (the dashed "nothing here yet"
  line every drawing uses for the missing thing).
- 24 drawings in three files: `table.tsx` (session-board-empty, note-tile-empty, scenes-empty,
  combat-idle, tables-empty, play-waiting, audio-empty, spells-empty), `records.tsx`
  (knowledge-empty, search-none, journal-empty, quests-empty, calendar-empty, timeline-empty,
  graph-empty, publish-empty), `world.tsx` (map-library, characters-empty, npcs-empty,
  factions-empty, community-empty, invites-empty, inventory-empty, connection-lost). All ten keys the
  roadmap names are present.
- `ds/illustrations/index.tsx`: `ILLUSTRATIONS`, `IllustrationKey`, `ILLUSTRATION_KEYS`,
  `isIllustrationKey` (own-property check, so `toString` is not a key) and `Illustration`
  (decorative `aria-hidden` SVG, a shared wash glow behind the drawing, 2px round accent strokes).
- `EmptyState.jsx` (**outside the fence, see below**): a known `illustration` key replaces the 56px
  icon badge with the drawing. An unknown or missing key keeps the icon badge, so a typo degrades to
  today's empty state. The facade in `ds/index.d.ts` already types every DS prop as `unknown`, so
  neither barrel file changed.
- Gallery `ds/illustrations/IllustrationGallery.tsx` at DEV-only `#/__illustrations` (`App.tsx`, a
  companion path). The lazy import sits behind `import.meta.env.DEV`, the same guard as `__rt`.
  Each key renders once through `EmptyState` with the key as the heading and a caption naming the
  surface it was drawn for. Captions come from a `Record<IllustrationKey, MessageKey>`, so a drawing
  added without a caption fails typecheck. EN + ES catalog entries added (`ds.illustrations.*`).
- Tests: `illustrations.test.tsx` (registry shape; per key: 160px, viewBox, `aria-hidden`, every
  `fill` is `none` or the wash, every `stroke` is `none` or the accent, no raw hex/rgb/style, at least
  5 shapes, a dashed hint line; `EmptyState` prop, unknown-key fallback and no-prop cases; the
  gallery draws exactly `ILLUSTRATION_KEYS` in order). `tests/e2e/illustrations.spec.ts` (24
  drawings, unique keys, 160px rendered width, axe with the a11y gate's tags and blocking impacts).

### Problems found and fixed during the run

- First e2e run: axe `scrollable-region-focusable` (serious) on both profiles. The gallery `<main>` is
  its own scroll container with nothing focusable inside it. Fixed with `tabIndex={0}` and
  `aria-labelledby` pointing at the `h1`.
- First `pnpm test:app`: `i18n/index.test.ts` "addresses every key by a dotted area path" failed
  because key segments must match `[a-zA-Z0-9]+`. The caption keys were hyphenated
  (`caption.session-board-empty`) and are now camelCase (`caption.sessionBoardEmpty`), mapped
  through the typed `CAPTIONS` record.
- Visual review: the first `connection-lost` drawing (a broken rope bridge) read as two boxes and a
  pair of eyebrows at 160px. It was redrawn as two chain links pulled apart, with sparks and a dashed
  missing link across the gap.

### Visual review

Screenshots from the repo's Playwright Chromium against a dev server on :5731: the whole gallery in
the default theme, `parchment` and `high-contrast`, plus the redrawn `connection-lost` card in
default and parchment. The line art stays legible and the wash reads as a warm glow in all three.
Files: `/tmp/rc-dsn31-gallery-{default,parchment,high-contrast}.png`,
`/tmp/rc-dsn31-connection-{default,parchment}.png`. The Playwright MCP browser could not start (no
Chrome at `/opt/google/chrome`), so no MCP screenshots were taken.

### Validation results (final tree)

- `vitest` on `illustrations.test.tsx`: 30 passed, after the redraw. With `i18n/index.test.ts`: 55
  passed. With `ds-interaction-fixes.test.tsx` (an existing EmptyState consumer): 133 passed.
- `pnpm test:app`: 124 files, 1,317 tests passed (`/tmp/rc-dsn31-testapp2.log`). This run came after
  the key rename and before the `connection-lost` redraw. The redraw only changes SVG shapes, and the
  illustration test passed again afterwards.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0 on the final tree (`/tmp/rc-dsn31-typecheck3.log`).
- `eslint` on `ds/illustrations`, `App.tsx`, both catalogs and the spec: exit 0. ESLint has no config
  for `.jsx`, so it skips `EmptyState.jsx`.
- `prettier --check` on every changed file: clean.
- `pnpm gates`: passed (6 gates). The file-size warnings are for existing files, none of them changed here.
- `pnpm --filter @dndtools/gm-react build`: passed. `check-prod-bundle` reports `__rt` absent. A grep
  of `dist` finds neither `__illustrations` nor `IllustrationGallery`, and the drawings ship inside
  the `EmptyState` chunk.
- `DNDTOOLS_E2E_PORT=5732 playwright test tests/e2e/illustrations.spec.ts --workers=2`: 2 passed
  (desktop-chromium, mobile-chromium) on the final tree (`/tmp/rc-dsn31-e2e3.log`).
- Not run here: the full Playwright suite. The only shared-route change is one added DEV-only route
  in `App.tsx`. The operator's browser gate runs the full suite.

### Out-of-fence path (operator action)

`apps/gm-react/src/ds/components/system/EmptyState.jsx` is changed, and the story requires that
change. The stored claim does not cover it, so the fence will report
`candidate changes paths outside its claim: apps/gm-react/src/ds/components/system/EmptyState.jsx`.
Adding that path to RC-DSN-3.1's `owns` (roadmap line 1692, then `tools/roadmap/sync-tasks.py
--apply`) clears it. The change is additive: the default render is unchanged when `illustration` is
absent.

## Attempt 2 (2026-09-19): operator-authorized ownership retry

- Starting branch: `dispatch/dndtools/3556721cde8f2b13c92b`; clean working tree at
  `ff6203e9` (the complete previous implementation). No additional agents were used.
- The current task explicitly owns `apps/gm-react/src/ds/components/system/EmptyState.jsx`.
  This supersedes Attempt 1's out-of-fence note above; no dispatcher control state was edited.
- Reviewed the registry, all 24 drawings, gallery, existing route, component integration and tests.
  The existing implementation already supplies the acceptance criteria: `#/__illustrations` in
  development renders each of the 24 keys exactly once through `EmptyState`.
- Retained the minimal existing `EmptyState.jsx` changes: import the illustration renderer/key
  guard, accept the `illustration` prop, render known keys instead of the icon badge, and document
  that behavior. Each is required to expose the requested key prop; absent or unknown keys retain
  the existing badge. No further component changes were necessary.
- Preserved all existing implementation and companion-path changes. This retry changes only this
  run journal, explicitly requested by the task. No push, promotion or loop launch was performed.
- Dispatch Headroom tools were not available in this session; verification used original native
  command output, not compressed summaries.

### Fresh verification

- Illustration and i18n unit suites: 2 files, 55 tests passed. The initial command also named an
  incorrect path for the interaction suite; that suite was therefore run separately below.
- Existing `ds/components/ds-interaction-fixes.test.tsx`: 1 file, 103 tests passed.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- ESLint on `apps/gm-react/src/ds/illustrations`: exit 0.
- Prettier check on illustrations and `EmptyState.jsx`: passed.
- Existing Playwright illustration spec: 2 passed (desktop and mobile Chromium), using the
  worktree-specific development-server port. Both profiles verified the gallery's 24 unique keys,
  160px rendered drawing size, and no serious/critical axe violations.
- `git diff --check`: passed before the journal update; checked again before commit.
- The operator still owns the full gates and independent review. No claim is made that the
  dispatcher ownership gate was executed here.

## Attempt 3 (2026-09-19): reconcile integration rebase

- Feedback identified a rebase conflict in `apps/gm-react/src/App.tsx` against integration commit
  `eafbce28a4f78231185cbf44ccbd603ad489415a`. Started from the clean task branch at `fef30403`.
- Rebased the two task commits onto that exact integration commit. The only conflict was adjacent
  lazy-import declarations: integration added `DsGallery`, while this task added
  `IllustrationGallery`. Resolved by retaining both declarations with their DEV guards.
- This `App.tsx` reconciliation is required by the explicit retry feedback. Preserved integration's
  outer `#/__ds` route and the task's `#/__illustrations` route; the diff against integration adds
  only the original 21 lines for the illustration import and route. No other integration routing
  was changed. No additional `EmptyState.jsx` edits were needed.
- Rebase completed successfully, producing implementation commit `8deb55ea` and prior verification
  journal commit `d57b8350`. No agents, push, promotion, loop launch or dispatcher-state edits.
- Headroom remained unavailable; all checks below use original native command output.

### Reconciled-tree verification

- Illustration, i18n and existing DS interaction suites: 3 files, 158 tests passed.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- ESLint on `App.tsx` and the illustration directory: exit 0. Prettier checks on `App.tsx`
  and this journal passed; `git diff --check` passed.
- Playwright `illustrations.spec.ts` and `widget-kit.spec.ts`: all 6 tests passed on desktop and
  mobile Chromium. These exercise both gallery routes: 24 unique 160px illustrations with no
  serious/critical axe violations, plus the existing DS gallery's component/theme comparisons.
- `git merge-base --is-ancestor eafbce28a4f78231185cbf44ccbd603ad489415a HEAD`: exit 0,
  confirming the requested integration commit is now an ancestor of the task candidate.
- Full central gates and independent review remain the operator's next step.
