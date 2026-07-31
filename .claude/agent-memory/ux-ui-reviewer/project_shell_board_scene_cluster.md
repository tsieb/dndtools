---
name: shell-board-scene-cluster
description: Structural UX gotchas in the gm-react shell + board/scene canvas cluster (AppShell, Board, SceneEditor, SceneCardsPanel, SceneBoardCanvas, widget-bodies, screen-kit, ScenesCreator); re-audited 2026-07-31 run #21 at e702bb6f
metadata:
  type: project
---

Re-verified 2026-07-31 at `e702bb6f`. All line numbers from that commit.

**Path corrections the briefs keep getting wrong:**
- `SceneEditor.tsx` lives in `src/screens/`, NOT `src/app/`.
- The scene Inspector is the local `function Inspector()` inside `SceneEditor.tsx:747-958`.
  There is NO `app/InspectorPanel.tsx`.
- `SceneCardsPanel` is rendered by `ScenesCreator.tsx:431`, inside its `<Page max={1180}>`.

## ⭐ THE FACT THAT REFRAMES THIS CLUSTER (run #21 update)
Every built-in widget is `author:'system'` → `tier:'system'` → `isWidgetResizable()` FALSE for 100%
of shipping widgets. **The three-affordances-disagree bug is now CLOSED**: `board-helpers.ts:92-94`
exports `isWidgetResizable`, and `SceneEditor.tsx:771/:886-909` gates S/M/L behind it (shows
"Locked — this widget's size is fixed by the scene layout."). Canvas + Inspector now agree.
Consequences that REMAIN: no resize handle ever renders (`SceneBoardCanvas.tsx:830`), the selection
chip always reads `lock` + "System · locked content" (`:826`), `Shift+Arrow` is dead (`:404-406`),
and `handleResizeWidget` in core still has NO tier gate (GUI is the only guard, but now consistent).

## ⭐ THE RUN-#21 HEADLINE
**`styles/index.css:84-86` gates the canvas touch-target compensation on `html[data-android]`, but
the SCALE is applied on every profile.** `SceneBoardCanvas.tsx:504` always publishes
`--scene-board-touch-target: 48/scale`, yet only `html[data-android] .scene-board-operation` consumes
it. On a non-Android phone `/board` renders at scale ≈0.48, so `OpChip`'s
`min*: var(--operation-touch-target, var(--density-touch-target, auto))` falls to
`--density-touch-target` (2rem–2.75rem, DEFINED — see non-defects) and paints at **~15px on screen**.
Timer's stacked transport pair (`gap:4`) ⇒ ~13px between centers, so the 2.5.8 Spacing exception
cannot save it either. Fix is one selector: drop `html[data-android]` from `index.css:84`.

## CONFIRMED FIXED — do not re-report
Run #21 closed: Inspector S/M/L vs canvas (above); `SceneCardsPanel` "Next card" (`:520`) and
"Queue {title}" (`:749`) hard-`disabled` → `aria-disabled` soft-disable.
Run #15 and earlier, all still true at HEAD: `SceneBoardCanvas.tsx:702` selection `outline` emitted
only when selected (global `:focus-visible` restored); `Board.tsx:101-103` `ensure-home` `.catch`;
`AppShell.tsx:1045-1057` Ctrl/⌘+Right try/catch + both toasts; `widget-bodies.tsx:403-409` ONE
persistent transport `OpChip`; `:305-317` dice `role="status"` + `SR_ONLY` prefix; `AppShell.tsx:1131`
`<main>` has no inline `outline:'none'`; both screens' `dispatch()` catch the persist rethrow;
`SceneMetaPanel key={id}`; bounded `height:'100%'`; Layouts as a peer of Add; both Delete confirms;
`<h2>`s in `<main>`; `pointercancel` + `setPointerCapture`; VIEW-mode `onBgDown` target guard;
`screen-kit` `LoadingRegion` + `srOnly` + `radioGroupKeyDown` Home/End + `BackBar` padding target.

## VERIFIED NON-DEFECTS (stop re-filing)
- **`--density-touch-target` IS defined** — `tokens/spacing.css:107/119/131` = 2rem / 2.75rem /
  1.75rem, plus `index.css:34` 3rem. So `OpChip`'s fallback chain never reaches `auto`. The board
  operate-chip problem is SCALE (above), not the fallback.
- **`screen-kit.tsx:271-274` `Seg` Home/End math is CORRECT.** Home = `moveSelection(-1, +1)` lands
  index 0; End = `moveSelection(0, -1)` lands index len-1. Traced it; do not "fix" it.
- **`ScenesCreator`'s `SceneRowMetaEditor` has no cross-row state leak** — it is inside the row's
  `key={scene.id}` div, so switching rows remounts it with fresh drafts.
- **`SceneCardRow`'s `useEffect` at `:651-657` correctly resyncs drafts** when not editing.
- Selection chip `top:-26` clipping is ~2px. The resize handle does NOT clip horizontally.
  `SceneCardsPanel`'s bare `maxWidth:1180` root is fine (Page owns gutters).
