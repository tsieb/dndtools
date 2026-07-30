---
name: player-char-scene-display-cluster
description: gm-react Player/PlayerView/Join/SceneDisplay/SceneDisplayOverlay/ProjectionControl/ViewAsControl — FIXED-vs-OPEN split re-verified 2026-07-30 at 9aeebdde (run #11)
metadata:
  type: project
---

Cluster: `screens/Player.tsx` (/player, in DM shell), `screens/PlayerView.tsx` (/play, chrome-less),
`screens/Join.tsx`, `screens/SceneDisplay.tsx` (/display), `app/SceneDisplayOverlay.tsx`,
`app/ProjectionControl.tsx`, `app/ViewAsControl.tsx`.
Run #11 re-read Player/PlayerView/Join at `9aeebdde`; SceneDisplay/Projection/ViewAs entries marked ‡
are carried from run #9 and were NOT re-verified.
Line counts at HEAD: Player 2596, PlayerView 2260, Join 205.

## FIXED — do not re-flag
Everything in the previous FIXED list holds (nav opacity + `aria-current` `PlayerView.tsx:521`,
`/play` skip link + `#player-main`, persistent toast live region `:810-813`, SceneBanner pause,
Handouts/Bestiary `aria-controls`, AtlasSection VisibilityChip, SheetSection `<h1>` + sticky padding,
class-resource 24px pips, `Player.tsx` write-error `role=alert` `:479-493`, `IconButton size=sm`=28px,
`auth.openAuthModal()`, stage `background`-shorthand fix `PlayerView.tsx:1003-1007` +
`data-testid="player-stage"`, `Player.tsx` tab bodies `key={charId}` `:514+`, `err`/`hpNote` reset on
tab AND PC switch `:363-370`/`:499-503`, HP typed amount + `role=status` `:475-477`, journal
`aria-pressed` `:2434`).
NEW this pass (`7bdf2908`):
- **`Player.tsx:1112-1126` equipment `stepQty` ×0 ghost is FIXED** — `aria-disabled` at qty ≤ 1 with
  an explaining label. `ds/IconButton.jsx` genuinely swallows the click on truthy `aria-disabled`, so
  this is a real block, not decoration.
- **`Player.tsx:1137-1156` Equip pill now meets 24px** (`padding:'6px 10px'; minHeight:24;
  boxSizing:'border-box'`). Its two siblings were NOT updated — see OPEN #6.

## VERIFIED NON-DEFECTS (stop re-deriving)
- `Player.tsx` vitals bar `position:sticky; top:0` is CORRECT (`AppShell` `<main>` is its own scroller).
- `registerBackHandler` is Android-Back only, never Escape.
- `--z-toast: 600` > `SceneDisplayOverlay` zIndex 120.
- `ds/Button.jsx:25-26` / `ds/IconButton.jsx`: `disabled` = hard; truthy `aria-disabled` = soft
  (focusable, `onClick` → `undefined`). **A soft-disabled control is a SILENT no-op on touch** unless
  the reason is rendered visibly — `title` is hover-only.
- `runtime.dispatch` **rethrows** on persist failure (`runtime/SceneRuntime.ts:482`).
- `PlayerView.tsx:1529-1547` DOES explain why the dice are hard-disabled (warning banner). Fine.
- `PlayerView.tsx:1003-1007`, `:1040-1074` hard-coded darks are deliberate projection-surface colours.
- `Icon name="UserCircle"` resolves.

## STILL OPEN (file:line, ranked, verified @ 9aeebdde unless marked ‡)
1. **No `catch` anywhere.** `Player.tsx:252-256` `dispatch()`; `PlayerView.tsx:470-478` `rollDice()`
   local branch. A rethrown persist rejects the promise, nothing renders.
2. **`Player.tsx:1504-1536` death saves is still a dead surface.** 6 inert 18px `<span>`s with no
   `role`/`aria`/text — AT reads the headings "successes"/"failures" and then nothing; the count is
   invisible. Nothing in `apps/gm-react/src` dispatches `death-save` though
   `packages/core/src/commands/combat.ts` implements it. The badge `:1507-1509` reads "Conscious"
   regardless of failures.
3. **`Player.tsx:1023-1028` equipment delete is instant, no confirm, no undo** — while journal delete
   in the SAME file (`:2302-2329`) ships a full Undo toast. **Fix with an Undo TOAST, not a confirm:**
   `equipment.spec.ts:115` clicks "Remove Longsword" and immediately asserts core state is empty.
4. **Zero hover feedback.** VERIFIED: `grep -rn ":hover" --include=*.css` over `apps/gm-react/src`
   returns **nothing**, and inline styles can't express `:hover`. In this cluster:
   `PlayerView.tsx:514` (the ENTIRE /play section nav — 9 rows, `.player-view-nav-row` has only
   layout rules in `styles/index.css:159/170/218`), `:1113`, `:1133`, `:1506` (d20-mode seg),
   `:1560` (the six dice), `:1800`, `:2111`; `Player.tsx:451` (inspiration), `:1137` (Equip),
   `:1473`, `:1613`, `:2430` (journal Shared/Private). Only `PlayerView.tsx:359` has handlers.
5. **`PlayerView.tsx:1595-1621` dice modifier.** `IconButton label="−1"/"+1"` are VALUES not actions;
   `mod` unbounded both ways; `{sgn(mod)}` `:1604-1613` is not a live region; no typed entry, no
   reset; the "Modifier" caption `:1596` is a bare `<span>` tied to nothing. `CharBuilder`'s
   `NumStepper` (`CharBuilder.tsx:669-724`) is the in-repo pattern to copy.
6. **Sub-24px pills (WCAG 2.5.8)** — `Player.tsx:2430-2451` journal Shared/Private (`3px 8px`, 11px
   ⇒ ~21px) and `Characters.tsx:1330-1349` Prepared. The Equip pill's fix is the template.
7. **`PlayerView.tsx:913-917` `toggleReady` is silent when `!presenceShared`** while the sibling
   `toggleHand` `:893-912` toasts in BOTH branches.
8. **`Player.tsx:2430-2451` journal share toggle's accessible name is "Shared"/"Private"** — identical
   for every entry. Needs `aria-label={\`Share ${im.title} with the table\`}`.
9. **`Join.tsx:192-196` "Try again" unmounts itself** (phase → `loading`) ⇒ focus falls to `<body>`.
   `join.spec.ts:62-68` clicks it but asserts nothing about focus — the fix is spec-safe.
10. **`Join.tsx:106-110`** the loading `role="status" aria-live="polite"` is mounted WITH its text on
    first paint ⇒ unreliably announced on the PRIMARY path. (`PlayerView.tsx:810-813`'s comment
    already documents this rule for this repo. The `role="alert"` at `:120` is fine.)
11. **`PlayerView.tsx:1079-1095` empty-stage contrast.** `backgroundColor:'#0d0906'` `:1003` is
    UNCONDITIONAL but the empty-state text/icon use `color: T.ter`. In parchment that's `#837057`
    (`styles/tokens/colors.css:161`) on `#0d0906` ≈ **4.2:1** — fails 1.4.3 for the 14px text
    `:1093`. In the default dark theme (`#9d8d75`) it's ~6.3:1 and passes. Use the populated
    branch's literal (`rgba(243,231,210,.7)` `:1074`, ~8:1).
12. **`PlayerView.tsx:1580-1593`** the d20-mode `seg` trio has no `role="group"`/`radiogroup` tying it
    to the "d20 mode" caption `:1581`.
13. ‡ `ViewAsControl.tsx:23` focus-on-open queries `[role="menuitem"]` but items are `menuitemradio`
    — run #9 recorded arrows/separator/menuitemradio as FIXED; re-verify before re-filing.
14. ‡ `SceneDisplayOverlay.tsx:176-191` Second-screen uses hard `disabled` so its
    `unavailableMessage` is unreachable; `:188` ignores `openSecondScreen()`'s null return.
15. ‡ `ProjectionControl.tsx:100,124` soft-disabled "Go live" refusal lives only in `title`;
    workflow pill is `!compact`-only so phone DMs never see Paused/Recap/Wrapping-up.
16. ‡ `SceneDisplay.tsx:66` empty-state `rgba(255,255,255,0.34)` on `#05070c` ≈ 2.9:1 → 1.4.3 FAIL.
17. ‡ `Icon.jsx:320,323,373` `dm-only`, `visibility-players` and `eye` all map to Lucide `Eye`.
18. Smaller: `Player.tsx`'s HP amount input `:416-433` sits AFTER both +/- buttons in DOM order;
    the inspiration toggle's `marginLeft:'auto'` `:456` inside a `flexWrap` vitals bar places it
    unpredictably on phone.

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
| **ADDING A CONFIRM to equipment Remove** | `equipment.spec.ts:115` — clicks then asserts state empty |
| `Player.tsx` "Switch character", "Item"/"Qty"/"Weight (lb)", "One more X", "Add one GP"/"Spend one CP", `Equipment (n)`, `Equip`/`Equipped` exact, "No equipment carried yet." | `equipment.spec.ts:48,68-90,102,111,115,125,134-177` |
| **"One fewer X"** — now conditional (`Cannot go below one X …` at qty ≤ 1) | check `equipment.spec.ts` before touching again |
| `Player.tsx` tab labels Sheet/Resources/Party/Level up/Journal | `responsive.spec.ts:660-673` |
| `Join` `role="main"` "Campaign invite", `<h1>` /invited/i, "Go to the app", "Try again", "This join link is incomplete.", "Checking your invite…" | `join.spec.ts:22,30,62,73,79` — all six pinned |
| SAFE (zero spec refs): ViewAsControl, death-save pips, journal Shared/Private, dice modifier ±1, d20-mode seg, Second-screen button, "Go live" copy, empty-stage copy | — |

## Coverage gaps
- `a11y-axe-gate.spec.ts:23-38` ROUTES has `/player` but NOT `/play`, `/join`, `/display`.
- `responsive.spec.ts:3-19` ROUTES (200%-text / reduced-motion / forced-colors / safe-area loops)
  also excludes `/play`, `/join`, `/display` — so OPEN #11's parchment contrast is structurally
  untested.
- `tests/a11y/known-violations.json` is `{ "violations": [] }`.

See [[player-surface-audit]] for structural classes, [[char-encounter-cluster]] for the
Characters/CharBuilder half (no-catch, sub-24px pills and zero-hover are SHARED findings), and
[[ds-layer-audit]] for token landmines.
