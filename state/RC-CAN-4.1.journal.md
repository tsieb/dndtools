# RC-CAN-4.1 run journal

## Scope

Tile gallery sheet with live previews. Owned paths: `app/canvas/AddWidgetGallery.tsx`, `app/SceneBoardCanvas.tsx`,
`app/canvas/WidgetFrame.tsx`, `screens/Board.tsx`, `screens/sceneEditor/index.tsx`,
`screens/sceneEditor/AddWidgetPanel.tsx` (under `apps/gm-react/src`), and
`docs/architecture/WIDGETS.md`. The new gallery replaces the add panels in `screens/Board.tsx` and `screens/sceneEditor`). DS `Sheet` on phone,
side panel on desktop/rail; one card per library entry with accent, icon, name, description and a
rendered miniature; category filter; search; profile-unsupported entries dimmed with the reason;
"Start from a template" header on an empty scene; "Generate with assistant" (WID-3.2) and "Build
your own" (WID-2.1) entries; selecting adds at the next free slot and focuses the tile.
Acceptance: e2e on both profiles. No agents, dispatcher mutations, push or promotion.

## Progress

- Surveyed: `Board.tsx` inline add panel, `sceneEditor/AddWidgetPanel.tsx`, core
  `listWidgetLibrary`/`resolveAddWidgetCommand`, `tileMeta.ts` (RC-CAN-2.2), `WidgetRenderSlot`
  (WID-1.1), DS `Sheet`, `GenerateDialog`, `WidgetBuilder`, board column geometry in
  `board-helpers.ts`, and every e2e lookup of the old panels (`canvas.spec.ts`,
  `widget-builder.spec.ts`).
- Design decisions:
  - The gallery reads the library itself with `includeUnavailable: true`, so unsupported entries
    show dimmed with the core's reason instead of vanishing.
  - Miniatures render through `WidgetRenderSlot` with a synthetic view-model built from the entry's
    default configuration, inside an `inert` + `aria-hidden` scaled box. Custom-code
    (`custom-html-js`) entries get a static silhouette: the gallery never boots third-party code
    before the DM has chosen to place it.
  - Desktop/rail: a non-modal side panel in the same slot the old panel used (Escape closes it).
    Phone: DS `Sheet` (bottom).
  - Next free slot: top-most, then left-most non-overlapping position on the board's column
    geometry (bounded) or within the scene's authored extent (canvas).
  - The gallery stays mounted while closed so it can focus the new tile once the panel is gone.
- Wiring: `Board.tsx` and `sceneEditor/index.tsx` now render `<AddWidgetGallery>`; both gained the
  "Build your own" builder, and the Board gained the WID-3.2 `GenerateDialog` it never had.
  `sceneEditor/AddWidgetPanel.tsx` deleted. Four catalog keys that only the old panels used were
  removed from EN and ES; the new ones are `addGallery.*` in both.
- Cards are a transparent overlay `<button>` over plain text plus the `inert` miniature, so a
  preview's own buttons never nest inside the card's control. Unsupported entries use
  `aria-disabled` (still focusable, reason in `aria-describedby`) and sort after addable ones.
- Existing e2e lookups updated: the `scene-add-widget-panel` test id became `add-widget-gallery`;
  the old "button nth(1)" pick now addresses the first non-disabled `gallery-entry-*`; the Layouts
  test closes the phone Sheet before pressing Done, which sits behind the modal scrim there.
- New tests: `app/canvas/AddWidgetGallery.test.tsx` (8 `nextFreeSlot` cases), e2e
  `tests/e2e/add-widget-gallery.spec.ts` (board: Sheet vs side panel, live miniature, dimmed
  desktop-only package with the core's reason, search, category filter, placement without overlap
  and focus on the new tile; scene: template header on an empty scene, generate/build entries, axe
  on the open gallery, two placements, builder opens).

## Validation results

- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- ESLint on every touched file: exit 0 (includes `dsn/no-raw-style-values` with allowances).
- `pnpm lint:raw-style-count`: 2,596 across 261 files, unchanged; the new file has none, and the
  Board (8) and scene editor (4) allowances still match.
- `vitest run --config vitest.app.config.ts` on `src/app/canvas` and `src/i18n`: 5 files, 113 tests
  passed (catalog orphan, plural-argument and ES coverage checks included).
- Prettier: two files reflowed with `--write`, then clean.
- Committed as `b8472410` before any browser run.
- Browser run 1 (port 15541; add-widget-gallery, canvas, widget-builder, responsive, a11y-axe-gate,
  ux-audit × desktop/mobile Chromium) was cut off when the previous session ended: it reached 85
  passes with no failures, all on desktop-chromium, and left no summary or exit code, so it is not
  counted as evidence.
- Gate feedback on the retry: the journal edit was uncommitted. Committed it as `b685dec4`, then
  restarted the same browser selection as run 2.

## Ownership repair and completion pass (2026-09-11)

- Confirmed the clean starting branch already contained the previous implementation and journal
  commits. No Headroom tools were available in this session; native exact tool output was used.
- Restored the prior attempt's changes to unowned EN/ES catalogs, feature brief, canvas/browser
  builder tests, and removed its unowned unit spec. These restores preserve the pre-task versions
  at `0c1b0fde`; there were no unrelated working-tree edits.
- Gallery-specific translations now live in the owned gallery component and use the existing
  locale/message formatter. The existing shared title and empty-state catalog entries remain used.
- Fixed the sample-data gap: declared templates use the same pure template bodies as the canvas,
  populated with synthetic rows and default configuration, without requiring live campaign bindings.
- Added the owned `WIDGETS.md` architecture document with an executable browser acceptance fixture
  and a temporary extraction command, so both-profile coverage survives without unowned test files.
- Preserved the scene library test hook on the card list and exposed the layout Done action in
  the phone Sheet footer. The toolbar is covered by the modal, so finishing editing remains
  reachable without dismissing the sheet first. Existing canvas/widget-builder tests run unchanged.
- Typecheck: exit 0. Targeted ESLint: no diagnostics. Canvas/i18n Vitest before removing the
  unowned unit file: 5 files / 113 tests, exit 0.
- Initial gallery browser run: 4 passed (9.8s), both Chromium profiles. Strengthened checks then
  exposed test assumptions: the first card (Audio) is a builtin, not a declared template; generation
  has two Close buttons. Targeted Initiative's populated status-list and the first Close control.
- Documentation-extracted fixture before the compatibility controls: 4 passed (11.4s), exit 0.
- Final browser checks after compatibility controls:
  - Unmodified `canvas.spec.ts` and `widget-builder.spec.ts`, desktop-chromium + mobile-chromium,
    `DNDTOOLS_E2E_PORT=15549 DNDTOOLS_PW_WORKERS=2`: 88 passed (1.5m), exit 0.
  - Executed the exact extraction/run/cleanup command in `docs/architecture/WIDGETS.md`:
    4 passed (10.8s), exit 0, both Chromium profiles. Temporary spec removed by `finally`.
  - Final typecheck and targeted ESLint: each exit 0. Prettier check: exit 0.
  - Raw style count remains 2,596 across 261 files. `git diff --check`: clean.
  - Candidate diff against `0c1b0fde` contains only the seven owned paths plus this explicitly
    required journal; an assertion over the staged path set passed.
- No push, promotion, dispatcher control-state changes, new loop, or additional agents.

## Rebase recovery (2026-09-11)

- The operator's failed rebase had already been aborted; the task branch was clean at `fe82445f`.
  Reflog identifies `5e6064d9` (`origin/loop/rc`) as the attempted target.
- Consolidated the task-only changes against `0c1b0fde` into one commit before rebasing, removing
  intermediate out-of-scope edits and reversals from the replay. The prior commit remains in reflog.
