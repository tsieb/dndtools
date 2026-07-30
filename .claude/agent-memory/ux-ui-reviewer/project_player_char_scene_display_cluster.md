---
name: player-char-scene-display-cluster
description: gm-react Player/PlayerView/Join/SceneDisplay/SceneDisplayOverlay/ProjectionControl/ViewAsControl — FIXED-vs-OPEN split re-verified 2026-07-30 at 329bcc58
metadata:
  type: project
---

Cluster: `screens/Player.tsx` (/player, in DM shell), `screens/PlayerView.tsx` (/play, chrome-less),
`screens/Join.tsx`, `screens/SceneDisplay.tsx` (/display + `SceneDisplaySurface`),
`app/SceneDisplayOverlay.tsx` (Ctrl+Shift+S), `app/ProjectionControl.tsx`, `app/ViewAsControl.tsx`.
Full re-read 2026-07-30 @ `329bcc58` (all 7 files, plus ds/Button, ds/Icon registry, index.css
player-view rules, AppShell main/topbar, backNavigation).

## FIXED — do not re-flag
Everything in the previous FIXED list still holds (nav opacity 0.7, `/play` skip link + `#player-main`,
persistent toast live region, SceneBanner separate hovered/focused pause, Handouts aria-controls,
AtlasSection VisibilityChip, SheetSection sticky padding, class-resource 24px pips + wrap,
`Player.tsx` write-error `role=alert`, Join structure, `ElevatedLocked` is dead, `IconButton size=sm`
is 28px, `auth.openAuthModal()` works, `Join` `role=main` label is fine, toast viewport phone math).
NEW this pass:
- **Stage `background`-shorthand overwrite is FIXED** (`PlayerView.tsx:998-1002`): one `backgroundColor`
  + a 4-layer `backgroundImage` + matching `backgroundSize`. Also gained `data-testid="player-stage"`
  (pinned by `player-view.spec.ts:73,98`). Grid tint is now a fixed warm rgba, deliberately not accent.
- **`Player.tsx` tab bodies are now `key={charId}`** (`:457,473,493,504`) — the cross-PC draft bleed is
  closed. `PlayerParty` is intentionally unkeyed (its state is party-scoped, not per-PC).

## VERIFIED NON-DEFECTS (checked this pass, stop re-deriving)
- `Player.tsx` vitals bar `position:sticky; top:0` is CORRECT: `AppShell.tsx:1112` `<main>` is its own
  `overflowY:auto` scroller and `TopBar` is a SIBLING above it. Nothing slides under the topbar.
- `registerBackHandler` (`platform/backNavigation.ts`) is **Android-Back only**. It is NOT an Escape
  handler — never cite it as Escape coverage.
- `--z-toast: 600` (`styles/tokens/spacing.css:64`) > `SceneDisplayOverlay` zIndex 120, so a Toaster
  call from inside the fullscreen overlay IS visible.
- All icon names used in the cluster resolve in `ICON_REGISTRY` (incl. `travel`, `tag`, `reveal`,
  `players`, `eye`). Unknown names silently fall back to `Square`.
- `ds/Button` (`core/Button.jsx:20-26`): `disabled` = native/hard; `aria-disabled` = soft (stays
  focusable, `onClick` replaced with `undefined`). This contract is the yardstick for every
  disabled-control finding in the cluster.

## STILL OPEN (file:line, ranked, verified @ 329bcc58)
1. **`ViewAsControl.tsx:23` focus-on-open is a no-op.** Queries `[role="menuitem"]`; every item is
   `role="menuitemradio"` (`:247`). Focus never enters the menu, and the Escape/arrow handler lives on
   the menu div (`:107`) so both are unreachable from the trigger. Fix: query `[role="menuitemradio"]`.
