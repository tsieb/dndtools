---
name: widget-customize-flow
description: The two widget customize/properties panels, their spec-id mappings, and recurring UX anti-patterns in the data-driven customization flow
metadata:
  type: project
---

The unified widget platform exposes ONE declarative customization model (`WidgetConfigField` + style `tokens` + size, in `packages/core/src/state/widget-package-state.ts`) but renders it through TWO divergent GUI panels:

- **Scene route** (`apps/gm/src/routes/scene/[id]/+page.svelte`): `WidgetCustomizePanel.svelte` inside a modal `<Dialog>` ("Customize widget"). Stacked `<fieldset>/<legend>` groups (Content / Display / Style / Size). Text/textarea use `oninput` (per-keystroke dispatch of `scene.configure-widget`). Controls sized `--touch-target-min` (44px). Renders `field.help`.
- **Command Center home** (`apps/gm/src/routes/+page.svelte`): `CanvasPropertiesPanel.svelte` as a docked non-modal right overlay (280px), shown only `canvasMode.isEdit && selectedBlock`. Uses `role=tablist` tabs (Layout / Content / Display / Style). All controls use `onchange`. Controls sized `--touch-target-floor` (24px). Does NOT render `field.help`. The board + this panel only render on the NON-compact profile (`+page.svelte` ~line 1064 `!profile.isCompact`); compact/mobile uses a stacked focused-panel doc instead — so its 24px targets are desktop-only and compliant.

**Spec-id mapping for this flow:**
- The customize/settings panel = `UX-CANVAS-007` ("Settings panel", §4 + §6.6 "Widget settings").
- Position/size numeric inputs + aspect-ratio lock = `UX-CANVAS-003`. Properties-panel responsive form (right sidebar 240px desktop / bottom sheet 40% tablet) = spec 04 §7.1/§7.2.
- Tabs ARIA = `UX-A11Y-012`. Error association / color-independence / disabled-not-opacity-only = `UX-A11Y-007`. Target size = `UX-A11Y-010`. Consistency (one pattern per problem) = `UX-VIS` consistency rubric. Progressive disclosure / defaults = principle 4 + `UX-CMD-002`.

**Recurring anti-patterns found in this flow (check on future reviews):**
1. **Gray-swatch misrepresentation**: both panels render style tokens as `<input type=color>` with `?? COLOR_FALLBACK` (`#888888`). Default token values are CSS vars (`var(--color-accent)`), which a color input can't display, so an un-overridden token shows gray, not the real effective color. Feedback defect. (WidgetCustomizePanel.svelte:121, CanvasPropertiesPanel.svelte:199.)
2. **All tokens forced to color control**: the token model is generic (name/value/description, no control type) but the panels hardcode `type=color` — lossy for any non-color token.
3. **Tabs pattern incomplete** in CanvasPropertiesPanel: `role=tablist`/`tab`/`aria-selected` present but no `role=tabpanel`, no `aria-controls`/id wiring, no arrow-key nav (UX-A11Y-012 is Must-have).
4. **Commit-semantics divergence**: scene panel `oninput` (per-keystroke `scene.configure-widget` dispatch → undo/persistence churn) vs CC `onchange`.
5. `definition.description` is documented (schema comment) as "surfaced in the Customize panel" but neither panel renders it.

**Good (do not regress):** defaults are strong — `defaultWidgetStyle()` tokens reference theme vars so widgets blend in by default, and configField defaults are sensible, so users rarely need to open the panel. This satisfies the "complexity inside the interface, not complex flows" emphasis.

**A11Y-gate blind spot (durable insight):** the touch-target CI scan (spec 03 §A11Y-004, lines 659-667) runs against DEFAULT widget state. Any control that is `disabled` by default escapes the scan as a non-target. The per-token "Reset" buttons in both panels are `disabled={!overridden}` until a user overrides a token — so a too-small Reset (no `min-height`, ~16-20px, below the 24px hard floor) passes the green gate and only manifests once a token is customized. When auditing target sizes here, mentally enable the disabled-by-default controls. Same trap applies to any conditionally-enabled affordance.

**Numeric-commit asymmetry within WidgetCustomizePanel:** config `number` fields commit through `commitNumber` (clamped to field min/max); the Size Width/Height inputs commit through raw `onSize?.(Number(...))` with no clamp — `Number('')→0` can collapse the widget. CanvasPropertiesPanel's rect inputs use `commitRect` (validates min, shows inline error, won't commit). So the scene panel has one guarded and one unguarded numeric path side by side.

**Accent-foreground contrast is default-correct but customization-incomplete:** filled-accent text uses `var(--widget-accent-foreground, var(--color-accent-foreground))`, but `defaultWidgetStyle()` only declares `accent`+`text` tokens (no `accent-foreground`). A user can edit the `accent` token to a dark color via the panel, leaving the hardcoded dark `--color-accent-foreground` → dark-on-dark on the Roll/primary button. Reachable via supported customization, no token to fix it.

See also [[ux-requirements-map]] and [[widget-render-layer]].
