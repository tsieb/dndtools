---
name: gm-react-ds
description: Where the gm-react design-system components live and the key ds contracts (Dialog a11y, Toaster undo, EmptyState/Skeleton/VisibilityChip) to check conformance against
metadata:
  type: reference
---

The design source of truth is `docs/design-package/` (mirrors the claude.ai/design "DND Tools Design System" via DesignSync). The app consumes a vendored mirror.

- App DS lives at `apps/gm-react/src/ds/` — JSX components under `components/<group>/`, exported via the `apps/gm-react/src/ds/index.js` barrel (typed by `index.d.ts`). Screens import `from '../ds'`.
- Key contracts to hold surfaces to:
  - `Dialog` (overlay) already implements focus-in, Tab-trap, Escape, focus-return, scroll-lock, `dismissible={false}`, `tone="danger"`. A hand-rolled modal is usually a finding — EXCEPT `CharBuilder`'s `Overlay` (app/CharBuilder.tsx ~283) which correctly reimplements the whole contract for a fixed-size full-screen builder shell (a11y intact; only a DRY note).
  - `Toaster.show({message, action, onAction})` / `.success/.warning/.error/.info` — undo toasts use `action`+`onAction`. `ToastViewport` is mounted once in AppShell.
  - `EmptyState` / `Skeleton` / `ProgressMeter` (system group) for async list/load states.
  - `VisibilityChip` (feedback) — grayscale-safe icon+label for DM-only vs player-visible; safety-critical. `Badge` is NOT an acceptable substitute (color+text only).
  - Map group ships `LayerPanel/LayerRow/LayerTypeBadge/FogControls/GenerationPanel/ImportWizard/MapCreationForm/Minimap/POIMarker/POIPopover/ToolPalette` — MapBuilder/Atlas hand-roll several of these.
- Screens use a local `screen-kit.tsx` `T.*` token map (`T.raised`, `T.bd`, `T.sub`, etc. → `var(--color-*)`). Raw hex is rare and a real violation when present. NOTE: `T` deliberately has NO spacing tokens, so pervasive one-off px paddings/radii (7/9/11/12) are an established (if non-conformant) app convention — call it out as a systemic decision, don't enumerate every site.
- Color/token rules from `docs/design-package/SKILL.md`: color encodes state never decoration; gold accent = one primary action per region; status colors always pair with a redundant icon shape; Lucide icons only (no emoji); icon names are lowercase kebab registry keys (`lock`, not `Lock`).