2. **`ViewAsControl.tsx:97-203` open menu is not focus-contained.** All items are tabbable (no roving
   tabindex), the click-catcher (`:99-103`) is pointer-only, so Tab out of the last item lands on the
   next topbar control (ProjectionControl's Go live) *behind* the catcher and it can be activated.
3. **`Player.tsx:1433-1465` Death saves is a dead surface.** 6 inert 18px `<span>`s, no text, no
   `aria`; nothing in `apps/gm-react/src` ever dispatches `kind:'death-save'` even though
   `packages/core/src/commands/combat.ts:587-614` implements it. Badge (`:1436`) reads "Conscious"
   regardless of failures. `Characters.tsx:1085-1088` has the text pattern (`2✓ / 1✗`) to copy.
4. **`SceneDisplayOverlay.tsx:176-191`** Second-screen uses hard `disabled` + `title` +
   explanatory `aria-label`. Native-disabled kills the tooltip AND the tab stop → the Android
   `unavailableMessage` is unreachable. Should be `aria-disabled` (the file's own sibling
   `ProjectionControl.tsx:96-99` documents exactly this).
5. **`SceneDisplayOverlay.tsx:188`** ignores `openSecondScreen()`'s return; `window.open`
   (`platform/sceneDisplayChannel.ts:99`) returns null when the popup is blocked → silent no-op.
6. **`ProjectionControl.tsx:100,124`** soft-disabled "Go live" has `onClick` stripped by Button, so on
   touch the refusal reason exists only in `title`/`aria-label` → tap does nothing, silently. Also the
   workflow pill is `!compact`-only, so phone DMs never see Paused/Recap/Wrapping-up.
7. **`SceneDisplay.tsx:66`** empty state `rgba(255,255,255,0.34)` on `#05070c` ≈ **2.9:1** at 15px →
   1.4.3 FAIL, on the projector everyone at the table looks at.
8. **`Player.tsx:2359-2377`** journal share toggle has no `aria-pressed` — the only toggle in the file
   without it (cf. `:408` inspiration, `:1072` equipped, `:1544` prepared).
9. **`PlayerView.tsx:2103-2106` / `:2133`** Bestiary accordion has `aria-expanded` but no
   `aria-controls` and the panel has no `id`. The Handouts fix (`:1794-1795`, `:1837`) was not mirrored.
10. **`Player.tsx:237,246-250,429`** `err` is screen-level, cleared only by the next *successful*
    dispatch — survives tab switch and PC switch.
11. **`PlayerView.tsx:1587-1613`** dice modifier: `IconButton label="−1"/"+1"` are values not actions,
    `mod` unbounded (34px readout at `:1600`), `{sgn(mod)}` not a live region, no direct entry.
12. **`Player.tsx:972-982`** `stepQty` clamps at `Math.max(0, …)` → "One fewer X" at qty 1 leaves a
    `×0` ghost item in the list, and the button never disables (further presses are accepted no-ops).
13. **`PlayerView.tsx:1274-1301`** `SheetSection` renders no heading at all; `/play`'s "My character"
    tab has zero `<h1>` (every other section gets one via `SectionHead:279`).
14. **`Join.tsx:192-196`** "Try again" flips phase to `loading`, unmounting itself → focus to `<body>`.
15. **`Icon.jsx:320,323,373`** `dm-only`, `visibility-players` and `eye` all map to Lucide `Eye`, so
    ViewAsControl's "DM view" / "Any player" / "Observer" rows carry the identical glyph.
16. Smaller, all still true: `PlayerView.tsx:913-917` `toggleReady` silent when `!presenceShared` while
    `toggleHand` always toasts; `PlayerView.tsx:1572-1585` d20-mode trio has no `role="group"` tying it
    to the "d20 mode" caption; zero `:hover` feedback in the cluster except `ViewAsControl`'s MenuItem
    (`:250-251`) — that is the in-repo pattern to copy.

## Spec-coupling map (grep before renaming any label)
| Change | Spec that breaks |
| --- | --- |
| `/play` nav `aria-label` (keep bare label as substring) | `co-dm.spec.ts:172-209`, `responsive.spec.ts:631` |
| locked-row `aria-disabled` | `co-dm.spec.ts:176-178` |
| "Dismiss scene banner" / `data-testid="scene-banner"` | `scene-cards.spec.ts:319-335` |
| `SectionHead` titles (Now playing / Maps & scenes / Bestiary / Combat assist) | `scene-cards.spec.ts:292/317/386`, `responsive.spec.ts:626-637` |
| `#player-main`, skip-link text, `data-skip-link` | `responsive.spec.ts:974-995`, `:55-67` |
| `data-testid="player-stage"` | `player-view.spec.ts:73,98` |
| `.scene-display` class, `/display` heading = card title, text "No scene on display" | `scene-cards.spec.ts:357,362,365` |
| `role="dialog"` name "Scene display", Escape-closes, focus-restore | `scene-cards.spec.ts:124-154` |
| "Next card" button name (substring match, so the `(n queued)` suffix is safe) | `scene-cards.spec.ts:212,223` — that instance is SceneCardsPanel's, not the overlay's |
| `Player.tsx` "Switch character", "Item"/"Qty"/"Weight (lb)", "One more X"/"One fewer X", "Add one GP"/"Spend one CP", `Equipment (n)` | `equipment.spec.ts:48,68-90,134-150,177` |
| `Player.tsx` tab labels Sheet/Resources/Party/Level up/Journal | `responsive.spec.ts:660-673` |
| "DM view" as a **radio** name | `graph.spec.ts:97,137` — that is Graph's own control, NOT ViewAsControl; ViewAsControl has **zero** e2e references |
| SAFE (no spec references at all): ViewAsControl entirely, death-save pips, journal Shared/Private toggle, dice modifier ±1, Bestiary accordion, `Join` "Try again", Second-screen button, "Go live" refusal copy | — |

## Coverage gaps
- `a11y-axe-gate.spec.ts:23-38` ROUTES has `/player` but NOT `/play`, `/join`, `/display`.
- `responsive.spec.ts:3-19` ROUTES (200%-text / reduced-motion / forced-colors / safe-area loops) also
  excludes `/play`, `/join`, `/display`.
- `tests/a11y/known-violations.json` is `{ "violations": [] }`.

See [[player-surface-audit]] for the structural classes and [[ds-layer-audit]] for token landmines
(`--color-dm-only-badge`/`-subtle` ARE defined; the cluster's usages are correct).
