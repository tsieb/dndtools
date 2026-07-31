---
name: shell-board-scene-cluster
description: Structural UX gotchas in the gm-react shell + board/scene canvas cluster (AppShell, Board, SceneEditor, SceneCardsPanel, SceneBoardCanvas, widget-bodies, screen-kit); re-audited 2026-07-30 run #15 at 33651613
metadata:
  type: project
---

Re-verified 2026-07-30 at `33651613`. All line numbers from that commit.

**Path corrections the briefs keep getting wrong:**
- `SceneEditor.tsx` lives in `src/screens/`, NOT `src/app/`.
- There is NO scene-side `app/InspectorPanel.tsx`. The scene Inspector is the local
  `function Inspector()` inside `SceneEditor.tsx:741-934`.

## ⭐ THE FACT THAT REFRAMES THIS CLUSTER (verified run #15)
**Every built-in widget is `author: 'system'`** (`state/widget-package-state.ts:452-457`, one
`systemWidget()` factory for all of them) → `tierOf` → `tier: 'system'` (`board-helpers.ts:70-80`)
→ `canResize` default `w.tier !== 'system'` is **FALSE for 100% of shipping widgets**. So:
- no resize handle EVER renders (`SceneBoardCanvas.tsx:830`),
- the selection chip always shows `lock` + "System · locked content" (`:826`, `TIER_LABEL`),
- `Shift+Arrow` `preventDefault()`s then silently returns (`:404-406`) — a dead feature,
- **but** the Inspector's S/M/L (`SceneEditor.tsx:872-885`) is unconditional and
  `handleResizeWidget` (`packages/core/src/commands/widget.ts:353-372`) has NO tier gate, so it
  works. Three affordances, three different answers. Consequence: the 14px resize handle is a
  LATENT finding, not a live one — don't spend severity on it.
- `WidgetDefinition.resizePolicy` exists in the schema, is always `'free'`, and is read by NOBODY.

## CONFIRMED FIXED — do not re-report
Run #14's entire top-6 is closed:
- `SceneBoardCanvas.tsx:702` emits `outline` ONLY when selected → the global `:focus-visible` ring
  is back on widget frames. (`outlineOffset: 2` inline == `--focus-ring-offset: 2px`; NON-issue.)
- `Board.tsx:101-103` — `command-center.ensure-home` now has a real `.catch(setError)`.
- `AppShell.tsx:1045-1057` — Ctrl/⌘+Right has try/catch + success AND failure toasts.
- `widget-bodies.tsx:403-409` — ONE persistent transport `OpChip` driven by `countdown.status`.
- `widget-bodies.tsx:305-317` — dice result is a permanently-mounted `role="status"` with an
  `SR_ONLY` prefix; the prohibited `aria-label` on a `<span>` is gone.
- `AppShell.tsx:1144-1149` — `<main>` has no inline `outline:'none'`; `outlineOffset:'-3px'`.
- Both screens' `dispatch()` helpers catch the persist-failure rethrow.
Older: `SceneMetaPanel key={id}`; bounded `height:'100%'`; Layouts as a peer of Add w/ Escape +
`aria-expanded`; both Delete confirms; `<h2>`s in `<main>`; `pointercancel` + `setPointerCapture`;
VIEW-mode `onBgDown` target guard; `widget-rejection.ts` soft-disable; `screen-kit` `LoadingRegion`
+ `srOnly` + `radioGroupKeyDown` Home/End + `BackBar` padding-based 24px target.

## VERIFIED NON-DEFECTS (I have claimed some of these before — stop)
- **Selection chip `top:-26` clipping is ~2px, not "clipped".** Measured: bounded `ty=8`, chip
  bottom pinned at board y −8, `scale(1/scale)` origin bottom-left. Barely a sliver.
- **The resize handle does NOT clip horizontally.** `transform: scale(1/scale)` origin bottom-right
  keeps it inside; the inner transform div is 792px wide inside a ≥900px wrapper.
- **`SceneCardsPanel`'s bare `maxWidth:1180` root is fine** — `ScenesCreator.tsx:149` wraps it in
  `<Page max={1180}>`, which owns the phone gutters.
- Focus ring and selection ring are the SAME colour (`--color-accent` == `--color-interactive-focus-ring`
  == `#e0b06f` in default+dark), but the selection CHIP disambiguates. Minor at most.
