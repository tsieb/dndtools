---
name: shell-board-scene-cluster
description: Structural UX gotchas in the gm-react shell + board/scene canvas cluster (AppShell, CommandPalette, Board, SceneEditor, SceneBoardCanvas) found 2026-07-29
metadata:
  type: project
---

Audit of the app-shell + campaign/board/scene cluster in `apps/gm-react`. The recurring,
structural classes worth re-checking on any future pass:

1. **The bounded canvas policy has two coupled sizing traps.** `SceneBoardCanvas` runs `/board`
   under `policy: 'bounded'` (its own scroll container) and `/scene/:id` under `'canvas'`
   (overflow hidden). Anything sized for the canvas policy — notably the edit-mode grid overlay
   (a 6000×6000 absolutely-positioned div) — becomes runaway *scrollable overflow* under bounded,
   because absolute descendants still contribute to the ancestor scroll region. Separately, the
   bounded policy auto-fits by *scaling the whole layer down* with a 0.4 floor, so the seeded
   default board (3 columns → ~792px extent, from `DEFAULT_COMMAND_CENTER_TOOLS` +
   `defaultLayout` in `packages/core/src/state/command-center-state.ts`) renders sub-50% on a
   phone. Any "fit the board" change must be checked at 393px AND in edit mode.
   **Why:** these two are invisible on desktop in view mode, which is where they get tested.

2. **`/board` and `/scene/:id` deliberately bypass `Page`** (`src/app/screen-kit.tsx`), which is
   the only source of route gutters and phone bottom-tab clearance — `main` has no padding in CSS.
   Their non-DM / permission-denied fallback states bypass it too, so those land flush against
   both phone edges. Check `Page` usage whenever a full-height screen adds a bail-out state.

3. **The AppShell global-hotkey guard suppresses hotkeys inside the app's own overlays.** It
   early-returns on `[aria-modal="true"]:not([data-scene-display-overlay])`, and the DS
   CommandPalette *is* `aria-modal="true"` — so any global shortcut meant to also work while the
   palette is open (⌘K toggle-off) is dead. Any new overlay either needs an opt-out attribute or
   its own handler.

4. **Side panels on the canvas screens close on Escape via a `Card onKeyDown` only.** Nothing
   focuses the panel on open, so Escape does nothing until the user tabs in, and there is no
   click-outside close. Applies to Board's Add/Layouts panels and SceneEditor's
   Add/Meta/Inspector panels. The DS `Dialog` (which manages focus + traps Tab) is the pattern
   these should borrow; `ScenesCreator` already uses it for delete-confirm.

5. **`listWidgetLibrary` is called with a hardcoded `profileId: 'desktop'`** on both Board and
   SceneEditor even though `useViewport()` is already in scope — the classic "isPhone exists but
   this call site ignores it" shape in this repo. Grep `profileId:` on any widget-surface pass.

6. **DS-level a11y gaps surfacing on Campaign:** `QuestCard` objective rows are plain buttons
   (no `role="checkbox"`/`aria-checked`), and Campaign wraps whole `NpcCard`s in
   `div role="button"`, which makes the card's contents presentational children to AT. Prefer a
   real link/button *inside* a non-interactive card.

See [[completion-pass-ux-patterns]] and [[beta-readiness-audit]] for the destructive-op and
Page/empty-state classes these overlap with.
