---
name: shell-board-scene-cluster
description: Structural UX gotchas in the gm-react shell + board/scene canvas cluster (AppShell, Board, SceneEditor, SceneBoardCanvas, SceneCardsPanel, widget-bodies); re-audited 2026-07-30 run #14 at 45adf828
metadata:
  type: project
---

Audit of the app-shell + board/scene canvas cluster in `apps/gm-react`. Re-verified 2026-07-30 at
`45adf828` (all line numbers below are from that commit).

**Path corrections the briefs keep getting wrong:**
- `SceneEditor.tsx` lives in `src/screens/`, NOT `src/app/`.
- **There is NO scene-side `app/InspectorPanel.tsx`.** The only `InspectorPanel.tsx` in the repo is
  `src/app/map/dock/InspectorPanel.tsx` (map editor). The scene Inspector is the local
  `function Inspector()` inside `SceneEditor.tsx:741-934`.

## CONFIRMED FIXED — do not re-report
Run #13's entire top-7 is closed:
- `SceneBoardCanvas` drags now `setPointerCapture` (`:209-215`) and terminate on `pointercancel`
  (`:307-314`, listener at `:317`) — drafts dropped, `body.userSelect` restored.
- Inspector Visibility `<Select>` has `aria-label="Widget visibility"` (`SceneEditor.tsx:859`).
- `Board.snapshotSafePoint()` wraps its raw dispatch in try/catch (`Board.tsx:242-246`).
- `SceneCardsPanel` `run()` (`:112-123`) and `createCard()` (`:99-102`) both catch a thrown persist.
- The DM-only chip on every widget frame is now `--color-text-secondary` (`SceneBoardCanvas.tsx:749`).
- The selection ring is an `outline`, not a `box-shadow` (`SceneBoardCanvas.tsx:698`) — **but that
  fix introduced OPEN-1 below. Read it before touching that line.**
Older fixed items still fixed: `SceneMetaPanel` `key={id}` + `[id]` reset; bounded `height:'100%'`;
Layouts as a peer of Add; both Delete confirms; `<h2>`s in `<main>`; desktop-only gutters (phone
exempt BY DESIGN — bounded fit scale is width-derived); `aria-expanded` on the four toolbar
disclosures; AppShell "More" is a real disclosure (`:600-628`); `widget-rejection.ts` soft-disable.

Verified NON-issues: `Field` auto-associates a single child (never flag a `<Field label>` with no
`htmlFor`). Phone panels are `zIndex:4` in the same non-stacking context as the fixed Dialog, so they
do NOT cover the destroy confirm. `--operation-touch-target` compensation is Android-only by design.
`/board` not being a phone bottom tab is CONTRACT-COMPLIANT.

## STILL OPEN — ranked (run #14 line numbers)
1. **`SceneBoardCanvas.tsx:698` — inline `outline: selected ? … : 'none'` on the widget frame
   SUPPRESSES the global `:focus-visible` ring** (`styles/tokens/base.css:36-39`). Inline style beats
   any stylesheet rule, so tabbing/arrowing between frames (the whole CANVAS-016 roving-tabindex
   feature) is now completely invisible on BOTH routes and in BOTH modes. Regression introduced by
   the box-shadow→outline fix. Fix: only emit the `outline` key when `selected`. In-repo precedent:
   `ds/components/map/LayerRow.jsx:101` and `screens/Graph.tsx:434` carry the same warning.
   Forced-colors is safe once fixed (`colors.css:407` maps the ring to `Highlight`).
2. **`Board.tsx:88-92` — `command-center.ensure-home` is `.finally()`-only, NO `.catch()`.** A
   persist failure ⇒ unhandled rejection and the GM Screen sits on "Setting up your GM Screen"
   forever with no error. The one dispatch that materializes the home scene.
3. **`AppShell.tsx:1043-1047` — Ctrl/Cmd+Right dispatches `scene-card.advance` with no catch and
   NO feedback on success or failure.** The only global play shortcut; unobservable either way.
4. **`widget-bodies.tsx:356-378` — Timer Start/Pause/Resume are conditionally-rendered SIBLINGS at
   different JSX indices**, so pressing one unmounts it and mounts a different node ⇒ focus to
   `<body>`. Fix: one persistent `OpChip` whose icon/label/onPress derive from `countdown.status`.
5. **Self-disabling buttons ⇒ focus to `<body>`** (`ds/components/core/Button.jsx:11-26`: `disabled`
   is the HARD native one). Sites: `SceneCardsPanel.tsx:301-308` Create (`disabled={submitting}`),
   `:744` Queue (`disabled={queued}`), `Board.tsx:677-685` Save preset (`presetName` cleared at
   `:229`). Soft-disable via `aria-disabled` where the spec allows.
6. **`widget-bodies.tsx:283-293` — `aria-label` on a bare `<span>`** (role=generic prohibits naming;
   axe `aria-prohibited-attr`), and the dice result has no live region, so pressing Roll announces
   NOTHING. The span only renders once history exists, which is why the `/board` axe gate misses it.
7. **A repeated IDENTICAL error is never re-announced.** `Board.tsx:450-466` / `SceneEditor.tsx:413`
   are conditionally-mounted `role="alert"`s fed a constant string; `setError(samestring)` bails out
   of re-render ⇒ zero DOM mutation ⇒ no second announcement and no visual change. Retry reads as
   "the button did nothing".
8. `SceneEditor.tsx:245-287` denied/missing bail-out is a bare `maxWidth:720` div, not `<Page>` —
   flush to both phone edges. `Board.tsx:267` already uses `<Page max={640}>`.
9. `SceneCardsPanel.tsx:773-851` per-card edit form: unannounced disclosure (no `aria-expanded`/
   `aria-controls`, label stays "Edit {title}", focus never enters, and Save/Cancel unmount it ⇒
   focus to `<body>`).
