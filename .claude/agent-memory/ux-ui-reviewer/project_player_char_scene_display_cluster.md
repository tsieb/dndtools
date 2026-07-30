---
name: player-char-scene-display-cluster
description: gm-react Player/PlayerView/Join/SceneDisplay/SceneDisplayOverlay/ProjectionControl/ViewAsControl — FIXED-vs-OPEN split re-verified 2026-07-30 at 8fa95d31 (run #10)
metadata:
  type: project
---

Cluster: `screens/Player.tsx` (/player, in DM shell), `screens/PlayerView.tsx` (/play, chrome-less),
`screens/Join.tsx`, `screens/SceneDisplay.tsx` (/display), `app/SceneDisplayOverlay.tsx`,
`app/ProjectionControl.tsx`, `app/ViewAsControl.tsx`.
Run #10 re-read Player/PlayerView/Join in full at `8fa95d31`; the SceneDisplay/Projection/ViewAs
entries below are carried from run #9 (`c93c5206`) and were NOT re-verified this pass.

## FIXED — do not re-flag
Everything in the previous FIXED list still holds (nav opacity, `/play` skip link + `#player-main`,
persistent toast live region, SceneBanner pause, Handouts aria-controls, AtlasSection VisibilityChip,
SheetSection sticky padding, class-resource 24px pips, `Player.tsx` write-error `role=alert`,
`ElevatedLocked` dead, `IconButton size=sm`=28px, `auth.openAuthModal()`, stage `background`-shorthand
fix at `PlayerView.tsx:1003-1005` + `data-testid="player-stage"`, `Player.tsx` tab bodies
`key={charId}` at `:514+`).
NEW/confirmed this pass:
- **`Player.tsx` `err` + `hpNote` now reset on BOTH tab switch (`:499-503`) and PC switch
  (`:363-370`).** The stale-accusation banner is closed.
- **HP stepper is a typed amount + announced result** — `hpAmount` string draft (`:416-433`),
  `hpStep()` (`:293-296`), and a permanently-mounted visually-hidden `role="status"` (`:475-477`)
  filled by `hpNote`. This is the in-repo pattern for success announcement.
- **Journal share toggle has `aria-pressed`** (`:2422`).
- **`PlayerView` SheetSection has a real `<h1>`** (`:1329`).
- **Bestiary accordion has `aria-controls` + panel `id`** (`:2113-2114`).
- **`Join.tsx` is largely repaired**: `<h1>` `:103`, `role="alert"` on the invalid state `:120`,
  a working "Try again" `:192-196` driven by `retryNonce`. And **`join.spec.ts` now exists** (6 tests).

## VERIFIED NON-DEFECTS (stop re-deriving)
- `Player.tsx` vitals bar `position:sticky; top:0` is CORRECT (`AppShell.tsx` `<main>` is its own
  scroller, TopBar is a sibling above it).
- `registerBackHandler` is **Android-Back only**, never Escape.
- `--z-toast: 600` > `SceneDisplayOverlay` zIndex 120.
- `ds/Button.jsx:25-26`: `disabled` = native/hard; truthy `aria-disabled` = soft (stays focusable,
  `onClick` replaced with `undefined`). **Consequence: a soft-disabled button is a SILENT no-op on
  touch** unless the reason is rendered visibly — `title` is hover-only.
- `runtime.dispatch` **rethrows** on persist failure (`runtime/SceneRuntime.ts:482`). Every
  `await runtime.dispatch` without a `catch` is a silent failure.
- `PlayerView.tsx:1529-1546` DOES explain why the dice are hard-disabled (a warning banner). That
  disable is acceptable; don't re-file it.
- `Icon name="UserCircle"` resolves (`ds/Icon.jsx:506`).
- The `/play` stage's hard-coded darks (`PlayerView.tsx:1003-1005`, `:1063`) are deliberate
  projection-surface colours, forced-colors-guarded.

## STILL OPEN (file:line, ranked, verified @ 8fa95d31 unless marked ‡ = carried from run #9)
1. **No `catch` anywhere in the cluster.** `Player.tsx:252-256` `dispatch()`, `PlayerView.tsx:470`
   `rollDice`. A persist failure rejects the promise, nothing renders, `err` was just cleared.
2. **`Player.tsx:1492-1524` Death saves is still a dead surface.** 6 inert 18px `<span>`s, no text,
   no `aria`, no way to record a save; nothing in `apps/gm-react/src` dispatches `kind:'death-save'`
   though `packages/core/src/commands/combat.ts` implements it. The badge `:1495-1497` reads
   "Conscious" regardless of failures, and the column headings `:1503-1505` render the raw state keys
   **"successes" / "failures"** as user-visible labels.
3. **`Player.tsx:1145-1151` equipment delete is instant, no confirm, no undo** — while journal delete
   in the SAME file (`:2290-2317`) ships a full Undo toast. Copy that.
4. **`Player.tsx:1031-1041` `stepQty` clamps at `Math.max(0, …)`** → "One fewer X" at qty 1 leaves a
   `×0` ghost row and the button never stops accepting presses.
5. **Sub-24px pill toggles (WCAG 2.5.8)** — `Player.tsx:1129-1144` Equip (`padding:'3px 9px'`,
   `font:11px` ⇒ ~21px) and `:2418-2439` Shared/Private (`3px 8px` ⇒ ~21px). Same shape lives in
   `Characters.tsx:1325-1344`.
6. ‡ **`ViewAsControl.tsx:23`** focus-on-open queries `[role="menuitem"]` but every item is
   `menuitemradio` — *run #9 recorded arrows/separator/menuitemradio as FIXED; re-verify before
   re-filing.*
7. ‡ **`SceneDisplayOverlay.tsx:176-191`** Second-screen uses hard `disabled` so its
   `unavailableMessage` is unreachable; `:188` ignores `openSecondScreen()`'s null return.
8. ‡ **`ProjectionControl.tsx:100,124`** soft-disabled "Go live" refusal lives only in `title`;
   workflow pill is `!compact`-only so phone DMs never see Paused/Recap/Wrapping-up.
9. ‡ **`SceneDisplay.tsx:66`** empty-state `rgba(255,255,255,0.34)` on `#05070c` ≈ 2.9:1 → 1.4.3 FAIL.
10. **`PlayerView.tsx:1595-1621`** dice modifier: `IconButton label="−1"/"+1"` are values not actions,
    `mod` unbounded, `{sgn(mod)}` (`:1604-1613`) is not a live region, no direct entry, no reset.
11. **`PlayerView.tsx:913-917` `toggleReady` is silent when `!presenceShared`** while the sibling
    `toggleHand` (`:895-911`) always toasts, in both branches.
12. **`PlayerView.tsx:1580-1593`** the d20-mode `seg` trio has no `role="group"`/`radiogroup` tying it
    to the "d20 mode" caption `:1581`.
13. **`Join.tsx:192-196` "Try again" unmounts itself** (phase → `loading`) → focus falls to `<body>`.
    `join.spec.ts:62-68` clicks it but asserts nothing about focus, so the fix is spec-safe.
14. **`Join.tsx:106-110`** the loading `role="status" aria-live="polite"` region is mounted WITH its
    text on first paint — polite regions mounted with content are unreliably announced. (The
    `role="alert"` at `:120` is fine; alert announces on insertion.)
15. **`Player.tsx:2418-2439`** the journal share toggle's accessible name is just "Shared"/"Private" —
    identical for every entry. Needs `aria-label={\`Share ${im.title} with the table\`}`.
16. ‡ **`Icon.jsx:320,323,373`** `dm-only`, `visibility-players` and `eye` all map to Lucide `Eye`.
17. Smaller: `Player.tsx`'s HP amount input `:416` sits AFTER both +/- buttons in DOM order, so you
    tab past the actions to reach the amount; the inspiration toggle's `marginLeft:'auto'` inside a
    `flexWrap` vitals bar places it unpredictably on phone.

## Spec-coupling map (grep before renaming any label)
| Change | Spec that breaks |
| --- | --- |
| `/play` nav `aria-label` | `co-dm.spec.ts:172-209`, `responsive.spec.ts:631` |
| locked-row `aria-disabled` | `co-dm.spec.ts:176-178` |
| "Dismiss scene banner" / `data-testid="scene-banner"` | `scene-cards.spec.ts:319-335` |
| `SectionHead` titles (Now playing / Maps & scenes / Bestiary / Combat assist) | `scene-cards.spec.ts:292/317/386`, `responsive.spec.ts:626-637` |
| `#player-main`, skip-link text, `data-skip-link` | `responsive.spec.ts:974-995`, `:55-67` |
| `data-testid="player-stage"` | `player-view.spec.ts:73,98` |
| `.scene-display` class, `/display` heading, "No scene on display" | `scene-cards.spec.ts:357,362,365` |
| `role="dialog"` name "Scene display", Escape, focus-restore | `scene-cards.spec.ts:124-154` |
| `Player.tsx` "Switch character", "Item"/"Qty"/"Weight (lb)", "One more X"/"One fewer X", "Add one GP"/"Spend one CP", `Equipment (n)`, `Equip` exact | `equipment.spec.ts:48,68-90,102,134-150,177` |
| `Player.tsx` tab labels Sheet/Resources/Party/Level up/Journal | `responsive.spec.ts:660-673` |
| `Join` `role="main"` name "Campaign invite", `<h1>` matching `/invited/i`, "Go to the app", "Try again", "This join link is incomplete.", "Checking your invite…" | `join.spec.ts:22,30,62,73,79` — **all six are now pinned** |
| SAFE (zero spec references): ViewAsControl entirely, death-save pips, journal Shared/Private toggle, dice modifier ±1, Second-screen button, "Go live" refusal copy | — |

## Coverage gaps
- `a11y-axe-gate.spec.ts:23-38` ROUTES has `/player` but NOT `/play`, `/join`, `/display`.
- `responsive.spec.ts:3-19` ROUTES (200%-text / reduced-motion / forced-colors / safe-area loops)
  also excludes `/play`, `/join`, `/display`.
- `tests/a11y/known-violations.json` is `{ "violations": [] }`.

See [[player-surface-audit]] for structural classes, [[char-encounter-cluster]] for the
Characters/CharBuilder half (the sub-24px pill and no-catch findings are shared), and
[[ds-layer-audit]] for token landmines.
