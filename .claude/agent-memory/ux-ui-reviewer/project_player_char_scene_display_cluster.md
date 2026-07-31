---
name: player-char-scene-display-cluster
description: gm-react Player/PlayerView/Join/SceneDisplay/SceneDisplayOverlay/ProjectionControl/ViewAsControl — FIXED-vs-OPEN split re-verified 2026-07-31 at 98e0211f (run #22)
metadata:
  type: project
---

Cluster: `screens/Player.tsx` (/player, in DM shell), `screens/PlayerView.tsx` (/play, chrome-less),
`screens/Join.tsx`, `screens/SceneDisplay.tsx` (/display), `app/SceneDisplayOverlay.tsx`,
`app/ProjectionControl.tsx`, `app/ViewAsControl.tsx`.
Run #22 re-read Player/PlayerView/Join at `98e0211f`. Entries marked ‡ carried from run #9, NOT
re-verified. Line counts at HEAD: **Player 2667, PlayerView 2274, Join 216 (unchanged)**.
`98e0211f` touched Player (+74) and PlayerView (+16).

## FIXED at 98e0211f (run #20's whole top-3 + two copy items) — do not re-chase
- **run #20 OPEN #1 — marching order move-UP-only / row-1 gutter collapse.** `Player.tsx:1688-1693`
  adds `moveDown`; `:1896-1915` now RENDERS both chevrons on every row and `disabled`s them at the
  ends. ⚠️ The `disabled` is HARD → new focus-loss defect, see new OPEN #1.
- **run #20 OPEN #2 — "Clear" destroys the order with no undo.** Now `clearOrder()` `:1697-1709`
  with an Undo toast, relabelled **"Clear order"** `:1846-1847`. ⚠️ Still unmounts itself — OPEN #1.
- **run #20 OPEN #16 (half) — raw enums.** `Player.tsx:2192` now "XP/Milestone advancement";
  `PlayerView.tsx:146-153` `kindLabel()` applied at `:2146` and `:2257`. ⚠️ FIVE sites survive —
  see new OPEN #6.
- **run #20 OPEN #17 — "1 members"** → `Player.tsx:1769-1771` pluralises.

## FIXED earlier — do not re-flag
- **run #15 OPEN #1 — death-save pips** `Player.tsx:1524-1545` now `role="img"`
  `aria-label="{n} of 3 {successes|failures}"` + a visible `n/3` mono readout. ⚠️ The pips are still
  READ-ONLY (nothing dispatches `death-save`) and the badge still lies — see OPEN #1 below.
- **run #15 OPEN #5 — /play empty-stage contrast** `PlayerView.tsx:1084-1094` now uses the literal
  `rgba(243,231,210,.7)` for both text and icon (was `T.ter`, 4.23:1 in parchment).
- **run #15 OPEN #7 + #8 — journal Shared/Private pill** `Player.tsx:2445-2462`: `6px 10px` +
  `minHeight:24` + `boxSizing` AND `aria-label={`${shared?'Shared':'Private'} — ${im.title}`}`.
- `Join.tsx:197-207` "Try again" no longer unmounts itself (soft-disable via `aria-disabled`).
- Everything in the older FIXED list holds (nav opacity + `aria-current` `PlayerView.tsx:519`,
  `/play` skip link + `#player-main` `:619-645`, persistent toast live region `:811-813`, SceneBanner
  pause, Handouts/Bestiary `aria-controls`, AtlasSection VisibilityChip, SheetSection `<h1>` + sticky
  padding, class-resource 24px pips, `Player.tsx` write-error `role=alert` `:479-493`, `IconButton
  size=sm`=28px, `auth.openAuthModal()`, stage `background`-shorthand + `data-testid="player-stage"`,
  tab bodies `key={charId}`, `err`/`hpNote` reset on tab AND PC switch, HP typed amount + persistent
  `role=status` `:475-477`, journal `aria-pressed`, equipment `stepQty` ×0 soft-disable, Equip pill 24px).

## VERIFIED NON-DEFECTS (stop re-deriving)
- `Player.tsx` vitals bar `position:sticky; top:0` is CORRECT (`AppShell` `<main>` is its own scroller).
- `registerBackHandler` is Android-Back only, never Escape.
- `--z-toast: 600` > `SceneDisplayOverlay` zIndex 120.
- `ds/Button.jsx`/`ds/IconButton.jsx`: `disabled` = hard; truthy `aria-disabled` = soft (focusable,
  `onClick` → `undefined`). A soft-disabled control is a SILENT no-op on touch unless the reason is
  rendered visibly — `title` is hover-only.
- `runtime.dispatch` **rethrows** on persist failure; `main.tsx:17` toasts unhandled rejections, so a
  bare `await dispatch` is not silent — only report it where the UI also LIES.
- `PlayerView.tsx:1565` dice hard-`disabled` IS explained by the warning banner above. Fine.
- `PlayerView.tsx:1003-1007`, `:1040-1074` hard-coded darks are deliberate projection colours.
- `PlayerView.tsx:1113/1133` hand + ready buttons BOTH carry `aria-pressed` + a state-changing label.
- `Icon name="UserCircle"` resolves.
- **The `/play` rail/bottom-bar does NOT lose its accessible names** — `navRow` puts `aria-label` on
  the BUTTON (`PlayerView.tsx:516`), so `.player-view-nav-row > span {display:none}` at ≤1024px is
  harmless. Measured run #20; stop re-deriving this one.
- `T.accFg` on a `T.ok` fill (`Player.tsx:2182-2183`) PASSES — dark 8.23:1, parchment 5.38:1.
- `T.warn` as TEXT on `T.surf` (`Player.tsx:2200`) PASSES — dark 8.65:1, parchment 4.76:1.

## NEW at run #22 (all verified @ 98e0211f)
1. ⭐ **The Marching order panel drops keyboard focus to `<body>` on EVERY successful action** —
   three separate mechanisms in one panel. (a) `Player.tsx:1845-1849` "Clear order" is guarded on
   `party.marchingOrder.length > 0`, so a successful clear unmounts the button you just pressed.
   (b) `:1855-1864` "Set from roster" lives inside the `length === 0` branch — same, in reverse.
   (c) `:1903`/`:1911` the new chevrons use HARD `disabled`, and `IconButton.jsx:50` passes it to
   the native attr, so a row reaching rank 1 or last disables the button under its own focus.
   This is the exact class the project already fixed at `Join.tsx:197-207` (soft-disable via
   `aria-disabled`). Fix: keep Clear/Set mounted + `aria-disabled`; on a boundary move, focus the
   sibling chevron. ZERO e2e refs to any marching-order label.
2. **Reordering is silent and the rank is not in the button name.** `moveUp`/`moveDown`
   `:1679-1693` announce nothing; the rank `{i + 1}` `:1889` is a bare `<span>` outside the
   `aria-label`. A SR user hears "Move Cara up" and then nothing at all — no confirmation, no new
   position. (Concrete instance of OPEN #3 below; Player still has ONLY the HP `role="status"`.)
3. **`PlayerView` never surfaces the roll RESULT.** `rollOne` `:1506-1517` fires and forgets;
   `rollDice` `:471-495` toasts only crits and errors. On phone `:1563-1568` stacks Roll above
   "Table roll log" in one column, so the new entry is below the fold ⇒ tapping d20 gives zero
   visible AND zero announced feedback. Fix: toast/announce the total on every accepted roll.
4. **`PlayerView.tsx:493` "Natural 1 — critical miss" is toasted with `status:'error'`**, which at
   `:846-848` gives it `role="alert" aria-live="assertive"` + the red error skin, and EXCLUDES it
   from the persistent polite region `:823`. A routine bad roll interrupts as a system error. Use a
   neutral/warning status.
5. **`PlayerView.tsx:823-824` drops byte-identical repeats.** The region renders
   `[...toasts].reverse().find(t => t.status !== 'error')?.msg ?? ''` — two nat-20s in a row, or
   the same lock refusal twice, change no text ⇒ announced once. `Characters.tsx:418` just got the
   blank-then-set fix for exactly this; here the fix is `key={toast.id}` on an inner node.
   (Toast lifetimes are uniform 2800ms FIFO `:187`, so no stale-revert bug — checked.)
6. **Five raw-enum Badges survive the `98e0211f` copy pass**: `Player.tsx:2245` `{meta.kind}` renders
   "class"/"hp"/"choice" beside each level-up step label; `Player.tsx:2483` `{im.kind}`;
   `PlayerView.tsx:1849` `{n.kind}`; `PlayerView.tsx:1924` `{e.kind}`. (`Characters.tsx:1067`
   "(xp)" is the Characters-cluster twin — filed there.) `kindLabel` `PlayerView.tsx:146` is the
   in-repo pattern to extend.
7. **`Player.tsx:2110-2122` hides the XP eligibility reason entirely when `nextXp === null`** — the
   whole *Experience* Panel that carries `xpEligible.message` is conditional, while the hard-
   `disabled` "Level up (XP)" button `:2124-2131` always renders. Sharpens OPEN #5: at max level /
   missing XP table the button is unexplained AND out of the tab order.
8. **`Player.tsx:2458-2470` journal inline editor.** Save is hard-`disabled={!editTitle.trim()}`
   with no `aria-invalid`/`aria-describedby` on the Input `:2447-2451` and no visible reason;
   Cancel `:2459` discards the draft unconfirmed; BOTH unmount themselves on activation
   (`setEditId(null)`) ⇒ focus to `<body>`; and `startEdit` `:2349-2353` never moves focus into the
   title Input, so the editor opens silently for a SR user.

## STILL OPEN from earlier runs (file:line, ranked; line numbers REBASED to 98e0211f)
1. ~~move-up-only + row-1 gutter collapse~~ **CLOSED at 98e0211f.** In-repo precedent for the pair:
   `SceneCardsPanel.tsx:574/584`, `Atlas.tsx:835/845`; `scene-cards.spec.ts:428-435` asserts the
   first item's Move-up is RENDERED and `toBeDisabled()`.
2. ~~"Clear" with no undo~~ **CLOSED at 98e0211f** (Undo toast + "Clear order" relabel).
3. **`Player.tsx` announces ONLY HP — ~12 other durable writes are silent** (still the top carryover;
   `moveUp`/`moveDown`/`clearOrder` joined the silent set). `role="status"`
   `:475-477` is fed exclusively by `setHpNote` (`:307`, the sole setter besides three resets).
   Silent: equipment add/remove/equip/qty, journal add/edit/delete/share, party stash add/remove,
   marching order set/clear/move, inspiration toggle, Rest, every level-up step. `Characters.tsx`
   just got the fix at `33651613` — port its `dispatch(cmd, okNote?)` shape onto Player's `Dispatch`
   wrapper and reuse the existing single region (rename `hpNote` → `note`). `equipment.spec.ts`
   asserts core state, not announcements; the `getByRole('status')` count assertion lives only in
   `character-sheet.spec.ts` and is scoped to `#main-content` on /characters. SAFE.
4. **`Player.tsx:2151-2153` level-up "Cancel" discards the whole draft, unconfirmed, un-undoable**
   (NEW). Ghost `sm`, accessible name just "Cancel", sitting in the header immediately right of
   "Level 3 → 4 · 2/3 choices made". `Characters.tsx:1115` is the identical twin. ZERO e2e refs
   (`responsive.spec.ts:667` only clicks the "Level up" TAB).
5. **`Player.tsx:2077-2100` the two "Level up" buttons are hard-`disabled` and their reasons are
   detached** (NEW). `xpEligible.message` renders at `:2070-2074` inside the *Experience* Panel
   ABOVE the buttons; `milestoneEligible.message` at `:2096-2100` BELOW them. Neither uses
   `aria-describedby`, and a hard-`disabled` button is out of the tab order — so a screen-reader
   user browsing by control finds no "Level up" affordance at all and never meets either
   explanation. `:2229-2239` in the same component does it right (the label carries the reason).
6. **`Player.tsx:1504-1512` the death-save Badge still lies, and the pips are a dead surface.** The
   badge reads "Conscious" with 2 failures and "Conscious" with 3 (dead). Nothing in
   `apps/gm-react/src` dispatches `death-save` although `packages/core/src/commands/combat.ts`
   implements it, so there is no way to record one from the UI. ZERO spec refs — safe to fix freely.
7. **`Join.tsx:106-110` the loading `role="status"` mounts WITH its text on first paint** ⇒ the
   PRIMARY path ("Checking your invite…") is unreliably announced, and so is its disappearance.
   Fix = persistent empty region, text swapped in (`PlayerView.tsx:811-813` is the template, NOT
   `screen-kit.LoadingRegion`, which also mounts with its text). `join.spec.ts:46,66` assert
   `getByText('Checking your invite…')` `toHaveCount(0)` — an emptied persistent region still passes.
8. **`PlayerView.tsx:1595-1621` dice modifier.** `IconButton label="−1"/"+1"` are VALUES not actions;
   `mod` unbounded both ways (hold Enter → +417 overflows the 34px readout); the readout is not a
   live region; no typed entry, no reset; the "Modifier" caption is a bare `<span>` bound to nothing.
   `CharBuilder.tsx` `NumStepper` (~`:669-724`) is the in-repo pattern. NO spec refs.
9. **`Player.tsx:1023-1028` equipment delete is instant, no confirm, no undo** — while journal delete
   in the SAME file (`:2302-2329`) and party-stash delete (`:1705-1730`) BOTH ship Undo toasts.
   **Fix with an Undo TOAST, not a confirm:** `equipment.spec.ts:115` clicks "Remove Longsword" then
   immediately asserts core state is empty.
10. **`Player.tsx:2214-2221` per-step "Choose"/"Change" duplicate names + stale input** (NEW). Every
    level-up step renders an identically-named button; `saveChoice` `:2014-2024` never clears
    `inputs[field]` on success, so the field keeps the abandoned text and
    `placeholder={done ? String(saved) : …}` `:2209` can never render. Suffix with `meta.label`.
11. **`/play`, `/join`, `/display` are missing from `responsive.spec.ts:4-19` ROUTES** and from
    `a11y-axe-gate.spec.ts:23-38`. That sweep waits on `#main-content` + an `<h1>`, neither of which
    exists outside AppShell, so they need their own loop (`/play` has `#player-main`; `/join` has an
    `<h1>` but no `#main-content`). Cheap, durable win — it is the only gate that would have caught
    the empty-stage contrast bug.
12. **Zero hover feedback.** No global `button:hover` and inline styles can't express `:hover`.
    `PlayerView.tsx:512` (the ENTIRE /play section nav — 9 rows), `:1113`, `:1133`, the six dice,
    `:1800`, `:2111`; `Player.tsx:451` (inspiration), `:1473`, `:1613`, `:2438`.
    Only `PlayerView.tsx:359` has handlers.
13. **`PlayerView.tsx:1580-1593`** the d20-mode `seg` trio (three `aria-pressed` buttons) has no
    `role="group"`/`radiogroup` tying it to the "d20 mode" caption `:1581`.
14. **`PlayerView.tsx:912-916` `toggleReady` says nothing in EITHER branch** while its sibling
    `toggleHand` `:893-911` toasts in both — including the honest "this device only" when
    `!presenceShared`. A solo player believes the DM sees them ready.
15. **`PlayerView.tsx:2198-2258` combat assist never announces a turn change** (NEW). The active
    combatant is signalled by an accent border + an "Active" Badge moving down a plain div stack —
    no `role="list"`, no `<ol>`, no live region. Following the order is the entire point of the
    section. The empty-node pattern at `:811` is already in this file.
16. **Raw core enums leak into the UI** (NEW): `Player.tsx:2148` renders `{draft.mode} advancement`
    ⇒ "xp advancement"/"milestone advancement"; `PlayerView.tsx:2245` `<Badge>{c.kind}</Badge>` ⇒
    lowercase "character"/"npc"/"monster".
17. **`Player.tsx:1741` "N members" is unpluralised** (NEW) — a solo table reads "1 members".
18. **`Player.tsx:1893-1896` the shared-stash DM-only marker is a raw lowercase `dm-only` Badge**
    (NEW), not the DS `VisibilityChip` used for the same concept everywhere else, and it breaks the
    project's "DM only" copy glossary. `:1892` `{s.detail}` is a bare flex item with no
    `minWidth:0`, so a long detail squeezes `{s.name}` `:1891` on the compact (phone) grid.
19. **`styles/index.css:201-205` hides `.player-view-elevated-label` at ≤640px** (NEW), so the three
    elevated/Co-DM tools lose their separator in the 9-up wrapping bottom bar. Measured at Pixel 5
    (393px): nav content box 377px, items `flex:0 0 44px` with `gap:2` ⇒ 8 per row, so the split is
    8+1 and one lone icon sits centered on row 2 (`justify-content:space-around`) with nothing
    marking it as the elevated group. `.player-view-shell` correctly reserves 107px for 2 rows.
20. `Player.tsx:416-433` the HP amount input sits AFTER both +/- buttons in DOM order, so a keyboard
    user reaches Damage/Heal before the amount they modify. The inspiration toggle's
    `marginLeft:'auto'` `:456` inside a `flexWrap` vitals bar places it unpredictably on phone.
21. ‡ `ViewAsControl.tsx:23` focus-on-open queries `[role="menuitem"]` but items are `menuitemradio`
    — run #9 recorded arrows/separator/menuitemradio as FIXED; re-verify before re-filing.
22. ‡ `SceneDisplayOverlay.tsx:176-191` Second-screen uses hard `disabled` so its
    `unavailableMessage` is unreachable; `:188` ignores `openSecondScreen()`'s null return.
23. ‡ `ProjectionControl.tsx:100,124` soft-disabled "Go live" refusal lives only in `title`;
    workflow pill is `!compact`-only so phone DMs never see Paused/Recap/Wrapping-up.
24. ‡ `SceneDisplay.tsx:66` empty-state `rgba(255,255,255,0.34)` on `#05070c` ≈ 2.9:1 → 1.4.3 FAIL.
25. ‡ `Icon.jsx:320,323,373` `visibility-players` and `eye` both map to Lucide `Eye`
    (`dm-only` → `VenetianMask` is FIXED).

## Spec-coupling map (grep before renaming any label)
| Change | Spec that breaks |
| --- | --- |
| `/play` nav `aria-label` | `co-dm.spec.ts:172-209`, `responsive.spec.ts:631` |
| locked-row `aria-disabled` | `co-dm.spec.ts:176-178` |
| "Dismiss scene banner" / `data-testid="scene-banner"` | `scene-cards.spec.ts:319-335` |
| `SectionHead` titles (Now playing / Maps & scenes / Bestiary / Combat assist) | `scene-cards.spec.ts:292/317/386`, `responsive.spec.ts:626-637` |
| `#player-main`, skip-link text, `data-skip-link` | `responsive.spec.ts` (also asserts a PAINTED focus ring) |
| `data-testid="player-stage"` | `player-view.spec.ts:73,98` |
| `.scene-display` class, `/display` heading, "No scene on display" | `scene-cards.spec.ts:357,362,365` |
| `role="dialog"` name "Scene display", Escape, focus-restore | `scene-cards.spec.ts:124-154` |
| **ADDING A CONFIRM to equipment Remove** | `equipment.spec.ts:115` — clicks then asserts state empty |
| `Player.tsx` "Switch character", "Item"/"Qty"/"Weight (lb)", "One more X", "Add one GP"/"Spend one CP", `Equipment (n)`, `Equip`/`Equipped` exact, "No equipment carried yet." | `equipment.spec.ts:48,68-90,102,111,115,125,134-177` |
| `Player.tsx` tab labels Sheet/Resources/Party/Level up/Journal | `responsive.spec.ts:667` |
| `Join`: `role="main"` "Campaign invite", `<h1>` /invited/i, "Go to the app", "Try again", "This join link is incomplete.", "Checking your invite…" (asserted ABSENT at :46,:66), "Open the player app" | `join.spec.ts:21-79` |
| SAFE (zero spec refs): marching-order labels ("Clear", "Set from roster", "Move X up"), "N members", "Add to stash", level-up Cancel/Choose/Change/Finish, death-save pips, journal Shared/Private, dice modifier ±1, "Modifier", d20-mode seg, ViewAsControl, Second-screen button, "Go live" copy, empty-stage copy | — |

## Coverage gaps
- `a11y-axe-gate.spec.ts:23-38` ROUTES has `/player` but NOT `/play`, `/join`, `/display`.
- `responsive.spec.ts:4-19` ROUTES (200%-text / reduced-motion / forced-colors / safe-area /
  clipped-control loops) also excludes `/play`, `/join`, `/display`.
- `tests/a11y/known-violations.json` is `{ "violations": [] }`.

See [[player-surface-audit]] for structural classes, [[char-encounter-cluster]] for the
Characters/CharBuilder half (silent writes, sub-24px pills, duplicate a11y names, zero-hover and the
unconfirmed level-up Cancel are SHARED findings), and [[ds-layer-audit]] for token landmines.
