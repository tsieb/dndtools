---
name: player-char-scene-display-cluster
description: gm-react Player.tsx (DM-shell /player), PlayerView.tsx (/play), Join.tsx, SceneDisplay*/ProjectionControl/ViewAsControl — findings from 2026-07-29 pass
metadata:
  type: project
---

Audit of `screens/Player.tsx` (in-shell player character sheet at `/player`), `screens/PlayerView.tsx`
(chrome-less `/play`), `screens/Join.tsx`, `screens/SceneDisplay.tsx` + `app/SceneDisplayOverlay.tsx`,
`app/ProjectionControl.tsx`, `app/ViewAsControl.tsx`, `styles/scene-display.css`.

**Join.tsx is now solid** — h1, `role="alert"` on invalid invite, Retry button, all present and
correct (this is the state after commit `5274a5f9`'s Join fixes). Don't re-flag its known-good state.

**New findings this pass (not part of 5274a5f9):**

1. **`Player.tsx`'s entire write-error surface has zero `role`/`aria-live`.** The shared `dispatch()`
   wrapper (~245-249) funnels every rejection (HP step, equipment, currency, advancement, journal,
   marching order) into a single `err` string rendered as a bare `{err && <div>...}` (~428-440) with
   no `role="alert"`, no `aria-live`, and it isn't sticky — so on a tall page (e.g. scrolled into the
   Equipment or Level-up panel) a rejected write is silently invisible to everyone, not just AT users.
   `grep 'role="alert"\|aria-live' screens/Player.tsx` returns nothing. This is the same "notice/error
   banner missing role=status" pattern the Knowledge/Wiki/Graph/Atlas reviewer found independently —
   now confirmed in a THIRD unrelated file, worth treating as an app-wide idiom to sweep for.

2. **Hand-rolled class-resource pips are 13×13px** (`Player.tsx` ~1379-1381, the `toggleResource`
   button grid) — below the WCAG 2.5.8 24px floor the team explicitly fixed for Switch/Chip-remove in
   `5274a5f9`. Note: the DS `SpellSlots` component itself (`ds/components/spell/SpellSlots.jsx:33-45`)
   only uses 16×16/12×12 pips, so this is consistent with an EXISTING un-fixed DS defect (already
   logged in the DS-layer-audit memory as "sub-24px targets") rather than a novel regression — but
   Player.tsx's own hand-rolled copy is even smaller than the DS original.

3. **`Player.tsx` equipment "Add" silently coerces a blank Qty field to 0** (~935:
   `Math.max(0, Math.trunc(Number(qty) || 0))`). `addItem` only gates on `name.trim()`; a cleared Qty
   input produces a phantom 0-count item with no validation message.

4. **`ViewAsControl.tsx` is the ONLY `role="menu"` in the whole app** (grep confirmed, single hit) and
   has no arrow-key roving focus — Tab-only navigation between `role="menuitem"` rows violates the ARIA
   menu keyboard contract it declares. Click-outside + Escape + focus-into-menu-on-open are all present
   and correct, just the arrow keys are missing.

5. **`SceneDisplaySurface`'s Electron `url`-hero-image block is intentional, not a bug** — verified
   `electron/main.cjs` CSP is `img-src 'self' data: blob:` (no `https:`), and `SceneCardsPanel.tsx`
   already disables the URL-hero input on native desktop (`disabled={nativeDesktop}` ~266) — so the
   DM can never author a URL hero image on desktop in the first place. Checked before reporting a false
   positive; don't re-flag this path.

6. **`SceneDisplayOverlay` is an exemplary modal** — real focus trap (Tab wrap, visible-node filtering),
   Escape closes, focus returns to the trigger on close, back-handler registered. Use as the reference
   implementation when flagging other panels' weaker Escape/focus handling (see
   [[shell-board-scene-cluster]] finding 4 for the contrast).

7. Player.tsx's sticky vitals bar uses `top: 0` (not `var(--native-titlebar-height)` like PlayerView) —
   checked and it's CORRECT: Player.tsx renders inside `AppShell`'s `<main>`, which IS the scroll
   container (TopBar sits outside it), so `top: 0` is relative to `<main>`'s own scroll region. Only
   the chrome-less standalone routes (PlayerView, outside AppShell) need the titlebar-height offset.
   Don't flag this as an inconsistency.

See [[player-surface-audit]] for the earlier, still-valid structural classes (join flow spans
SessionPanel, chrome-less routes lose DS contracts, live regions mounted with content already present,
DM-only visibility encoded two ways, phone nav DOM order).