- `Field` auto-associates a single child. Phone panels `zIndex:4` do not cover the Dialog.
  `/board` not being a phone bottom tab is contract-compliant. `--operation-touch-target` is
  Android-only by design.

## STILL OPEN — ranked (run #15 line numbers)
1. `SceneEditor.tsx:872-885` S/M/L vs `SceneBoardCanvas.tsx:405-406/:431/:826` — see ⭐ above.
2. `SceneBoardCanvas.tsx:325-344` `onWheel` never `preventDefault`s ⇒ ⌘/Ctrl+wheel zooms the canvas
   AND the browser. Needs a native `{passive:false}` listener on `wrapRef`, gated `policy==='canvas'`.
3. **Phone `/board` renders at scale ≈0.48.** `boundedScale = clamp((wrapWidth-16)/792, 0.4, 1)`
   (`:194-197`); the seeded home is 3 cols × 240 + 24 gutter = **792px extent**
   (`state/command-center-state.ts:99-117`). Pixel 5 = 393 ⇒ 0.476. 13px body text → ~6px.
4. `SceneEditor.tsx` has ZERO polite live regions (only `role="alert"` at `:416`). Add / resize /
   visibility / focus-order / metadata-save / remove are all silent. Board has a permanent
   `role="status"` host (`Board.tsx:439-456`) — port it.
5. `SceneEditor.tsx:245-287` denied/missing bail-out is a bare `maxWidth:720` div, not `<Page>`.
6. A repeated IDENTICAL message never re-announces — `setError(PERSIST_FAILED)` / `setStatus(same)`
   hits React's `Object.is` bail-out. Both the error alerts (`Board.tsx:458`, `SceneEditor.tsx:413`)
   AND Board's status (applying the same preset twice). Needs a nonce or a clear-first tick.
7. Hard-`disabled`-on-own-success ⇒ focus to `<body>`: `SceneCardsPanel.tsx:305` Create,
   `:516` **Next card (NEW — `advance` pops the head, so the last card empties the queue)**,
   `:744` Queue, `Board.tsx:689` Save preset.
8. `SceneCardsPanel` gives NO success feedback for create / Show / queue / visibility-toggle — only
   `Toaster.error` on failure. Only `deleteCard` (`:132`) confirms, and it has a proper Undo.
9. `SceneCardsPanel.tsx:758-764` + `:773-851` per-card edit disclosure: no `aria-expanded`/
   `aria-controls`, label stays "Edit {title}", focus never enters, `:775` Escape is unreachable.
10. Side panels never move focus in and have no click-outside (`Board.tsx:532`,`:627`;
    `SceneEditor.tsx:459`,`:476`,`:511`). Their Escape handlers are on the panel Card, so Escape is
    dead from the state the user is actually in. **`canvas.spec.ts:404/445/484` explicitly
    `.focus()` the Close button first** — moving focus in on open keeps those green.
11. Unguarded double-add: `Board.tsx:583-622` / `SceneEditor.tsx:687-726` fire an async
    `scene.add-widget` with no busy state and no idempotency key ⇒ double-tap adds two.
12. `SceneEditor.tsx:897-903` "Earlier" `disabled={focusOrder === 0}` self-disables on success; and
    from "Auto" it jumps to `Position 1` (not "earlier").
13. `SceneBoardCanvas.tsx:480` `touchAction:'none'` on `/scene/:id` ⇒ no pinch-zoom on a phone, and
    `onBgDown:255` requires `e.target === e.currentTarget` so pan only works from bare background.
14. `AppShell.tsx:1160` `SceneDisplayOverlay` is ⌘/Ctrl+Shift+S ONLY — no pointer entry point.
15. `widget-bodies.tsx:126-131` `!onPress` renders an `aria-hidden` inert chip; in VIEW mode with an
    undeclared command that is a dead control invisible to AT.
16. `widget-bodies.tsx:381` timer `urgency:'warning'` is COLOR ALONE (`statusLabel` stays "Running";
    only `danger` gets the "9.4" format change). Expiry ("Time's up",
    `queries/timer-countdown.ts:109-115`) renders in a `<Muted>` with no live region.