- `Field` auto-associates a single child. Phone panels `zIndex:4` do not cover the Dialog.
- `/board` not being a phone bottom tab is contract-compliant.

## STILL OPEN — ranked (run #21 line numbers)
1. ⭐ Android-only touch compensation — `styles/index.css:84` + `SceneBoardCanvas.tsx:504`. See above.
2. `SceneCardsPanel.tsx:516-525` "Next card" is `aria-disabled` but `onClick={onAdvance}` is
   UNGUARDED ⇒ pressing it dispatches `scene-card.advance`, core rejects "The scene queue is empty."
   (`packages/core/src/commands/scene-card.ts:456`), `run()` red-toasts it. **`scene-cards.spec.ts:243-247`
   is a FALSE GREEN** — its comment claims "the press is swallowed rather than dispatching a doomed
   command"; it only asserts `activeCardId` is unchanged, which a rejection also satisfies.
3. `SceneCardsPanel.tsx:740-751` same pattern on Queue, and the rejection message is
   `Scene card <raw-uuid> is already queued.` (`scene-card.ts:526-530`) ⇒ a UUID in a user toast.
4. `SceneBoardCanvas.tsx:496-509` the bounded transform div sets `minWidth/height` to the UNSCALED
   `boundedExtent`, but `transform:scale()` doesn't affect layout ⇒ phone `/board` reserves ~576px of
   scrollHeight for ~274px of painted board = **~300px of dead scroll**. The `:514-521` comment proves
   the author knows absolute children contribute overflow; they just missed transform-vs-layout.
5. `Board.tsx:439-456` the "permanent live-region host" is `display: status ? 'inline-flex' : 'none'`.
   `display:none` removes it from the ACCESSIBILITY TREE, so flipping to visible + content in one
   commit is exactly the "insert region and text together" mutation the comment says SRs drop.
   The documented fix does not work. Use `srOnly`/`height:0;overflow:hidden` when empty instead.
6. `AppShell.tsx:1027` + `SceneDisplayOverlay.tsx` — `setDisplayOpen(true)` has exactly ONE caller
   (⌘/Ctrl+Shift+S). No pointer entry point anywhere; unreachable on phone/tablet-touch, while
   `SceneCardsPanel.tsx:200` advertises the shortcut.
7. `AppShell.tsx:1033-1060` — `if (display.queuedCount > 0)` wraps everything; the empty-queue path
   falls to a bare `return` with no `preventDefault`, no toast. Silent no-op on an advertised shortcut.
8. `SceneEditor.tsx` has ZERO polite live regions (only `role="alert"` at `:422`). Add / resize /
   visibility / focus-order / metadata-save / remove are all silent. Port Board's host — but fix #5 first.
9. `SceneCardsPanel.tsx:763-769` per-card edit disclosure: no `aria-expanded`/`aria-controls`, label
   stays "Edit {title}", focus never enters, `:780` Escape unreachable, and `:414` `setEditingId(null)`
   on save unmounts the panel with focus on Save ⇒ focus to `<body>`.
10. `ScenesCreator.tsx:236-248` the green "Saved" tick reads `runtime.lastLifecycle` (SceneRuntime
    `:237`), which is GLOBAL and never cleared on unmount ⇒ remount `/scenes` after any earlier
    `scene.create` and an EMPTY form wears a green tick. Neither the success nor the failure span
    (`:249-261`) is in a live region.
11. `ScenesCreator.tsx:356-363` + `:441-543` row meta editor: no `aria-expanded`, no focus entry,
    `saveRowMeta` `:106` `setEditingId(null)` unmounts under focus, and the `:514-526` error span is a
    bare `<span>` where DS `Field error=` would give role=alert + aria-invalid + aria-describedby.
12. `Board.tsx:583-622` / `SceneEditor.tsx:693-732` widget-library rows: no busy state, no idempotency
    key ⇒ double-tap adds two widgets. Also NO hover (bare inline-styled `<button>`, and this repo has
    no global `button:hover`).
13. `SceneBoardCanvas.tsx:325-344` `onWheel` never `preventDefault`s ⇒ ⌘/Ctrl+wheel zooms canvas AND
    browser. Needs a native `{passive:false}` listener on `wrapRef`, gated `policy==='canvas'`.
14. `SceneBoardCanvas.tsx:480` `touchAction:'none'` for `policy==='canvas'` ⇒ no pinch-zoom on a phone;
    `onBgDown:255` requires `e.target === e.currentTarget` so pan works only from bare background.
15. `SceneEditor.tsx:251-292` denied/missing bail-out is a bare `maxWidth:720` div, not `<Page>`.
16. A REPEATED IDENTICAL message never re-announces — React `Object.is` bail-out on
    `Board.tsx:458` / `SceneEditor.tsx:419` / Board's `setStatus`. Needs a nonce or clear-first tick.
17. `AppShell.tsx:568-593` "All scenes (N)" / "Show fewer" has no `aria-expanded`/`aria-controls`
    (the "More · audio, graph & extensions" toggle at `:601-604` has BOTH — copy that).
18. `SceneCardsPanel.tsx:536-604` the queue renders visible "1." "2." numbers with NO list semantics
    (`<div>`s, no `role=list`/`<ol>`) ⇒ AT gets no position/count.
