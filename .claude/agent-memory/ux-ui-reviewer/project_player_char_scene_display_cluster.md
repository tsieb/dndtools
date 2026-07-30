---
name: player-char-scene-display-cluster
description: gm-react Player.tsx (/player), PlayerView.tsx (/play), Join.tsx, SceneCardsPanel.tsx, SceneDisplay*/ProjectionControl/ViewAsControl — state as of 2026-07-29 (re-verified after fc40e764)
metadata:
  type: project
---

Audit of `screens/Player.tsx` (in-shell sheet at `/player`), `screens/PlayerView.tsx` (chrome-less
`/play`), `screens/Join.tsx`, `screens/SceneCardsPanel.tsx` (embedded in `/scenes`),
`screens/SceneDisplay.tsx` + `app/SceneDisplayOverlay.tsx`, `app/ProjectionControl.tsx`,
`app/ViewAsControl.tsx`, `styles/index.css`, `styles/scene-display.css`.

## FIXED — do not re-flag
- `Join.tsx` is solid: `<h1>`, `role="alert"` on invalid invite, `role="status"` on loading, Retry +
  escape-hatch buttons. `Icon name="UserCircle"` IS a real registry entry (`ds/.../Icon.jsx:506`) —
  checked, not a broken glyph.
- `Player.tsx`'s write-error banner NOW has `role="alert" aria-live="assertive"` (~429-443). The
  "no live region on the error surface" finding from the previous pass is CLOSED.
- `PlayerView` nav rows switched `disabled` → `aria-disabled` so the lock-reason toast is reachable
  and `aria-label` readable (~496). Playwright's `toBeEnabled`/`toBeDisabled` DO honour
  `aria-disabled`, so `co-dm.spec.ts:186-188` is still a meaningful gate.
- `SceneCardsPanel` delete has real undo (`scene-card.restore`); queue reorder boundary-disable is
  DELIBERATE and asserted by `scene-cards.spec.ts:363-385`.
- `ds/Field` AUTO-associates its `<label>` with a single unnamed child via `React.useId()`, so the
  SceneCardRow edit-form fields with no `htmlFor`/`id` are correctly labelled. Its `help`/`error`
  text is NOT wired via `aria-describedby` though — DS-level gap.
- `Player.tsx` spell slots now use the DS `SpellSlots`; only CLASS RESOURCES are still hand-rolled.

