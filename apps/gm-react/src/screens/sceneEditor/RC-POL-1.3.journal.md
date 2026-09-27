# RC-POL-1.3 — Scene editor polish

## Resumed verification — 2026-09-27

Resumed on preserved candidate `c909f7ea3a3c4642de78c1698da3e570df3708eb`, with a clean
worktree. The implementation and evidence below predate this resumption; their historical
cross-surface changes are preserved, not repeated. Current ownership is the scene editor folder
and `scripts/emphasis-baseline.json`; this continuation changes only the owned journal.

The operator's newly owned emphasis baseline already contains exactly five scene-editor entry
deletions. Each tightens the ratchet: the small-display-face allowances for `Inspector.tsx`,
`SceneMetaPanel.tsx`, and `index.tsx` are obsolete after correcting the type hierarchy; the
`AddWidgetPanel.tsx` small-display-face allowance names a removed file; the `index.tsx` allowance
for three multiple-accent-primary findings is obsolete after the supporting-action changes.
No unrelated allowance is changed and
no budget is increased. There is no further baseline edit to make.

Fresh verification (Headroom exact originals retrieved before recording results):

- `pnpm gates`: exit 0, no owned-file size warning. Largest owned source: `index.tsx`, 465 lines.
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0.
- `pnpm lint:emphasis --quiet`: exit 0. The 21 remaining loose entries are unrelated;
  deliberately did not run a repository-wide baseline rewrite.
- Focused app unit checks (`playerPreview`, `board-resizable`, `feedback-hygiene`): 3 files,
  14 tests passed.
- Pinned-container visual comparison, `CONTAINER_ENGINE=docker bash
apps/gm-react/tests/visual/run-in-container.sh --update-snapshots=none --retries=0
-g 'scene/:id|scene editor' --workers=2`: 24 passed (41.5s). No snapshots changed.
- Baseline budget: 444 files, 32,736.3 / 32,768.0 KiB.
- Browser suite: **359 passed, 2 skipped, 3 failed** (9.4m), exit 1.
  `pnpm --filter @dndtools/gm-react exec playwright test` with
  `tests/e2e/{scene-editor-polish,canvas,binding-inspector,scene-templates,flow-layout,
scene-surfaces,widget-generate,responsive,player-preview,a11y-axe-gate}.spec.ts`, both
  Chromium projects, `--retries=0 --workers=2 --reporter=line` (brace list expanded to arguments).
  All scene-editor cases passed, including both profiles' polish/overlay checks. Three desktop
  axe cases (`/`, `/board`, `/player`) timed out at the runtime-loaded wait, before axe ran
  (`a11y-axe-gate.spec.ts:85`, 20s). The pinned visual run overlapped the beginning of this run;
  contention is a possibility, not a demonstrated cause. An isolated one-worker rerun of these
  three cases passed (3/3, 9.8s), with `--retries=0 --workers=1 --project=desktop-chromium
--grep 'a11y axe gate: /(board|player)?$'` on `a11y-axe-gate.spec.ts`. No code changed between
  runs. This does not establish a durable startup fix; the initial full command remains non-green.

The existing axe spec excludes shell chrome and filters the precise parchment token pair in
DEBT-2026-008. A passing result therefore means the scoped suite passes with that documented
waiver, not that the entire route has zero unfiltered axe violations. That limitation remains
for independent review; shared tokens and the external spec are outside this continuation's claim.

## Scope and starting point

Owned surface: `apps/gm-react/src/screens/sceneEditor/`. The task branch started at `2fb670a4`,
96 commits behind `loop/rc`; it was an ancestor, so it was fast-forwarded to `loop/rc` `62ed9022`
before any change. Nothing from the earlier interrupted attempts survived in the worktree.

Crossed the owned boundary only where the acceptance needs it, and minimally:

- EN/ES catalogs (`i18n/messages/{en,es}.ts`): new `sceneEditor.*` keys; `sceneEditor.cannotOpen`
  removed (it interpolated the raw refusal code).
- Ratchets lowered, never raised: `no-raw-style-values.allow.js` (the three scene editor entries
  deleted; the stale total comment now states the real sum, 1893) and `emphasis-baseline.json`
  (five scene editor entries deleted, one of them for `AddWidgetPanel.tsx`, which no longer exists).
- Specs: new `tests/e2e/scene-editor-polish.spec.ts` and `tests/visual/scene-editor-polish.spec.ts`;
  `widget-generate.spec.ts` opens the phone overflow menu (see §20.3); two source-scan guards
  (`board-resizable.test.ts`, `feedback-hygiene.test.ts`) re-pointed at the files the split
  created, as their own comments ask.