- Rebased successfully onto `5e6064d9`. Board formatting merged automatically. Resolved the sole
  add/add conflict in `docs/architecture/WIDGETS.md` by preserving the upstream widget architecture
  document and appending the gallery documentation and reproducible acceptance fixture as section 9.
- Candidate diff still contains only the seven owned paths plus this required journal.
- Rebased validation (exact native command output; no Headroom tools available):
  - Documentation-extracted gallery fixture: 4 passed (11.3s), exit 0, both Chromium profiles.
  - Unmodified canvas/widget-builder e2e specs: 88 passed (1.5m), exit 0, both Chromium profiles.
  - App typecheck and targeted ESLint: exit 0 each.
  - Prettier found only journal spacing, corrected with the formatter; final check passed.
  - Asserted the incoming widget document is a verbatim prefix of the merged document, the
    candidate path set is within ownership, and the target commit is an ancestor of HEAD.
- The task branch is ready for the operator to repeat integration gates. No push or promotion.

## Quality gate correction (2026-09-11)

- Read the operator's exact log for attempt `ffaaec29-29f0-4986-b9fb-025a3d8198ca`.
  The sole failure was `AddWidgetGallery.tsx` at 908 lines, exceeding the 800-line hard limit.
- Extracted gallery card chrome to `WidgetLibraryCard` in the owned `WidgetFrame.tsx`:
  identity, accent, unavailable reason and accessible overlay button belong to the frame;
  the gallery retains miniature rendering, discovery, filtering and placement. No gate exception.
- Validation after extraction:
  - `pnpm gates`: exit 0, all 6 quality gates passed. Gallery: 782 lines; WidgetFrame: 546.
    Both remain above the advisory 500-line target but below the 800-line hard limit.
  - App typecheck and ESLint on both changed TSX files: exit 0 each.
  - Executed the documented gallery acceptance fixture: 4 passed (11.0s), exit 0, desktop and
    mobile Chromium; previews, filtering, unsupported entries, placement/focus and axe covered.
  - Prettier and `git diff --check`: clean. Only owned files plus the required journal changed.
- No push, promotion, dispatcher changes, loop launch or additional agents.

## Full typecheck dependency recovery (2026-09-11)

- Read the exact operator log for attempt `326d61b0-c3b2-4572-a105-6fffd2447139`.
  Root `pnpm typecheck` failed in cloud-fns because `stripe` and `@aws-sdk/client-ssm` could not
  resolve; the remaining billing type errors followed those missing declarations. The prior
  app-only typecheck did not exercise this package.
- Verified both dependencies already exist in the incoming cloud-fns manifest and frozen lockfile.
  Ran `pnpm install --frozen-lockfile --ignore-scripts`: exit 0, restored 22 packages from the
  local store, no resolution changes and no tracked file modifications.
- Verified both modules now resolve from `packages/cloud-fns` to this worktree's pnpm store.
- Reran the exact failed root command, `pnpm typecheck`: exit 0 for core, cloud-fns and gm-react.
  No source or dependency-manifest change was needed. Gallery code and prior browser acceptance
  remain unchanged; no redundant browser rerun for dependency-link restoration.
- This journal is the only tracked change. No push, promotion or dispatcher state changes.

## Post-rebase e2e cascade (2026-09-12)

- Read the exact operator log for the post-rebase gate (attempt `efd9ee8a-4a60-4acc-9444-0fcb692ade15`,
  `pnpm e2e`, exit 1): 886 passed, 181 failed, 3 flaky. The failures span unrelated specs (map
  editor, onboarding, party stash, systems, wiki) and are almost all mobile-chromium. Their retries
  fail with `page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5273/...`; the rest are
  `waitReady` timeouts and destroyed-context errors in the same runs. The run had attached to a
  Vite server on the shared port 5273 that stopped mid-suite. The failures are not gallery
  behaviour.
