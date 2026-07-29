---
name: completion-pass-ux-patterns
description: Recurring UX anti-patterns found in the gm-react feature-completion pass (destructive ops without confirm/undo, async false-negatives, VisibilityChip gaps) and which surfaces are exemplary
metadata:
  type: project
---

Design-package conformance review of the gm-react feature-completion pass (branch feat/completion-pass, ~24 commits, ~14.6k lines across ~17 surfaces).

**Why:** the pass converted honest-stub surfaces to real backends; the sweep was supposed to add EmptyState/Skeleton/VisibilityChip/undo/Dialog-focus everywhere. It landed unevenly.

**How to apply:** when reviewing gm-react screens, check these recurring anti-patterns first — they recur across surfaces:

1. **Destructive op fires on a single click with only a success toast — no confirm Dialog and no undo `action`.** This is the dominant theme. Confirmed at: Settings device-revoke / invite-revoke / connection-disconnect / permission-revoke / sign-out-everywhere; Community remove-listing / unpublish; ConnectedSources folder+gdoc disconnect; Knowledge note-delete; Player journal-entry + party-stash delete; Audio automation-delete + layer-remove; MapBuilder POI/token delete (incl. Delete/Backspace key path with "undo is disabled"). The ds `Toaster` undo action and `Dialog tone="danger"` are available and mostly unused for these.
   - EXEMPLARS that do it right (use as the template): `ScenesCreator` delete → `Toaster.success(..., {action:'Undo', onAction: scene.restore})`; `Extensions` package-remove uses a confirm state; Settings delete-account is a type-to-confirm danger Dialog.

2. **Async false-negative from an empty-initialized presence/state map.** `Audio.tsx useAssetBytesPresence` starts `{}` and resolves async, so every asset shows "File bytes missing — re-import" and play is gated wrongly during the first-paint window. Pattern to watch: any `useState({})` + async-fill that a boolean gate reads before it settles → needs an `unknown` tri-state.

3. **VisibilityChip gaps.** Map surfaces (MapBuilder/Atlas) use `Badge` + hand-rolled dm-only/players icon toggles instead of `VisibilityChip`. `QuestCard` (Campaign) renders the chip ONLY when `dmOnly` — player-visible quests get no cue. Knowledge→GoogleDocs push can exfiltrate a dm-only note with no visibility warning.

4. **Async lists show bare-text loading/empty instead of ds `Skeleton`/`EmptyState`** (Settings devices/invites/connections, Community Discover, Atlas maps). Note: many list reads are synchronous from in-memory `runtime.state` (local-first) — Skeleton is genuinely N/A there (Characters/Player/Session/Campaign). Distinguish real async I/O from sync reads before flagging.

5. **Hand-rolled controls where ds equivalents exist:** raw `<input type=range>` instead of `Slider` (Audio faders, MapBuilder, CharBuilder); native `<select>` instead of `Select` (Settings); local `Seg` instead of `SegmentedControl`; MapBuilder/Atlas hand-roll `LayerRow`/`MapCreationForm`/`ImportWizard`.

Copy-honesty is a genuine strength across the pass (fail-closed states name why + what to do; simulated billing clearly labeled in Upgrade/Subscription).

## Update (2026-07-28 static review, cluster: AppShell/nav/CommandPalette/Onboarding/Settings/Extensions/Audio/Upgrade/ConnectedSources)

Most of the anti-patterns above are now FIXED in the current tree:
- `Audio.tsx useAssetBytesPresence` already returns a proper 'unknown'|'present'|'missing' tri-state and callers treat 'unknown' as not-blocking — issue #2 resolved.
- `ConnectedSources.tsx` folder/gdoc disconnect, `Settings.tsx` device-revoke/invite-revoke/permission-revoke/vault-folder-disconnect/AI-key-forget all now use `Dialog tone="danger"` confirms or Toaster `Undo` — issue #1 mostly resolved for these surfaces.
- Audio automation-delete + ambience-layer-remove now use immediate-delete-with-Toaster-Undo (documented in code comments as deliberate, re-dispatching the original id) — also resolved.

Two NEW instances of anti-pattern #1 (destructive, no confirm/undo) found this pass, both worth checking again in future audits:
- `Extensions.tsx` Custom Object Type "Delete" (~line 1651) — single click, no confirm/undo; inconsistent with the widget-package "Remove" confirm-state pattern in the SAME file (`ExtPlugins`, `confirmRemoveId`).
- `Settings.tsx` MCP agent-binding "Remove" (~line 4069, uses local `run()` helper ~line 3868) — single click, no confirm/undo, despite its own toast copy warning that pending proposals expire.

New unrelated finding: `AppShell.tsx` mounts `<ToastViewport placement="bottom-right" />` globally (~line 1106) with no awareness of the phone `BottomTabBar`'s height (`PhoneNav`, ~line 758). `ToastViewport`'s bottom-right fixed positioning (`src/ds/components/overlay/Toast.jsx`) only offsets by `--space-4` (16px) + safe-area-bottom, while the tab bar occupies ~60px+safe-area at the true viewport bottom — toasts (z-index 600) visually overlap the tab bar on the phone profile. Check on future mobile passes; grep for any `--bottom-tab-bar-height` var to see if fixed.
