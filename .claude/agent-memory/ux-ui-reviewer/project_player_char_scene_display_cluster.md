---
name: player-char-scene-display-cluster
description: gm-react Player/PlayerView/Join/SceneDisplay/SceneDisplayOverlay/ProjectionControl/ViewAsControl — FIXED-vs-OPEN split re-verified 2026-07-30 at 016b696c (run #15)
metadata:
  type: project
---

Cluster: `screens/Player.tsx` (/player, in DM shell), `screens/PlayerView.tsx` (/play, chrome-less),
`screens/Join.tsx`, `screens/SceneDisplay.tsx` (/display), `app/SceneDisplayOverlay.tsx`,
`app/ProjectionControl.tsx`, `app/ViewAsControl.tsx`.
Run #15 re-read Player/PlayerView/Join at `016b696c`. Entries marked ‡ are carried from run #9 and
were NOT re-verified. Line counts at HEAD: Player 2597, PlayerView 2260, **Join 216**.
None of Player/PlayerView changed since run #11; Join gained the retry soft-disable.

## FIXED — do not re-flag
Everything in the previous FIXED list holds (nav opacity + `aria-current` `PlayerView.tsx:521`,
`/play` skip link + `#player-main`, persistent toast live region `:810-813`, SceneBanner pause,
Handouts/Bestiary `aria-controls`, AtlasSection VisibilityChip, SheetSection `<h1>` + sticky padding,
class-resource 24px pips, `Player.tsx` write-error `role=alert` `:479-493`, `IconButton size=sm`=28px,
`auth.openAuthModal()`, stage `background`-shorthand fix `PlayerView.tsx:1003-1007` +
`data-testid="player-stage"`, `Player.tsx` tab bodies `key={charId}`, `err`/`hpNote` reset on tab AND
PC switch, HP typed amount + persistent-empty `role=status` `:475-477`, journal `aria-pressed`,
equipment `stepQty` ×0 soft-disable `:1112-1126`, Equip pill 24px `:1137-1156`).
NEW this pass:
- **`Join.tsx:197-207` "Try again" no longer unmounts itself** — it stays mounted through `loading`
  and soft-disables via `aria-disabled` + `title`. `join.spec.ts:62-68` documents that this is not
  assertable offline (resolve rejects in a microtask), so the fix is spec-safe either way.
- The app-wide `role="status"`-wrapping-only-Skeleton class was swept in `016b696c` via the new
  `screen-kit.LoadingRegion`. ⚠️ **Join was NOT swept** and `LoadingRegion` itself still mounts with
  its text, so it is not the right template for the mount-with-content class — `PlayerView.tsx:810-813`
  (persistent, empty, `aria-atomic`) is.

## VERIFIED NON-DEFECTS (stop re-deriving)
- `Player.tsx` vitals bar `position:sticky; top:0` is CORRECT (`AppShell` `<main>` is its own scroller).
- `registerBackHandler` is Android-Back only, never Escape.
- `--z-toast: 600` > `SceneDisplayOverlay` zIndex 120.
- `ds/Button.jsx` / `ds/IconButton.jsx`: `disabled` = hard; truthy `aria-disabled` = soft (focusable,
  `onClick` → `undefined`). **A soft-disabled control is a SILENT no-op on touch** unless the reason
  is rendered visibly — `title` is hover-only.
- `runtime.dispatch` **rethrows** on persist failure; `main.tsx:17` toasts unhandled rejections
  generically, so a bare `await dispatch` is not silent — only report it where the UI also LIES.
- `PlayerView.tsx:1529-1547` DOES explain why the dice are hard-disabled (warning banner). Fine.
- `PlayerView.tsx:1003-1007`, `:1040-1074` hard-coded darks are deliberate projection-surface colours.
- `PlayerView.tsx:1114/1135` hand + ready buttons BOTH carry `aria-pressed` and a state-changing label.
- `Icon name="UserCircle"` resolves.

## STILL OPEN (file:line, ranked, verified @ 016b696c unless marked ‡)
1. **`Player.tsx:1504-1537` death saves is a dead surface.** 6 inert 18px `<span>`s, no `role`, no
   text, no `aria` — state is encoded in fill colour ALONE (1.1.1 + 1.4.1). AT reads the headings
   "successes"/"failures" then nothing. Nothing in `apps/gm-react/src` dispatches `death-save`
   although `packages/core/src/commands/combat.ts` implements it. The badge `:1508` reads
   "Conscious" regardless of 2 failures. ZERO spec references — safe to fix freely.
2. **`Join.tsx:106-110` the loading `role="status"` mounts WITH its text on first paint** ⇒ the
   PRIMARY path ("Checking your invite…") is unreliably announced, and so is its disappearance.
   Fix = persistent empty region, text swapped in. `join.spec.ts:46,66` assert
   `getByText('Checking your invite…')` `toHaveCount(0)` — an emptied persistent region still passes.
3. **`PlayerView.tsx:1595-1621` dice modifier.** `IconButton label="−1"/"+1"` are VALUES not actions;
   `mod` unbounded both ways (hold Enter → +417 overflows the 34px readout `:1604-1613`); the readout
   is not a live region; no typed entry, no reset; the "Modifier" caption `:1596` is a bare `<span>`
   bound to nothing. `CharBuilder.tsx` `NumStepper` (~`:669-724`) is the in-repo pattern. NO spec refs.
4. **`Player.tsx:1023-1028` equipment delete is instant, no confirm, no undo** — while journal delete
   in the SAME file (`:2302-2329`) ships a full Undo toast. **Fix with an Undo TOAST, not a confirm:**
   `equipment.spec.ts:115` clicks "Remove Longsword" then immediately asserts core state is empty.
5. **`PlayerView.tsx:1079-1095` empty-stage contrast — PARCHMENT ONLY.** Text/icon use `T.ter`;
   stage `backgroundColor:'#0d0906'` `:1003` is unconditional. Parchment `--color-text-tertiary`
   is `#837057` (`styles/tokens/colors.css:161`) ⇒ **4.23:1**, fails 1.4.3 for the 14px string
   `:1093`. Default dark `#9d8d75` ⇒ 6.14:1, passes. Use the populated branch's literal
   `rgba(243,231,210,.7)` (`:1074`, ~8:1). Structurally untested — see Coverage gaps.
6. **`/play`, `/join`, `/display` are missing from `responsive.spec.ts:4-19` ROUTES.** That sweep
   waits on `#main-content` + an `<h1>`, neither of which exists outside AppShell, so they need
   their own loop (`/play` has `#player-main`; `/join` has an `<h1>` but no `#main-content`).
   Cheap, durable win — it is the only gate that would have caught #5.
7. **Sub-24px pill (WCAG 2.5.8):** `Player.tsx:2437-2451` journal Shared/Private (`3px 8px`, 11px
   ⇒ ~21px). Template is the already-fixed Equip pill `:1144-1146`.
8. **Duplicate accessible names.** `Player.tsx:2437` journal share toggle is "Shared"/"Private" for
   EVERY entry — needs `aria-label={`Share ${im.title} with the table`}`. Same class as
   `Characters.tsx:1330` Prepared pills.
9. **Zero hover feedback.** No global `button:hover` and inline styles can't express `:hover`.
   `PlayerView.tsx:514` (the ENTIRE /play section nav — 9 rows), `:1113`, `:1133`, `:1506`, `:1560`
   (the six dice), `:1800`, `:2111`; `Player.tsx:451` (inspiration), `:1473`, `:1613`, `:2430`.
   Only `PlayerView.tsx:359` has handlers.
10. **`PlayerView.tsx:1580-1593`** the d20-mode `seg` trio (three `aria-pressed` buttons) has no
    `role="group"`/`radiogroup` tying it to the "d20 mode" caption `:1581`.
11. **`PlayerView.tsx:912-916` `toggleReady` says nothing in EITHER branch** while its sibling
    `toggleHand` `:893-911` toasts in both — including the honest "this device only" when
    `!presenceShared`. A solo player believes the DM sees them ready.
12. `Player.tsx:416-433` the HP amount input sits AFTER both +/- buttons in DOM order, so a keyboard
    user reaches Damage/Heal before the amount they modify. The inspiration toggle's
    `marginLeft:'auto'` `:456` inside a `flexWrap` vitals bar places it unpredictably on phone.
13. ‡ `ViewAsControl.tsx:23` focus-on-open queries `[role="menuitem"]` but items are `menuitemradio`
    — run #9 recorded arrows/separator/menuitemradio as FIXED; re-verify before re-filing.
14. ‡ `SceneDisplayOverlay.tsx:176-191` Second-screen uses hard `disabled` so its
    `unavailableMessage` is unreachable; `:188` ignores `openSecondScreen()`'s null return.
15. ‡ `ProjectionControl.tsx:100,124` soft-disabled "Go live" refusal lives only in `title`;
    workflow pill is `!compact`-only so phone DMs never see Paused/Recap/Wrapping-up.
16. ‡ `SceneDisplay.tsx:66` empty-state `rgba(255,255,255,0.34)` on `#05070c` ≈ 2.9:1 → 1.4.3 FAIL.
17. ‡ `Icon.jsx:320,323,373` `dm-only`, `visibility-players` and `eye` all map to Lucide `Eye`.

## Spec-coupling map (grep before renaming any label)
| Change | Spec that breaks |
| --- | --- |
| `/play` nav `aria-label` | `co-dm.spec.ts:172-209`, `responsive.spec.ts:631` |
| locked-row `aria-disabled` | `co-dm.spec.ts:176-178` |
| "Dismiss scene banner" / `data-testid="scene-banner"` | `scene-cards.spec.ts:319-335` |
| `SectionHead` titles (Now playing / Maps & scenes / Bestiary / Combat assist) | `scene-cards.spec.ts:292/317/386`, `responsive.spec.ts:626-637` |
| `#player-main`, skip-link text, `data-skip-link` | `responsive.spec.ts` (skip-link test now also asserts a PAINTED focus ring) |
| `data-testid="player-stage"` | `player-view.spec.ts:73,98` |
| `.scene-display` class, `/display` heading, "No scene on display" | `scene-cards.spec.ts:357,362,365` |
| `role="dialog"` name "Scene display", Escape, focus-restore | `scene-cards.spec.ts:124-154` |
| **ADDING A CONFIRM to equipment Remove** | `equipment.spec.ts:115` — clicks then asserts state empty |
| `Player.tsx` "Switch character", "Item"/"Qty"/"Weight (lb)", "One more X", "Add one GP"/"Spend one CP", `Equipment (n)`, `Equip`/`Equipped` exact, "No equipment carried yet." | `equipment.spec.ts:48,68-90,102,111,115,125,134-177` |
| `Player.tsx` tab labels Sheet/Resources/Party/Level up/Journal | `responsive.spec.ts:667` |
| `Join`: `role="main"` "Campaign invite", `<h1>` /invited/i, "Go to the app", "Try again", "This join link is incomplete.", "Checking your invite…" (asserted ABSENT at :46,:66), "Open the player app" | `join.spec.ts:21-79` |
| SAFE (zero spec refs): death-save pips, journal Shared/Private, dice modifier ±1, "Modifier", d20-mode seg, ViewAsControl, Second-screen button, "Go live" copy, empty-stage copy | — |

## Coverage gaps
- `a11y-axe-gate.spec.ts:23-38` ROUTES has `/player` but NOT `/play`, `/join`, `/display`.
- `responsive.spec.ts:4-19` ROUTES (200%-text / reduced-motion / forced-colors / safe-area / clipped-
  control loops) also excludes `/play`, `/join`, `/display` — OPEN #5 is structurally untested.
- `tests/a11y/known-violations.json` is `{ "violations": [] }`.

See [[player-surface-audit]] for structural classes, [[char-encounter-cluster]] for the
Characters/CharBuilder half (no-catch, sub-24px pills, duplicate a11y names and zero-hover are
SHARED findings), and [[ds-layer-audit]] for token landmines.
