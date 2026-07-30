---
name: player-char-scene-display-cluster
description: gm-react PlayerView.tsx (/play), Player.tsx (/player), Join.tsx, plus SceneCardsPanel/SceneDisplay — FIXED-vs-OPEN split re-verified 2026-07-30 at 0a07165d
metadata:
  type: project
---

`screens/PlayerView.tsx` (chrome-less `/play`), `screens/Player.tsx` (in-shell `/player`),
`screens/Join.tsx` re-audited 2026-07-30 @ `0a07165d`. SceneCardsPanel / SceneDisplay* /
ProjectionControl / ViewAsControl were NOT re-verified this pass — their items below are carried
forward from 2026-07-29 and should be re-checked before acting.

## FIXED — do not re-flag (verified at 0a07165d)
- Locked `/play` nav-row opacity is now **0.7** (`PlayerView.tsx:557`), with the rationale comment.
- `/play` HAS a skip link (`PlayerView.tsx:621-647`, `data-skip-link`, HashRouter-safe
  `preventDefault` + manual focus) and `<main id="player-main" tabIndex={-1}>` (`:805`).
  Pinned by `responsive.spec.ts:974-995`. `#main-content` remains the AppShell-only marker.
- Toast live region is a **persistent** `visually-hidden role="status"` whose text swaps
  (`PlayerView.tsx:813-815`); per-toast nodes only claim `role="alert"` when `status==='error'`
  (`:837-839`). The mount-with-content class is closed here.
- `SceneBanner` pause is CORRECT and still the right shape: **separate** `hovered`/`focused` flags
  (`PlayerView.tsx:331-339`), `onFocus`/`onBlur` = focusin/focusout so the nested Dismiss holds it.
  A single shared `paused` boolean is the known-wrong shape. Covered by `scene-cards.spec.ts:319-335`.
- Handouts accordion has `aria-controls` + panel `id` (`PlayerView.tsx:1786` / `:1828`).
- `AtlasSection` uses `ds/VisibilityChip` (`PlayerView.tsx:2030`) — the gold-`Badge` inversion is gone.
- `SheetSection` sticky header now switches padding on viewport (`PlayerView.tsx:1302`,
  `'12px 14px'` phone / `'12px 28px'` desktop) matching `PvPage` (`:252`). Old item 13 CLOSED.
- `Player.tsx` class-resource pips: 24px + `flexWrap` + `justifyContent:'flex-end'` + `flex:'0 0 auto'`
  (`:1385-1411`). Template for any future sub-24px target.
- `Player.tsx` write-error banner has `role="alert" aria-live="assertive"` (`:429-443`);
  `dispatch()` (`:246-250`) clears `err` on success, so no stale-error-on-retry.
- `Join.tsx` is structurally sound: `<h1>` (`:103`), `role="alert"` on invalid (`:120`),
  `role="status"` on loading (`:107`), Retry + escape-hatch buttons.
- `ElevatedLocked` (`PlayerView.tsx:1956`) IS dead — `current` clamped at `:511`, all 9 ids branch at
  `:575-603`, `else` at `:604` unreachable. Do not report.
- `IconButton size="sm"` is **1.75rem = 28px** (`ds/.../IconButton.jsx:10`) → all `size="sm"`
  IconButtons in this cluster clear WCAG 2.5.8. Don't flag them.
- `auth.openAuthModal()` from `Join.tsx:179` WORKS — `AuthModal` is mounted by `AuthProvider`
  (`cloud/AuthContext.tsx:183`), above the router. Not a dead handler.
- `Join.tsx:86` `role="main" aria-label="Campaign invite"` is CORRECT — landmark roles are not
  name-from-content, so the label does not erase the subtree.
- `.player-view-toast-viewport` is lifted above the phone nav (`styles/index.css`, `bottom:
  calc(119px + safe-area)`); `.player-view-shell` reserves `107px`. Phone nav math checks out.