- Cause: the operator rebased onto `87eca0e0` (local `loop/rc` at the time), which predates
  `5d7bf943`, where linked worktrees derive their own e2e port (5300–5899).
- Rebased the three task commits onto the current local `loop/rc` (`ac99ca7b`, which contains
  `5d7bf943`). No conflicts, and no source change was needed. This worktree now derives port 5761.
- Candidate diff against `loop/rc`: the seven owned paths plus this journal. `git diff --check`: clean.
- Root `pnpm typecheck` (core, cloud-fns, gm-react): exit 0. `pnpm gates`: exit 0, 6 gates passed.
  ESLint on the five changed TSX files: exit 0.
- Documented gallery acceptance fixture (`WIDGETS.md` §9, executed verbatim, port 15549 checked
  free first): 4 passed (13.5s), exit 0, desktop-chromium and mobile-chromium. Temporary spec removed.
- Two broader browser runs were stopped when the session ended. They produced no summary or exit
  code, so neither counts as evidence. Canvas, widget-builder and widget-generate on both profiles
  (port 5761) had reached 90/94 with no failure lines. Responsive, a11y-axe-gate, scene-cards and
  ux-audit on both profiles (port 5762) had reached 28/168 with no failure lines.
- Gate feedback on the retry: this journal edit was uncommitted. Committed it before rerunning the
  browser selections.

## Rebase conflict recovery (2026-09-12)

- Operator feedback: the rebase stopped on `46be9a26` (gallery card extraction) with a conflict.
  Upstream `loop/rc` had changed `WidgetFrame.tsx` in RC-CAN-2.4 (tile action menu, `history`
  prop) and in `83cb216f` (visibility badges by exception: DS `VisibilityChip` replaces the local
  `visibilityChip` chip).
- Rebased the four task commits onto local `loop/rc` `66b7ab7f`. The only conflict was the
  `WidgetFrame.tsx` import block. Kept both sides: `useId`, `useMemo`, `useRef`, `ReactNode`,
  `WidgetLibraryEntry`, `Icon` and `VisibilityChip`. Everything else merged automatically, and
  `WidgetLibraryCard` needed no change because it never used the removed chip helper.
- Checked upstream for references to the removed panel: `canvas.spec.ts` (three uses, one new
  upstream) and `widget-builder.spec.ts` (two uses) still target `scene-add-widget-panel`, which
  the gallery keeps on the scene card list. No source imports of `AddWidgetPanel` remain.
- Candidate diff against `loop/rc`: the seven owned paths plus this journal. `git diff --check`
  is clean and the lockfile is unchanged upstream. Sizes: gallery 782 lines, WidgetFrame 531.
- Validation on the rebased branch (exact command output; no Headroom tools in this session):
  - Root `pnpm typecheck` (core, cloud-fns, gm-react): exit 0.
  - `pnpm gates`: exit 0, 6 gates passed.
  - ESLint on the five changed TSX files: exit 0. Prettier check on all changed files: exit 0.
  - `vitest run --config vitest.app.config.ts` on `apps/gm-react/src/app/canvas` and `src/i18n`:
    4 files, 105 tests passed.
  - `WIDGETS.md` §9 gallery acceptance fixture run verbatim (port 15549, checked free first):
    4 passed (10.5s), exit 0, desktop-chromium and mobile-chromium. Temporary spec removed.
  - `canvas.spec.ts` and `widget-builder.spec.ts` unmodified, desktop-chromium and mobile-chromium,
    `DNDTOOLS_E2E_PORT=5761 DNDTOOLS_PW_WORKERS=3`: 100 passed (1.3m), exit 0.
- No push, promotion, dispatcher control-state changes, loop launch or additional agents.

## App tests gate: base-branch changelog failure (2026-09-12)

- Read the exact operator log for attempt `807a0033-e783-4692-aad4-a80541af19cf` (`pnpm test:app`,
  exit 1) at head `8dd17af2`: 1 failed, 1,333 passed across 126 files. The only failure is
  `apps/gm-react/src/app/help/changelog.test.ts` › "the shipped version is the changelog's latest
  release": `expected 'Unreleased' to be '0.3.7'`. Quality gates, format, typecheck and lint
  passed in the same run.