- Baselines: the nine `scene-editor--*` golden routes re-rendered; fifteen new glyph crops.
- `docs/requirements/FEATURE-GAPS.md` Scene editor row; `DEBT.md` DEBT-2026-008 (a design-system
  token pair this pass found and does not own).

No dispatcher state, push, promotion or loop launch. The dispatch Headroom tools were not offered in
this session; every figure below comes from the original command output.

## What changed

- **File size.** `index.tsx` 797 → 465 lines, `Inspector.tsx` 516 → 296. New files:
  `useSceneCommands.ts` (every durable write and the undo stack), `SceneToolbar.tsx`,
  `SceneUnavailable.tsx`, `InspectorTransform.tsx` (the Transform tab), `StyleTokenList.tsx`.
  Largest file in the folder is now `index.tsx` at 465.
- **Toolbar.** Edit mode used to share one wrapping row: on a 1280px desktop Done fell onto its own
  line, and a phone took three lines. Now the first row is identity + mode (back, name, details,
  View as, Edit layout / Done) and editing adds a labelled "Layout tools" row. On a phone Done closes
  the tools row and Snap + Generate move into a bounded DS `Menu` ("More editing tools"), so the edit
  controls take one line. The Flow/Canvas picker stays visible on a phone (`flow-layout.spec.ts`
  asserts it).
- **Unavailable state.** Was a card that printed the raw refusal code ("Cannot open this scene:
  scene-not-found"). Now the `scenes-empty` illustration, an `<h2>`, and per-reason copy (missing,
  {gm}-only, not shared, anything else).
- **Copy.** Every hard-coded English string in the folder moved to the catalogs: undo labels
  (Moved/Resized/Removed/Docked/Undocked), the persist-failure message, Edit layout/Done, the empty
  hints, the Inspector's tab and panel labels (the old `inspectorLabels(locale)` ternary is gone),
  "Dock to edge", the S/M/L size buttons (now Small/Medium/Large). The summary line no longer says
  "pan and zoom to explore" under the flow layout, which does neither.
- **Feedback.** Saving scene details raises "Scene details saved." (the panel closes, taking the only
  confirmation with it). The keyboard-order position line is `aria-live`.
- **Touch targets.** Measured on the phone profile, the back, details and overflow buttons were
  28–36px and the Flow/Canvas radios 29px tall. On a phone they are now 44px: DS `IconButton`
  `size="lg"` (its sizes are fixed), and the shared `Seg`'s labels get a 30px box inside its 7px
  padding. The identity row does not wrap on a phone, so the name truncates (with a `title`) rather
  than pushing View as onto a third line; the buttons are pinned so only the name gives way.
- **Android Back.** On a phone the Inspector and details panel float over the canvas; Back now
  closes them (`registerBackHandler('overlay')`) instead of leaving the scene and dropping the
  details draft.
- **Type and contrast.** Four sizes (xl, md, sm, xs); the 10px `--text-2xs` and the 20px overlay
  title are gone. Panel titles are `<h3>` in the sans face (Cinzel was set at 17px). Tertiary text
  moved to secondary; the details panel maps tertiary → secondary for DS `Field` help text, which
  measured under 4.5:1 there. The colour field is 48×44 (was 44×28).
- **Emphasis.** Save details moved from filled primary to the subtle accent, matching Done. The
  emphasis lint no longer reports anything in the folder.

## Embedded §20.2–§20.5 checklist

A waiver states why the item does not apply or what stops it; it is not a claim that a test ran.

### §20.2 Design fidelity

- [x] DS primitives and screen-kit only; no raw hex/rgba/px spacing. `dsn/no-raw-style-values` over
      the folder with its allowances deleted: 0 findings (was 9). The 28px desktop gutter is
      `calc(var(--space-6) + var(--space-1))`, pixel-identical to the Board's.
- [x] Prototype: waived exact comparison. The §4 prototype canvas (`scene-shell.jsx`) predates the
      layout policy, bindings, templates and player preview, so there is no prototype view for most
      of what the toolbar now holds. Deviation: the two-row toolbar, reasoned above.
- [x] One primary per region: Done and Save details are the subtle accent, Remove widget the danger
      fill; the primary panel (Inspector/details) is the overlay-elevation card. Emphasis lint:
      0 findings in the folder.
- [x] Type: xl (scene name, unavailable title, Cinzel at 24px), md (panel titles, sans), sm, xs.
      Numbers in mono: the keyboard-order position and style-token names.