## STILL OPEN (verified 2026-07-30, ranked)
1. **`PlayerView.tsx:987-994` — `backgroundImage` (`:990`) silently overwrites the `background`
   shorthand (`:987`).** React writes styles in key order, and the shorthand resets
   `background-color` to transparent, so **whenever `sceneName` is truthy the stage's dark
   theatrical backdrop is destroyed** and only the 38px grid over a transparent box remains
   (page bg shows through). Invisible in the dark themes, obvious + contrast-failing in parchment.
   This is the root cause of half of the old "stage hard-codes colours" item. Fix = one
   `backgroundColor` + one merged `backgroundImage` layer list + matching `backgroundSize`.
2. **`Player.tsx:451-504` — the tab bodies are not keyed by `charId`.** `PlayerSheet`'s `editing` /
   `drafts` / `backstoryDraft` survive a PC switch through the always-visible `Select` (`:340-347`),
   so Save writes PC A's race/subclass/background/speed/init onto PC B (`saveEdit` `:565-577`
   diffs the drafts against the NEW `C`). Fix `key={charId}`; `equipment.spec.ts:46-50` selects the
   PC BEFORE filling forms, so keying is spec-safe.
3. **`PlayerView.tsx:1578-1604` dice modifier stepper** — `IconButton label="−1"/"+1"` are values not
   actions, `{sgn(mod)}` (`:1595`) is not a live region, `mod` is UNBOUNDED (hold Enter → +417
   overflowing the 34px readout), no direct numeric entry.
4. **`PlayerView.tsx:1292-1438` `SheetSection` renders NO heading.** Every other section gets
   `SectionHead`'s `<h1>`; the sheet's identity strip (`:1309-1319`) is plain spans. `/play`'s
   "My character" tab therefore has zero headings.
5. **Stage colour hard-coding, parchment-specific measurements** (`PlayerView.tsx:988-1062`):
   - `:991` grid = `color-mix(accent 14%, transparent)`; parchment accent `#9a5418` at 14% over
     near-black ≈ invisible.
   - `:1078` "Nothing is being shown yet." uses `T.ter` on hard-coded `#0d0906` = **4.18:1** in
     parchment (`--color-text-tertiary #837057`) → 1.4.3 FAIL at 14px. Tavern is 6.14:1.
   - `:1028` map-fallback pill `rgba(243,231,210,.75)` on `rgba(8,5,3,.6)` ≈ **3.75:1** at 11px
     (worse once finding 1 is present).
   - `:1011` "What the table sees" ≈ **5.07:1** — NOT a defect, stop re-measuring it.
6. **No `@media (forced-colors: active)` escape for the stage.** `styles/tokens/colors.css:362`
   remaps `background-color`/`color` but forced-colors leaves `background-image` alone, so the
   `linear-gradient(transparent, rgba(8,5,3,.85))` scrim at `:1045` survives while its `#f3e7d2`
   caption (`:1048`) is forced to `CanvasText` → black-on-black in light HC. `/play` is NOT in
   `responsive.spec.ts` ROUTES, so the forced-colors gate never walks it.
7. **`Player.tsx:1425-1457` Death saves panel conveys nothing to AT** — the 3+3 pips are bare
   `<span>`s with no text and the only labels are "SUCCESSES"/"FAILURES". No count is exposed.
8. **`Player.tsx:360-388` HP stepper is ±1-only with no live region.** 27 damage = 27 commands;
   a successful write changes the number silently. Same NumStepper class as the character cluster.
9. **`PlayerView.tsx:2094-2131` Bestiary accordion** has `aria-expanded` (`:2096`) but no
   `aria-controls`, and the panel (`:2124`) has no `id` — the Handouts fix was not mirrored here.
10. **`Join.tsx:192-196` "Try again" destroys itself** — `setRetryNonce` flips phase to `loading`,
    unmounting the focused button; focus falls to `<body>`.