10. `AppShell.tsx:1134` `<main tabIndex={-1}>` has inline `outline:'none'`, so activating "Skip to
    content" gives a keyboard user no visual confirmation focus moved.
11. `SceneEditor.tsx:511` selecting a widget while Scene details is open paints a ring but opens no
    Inspector; the Edit-layout toggle (`:403-407`) clears `addOpen` but not `metaOpen`.
12. `SceneEditor.tsx` has ZERO polite live regions (only `role="alert"` at `:416`); `Board`'s
    permanent status host has no peer there. Add/save/visibility/resize/move/remove all silent.
13. `SceneBoardCanvas.tsx:445` frame `ariaLabel` appends pixel geometry unconditionally (VIEW mode
    too). `:806` selection chip at `top:-26` clipped in the bounded scroller. `:834-835` 14px resize
    handle (≈6.6px at bounded scale). `:325-344` `onWheel` never `preventDefault`s (needs a native
    `{passive:false}` listener on `wrapRef`, gated `policy==='canvas'`).
14. Widget-library rows fire an unguarded async add (`Board.tsx:575-614`, `SceneEditor.tsx:687-727`)
    — no busy state, `scene.add-widget` has no idempotency key ⇒ double-tap adds two.
15. `AppShell.tsx:567-592` "All scenes (N)" / "Show fewer" has no `aria-expanded`/`aria-controls`.
16. `AppShell.tsx:541-547` "New scene" navigates to `/scenes` with no state, and `ScenesCreator.tsx`
    has NO `useLocation`/create-intent consumer (Board/Campaign/Knowledge/Atlas all do).
17. `AppShell.tsx:1145` `SceneDisplayOverlay` is Ctrl/Cmd+Shift+S only — no button, menu row or
    palette entry ⇒ unreachable on phone/tablet.
18. No hover on the bare inline-styled buttons (`Board.tsx:575-614`, `SceneEditor.tsx:687-727`,
    `AppShell.tsx:477-504`, `:568-592`, `:600-628`). No global `button:hover` exists; `SideRow`/
    `SceneSideRow` already use the `onMouseEnter/Leave` + `T.hover` pattern.
19. Carried deferred backlog (own pass each): bounded `/board` scaling to ~0.47 on a phone (needs 3
    coordinated changes + 2 spec edits); Inspector S/M/L resizing canvas-LOCKED system widgets
    (`SceneEditor.tsx:872-891` vs `SceneBoardCanvas:405/431`); side panels never moving focus IN and
    having no click-outside; `widget-bodies.tsx:112-118` `aria-hidden` inert OpChip; "Keyboard order"
    readout lies (`SceneEditor.tsx:895-919`); `Board.tsx:203 if (ok) setStatus(null)` dead code;
    `/board` printing "GM Screen" twice.

## Reusable facts learned here
- `SceneRuntime.dispatchNow` REJECTS for policy refusals but THROWS for persist failures. Any
  `await runtime.dispatch()` without a `catch` is a silent-failure site; `try/finally` is NOT enough.
  **`.finally()` on the promise is equally insufficient** — see OPEN-2.
- `ds/components/core/Button.jsx:20-26`: `disabled` = hard native (drops out of tab order, kills the
  `title`/`aria-label` explanation); truthy `aria-disabled` = soft (focusable, swallows the click).
- `ds/components/forms/Select.jsx` is a bare `<select>` with NO auto-label; only `Field` names it.
- The global focus ring is `:focus-visible { outline }` in `styles/tokens/base.css:36`, tokens in
  `spacing.css:96-98`, remapped to `Highlight` under forced-colors (`colors.css:407`). **Any inline
  `outline:'none'` anywhere silently defeats it** — this is the repo's most-repeated regression.
- `--scene-board-touch-target` (`SceneBoardCanvas.tsx:504`) has exactly ONE consumer:
  `styles/index.css:84-86`, gated `html[data-android]`.

## Spec map / coupling for this cluster
- `canvas.spec.ts` — phone `/board` `touch-action: pan-y` (`:47`); `getByTestId('scene-board-bounded')`
  scrollHeight/clientHeight; `getByTestId('scene-board-canvas')`; `{name:/Edit layout/i}`;
  `{name:'Add', exact:true}`; **`getByTestId('scene-add-widget-panel').getByRole('button').nth(1)`
  (`:199`, `:637`) assumes Close is button index 0** — any AddWidgetPanel header change breaks it; a
  strict `{name:'Remove widget'}` that must stay unambiguous; `getByTestId('widget-<id>').focus()` +
  Enter/Delete. Nothing asserts the frame's `aria-label` or `role`, so OPEN-1/13 are spec-free.
- `scene-cards.spec.ts` — `{name:'Queue {title}'}` is `.click()`ed BEFORE queuing (`:206`, `:407`,
  `:434`), so soft-disabling it is safe; `{name:'Show', exact:true}` (`:265`);
  `{name:'Create scene card'}` (`:175`); **`Move {title} up/down` are asserted `toBeDisabled()`
  (`:413-421`, `:445`) — those two MUST stay natively `disabled`.**
- `responsive.spec.ts:218-275` — `/board` AND `/scene/:id` must fill `#main-content` exactly. Any new
  always-visible row on either root risks it; a `display:none` live-region host does not.
- `a11y-axe-gate.spec.ts:22-38` — 15 routes; `/board` and `/scenes` are in, **`/scene/:id` is NEVER
  axe-scanned**, and `/board` is scanned on fresh state (no dice history ⇒ OPEN-6 uncaught).

See [[completion-pass-ux-patterns]], [[ds-layer-audit]] and [[beta-readiness-audit]] for the
destructive-op / Page / token classes this overlaps with.
