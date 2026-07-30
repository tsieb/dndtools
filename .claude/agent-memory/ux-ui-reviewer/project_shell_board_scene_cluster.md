---
name: shell-board-scene-cluster
description: Structural UX gotchas in the gm-react shell + board/scene canvas cluster (AppShell, CommandPalette, Board, SceneEditor, SceneBoardCanvas, ProjectionControl, SceneCardsPanel, widget-bodies); re-audited 2026-07-30 run #7 at b5ed692f
metadata:
  type: project
---

Audit of the app-shell + board/scene canvas cluster in `apps/gm-react`. Re-verified 2026-07-30 at
`b5ed692f` (line numbers below are from that commit).

## CONFIRMED FIXED — do not re-report
- Board "Layouts" panel is now a peer of Add: toolbar toggle + `aria-expanded` + Close + Escape +
  shared side slot (`Board.tsx:349-360`, `:564-669`), spec'd at `canvas.spec.ts:350-390`.
- Both screens use `height:'100%'` instead of `calc(--app-viewport-height - N)`
  (`Board.tsx:273`, `SceneEditor.tsx:268`). The magic-number/`<main>`-overflow item is DEAD.
- `/board` keyboard Delete now stages a `Dialog` confirm (`Board.tsx:145-158`, `:443-467`).
- `profileId:'desktop'` hard-coding is GONE — both callers use `widgetProfileForRuntime()`
  (`Board.tsx:107`, `SceneEditor.tsx:95`; maps electron→desktop, android→mobile, else `web`).
- `AppShell` global hotkeys now have a `typing` input guard (`AppShell.tsx:1012-1018`) covering
  Ctrl+Shift+S and Ctrl+ArrowRight. ⌘K stays deliberately global.
- `ToastViewport` now offsets for the phone `BottomTabBar` (`AppShell.tsx:1140-1151`).
- Hard-coded warm rgba is GONE from SceneBoardCanvas (`:445` uses `color-mix(… var(--color-accent) 7%)`)
  and widget-bodies (`:544-546` uses `--map-grid-line`/`--map-canvas-bg`).
- Board now styles rejections as `role="alert"` + `--color-status-error-text` separately from the
  `role="status"` success region (`Board.tsx:380-414`).
- Board's non-DM bail-out goes through `<Page>` (`Board.tsx:234`). SceneEditor's denied/missing
  bail-out still does NOT (`SceneEditor.tsx:214` bare `maxWidth:720` div) — STILL OPEN.
- Bounded empty-state headline is parameterized (`emptyTitle`), grid overlay uses `inset:0` in bounded.
- `--map-*` AND `--layer-*` tokens ARE cut for `[data-theme='parchment']` (colors.css:301-318) and
  remapped under `@media (forced-colors:active)` (:412-429). My old ":root-only" note was wrong/stale.
- Global `:focus-visible` ring exists (`styles/tokens/base.css:36`), so the bare `tabIndex` divs
  (WidgetFrame) DO get a focus ring. Don't flag those as focus-invisible.

## STILL OPEN — structural
1. **Widget operate chips ignore the live-session gate.** `widget-command.ts:177` rejects any
   `descriptor.writesTo === 'session'` command unless `session.workflow === 'active'`, and dice/timer
   commands all write to session. `widget-bodies.tsx:239/301` gate only on `widget.commands.includes(…)`,
   so Roll/Start/Pause/Reset render fully enabled on a fresh (idle) board and the raw core string
   "Session widget commands require an active workflow; current workflow is idle." lands verbatim in
   `Board.tsx:118` / `SceneEditor.tsx:106`. HIGHEST-VALUE finding in this cluster.
2. **`SceneEditor` never resets on `id` change.** `App.tsx:385` is one `<Route path="/scene/:id">`, so
   React Router reuses the element; `SceneMetaPanel` is mounted with NO `key` (`:412-421`) and holds
   `useState`-seeded drafts with no prop sync. Sidebar scene rows (`AppShell.tsx:558`) and the palette
   (`CommandPalette.tsx:122`) both do scene→scene nav → scene A's name/description/tags get saved onto
   scene B. `Inspector` (`:460`) correctly DOES carry `key={selectedInstance.id}` — the pattern is known
   in the same file. `error`/`editing` also survive the nav.
3. **Bounded canvas is an auto-fit SCALE, not a scroll.** Seeded extent is exactly 792×552
   (`command-center-state.ts`: COLUMNS 3 × 240 + 24 gutters; 7 tools → 3 rows), so a 393px phone paints
   /board at ~0.47. The 0.4 floor never engages. `--scene-board-touch-target` (SceneBoardCanvas:457) is
   consumed ONLY under `html[data-android]` (`styles/index.css:84-86`); `--density-touch-target` is ALSO
   Android-only (`:33`), so on iOS/mobile-web `OpChip`'s min-width/height resolve to `auto`.
   **NOT fixable as one change** — see the "phone fit" note below.
4. **Side panels never move focus in and have no click-outside dismissal** (`Board.tsx:469-478`,
   `:564-574`; `SceneEditor.tsx:504-509`, `:598-603`, `:717-722`). MED risk: `canvas.spec.ts:381`/`:427`
   call `.focus()` on Close *before* Escape, and the frames own a roving tabindex.
5. `SceneBoardCanvas:770-787` resize handle is 14px (compensated by `scale(1/scale)` so 14px is the real
   on-screen size — still under the WCAG 2.5.8 24px floor). `ZoomBtn` 28px is fine.