- Reproduced locally: the single spec fails the same way, and a full `pnpm test:app` gives the
  same totals (1 failed, 1,333 passed, exit 1). No other test fails.
- Cause: upstream `66b7ab7f` (RC-DOC-1.4, "docs: add RC release notes and Lamplight marketing
  page") added bulleted "Release candidate preview" notes under `## [Unreleased]` in
  `CHANGELOG.md`. `latestRelease` skips only an empty leading `[Unreleased]` section, so it now
  returns `Unreleased`, while `apps/gm-react/package.json` is still `0.3.7`.
- Not caused by this branch. The test reads `CHANGELOG.md` and `apps/gm-react/package.json` and
  imports `./changelog`, which has no imports. `git diff --quiet loop/rc HEAD -- CHANGELOG.md
apps/gm-react/package.json apps/gm-react/src/app/help/` exits 0, so every input is
  byte-identical to `loop/rc` `66b7ab7f`, and the test fails the same way there.
  `origin/loop/rc` has no newer commit touching these files.
- Not fixed here. `CHANGELOG.md`, `apps/gm-react/package.json` and `app/help/changelog.ts` are
  outside RC-CAN-4.1's owned paths, and earlier attempts on this task had to revert out-of-scope
  edits. The fix needs an owner of those files. Either `latestRelease` treats `[Unreleased]` as
  never shipped (the Help badge compares against the built version anyway), or the RC preview
  notes move out of a bulleted `[Unreleased]` section. Until one of those lands, `pnpm test:app`
  fails on `loop/rc` itself and on every candidate rebased onto it.
- No source change on this branch; this journal is the only edit. Gallery code and the browser
  acceptance recorded above are unchanged.
- No push, promotion, dispatcher control-state changes, loop launch or additional agents.

## App tests gate repeat (2026-09-12)

- Read the exact operator log for attempt `40179ab0-a674-4a7c-9d00-ff7d7945dd72` at head
  `d7a8be18`. It is the same result: 1 failed, 1,333 passed. The only failure is again
  `help/changelog.test.ts` with `expected 'Unreleased' to be '0.3.7'`. The other four gate
  commands exited 0.
- The base has not changed. Local `loop/rc` and `origin/loop/rc` are both still `66b7ab7f`. No ref
  in the repository has a commit touching `CHANGELOG.md`, `app/help/changelog.ts` or its test
  after `66b7ab7f`, so there is no fix to rebase onto.
- Seven other `dispatch/dndtools/*` task branches also contain `66b7ab7f`, so their App tests gates
  will fail on the same test.
- Retrying this task will not clear the gate until the changelog failure is fixed on `loop/rc` by
  an owner of those files (options in the previous section). Nothing inside RC-CAN-4.1's owned
  paths can affect this test. This journal is the only edit.
- No push, promotion, dispatcher control-state changes, loop launch or additional agents.

## Rebase onto the changelog fix, and flow placement (2026-09-18)

- Read the exact operator log for attempt `504bf522-45db-49a7-bf75-92234226ea1a` at head
  `ee46be4f`: the same single `help/changelog.test.ts` failure (1 failed, 1,333 passed). The other
  four gate commands exited 0.
- `loop/rc` now contains `32d9ed73` ("fix(help): exclude unreleased notes from shipped release
  selection"). Local `loop/rc` is `0a4cc184` and contains the fix. `origin/loop/rc` (`1baa5e21`)
  differs only by roadmap-docs merge commits, so rebased onto local `loop/rc`, the target the
  operator has used before.
- Rebase conflicts, both resolved by keeping both sides:
  - `screens/sceneEditor/index.tsx`: RC-CAN-7.7 (`ba5c52dd`, ADR-041 layout policy) added
    `layoutPolicy` beside the editor's own `listWidgetLibrary` call, which this task had removed
    because the gallery reads the library itself. Kept `layoutPolicy` and dropped `library`.
  - `app/canvas/WidgetFrame.tsx` imports: upstream note-depth badges (`5c65d19b`) plus the
    gallery card's `useId`, `ReactNode` and `WidgetLibraryEntry`.
- New behaviour to fit ADR-041. The editor now renders `FlowBoard` for `flow` scenes, which order
  tiles by `flowOrder` (y, then x). The gallery's canvas search could put a new tile at the start
  or middle of a flow screen's reading order. Changes, all in owned paths:
  - `AddWidgetGallery` accepts `policy: 'flow'`. A flow pick lands at
    `flowKeyBetween(last, null)` over `flowOrder`, one flow row after the last tile (`{0, 0}` on
    an empty scene). Canvas and bounded placement are unchanged.
  - The `scene-add-widget-panel` hook is kept for every scene policy, not just `canvas`.
  - `sceneEditor/index.tsx` passes the scene's `layoutPolicy` instead of the hard-coded `canvas`.
  - `WIDGETS.md` §9 documents the flow rule. The acceptance fixture gained a flow test: sets the
    policy with `scene.set-layout-policy`, places two tiles, and asserts `{0, 0}` then `{0, 240}`,
    the flow board, focus on each new tile, and DOM order.
- Checked the new upstream `note-depth.spec.ts`: it clicks `/^Note\b/` inside
  `scene-add-widget-panel`, which resolves to the gallery card's overlay button.
- Validation on the rebased branch (exact command output; Headroom tools not used for these runs):
  - Root `pnpm typecheck`: exit 0. ESLint on the five changed TSX files: exit 0.
  - `pnpm gates`: exit 0, 6 gates passed. Sizes: gallery 786, WidgetFrame 588, scene editor 621,
    all under the 800-line hard limit.
  - `pnpm test:app`: exit 0, 135 files, 1,491 tests passed. The changelog failure is gone.
  - `WIDGETS.md` §9 fixture run verbatim (port 15549, checked free first): 6 passed (11.9s),
    exit 0, desktop-chromium and mobile-chromium, including the new flow test. Temporary spec
    removed.
  - `canvas.spec.ts`, `widget-builder.spec.ts` and `note-depth.spec.ts` unmodified, both profiles,
    `DNDTOOLS_E2E_PORT=5761 DNDTOOLS_PW_WORKERS=3`: 104 passed (1.5m), exit 0.
- No push, promotion, dispatcher control-state changes, loop launch or additional agents.

## Lint gate: emphasis ratchet (2026-09-18)

- Read the exact operator log for attempt `a1a118ac-e019-490e-b5a8-280dfc3f8900` (`pnpm lint`,
  exit 1) at head `3aeb8f1b`. ESLint had 0 errors (15 warnings, none in owned files). Boundary lint
  passed. `lint:emphasis` (RC-ENG-8.4) failed: per-file counts may only shrink against
  `scripts/emphasis-baseline.json`, and four were above it:
  - `AddWidgetGallery.tsx` display-face-below-24px 2 > 0: Cinzel headings at 13px and 17px.
  - `AddWidgetGallery.tsx` multiple-accent-primaries 1 > 0: the category filter's selected chip
    used `primary`, so "All" and the mapped chips counted as two gold fills.
  - `Board.tsx` 4 > 2 and `sceneEditor/index.tsx` 4 > 3: the gallery's primaries, plus
    `WidgetBuilder`, which the Board gained for "Build your own".
- Why `WidgetBuilder` counts: its primary is inside its own `role="dialog"`, but the step body is
  built in a variable before the `return`, and the lint reads JSX where it is written. This is a
  false positive in an unowned file. `loop/rc`'s scene editor already rendered `WidgetBuilder`, so
  its baseline of 3 includes it. The Board's does not.
- Fixes, all in owned files; the baseline was not edited:
  - Gallery headings use `var(--font-sans)`. Cinzel starts at 24px.
  - Gallery category chips use the DS `accent` variant (subtle tint) when selected, still with
    `aria-pressed`. The gallery now exposes no primaries.
  - Done while editing uses `accent` instead of `primary` on both the Board and the scene editor,
    so the two editors match. In edit mode the Board already showed two gold fills side by side:
    the selected zoom chip and Done. The zoom chips were left alone because the `/board` golden
    PNG (`tests/visual/golden-routes.spec.ts`) captures them in the default state, and it cannot be
    re-baselined here. Done only appears in edit mode, which the golden route does not capture. No
    e2e asserts either button's styling; they are found by role and name.
- Follow-up for the owner of `screens/extensions/WidgetBuilder.tsx`: rendering the step body
  inside the dialog JSX would clear the false positive and give the Board back a slot.
- Validation (exact command output):
  - `pnpm lint`: exit 0. Emphasis: Board 2 (baseline 2), scene editor 2 (baseline 3), gallery 0;
    totals display-face 81 / 84 and primaries 60 / 61. Contrast gate passed.
  - Root `pnpm typecheck`: exit 0. `pnpm gates`: exit 0.
    `pnpm format:check:changed -- --base loop/rc`: exit 0 (7 files).
  - `pnpm test:app`: exit 0, 135 files, 1,491 tests.
  - `WIDGETS.md` §9 fixture verbatim (port 15549, checked free first): 6 passed (13.5s), exit 0,
    desktop-chromium and mobile-chromium. Temporary spec removed.
  - `canvas.spec.ts`, `widget-builder.spec.ts`, `note-depth.spec.ts`, both profiles, port 5761:
    104 passed (1.6m), exit 0.
- No push, promotion, dispatcher control-state changes, loop launch or additional agents.

## Review fix: card focus ring (2026-09-18)

- Review of `fd65872d` rejected the candidate for WCAG 2.4.7. The card's overlay `<button>` drew the
  global `:focus-visible` ring outside its box, and the card's `overflow: hidden` clipped all of it.
- Fix (`WidgetFrame.tsx`, `WidgetLibraryCard`): the overlay button sets an inline
  `outlineOffset: calc(-1 * var(--focus-ring-width) - 2px)`, which draws the ring inside the card
  edge. Clipping stays on the card because the miniature needs it.
- The WIDGETS.md §9 fixture now reaches the first addable card by keyboard (Shift+Tab, then Tab). It
  asserts `:focus-visible`, a solid outline whose width plus offset is ≤ 0 (inside the box), and a
  masked card screenshot that differs from the unfocused one.
- Mutation check: I reverted only the `outlineOffset` line and ran the GM Screen test. It failed on
  both profiles (`Expected: <= 0, Received: 4`). Then I restored the fix.
- Final checks (port 15637, `DNDTOOLS_PW_WORKERS=2`): the extracted fixture plus unmodified
  `canvas.spec.ts` and `widget-builder.spec.ts` on desktop-chromium and mobile-chromium passed
  106/106, exit 0. The fixture alone passed 6/6 before that. gm-react typecheck, `pnpm lint`
  (including emphasis and contrast) and `pnpm gates` each exited 0.
  `format:check:changed -- --base loop/rc` was clean.
- Low finding (test ids keyed on type): documented in §9 that type ids are assumed unique across
  packages. I did not rename them because existing specs depend on them.
- Not addressed; outside ownership: promoting the fixture to `tests/e2e/add-widget-gallery.spec.ts`
  and restoring the `nextFreeSlot` unit spec. An earlier ownership repair on this task removed exactly
  those unowned test files, so the owner of `apps/gm-react/tests/` should add them. The fixture is
  ready to copy verbatim.
- The `Done` → `accent` emphasis change noted in the review is unchanged (see the lint:emphasis
  entry above).
