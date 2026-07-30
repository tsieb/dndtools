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

## Update (2026-07-29, cluster: Settings/Onboarding/Extensions/Community/ConnectedSources/Knowledge/WikiReader/Graph/Audio/tokens)

Confirmed-fixed since the last pass (do not re-report): `Onboarding` focus-on-open now lands on the
CONTENT region not "Skip setup" (`Onboarding.tsx` ~305-308, `contentRef`), so beta-audit item #4 is
resolved. Raw hex/`<input>`/`<select>` are effectively absent from this whole cluster — token and ds
discipline in these files is genuinely good (only deliberate `#fff` QR quiet zone in `Settings.tsx`).

STRUCTURAL classes worth re-checking every pass:

1. **`Seg` in `app/screen-kit.tsx` is an incomplete `role="radiogroup"`** — no arrow-key selection, no
   roving tabindex (every radio is a Tab stop). `ds/components/forms/SegmentedControl.jsx` has the same
   gap. `Onboarding.tsx` (~144-153) implements the correct contract, so the pattern IS known in-repo.
   `Seg` is used for SAFETY-CRITICAL choices (Knowledge note visibility DM-only↔Players).

2. **Inert accent-coloured `[[wikilinks]]`.** Both markdown renderers (`Knowledge.tsx` `boldify`,
   `WikiReader.tsx` `boldify`) paint wikilinks with `--color-accent` but render a bare `<span>` — no
   nav, no cursor, no keyboard target. The graph data to resolve them EXISTS
   (`getNoteRelationshipsForActor`, `GraphViz` edges `relationship:'wikilink'`). Same two renderers
   also emit `<li>` with no `<ul>` parent.

3. **`--layer-*` / `--map-*` tokens are `:root`-only** (`styles/tokens/colors.css` ~258-282) — no
   `[data-theme='parchment']`/`high-contrast` overrides and NOT in the `@media (forced-colors:active)`
   remap block. Consumers are SVG `fill`/`stroke` in `app/MapBuilder.tsx`, which forced-colors mode
   does not override, so the map surface keeps custom hues in OS high-contrast.

4. **Retry-on-load-failure is inconsistent.** `Community.tsx` is the EXEMPLAR (EmptyState + `icon="retry"`
   button at ~290/921/1240). `Settings.tsx` devices (~657) and invites (~1348) render dead failure text
   despite already having a reusable `load` fn. Use Community as the template.

5. **Unconditional 2-column grids on phone** in `Audio.tsx` (~920/1012/1479/1601) — the same class the
   prior pass fixed in `Extensions.tsx`; `Audio.tsx:1798` shows the file already knows the `isPhone`
   conditional. Note the in-repo idiom: two `fr` tracks SQUEEZE rather than overflow, so the responsive
   e2e gate will not catch these — they need a min-width assertion, not an overflow assertion.

6. **`ConnectedSources.tsx` `statusBySource` strings are the sole feedback for long async pull/push and
   carry no `role="status"`/`aria-live`.** Errors there are silent to AT.

Anti-pattern #1 (destructive, no confirm/undo) still open at exactly the two sites flagged last pass:
`Extensions.tsx` `deleteType` (~1665) and `Settings.tsx` MCP `mcp.remove-agent-binding` (~4080). NEW
sibling: `Knowledge.tsx` "Push to players" (~359, ~429) flips DM-only→player-visible on one click with
no confirm, no undo and no toast — while `ConnectedSources.tsx` (~449-462) carefully Dialog-gates the
analogous dm-only→external-Doc push. Inconsistent treatment of the same exposure risk.

Also: the ONLY `outline:'none'` in this cluster that is a real violation is `Graph.tsx:510` (raw graph
search `<input>`, no focus repaint). Every other hit is either a `tabIndex={-1}` programmatic-focus
container (Onboarding/Dialog/Sheet) or a ds control that repaints focus in `onFocus`
(`ds/components/forms/Input.jsx:19`). Use that triage instead of flagging the grep hits.

New unrelated finding: `AppShell.tsx` mounts `<ToastViewport placement="bottom-right" />` globally (~line 1106) with no awareness of the phone `BottomTabBar`'s height (`PhoneNav`, ~line 758). `ToastViewport`'s bottom-right fixed positioning (`src/ds/components/overlay/Toast.jsx`) only offsets by `--space-4` (16px) + safe-area-bottom, while the tab bar occupies ~60px+safe-area at the true viewport bottom — toasts (z-index 600) visually overlap the tab bar on the phone profile. Check on future mobile passes; grep for any `--bottom-tab-bar-height` var to see if fixed.