## STILL OPEN (confirmed after fc40e764)
1. **Locked `/play` nav rows are `opacity: 0.42`** (`PlayerView.tsx:524`). Measured ≈**2.48:1** for
   `--color-text-secondary #bcab92` composited at 42% over the sidebar (~#1e170f). These rows are
   focusable AND actionable (they toast), so the 1.4.3 "inactive component" exemption does not
   apply. 0.7 gives ≈4.58:1. At ≤1024px the label is `display:none`, so only the 0.42 icon remains
   (1.4.11 fails too). Cheapest highest-value fix in the cluster.
2. **`/play` has no skip link and its `<main>` (`PlayerView.tsx:745`) has no `id`.** AppShell has
   one (`AppShell.tsx:1057` → `#main-content`) but `/play` sits outside it. Combined with the phone
   nav being DOM-FIRST (`styles/index.css:176-232` fixes `.player-view-sidebar` to `bottom:0` while
   the `<aside>` stays the first shell child), 9 nav buttons precede content in tab order. Use a
   DISTINCT id (`player-main`) — `_helpers.ts:55`/`join.spec.ts:5` treat `#main-content` as the
   AppShell marker.
3. **Stage viewport hard-codes 6 colours** (`PlayerView.tsx:912-1009`: `#1a130b #100b07 #15100a
   #0d0906 #f3e7d2 rgba(8,5,3,.85) rgba(243,231,210,.7)`). Contrast is actually FINE in parchment
   (label ≈5.35:1), so the real symptoms are (a) the `color-mix(accent 14%)` grid vanishes against
   near-black once accent is the dark parchment `#9a5418`, and (b) `forced-colors: active` overrides
   `background-color` and `color` but NOT `background-image`, so the near-black gradient scrim at
   :974 survives while its cream text is forced to CanvasText → black-on-black. Needs a
   `@media (forced-colors: active)` escape, or a documented "theatre chrome is theme-exempt" ADR.
4. **Toast live regions mount with content** (`PlayerView.tsx:761-787`). Nuance: `role="alert"`
   (error toasts) IS announced on insertion; the `role="status"` info/success/neutral ones usually
   are not. Only the status half is broken.
5. **`SceneBanner` auto-dismisses at 5s** (`:311-315`) with no pause. Observable symptom beyond
   2.2.1: its own Dismiss `IconButton` (`:390`) lives INSIDE the banner, so a keyboard user focused
   there loses focus to `<body>` when the timer fires.
6. **Accordions have `aria-expanded` but no `aria-controls`/panel id** — Handouts
   (`:1714` / panel `:1754`) and Bestiary (`:2026` / panel `:2054`).
7. **`AtlasSection` renders the raw `dm-only` enum in a GOLD accent `Badge`** (`:1960`). Gold =
   primary action everywhere else, so the safety cue reads inverted. `ds/VisibilityChip` already
   normalizes `dm-only`/`player-visible`/`shared` (`CORE_ALIASES`) — swap it in.
8. **`ElevatedLocked` (`:1881`) is unreachable** — `current` is clamped to `allowedIds` at `:481`
   and all 9 ids have branches, so the `else` at `:571` never runs. Dead code, low user impact.
9. **`Player.tsx:1388` class-resource pips are 13×13px.** MEASURED: growing them to 24px is NOT
   safe alone. `setClassResourceInputSchema.max` is `z.number().int().nonnegative()` — UNBOUNDED
   (`packages/core/src/schemas/commands.ts:1736`), so 20 sorcery points is legal. Phone budget:
   393 − 28 (Page) − 32 (Panel) ≈ 333px, minus icon 17 + 3 gaps 33 + counter 30 → ≈253px for
   name+pips. 24px pips overflow past 6; 13px pips already degrade past ~14 (the pip `<button>`s
   have no content so `min-width:auto` ≈ 3px and they SHRINK to slivers rather than overflow).
   Fix must add `flexWrap:'wrap'` + `justifyContent:'flex-end'` + `flex:'0 0 auto'` on the pips.
10. **`SceneCardsPanel` edit disclosure is unannounced** — the Edit `IconButton` (`:715-721`) has no
    `aria-expanded`/`aria-controls`, its label stays "Edit {title}" when open, focus never moves
    into the form (`:730`) nor back on Cancel. Escape works but only via the container's `onKeyDown`.
11. **Queue move buttons drop focus at the boundary** (`SceneCardsPanel.tsx:528-543`): the button
    you just pressed becomes `disabled`. Keep the disable (spec-asserted) and move focus to the
    surviving sibling.
12. **Dice modifier stepper** (`PlayerView.tsx:1509-1532`): IconButton labels are the deltas
    ("−1"/"+1") not actions, the `{sgn(mod)}` value span is not a live region so nothing is
    announced, and `mod` is unbounded. Also `seg()` (`:1417`) is three `aria-pressed` buttons with
    the "d20 mode" caption (`:1493`) not programmatically attached — needs `role="group"`.
13. **`SheetSection`'s sticky header hard-codes `padding: '12px 28px'`** (`:1231`) while `PvPage`
    switches to 14px on phone (`:238`) and `Player.tsx:323` does the same — so on a 393px phone the
    sheet header is inset 28px and everything under it 14px. Oversight, not a convention.

## Verified NON-defects (don't re-report)
- `SceneDisplaySurface`'s Electron `url`-hero block is intentional (CSP `img-src 'self' data: blob:`
  and `SceneCardsPanel.tsx:266` disables the URL input on native desktop).
- `SceneDisplayOverlay` is the exemplary modal: real focus trap, Escape, focus restore, back-handler.
  Cite it when flagging weaker panels.
- `Player.tsx`'s sticky vitals `top: 0` is CORRECT — it renders inside `AppShell`'s `<main>`, which
  is the scroll container. Only chrome-less routes need `var(--native-titlebar-height)`.
- `ViewAsControl.tsx` is the app's ONLY `role="menu"`; missing arrow-key roving focus (still open,
  outside this cluster's files).
- `runtime.defaultActorId` is a getter returning the PREVIEWED actor, so reads through it are
  correctly actor-filtered during "View as" — no DM-only leak.
- `.player-view-toolbar > span:nth-child(2)` (index.css:222) hides the tier blurb on phone via
  JSX-order-coupled CSS. Fragile but currently correct — don't reorder that toolbar's children.

## Coverage map
- `/play`: `responsive.spec.ts:454-527` (compact Co-DM nav + no-overflow), `co-dm.spec.ts:163-209`,
  `scene-cards.spec.ts:279-361` (player banner + journal scene history), `equipment.spec.ts`,
  `command-palette.spec.ts`, `graph.spec.ts`.
- `/player`: `responsive.spec.ts:529-541` (per-tab overflow vs `#main-content`), `a11y-axe-gate.spec.ts` ROUTES.
- `/join`: `join.spec.ts`, `responsive.spec.ts:510-527`.
- `/scenes` + SceneCardsPanel: `scene-cards.spec.ts` (composer, queue order, Show/push, reorder
  boundaries), `a11y-axe-gate.spec.ts` (`/scenes`).
- **`/play` and `/join` are NOT in the axe-gate ROUTES list** (`a11y-axe-gate.spec.ts:23-40` has
  `/scenes` and `/player` only) — axe violations on the standalone player app go uncaught.
  `tests/a11y/known-violations.json` is `{ "violations": [] }`, so the register is clean.

See [[player-surface-audit]] for the older structural classes (join flow spans SessionPanel,
chrome-less routes lose DS contracts, DM-only encoded two ways) and [[ds-layer-audit]] for the
Tabs/Checkbox/SpellSlots DS gaps this cluster inherits.
