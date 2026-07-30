---
name: player-surface-audit
description: Player-facing surface map (/play, /join, join-by-code modal, widget bodies) and the recurring defect classes found there — recheck these on every pass
metadata:
  type: project
---

Audit of gm-react's PLAYER-facing cluster (`/play` = `screens/PlayerView.tsx`, `/join` =
`screens/Join.tsx`, `/player` = `screens/Player.tsx` inside the DM shell,
`app/ProjectionControl.tsx`, `app/ViewAsControl.tsx`, `app/widget-bodies.tsx`).

**How to apply:** these are structural classes, not one-off bugs. Recheck each on any future pass
over player surfaces; they regenerate because the surfaces are hand-rolled rather than DS-driven.

1. **The player join flow spans TWO files and the second one is the weaker.** `/join` only resolves
   the invite *token*; the actual connect happens in the "Join a table" modal inside
   `net/SessionPanel.tsx` (`JoinSessionButton`). Any audit scoped to `screens/Join.tsx` alone misses
   half the flow. The modal's code-entry `<textarea>`s are labelled only by a sibling `<span>` +
   placeholder, and its error line is a bare colour-only `<div>`.

2. **Chrome-less routes hand-roll their own a11y and lose the DS contracts.** `/play` and `/join`
   sit OUTSIDE `AppShell`, so they get no `ToastViewport`, no `Toaster`, no `EmptyState`, no
   `VisibilityChip`. `PlayerView` reimplements toasts (`useToasts`) and `Join` reimplements the
   error/empty states — both without `role="alert"`. Expect missing live-regions here specifically.

3. **Live regions are mounted together with their content.** The repeated pattern is
   `{cond && <div role="status" aria-live="polite">…</div>}` (PlayerView toasts, `SceneBanner`,
   Join's loading line). Inserting the region and the text in the same tick is unreliably announced;
   the fix is always a persistent empty region. This is the app's single most common a11y defect on
   DM-push content.

4. **DM-only visibility is encoded two different ways inside the same file.** `PlayerView`'s
   `LockedNote`/`JournalSection` correctly use `--color-visibility-dm` + the `hidden` icon, but its
   Co-DM `AtlasSection`/`AssistSection` use gold `Badge status="accent"` with the raw enum string
   (`dm-only`). Gold = "primary action" everywhere else, so the safety cue reads inverted. `Badge` is
   not a `VisibilityChip` substitute — see [[gm-react-ds]].

5. **`/play` phone layout puts the nav bar visually last but FIRST in DOM.** `styles/index.css`
   (~187) fixes `.player-view-sidebar` to `bottom: 0` at ≤640px while the `<aside>` remains the first
   child of the shell — 9 nav buttons precede content in tab order.

6. **The player "stage" viewport deliberately hard-codes near-black + low-alpha cream** (PlayerView
   StageSection) and so ignores the parchment / high-contrast themes. Decide once whether the stage
   is theme-exempt "theater" chrome; right now it is undocumented.

**Verified NOT a defect (do not re-report):** `runtime.defaultActorId` is a getter that returns the
*previewed* actor while previewing (`runtime/SceneRuntime.ts` ~250), so every
`widget-bodies.tsx` / `Player.tsx` read made with it is correctly actor-filtered during
"View as" — there is no DM-only leak through that path. `ds/Icon` defaults to `aria-hidden` unless
given `label`, so bare `<Icon>` usage is correct. Journal delete in `Player.tsx` has a real undo
toast.

See [[beta-readiness-audit]] for the older, DM-side findings.