- [x] Status colour + shape: DS `Badge` adds the shape for success/warning/error/info (binding
      states); preview chips carry their own icons; the error alert and unavailable title carry the
      error icon. DM-only stripe: the tiles' purple stripe is drawn by the canvas frame (unchanged).
- [x] All five themes × three tiers: the golden `scene-editor--*` captures (three themes) are
      re-baselined, and `tests/visual/scene-editor-polish.spec.ts` pins the Inspector in all five ×
      three as a text-free glyph crop. The budget has no room for full-state captures, so a
      six-state matrix (view, inspector, details, preview, unavailable, plus crops) was rendered in
      the pinned image for all 15 theme × tier cells, reviewed as contact sheets, strict-compared,
      and not committed. Details under "Visual evidence".
- [x] Motion: the folder adds no animation; DS transitions use the named duration tokens and the
      global reduced-motion override. Specs run with `reducedMotion: 'reduce'`.
- [x] States: empty (`session-board-empty` via `BoardEmptyState`), error and unavailable
      (`SceneUnavailable`, `scenes-empty` — there is no dedicated missing-scene key), preview-blocked
      (the overlay's note). Loading waived: the route chunk loads under the shell's shared
      `<Suspense>` Boot fallback (`App.tsx`), and the scene read is synchronous from loaded state, so
      the screen has no loading phase of its own.

### §20.3 Interaction and UX

- [x] Feedback: layout edits are optimistic with undo announcements (`useLayoutHistory`); remove
      raises an Undo toast; details save raises a toast; policy, visibility and keyboard order show
      their new state inline. Failures land in the `role="alert"` line.
- [x] Destructive: Remove widget is undoable (toast action and Ctrl+Z) and names the widget.
- [x] Save status: every edit is auto-persisted; a failed IndexedDB write says "Check storage space
      and try again." Rejections use the shared widget-rejection copy.
- [x] Route back: the back button goes to Scenes; browser back is the router's. Android Back:
      overlay (preview, phone panels, menus) first, then history — e2e below.
- [x] No hover-only controls. Touch targets: a phone test measures every control in the toolbar,
      the "More editing tools" menu and the Inspector's Content, Transform and Visibility tabs, and
      requires 44px on both axes; it found five undersized controls, now fixed (see above). The
      colour field was 28px tall and is now 44px. The 48dp Android figure is not asserted here.
- [x] Compact tier: the shell's top bar contract ("keeps one top-bar action, one overflow and one
      primary action on a phone") already runs for `/scene/:id` in `responsive.spec.ts` and passes.
      Inside the screen, the phone's secondary edit tools sit in a bounded menu.
- [x] Copy re-read against the voice; all strings through `t()`; ES added for every new key; no
      literal DM/GM (`{gm}` placeholder).
- [x] Help: the keyboard-order section now explains itself; Remove widget's tooltip names the
      Delete and Ctrl+Z shortcuts; the layout picker's options carry their hints. Binding modes are
      self-describing labels ("Read and act on it"), so no HelpTip was added there.

### §20.4 Accessibility

- [x] axe (WCAG 2.2 AA + best-practice, every impact, not just blocking) on desktop and mobile:
      view, edit, Inspector (Content, Binding, Transform, Visibility tabs) in all five themes;
      details panel, add gallery, phone "More editing tools" menu, generate dialog, player preview,
      empty scene, template picker, unavailable. Shell chrome (top bar, tab bar, sidebar, session
      rail) is excluded: it belongs to the App shell story and fails parchment/scholar contrast on
      every route. One named exception, DEBT-2026-008 below. Known-violation register unchanged.
- [x] Keyboard walkthrough (both profiles, in the spec): focus Edit layout → Enter (focus stays on
      the same button, now Done) → focus a tile → Enter opens the Inspector → arrow to the Transform
      tab → Enter → Later → Enter (writes; "Position 2" announced) → Escape closes the Inspector and
      focus is not on `<body>` → Enter on the details button → type a name → Enter on Save → heading
      updates and "Scene details saved." shows.
- [x] Headings: the shell's `<h1>` (Scenes) is untouched; the scene name is `<h2>`; the Inspector,
      details panel and preview overlay titles are `<h3>`. The tools row is a labelled group.
- [x] Live regions: the alert line re-announces repeated identical failures (guard re-pointed and
      passing); the undo stack announces; the position line is polite. No new spam: nothing
      announces on render.
- [x] Screen-reader audio spot check waived: no screen reader runs in this headless environment. The
      accessible names and roles above are asserted, not listened to.
- [x] 200% text: the toolbar stays inside `#main-content`, and Done, Add and Remove widget scroll into
      view (both profiles). No new scroll regions.

### §20.5 Core discipline and correctness

- [x] Every write goes through `runtime.dispatch` (`useSceneCommands.ts`, `BindingInspector`,
      `InspectorTransform`'s dock and fallback move). No client-side visibility filtering: widgets
      come from `getSceneForActor`, the preview from the previewed actor's read.
- [x] Preview-as-player: `SceneRuntime.dispatch` rejects every command read-only while previewing;
      the editor hides its edit controls and sets `inert` on the stage (`player-preview.spec.ts`
      "dims what a player cannot see…", both profiles, green in this run).
- [x] Player projection through an actor read: `player-preview.spec.ts` asserts `data-read-actor` is
      the previewed actor and the verdicts come from that read.
- [x] Primary task and a failure path on both profiles: the keyboard walkthrough, and a missing plus
      a soft-deleted scene (the deleted one used to print "scene-not-found").
- [x] Perf waived: the ENG-1.1 registry has no scenario that routes through this folder
      (`scene-first-render` times `/board`). The change adds no network, effect or dependency; the
      canvas components are the same ones, with the same props.
- [x] FEATURE-GAPS row updated (what it does, E2E list); `pnpm feature-audit`: 46 limits, 0 stale.
      No architecture contract moved.

## Finding outside this surface: DEBT-2026-008

On parchment, `--color-accent` (#9a5418) on `--color-accent-subtle` (#f0e0c8) is 4.43:1. The DS
`Button variant="accent"` (Done, here and on the GM Screen) and the widget-body kit's accent `Chip`
(Dice and Character tiles) both paint that pair and fail axe `color-contrast`. Fixing it here would
mean either restyling shared components or changing the token, and either one re-baselines every
parchment capture the budget can't hold. Recorded in `DEBT.md`; the polish spec lets exactly that
pair through on parchment and nothing else.

## Visual evidence

- Golden routes: nine `scene-editor--*` captures differed as expected (2–3% of pixels: the summary
  line moved from 10px tertiary to 12px secondary, and the phone's Edit layout row). Diffs inspected,
  then re-rendered. The three phone captures were rendered twice more for the 44px buttons; the
  final phone capture shows the name truncated to "The Sunken Cry…" beside four 44px buttons.
- Review matrix (throwaway spec, deleted): 5 themes × 3 tiers × {view, inspector, details, preview,
  unavailable} plus two crops, rendered in the pinned image. Contact sheets inspected: readable
  in every theme, no clipped controls, the phone tools row on one line, preview tiles stacked on the
  phone. Strict compare against its own first render: 24 passed (15 matrix + 9 golden), then the
  matrix files were deleted.
- Committed: 9 golden + 15 glyph crops (636–662 B each). Strict compare of exactly the committed
  set, `CONTAINER_ENGINE=docker tests/visual/run-in-container.sh --update-snapshots=none
--retries=0 -g "scene/:id|scene editor" --workers=2`: **24 passed**.
- `node tests/visual/check-baseline-budget.mjs`: **444 files, 32,736.3 / 32,768 KiB** (the
  re-rendered golden captures came out ~10 KiB smaller than before). The illustration crop was
  measured at ~5.8 KB per image, too large for 15 more.

## Validation (final tree)

- `pnpm gates`: exit 0; the log has no `sceneEditor` line (largest owned file: `index.tsx`,
  465 lines).
- `pnpm --filter @dndtools/gm-react typecheck`: exit 0. ESLint on the folder, the specs, both
  catalogs, the re-pointed guards and the raw-style allowlist: exit 0. `pnpm lint:emphasis --quiet`:
  exit 0, no scene editor finding. `pnpm feature-audit`: 46 limits, 0 stale. Prettier `--check` on
  every changed file: clean (`format:check:changed -- --base loop/rc` only sees commits, so it was
  run file by file before the commit).
- `pnpm test:app`: **146 files, 1641 tests passed**. The first run failed two source-scan guards
  (`board-resizable.test.ts`, `feedback-hygiene.test.ts`) that read code the split moved; both
  re-pointed at `InspectorTransform.tsx` and `useSceneCommands.ts`; the Board.tsx case in
  `feedback-hygiene` is unchanged.
- Visual, pinned image, strict (`--update-snapshots=none --retries=0 -g "scene/:id|scene editor"`):
  **24 passed**.
- E2E, every spec that opens `/scene/:id` plus collab, map-tile and permissions, both profiles,
  `--retries=0`, one run: **486 passed, 3 skipped, 1 failed**. The failure was the new phone
  touch-target test: in the no-wrap row, flexbox shrank two 44px buttons to 43px wide. Pinned them
  (`flex: 0 0 auto`); that test then passed 3/3 (`--repeat-each=3`).
- E2E re-run after that fix, both profiles, `--retries=0`: `scene-editor-polish`, `responsive`,
  `flow-layout`, `canvas`, `player-preview`, `widget-generate`, `a11y-axe-gate`: **344 passed,
  2 skipped** (the phone-only tests skip on desktop), 0 failed.
- An earlier run of the pre-toolbar-change tree (438 passed, 1 skipped) failed only
  `widget-generate.spec.ts:211` on mobile, because Generate moved into the phone menu; the spec
  opens the menu when it is present.

## Integration reconciliation — 2026-09-27

Rebased the preserved candidate onto the operator's exact integration target,
`6dd4f09c1a0873491cb51a5c8f9da1367103e8f7`. The explicitly reported conflicts require reconciling
three phone snapshots, FEATURE-GAPS and the raw-style allowlist in addition to owned source.
No unrelated integration changes were discarded.

- Kept RC-CAN-5.1's stacked phone reader, remembered List toggle, full-screen tile chrome hiding,
  bounded scrolling and metadata-panel hiding. Wired its widget commands to `useSceneCommands`.
  The polished toolbar receives the existing posture; List shares the second row with Edit layout.
  Its summary omits canvas pan/zoom instructions while stacked. Editing still uses flow/canvas.
- Preserved the integration inventory, updating only the Scene editor row's content with the polish
  and stacked-reader behavior (table padding normalized by Prettier).
- Preserved the integration raw-style allowances, removing only the same three obsolete scene-editor
  entries and recalculating the total comment. The emphasis baseline still removes only the five
  scene-editor entries justified above; no new allowance or unrelated removal.
- Re-rendered the conflicting phone goldens in the pinned container, retaining stacked tiles and
  the polished toolbar together. The 24 scene visual cases rendered successfully; all baselines
  total 511 files, 32,588.3 / 32,768 KiB. All three updated phone images were visually inspected.
  Strict pinned-container comparison (`--update-snapshots=none --retries=0
-g 'scene/:id|scene editor' --workers=2`) passed all 24 cases (42.9s).
- Reconciled `index.tsx` is 462 lines. Typecheck and surface ESLint passed; fresh gates passed.

Reconciled-tree validation (exact Headroom output retrieved):

- Both Chromium profiles, no retries, two workers: **132 passed, 2 skipped** (3.5m).
  Specs: `scene-editor-polish`, `canvas`, `flow-layout`, `scene-surfaces`, `player-preview`,
  `scene-templates`. The two skips are the desktop instances of phone-only polish checks.
  Axe scans retain the previously documented shell exclusions and DEBT-2026-008 token waiver;
  this reconciliation does not claim to fix those shared-surface findings.
- A separate Playwright phone check at 393×851 against the task's Vite server passed: default
  stacked reader; maximize first tile hides the toolbar; Escape restores it; List switches to
  spatial and back; Edit layout removes the stacked reader; Done restores it. This directly
  exercises the semantics that overlapped in the source conflict.
- Focused app unit tests (`playerPreview`, `board-resizable`, `feedback-hygiene`): 14 passed.
- `pnpm gates`: exit 0, no scene-editor file-size warning; typecheck, surface ESLint and
  `pnpm lint:emphasis --quiet`: exit 0. Unrelated baseline slack is preserved.

The rebase completed with no unmerged paths, and `6dd4f09c` is an ancestor of the task branch.
Final formatting and whitespace checks passed. No push, promotion or dispatcher-state change.

## Boundary lint repair — 2026-09-27

The operator's full lint gate on `2b6e67c5` failed PLAT-006 at `useSceneCommands.ts:138`:
the extracted widget-operation hook called the browser crypto primitive directly. Surface ESLint
alone did not cover this separate boundary gate. Replaced that call with `runtime.newId()`, the
existing runtime entry point backed by the injected environment ID generator. Each operation
still requests a fresh idempotency key. No exception, baseline or shared-runtime change is needed.

Validation: full `pnpm lint` exited 0, including the boundary and non-text contrast gates;
existing unrelated warnings remain. `starter-widgets.spec.ts` passed on desktop and mobile
(2/2, retries disabled); this places widgets on `/scene/:id` and asserts a Table Roller command
adds a roll to session history through the repaired hook. App typecheck and formatting passed.
`pnpm gates` passed with no owned-file size warnings (exact stderr retrieved and checked).
This is an ID-provider correction with no visual change; the operator's already-passing pinned
visual result is retained, not claimed as a new run. Only this hook and the owned journal changed.