17. `AppShell.tsx:568-593` "All scenes (N)" / "Show fewer" has no `aria-expanded`/`aria-controls`.
18. `SceneBoardCanvas.tsx:445` frame `ariaLabel` appends pixel geometry in VIEW mode too.
19. `/board` prints "GM Screen" twice: `AppShell.tsx:858` `<h1>` (`nav.ts` RUN[1].label) +
    `Board.tsx:355` `<h2>`.
20. No hover on bare inline-styled buttons: `Board.tsx:584`, `SceneEditor.tsx:688`,
    `AppShell.tsx:478`, `:569`, `:601`. (`SideRow`/`SceneSideRow` already do the `T.hover` pattern.)
21. `AppShell.tsx:1039` `if (display.queuedCount > 0)` — ⌘/Ctrl+→ silently no-ops on an empty queue
    while `SceneCardsPanel.tsx:200` advertises the shortcut.
22. `SceneEditor.tsx:511` + `:403-407`: selecting a widget while Scene details is open paints a ring
    but opens no Inspector; the Edit-layout toggle clears `addOpen` but not `metaOpen`.
23. `AppShell.tsx:542-548` "New scene" navigates to `/scenes` with NO create-intent state, and
    `ScenesCreator.tsx` has no `useLocation` consumer (Board/Atlas/Knowledge/Campaign/Characters all
    do). Low impact — the create form IS the first thing on `/scenes`.
24. `Board.tsx:211` `if (ok) setStatus(null)` is dead code (`dispatch` already nulled it).
25. LATENT: 14px resize handle (`:830-847`) — unreachable until a non-system widget package ships.

## Reusable facts learned here
- `SceneRuntime.dispatchNow` REJECTS for policy refusals but THROWS for persist failures.
  `.finally()` is NOT a catch. `main.tsx:17` toasts unhandled rejections generically.
- `ds/components/core/Button.jsx`: `disabled` = hard native; truthy `aria-disabled` = soft.
- `handleResizeWidget`/`handleMoveWidget` have NO tier or `resizePolicy` gate — the GUI is the only
  guard, and the two GUI paths disagree.
- `--focus-ring-offset: 2px`, `--focus-ring-width: 2px`, `:focus-visible` in `tokens/base.css:36`.
- Seeded home extent = 792 × (24 + 3rows*184) — memorize 792 for any bounded-scale math.

## Spec map / coupling
- `canvas.spec.ts` — phone `/board` `touch-action: pan-y` (`:47`); `scene-board-bounded` /
  `scene-board-canvas` testids; `{name:/Edit layout/i}`; `{name:'Add', exact:true}`;
  `{name:'Layouts', exact:true}` + `aria-expanded` assertions (`:435-441`);
  `getByTestId('board-layouts-panel')`; `{name:'Close layouts'}`; `{name:'Close', exact:true}`
  **`.focus()`ed before Escape at `:404`, `:445`, `:484`**;
  `getByTestId('scene-add-widget-panel').getByRole('button').nth(1)` (`:237`, `:666`) assumes Close
  is index 0; strict `{name:'Remove widget'}`; `scene-meta-panel` + `#scene-meta-name` +
  `{name:'Save details'}`; `getByTestId('widget-<id>').focus()` + Enter/Delete.
  Nothing asserts the frame `aria-label`/`role`, so #18 is spec-free.
- `scene-cards.spec.ts` — `{name:'Queue {title}'}` clicked BEFORE queuing (`:206`,`:407`,`:434`) ⇒
  soft-disabling it is SAFE; `{name:'Next card'}` clicked (`:212`,`:223`) but never asserted
  disabled ⇒ soft-disable SAFE; `{name:'Create scene card'}` (`:175`) SAFE;
  **`Move {title} up/down` asserted `toBeDisabled()` at `:413-421`,`:445` — those two MUST stay
  natively `disabled`**; `:426`/`:446` assert `toBeFocused()` after a reorder.
- `responsive.spec.ts:218-275` — `/board` AND `/scene/:id` must fill `#main-content` exactly at
  393×720 and 1280×800, and `#main-content > div` must be ≥ clientHeight−2. A `display:none`
  live-region host is safe; any always-visible new row is not.
- `a11y-axe-gate.spec.ts:22-38` — 15 routes; `/board` and `/scenes` are in, **`/scene/:id` is NEVER
  axe-scanned**, and `/board` is scanned on fresh state.

See [[completion-pass-ux-patterns]], [[ds-layer-audit]], [[beta-readiness-audit]].