6. `SceneCardsPanel.tsx:745-751` per-card Edit is an unannounced disclosure (no `aria-expanded`/
   `aria-controls`, label stays "Edit {title}", focus never enters, Cancel never restores).
7. Create-intent gaps: `CommandPalette.tsx:154-161` "New scene", `:202-209` "Build encounter", and
   `AppShell.tsx:536-542` sidebar "New scene" all navigate bare. Only Characters/Campaign/Knowledge/
   Atlas/Board read `location.state` — `/scenes` and `/session` have NO consumer.
8. `Board.tsx` / `SceneEditor.tsx` render their page titles as plain `<div>`s. Every other screen uses a
   real `<h2>`. On `/scene/:id` the only heading is the topbar `<h1>Scenes</h1>` — the scene's own name
   is not a heading. On `/board` "GM Screen" appears twice (topbar h1 + screen header) ~60px apart.
9. `Board.tsx` `status` is a `role="status"` region that is only cleared on rejection (`:117`) and after
   a successful `operateWidget` (`:179`) — a stale "Layout X applied" survives every later move/resize/add.

## NEW this pass (run #7)
- `SceneBoardCanvas.tsx:341-349`: the Delete key path moves focus to the neighbour frame BEFORE the
  confirm dialog resolves, so Delete→"Keep" silently relocates the keyboard cursor. Fix: move the
  `frameRefs.get(neighbour)?.focus()` into the host screen's `confirmDestroy`.
- `SceneEditor.tsx:813-832` Inspector "Size S/M/L" resizes system-tier widgets that the canvas declares
  locked (`canResize` default `w.tier !== 'system'`, lock glyph at `SceneBoardCanvas:766`). Core has NO
  system-tier resize gate (`commands/widget.ts:354`), so the button WORKS — contradictory affordances.
  Shift+Arrow on the same widget returns silently (`SceneBoardCanvas:358-359`) with zero feedback.
- `SceneEditor.tsx:312-321` (meta) and `:339-349` (Add) are disclosure toggles with NO `aria-expanded`,
  while `Board.tsx:340/353` has it. Meta's label never changes state either.
- `SceneCardsPanel.tsx:722-733` Queue IconButton uses NATIVE `disabled`, so its "{title} is queued"
  explanation leaves the tab order — the exact anti-pattern `ProjectionControl.tsx:96-100` documents a
  fix for in the same cluster.
- `SceneBoardCanvas.tsx:279-298` `onWheel` never prevents default. React attaches `wheel` PASSIVE at the
  root, so `preventDefault()` inside the JSX handler is a no-op — Ctrl+wheel over `/scene` zooms the
  canvas AND the browser page, and a plain wheel pans the canvas AND scrolls `<main>`. Fix needs a
  native non-passive `addEventListener('wheel', …, {passive:false})`.
- `widget-bodies.tsx:109-114`: the inert `OpChip` variant is `aria-hidden`, so a Roll/Start chip on a
  widget whose package is unavailable (`commands: []`) is visible, unpressable, and invisible to AT.
  Mitigated by the frame's `statusNote`, so LOW.
- Do NOT report "bounded scroll extent ignores the transform". Per CSS Overflow, the scrollable overflow
  region uses the TRANSFORMED descendant boxes, so `minWidth/height: boundedExtent.*`
  (`SceneBoardCanvas:458-459`) does not create dead scroll space at scale<1. I checked this and it is a
  non-defect.

## The "raise the phone fit floor" question — verdict: NOT one coherent change
Four coupled edits + a state-model change, not a tweak:
(a) raise the `boundedScale` floor (`:187-190`); (b) `overflowX:'hidden'`→`'auto'` (`:427`) because
`responsive.spec.ts` `clippedControls()` only forgives an off-viewport control when an ancestor owns a
real scroll range on that axis; (c) `touchAction` `'pan-y'`→`'pan-x pan-y'` (`:433`), which breaks
`canvas.spec.ts:47`'s `toHaveCSS('touch-action','pan-y')`; (d) the zoom cluster is gated
`policy === 'canvas'` (`:484`) and reads `view.scale`, while bounded uses the DERIVED `boundedScale` —
un-gating it requires a new `userScaleOverride ?? boundedScale` state and a pan story for bounded.
Recommend instead: a bounded-only "Fit / 100%" toggle that sets one override, done as its own change.

## Spec map / coupling for this cluster
- `canvas.spec.ts` — `:47` phone `touch-action: pan-y`; `:83`/`:195`/`:263`/`:329`/`:366`/`:413`
  `getByRole('button', {name:'Edit layout'})`; `:196` + `:361-363` `{name:'Add', exact:true}` and
  `{name:'Layouts', exact:true}`; `:199` **`getByTestId('scene-add-widget-panel').getByRole('button').nth(1)`
  assumes Close is button index 0** — any header change in `AddWidgetPanel` breaks it; `:381`/`:427`
  focus "Close layouts"/"Close" then Escape; `:63-88` edit-mode scrollHeight; destroy-confirm for /scene.
- `scene-cards.spec.ts` — `:206`/`:407`/`:434` `{name: 'Queue {title}'}`; `:265` `{name:'Show', exact:true}`;
  `:413-445` assert the queue Move up/down arrows `toBeDisabled()` (so those must stay natively disabled).
- `responsive.spec.ts` — `/board` in ROUTES + the `clippedControls` scroll-path rule.
- `a11y-axe-gate.spec.ts` — `/board` + the opened command palette. `ux-audit.spec.ts` +
  `command-palette.spec.ts` — the palette.

See [[completion-pass-ux-patterns]] and [[beta-readiness-audit]] for the destructive-op / Page /
empty-state classes these overlap with.