11. **`PlayerView.tsx:1564-1576` d20-mode segmented control** — three `aria-pressed` buttons with the
    "d20 mode" caption (`:1564`) not programmatically attached. Needs `role="group" aria-label`.
12. **`Player.tsx:1768-1776` marching-order "Move … up" unmounts at index 0** (`i > 0` guard) →
    focus drop. Same shape as the SceneCardsPanel boundary item.
13. **`Player.tsx` `err` is screen-level and never cleared on tab or PC switch** (`:237`, `:429`).
14. **`Player.tsx:2351-2369` journal share toggle has no `aria-pressed`**, unlike the equipped
    (`:1064`), prepared (`:1536`) and inspiration (`:406`) toggles in the same file.
15. **`PlayerView.tsx:913-917` `toggleReady` is silent when `!presenceShared`** while `toggleHand`
    (`:893-912`) always toasts — asymmetric feedback on adjacent buttons.
16. **Zero `:hover` feedback anywhere in this cluster** (global: no `button:hover` rule exists;
    inline styles can't express it). In-repo pattern = `onMouseEnter/Leave`, `ds/map/LayerRow.jsx:96`.

## Carried forward, NOT re-verified 2026-07-30 (SceneCardsPanel / SceneDisplay)
- `SceneCardsPanel.tsx:715-721` edit disclosure unannounced (no `aria-expanded`/`aria-controls`,
  no focus move into `:730` or back on Cancel).
- `SceneCardsPanel.tsx:528-543` queue move buttons drop focus at the boundary (keep the disable —
  `scene-cards.spec.ts:413-445` asserts it — and move focus to the surviving sibling).

## Spec-coupling map (grep before renaming any label)
| Change | Spec that breaks |
| --- | --- |
| `/play` nav `aria-label` (must keep the bare label as a substring) | `co-dm.spec.ts:172-209`, `responsive.spec.ts:631` |
| locked-row `aria-disabled` → anything else | `co-dm.spec.ts:176-178` (`toBeDisabled` honours `aria-disabled`) |
| "Dismiss scene banner" / `data-testid="scene-banner"` | `scene-cards.spec.ts:319-335` |
| `SectionHead` heading text ("Now playing", "Maps & scenes", "Bestiary", "Combat assist") | `scene-cards.spec.ts:292/317/386`, `responsive.spec.ts:626-637` |
| `#player-main` id / skip-link text / `data-skip-link` | `responsive.spec.ts:974-995`, `responsive.spec.ts:55-67` |
| `Player.tsx` "Switch character", "Item"/"Qty"/"Weight (lb)", "One more X"/"One fewer X", "Add one GP"/"Spend one CP", `Equipment (n)` | `equipment.spec.ts:48,68-90,134-150,177` |
| `Player.tsx` tab labels Sheet/Resources/Party/Level up/Journal | `responsive.spec.ts:660-673` |
| `Move {name} up` (SceneCardsPanel) | `scene-cards.spec.ts:413-445` |
| adding an `<h1>` to `/play` Sheet | nothing — `/play` is absent from `responsive.spec.ts` ROUTES and from the axe gate |

## Coverage gaps
- `a11y-axe-gate.spec.ts:23-38` ROUTES has `/player` but **NOT `/play` or `/join`**.
- `responsive.spec.ts:3-19` ROUTES (used by the 200%-text / reduced-motion / forced-colors /
  Android-safe-area loops) also excludes `/play` and `/join`. They get only the two bespoke
  compact-phone tests at `:585` and `:641`.
- `tests/a11y/known-violations.json` is `{ "violations": [] }` — the register is clean.

See [[player-surface-audit]] for the structural classes and [[ds-layer-audit]] for the token
landmines (`--color-dm-only-badge`/`-subtle` ARE defined at colors.css:74/130/184/237/400 — the
cluster's usages at `PlayerView.tsx:295-299,1869-1874` and `Player.tsx:2266-2271` are correct).