19. `SceneBoardCanvas.tsx:445` frame `ariaLabel` appends pixel geometry in VIEW mode too. Spec-free.
20. `/board` prints "GM Screen" twice: `AppShell.tsx:858` `<h1>` + `Board.tsx:355` `<h2>`.
21. `SceneEditor.tsx:409-413` the Edit-layout toggle clears `addOpen` but NOT `metaOpen`; and `:452`
    selecting a widget while Scene details is open paints a ring but `:517` gates the Inspector off.
22. Side panels never move focus IN and have no click-outside (`Board.tsx:532`,`:627`;
    `SceneEditor.tsx:465`,`:482`,`:517`). **`canvas.spec.ts:404/445/484` explicitly `.focus()` the
    Close button first**, so moving focus in on open keeps those green.
23. `SceneEditor.tsx:924-928` "Earlier" `disabled={focusOrder===0}` self-disables on success; from
    "Auto" it jumps to `Position 1`, not "earlier".
24. `widget-bodies.tsx:126-131` `!onPress` renders an `aria-hidden` inert chip — in EDIT mode that is
    EVERY operate control on the canvas, invisible to AT with no explanation.
25. `widget-bodies.tsx:381/387` timer `urgency:'warning'` is COLOR ALONE (`statusLabel` stays
    "Running"); expiry text renders in a `<Muted>` with no live region.
26. `Board.tsx:211` `if (ok) setStatus(null)` is dead code (`dispatch` already nulled it).
27. `SceneBoardCanvas.tsx:609-632` `ZoomBtn` is inline `width/height:28`; on Android
    `min-height:48px` (index.css:41) wins over the inline `height`, giving a 28×48 button in a cluster
    whose `%` label is 38px wide. Cosmetic misalignment, Android only.

## Reusable facts learned here
- `SceneRuntime.dispatchNow` REJECTS for policy refusals but THROWS for persist failures.
  `main.tsx:17` toasts unhandled rejections generically. `SceneRuntime:237` `lastLifecycle` is global
  and survives route changes.
- `ds/components/core/Button.jsx`: `disabled` = hard native; truthy `aria-disabled` = soft. **A soft
  disable REQUIRES the onClick to guard itself** — three sites in this cluster forgot.
- `--focus-ring-offset: 2px`, `--focus-ring-width: 2px`, `:focus-visible` in `tokens/base.css:36`.
- Seeded home extent = 792 × 576 (3 cols × 240 + 24 gutter; 24 + 3 rows × 184). Pixel 5 = 393 ⇒
  `boundedScale = clamp((393-16)/792, 0.4, 1) = 0.476`. Memorize 792/576.

## Spec map / coupling
- `canvas.spec.ts:46-93` phone `/board` asserts `touch-action: pan-y` AND
  `scrollHeight > clientHeight` after moving a widget to `y:900` at 375×667. **A fix for open item #4
  (scaling the layout box) leaves ~491px vs a ~460px clientHeight — green but only just. MED risk.**
  `:101-127` compares board `scrollHeight` before/after Edit layout with a `+200` tolerance.
- `canvas.spec.ts` also pins: `scene-board-bounded`/`scene-board-canvas` testids; `{name:/Edit layout/i}`;
  `{name:'Add', exact:true}`; `{name:'Layouts', exact:true}` + `aria-expanded` (`:435-441`);
  `board-layouts-panel`; `{name:'Close layouts'}`; `{name:'Close', exact:true}` `.focus()`ed before
  Escape at `:404`,`:445`,`:484`; `scene-add-widget-panel` `getByRole('button').nth(1)` (assumes Close
  is index 0); `{name:'Remove widget'}`; `scene-meta-panel` + `#scene-meta-name` + `{name:'Save details'}`;
  `getByTestId('widget-<id>').focus()` + Enter/Delete. Nothing asserts the frame `aria-label`/`role`.
- `scene-cards.spec.ts` — `{name:'Queue {title}'}` clicked only when NOT queued (`:206`,`:422`,`:451`);
  `{name:'Next card'}` clicked at `:212`,`:223`; **`:239-247` asserts `aria-disabled='true'` + the
  `title` + `el.disabled === false`, then `dispatchEvent('click')` and asserts `activeCardId`
  unchanged — guarding the handler KEEPS this green and makes the comment true**;
  `Move {title} up/down` asserted `toBeDisabled()` at `:428-436`,`:462` — those MUST stay natively
  `disabled`; `{name:'Show', exact:true}` at `:280`; `{name:'Create scene card'}`.
- `responsive.spec.ts:225-273` — `/board` AND `/scene/:id` must fit `#main-content` exactly at 393×720
  and 1280×800, and `#main-content > div` must be ≥ clientHeight−2. A zero-height/`srOnly` live-region
  host is safe; any always-visible new row is not.
- `a11y-axe-gate.spec.ts` — `/board` and `/scenes` are scanned; **`/scene/:id` is NEVER axe-scanned**.

See [[completion-pass-ux-patterns]], [[ds-layer-audit]], [[beta-readiness-audit]].
