---
name: settings-extensions-cluster
description: Structural findings for the Settings/Extensions/Community/Upgrade/ConnectedSources cluster (2026-07-29 parallel review, reviewer A) and which deferred backlog items are still live
metadata:
  type: project
---

Cluster: `apps/gm-react/src/screens/{Settings,Extensions,Community,Upgrade}.tsx` +
`apps/gm-react/src/app/ConnectedSources.tsx`. Reviewed after commit `5274a5f9` (prior sweep fixed
~40 defects app-wide). This pass found the cluster is generally EXEMPLARY for confirm-before-destroy
(Community's listing/wiki unpublish, Extensions' widget-package remove all use inline two-step
confirm or a Dialog) — which makes the two exceptions below stand out as real inconsistencies rather
than a systemic class.

**Two deferred backlog items re-verified as still live (2026-07-29):**
1. `ds/components/core/Tabs.jsx` still emits no `id`/`aria-controls` on its `role="tab"` buttons, and
   the app has zero `role="tabpanel"` — confirmed at both call sites in this cluster:
   `Community.tsx` `export function Community()` (~line 137) and `Extensions.tsx`
   `export function Extensions()` (~line 2463) both render tab bodies as bare `{tab === 'x' && <X/>}`
   conditionals. Fix belongs in `Tabs.jsx` (emit ids + export a `TabPanel`), not per-screen.
2. Destructive single-click with no confirm/undo, still present:
   - `Extensions.tsx` `deleteType` (~1551) wired directly to the Delete button (~1673) — no confirm
     dialog, unlike the SAME file's `removePackage` which uses a `confirmRemoveId` two-step inline
     confirm (~438). The panel copy says delete is blocked while objects of that type exist, but an
     empty type deletes immediately and irreversibly.
   - `Settings.tsx` MCP "Agent connections" → Remove button (~4104-4121) dispatches
     `mcp.remove-agent-binding` straight from `onClick`, via the local `run()` helper (~3900) which
     only ever calls `Toaster.success`/`.error` — no `action`/`onAction` undo, no confirm step.

**New finding this pass:** `Settings.tsx`'s hand-rolled "Optional tool preference" radiogroup
(~4309-4363, `SettingsToolPreferences`) has `role="radiogroup"` + `role="radio"` buttons but NO
`onKeyDown` and NO roving `tabIndex` (every button defaults to a tab stop). This is the same defect
class as ds's `Seg`/`SegmentedControl` (see [[ds-layer-audit]]) but it's a THIRD, independent
hand-rolled instance, not routed through either fixed component. Contrast with `Community.tsx`'s
Wiki-access radiogroup (~1396) and `Onboarding.tsx`, which both use a shared local
`radioGroupKeyDown` helper (duplicated per-file, not centralized) — Settings.tsx's tool-preference
group has neither the helper nor its own equivalent.

**Verified NON-defects (don't re-chase):**
- `Seg` (`app/screen-kit.tsx` ~127) is properly fixed: roving tabIndex + Arrow/Home/End
  (`moveSelection`), and every one of the 7 call sites in this cluster passes the optional
  `ariaLabel` (the ds_layer_audit "regressed twice" pattern has NOT recurred here).
- All `<Input>`/`<Select>`/`<Textarea>` in this cluster carry `aria-label` or a paired `<label>` —
  an early grep suggested ~19 unlabeled fields but every one was a false positive from a regex that
  choked on `=>` inside `onChange` arrow functions; manual read confirmed all are labeled.
  **Gotcha for next reviewer:** don't regex-scan multiline JSX props across `=>`; read the block.
  scan JSX props across `=>` inside onChange; read the block instead.
- Only one raw hex color in the cluster (`Settings.tsx` ~1553, `#fff` for a QR quiet zone) and it's
  deliberately commented as an exception (scanners need true white regardless of theme) — not a
  token violation.
- `Upgrade.tsx`'s 4-column plan-comparison grid (~523/592, `1.7fr 1fr 1fr 1fr` with no phone branch)
  looks like a hard-coded desktop grid but is correctly wrapped in an `overflowX:'auto'` container
  with `minWidth:620` — it horizontal-scrolls on phone instead of crushing. Role table/row/columnheader/
  cell structure is complete.
- `Settings()` top-level shell (~4649) DOES have full phone handling: `useViewport()` drives a
  `<Select>` nav on phone vs the sticky rail nav on tablet/desktop. The 4700+ lines of subpage
  panels below it rely on `flexWrap`/`grid auto-fit` rather than explicit `isPhone` branches, which
  is consistent with the rest of the app's convention and not itself a defect — no fixed-width
  (`width:`) overflow risks found in this cluster via grep.
- `ConnectedSources.tsx` disconnect and lossy-push confirms are exemplary: real `Dialog` with
  `tone="danger"`/`"warning"`, honest irreversibility copy, per-item ack tokens re-checked server
  (core) side.

**New finding:** `ConnectedSources.tsx`'s per-source `statusBySource` result text (pull/push/connect
outcomes, e.g. "Imported 3 new…", error messages) renders as a plain `<div>` with no
`role="status"`/`aria-live` — at least 3 sites (~670-674, ~760-764, ~827-831). This is the
established pattern elsewhere in the SAME cluster (`Settings.tsx` has 5 `role="status"` regions,
`Community.tsx` has 3) but is entirely absent here, so a screen-reader user who pulls/pushes a
folder or Doc gets no announcement of success or failure.

See also [[ds-layer-audit]] (Tabs/radiogroup root causes), [[completion-pass-ux-patterns]] (destructive-op pattern), [[gm-react-ds]] (DS contracts).
