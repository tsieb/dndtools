---
name: widget-render-layer
description: Unified widget render path (WidgetView/templates/registry) — governing UX-* docs and recurring UX anti-patterns
metadata:
  type: reference
---

The unified widget render path lives in `apps/gm/src/lib/gui/ux-canvas/widgets/`:
`WidgetView.svelte` (single entry; resolves renderer + applies `--widget-*` style vars + fail-soft placeholder),
`widget-registry.ts` (template/builtin/custom resolution), `templates/Template*.svelte` (8 generic templates),
`AudioWidget.svelte`/`MapWidget.svelte` etc (builtin renderers), `CustomWidgetFrame.svelte` (sandboxed iframe).

Governing UX spec docs: `01-visual-design-system.md` (UX-VIS tokens/type/spacing/motion),
`03-accessibility.md` (UX-A11Y), `13-audio-atmosphere.md` (UX-AUDIO).

Recurring anti-patterns found here (verify still present before citing):
- **Missing `--widget-accent-foreground` token.** The adaptive `--widget-*` set has accent/text/surface/border
  but NO foreground-on-accent. Result: components hardcode `color: white` on `--widget-accent`/`--color-accent`
  (gold #d4a76a) → ~2.2:1 contrast, FAILS WCAG AA in the default dark Tavern theme. Seen in AudioWidget,
  TemplateActionPanel, and core's preview CSS (`packages/core/src/queries/widget-package-review.ts`). Spec token
  is `--color-accent-foreground` (#111418). A paired `--widget-accent-foreground` is the real fix.
- **Empty-state divergence across the 3 data-query templates.** `widget-data.ts` returns a contextual
  `emptyLabel` ("No scenes yet." etc). TemplateStatusList uses it; TemplateDataTable and TemplateChart both
  ignore it and hardcode their own ("No matching rows." / "No data to chart."). Three templates, three behaviors.
- **Inconsistent base font size:** data-table & tracker base at `--text-xs` (12px, below the UX-VIS-004 13px body
  floor for primary content); status-list/action-panel/stat-block/scene-message/form-panel base at `--text-sm`.
- Templates render headings as `<p>` (no semantic `<h*>`); widget title/chrome lives in the canvas frame, not the template.
