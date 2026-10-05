# RC-WID-5.3 — Hub renderers and bare presentation

## Implementation — 2026-10-04

Started on the assigned task branch with a clean worktree. No Headroom tools are exposed;
validation output is retained in `/tmp/rc-wid53-*.log` and read directly.

- Added hero, card-grid, launcher and link-list to the persisted template enum and both renderer
  registries. Controls use the existing host intent resolver before render and again on activation.
- Presentation is a host instance configuration setting (`framed` by default), as title and visibility
  already are. The Layout step declares a Display select; package defaults, configure-widget,
  duplication, history and exports use the existing configuration persistence path.
- Bare view frames retain their label and native focus outline; editing restores frame chrome.
- Necessary companion edits outside ownership: public core exports, exhaustive builder preview and
  vocabulary maps, MCP template descriptions, translated labels and tests. No dispatcher state edits.

Validation and baseline comparison pending.

## Resume and validation — 2026-10-04

Previous session stopped at the provider allowance limit with the implementation uncommitted.

- Removed the Layout step's duplicate "Hub previews" template select; the Data step's existing
  Template kind picker already lists all four kinds and drives `BuilderPreview`. Layout now carries
  only the Presentation (framed/bare) control, with help text (en/es, qps-ploc regenerated).
- Bare frames failed axe color-contrast on a scene with a parchment surface: the frame is
  transparent, so dark-theme tertiary text sat on the light board. The bare frame now takes the
  board's `data-theme` (new optional `surfaceTheme` prop, passed by `SceneBoardCanvas` — a one-line
  crossing outside owned paths). The inner content keeps `role="group"`; only the frame becomes a
  labelled region, so bare widgets add one landmark, not two.
- Restored the WidgetFrame outline comment the first pass had trimmed; moved new imports next to the
  sibling template imports; raw `0` style values → `var(--space-0)` (raw-style ratchet); HubIntent
  takes an explicit `variant` so the emphasis lint sees the hero as the only gold primary.
- e2e: builder previews run on both profiles (narrow uses the Edit/Preview pane switch). The bare
  frame test is skipped on mobile: phones render scenes through PhoneNavigator, which never draws
  WidgetFrame chrome — bare is a canvas-frame presentation.

Evidence (local, logs in /tmp/rc-wid53-\*.log):

- `pnpm typecheck` 0; `pnpm lint` 0 (warnings only, pre-existing).
- `vitest --config vitest.app.config.ts` full: 163 files / 1921 tests passed; Hub.test 10/10 with
  16 snapshots (re-recorded after the token swap; keys unchanged, only inline style values moved).
- core `vitest run`: 284 files / 5184 tests passed.
- Playwright `hub-templates` + `widget-builder` + `canvas` + `canvas-keyboard` + `a11y-axe-gate`,
  desktop-chromium + mobile-chromium: 174 passed, 2 skipped (incl. the intentional mobile skip).
- The four CAN-7.5 aria-baseline specs (`state/RC-CAN-7.5/aria/aria-home-desktop.yaml` slices)
  pass on both profiles with axe clean, visible focus ring and hover.

## Claim gate follow-up — 2026-10-04

Gate flagged six paths outside the claim (base bad21178).

- `SceneBoardCanvas.tsx` — REVERTED to base. The bare frame now reads the scene surface's
  `data-theme` itself (layout effect on its own body node: closest `[data-background]` board →
  its `scene-background` child), so no prop crosses the claim. The bare axe check still passes.
- Kept, each required: `AddWidgetGallery.tsx`, `BuilderPreview.tsx`, `vocabulary.ts`,
  `WorkerHost.ts` hold `Record<WidgetTemplateKind, …>` maps; `mcp/tool-registry.ts` holds
  `Record<(typeof ALL_WIDGET_TEMPLATE_KINDS)[number], string>`. Reverting them to base with the owned
  union/list extended fails `pnpm typecheck` with TS2739 (missing hero/card-grid/launcher/link-list)
  in all five — logs /tmp/rc-wid53-revert-tc.log, /tmp/rc-wid53-revert-tc2.log. BuilderPreview and
  vocabulary (the Data step's template picker) are also how "the builder previews all four" is met.
  Dropping the kinds from `ALL_WIDGET_TEMPLATE_KINDS` to spare tool-registry would break that list's
  documented invariant (builder, schema and MCP tool name the same kinds).

Evidence after the change: `pnpm typecheck` 0, `pnpm lint` 0 (warnings only); widgets/builder/canvas
unit tests 536 passed; Playwright hub-templates + canvas + canvas-keyboard on both profiles: 95
passed, 1 skipped (intentional mobile skip of the bare-frame canvas test).

## Claim widened — 2026-10-05

Operator brief widened the claim to AddWidgetGallery, BuilderPreview, vocabulary, WorkerHost and
the MCP tool registry. Candidate unchanged (e33bd1c2 on base bad21178); every changed path is now
owned or a companion path (i18n catalogs, core index, e2e spec, this journal). No code edits.

Re-run on the candidate: `pnpm typecheck` 0; `pnpm lint` 0 (16 pre-existing warnings); app vitest
164 files / 1924 tests passed; core vitest 284 / 5184 passed; Playwright hub-templates +
widget-builder on desktop + mobile: 29 passed, 1 skipped (intentional mobile skip of the bare
canvas-frame test).

## Rebase onto 23d73c91 — 2026-10-05

Gate could not rebase the three commits (conflicts in SceneBoardCanvas, WidgetFrame, widget-package
schema). Squashed them first (net diff vs bad21178 has no SceneBoardCanvas change; old tip 59dc807d)
and rebased onto 23d73c91.

- `schemas/widget-package.ts`: import list — kept upstream `WIDGET_COMMAND_EXECUTORS` (RC-WID-6.1)
  alongside `ALL_WIDGET_TEMPLATE_KINDS`.
- `WidgetFrame.tsx`: took upstream (RC-CAN-8.1/8.3 lift, grip, context menu, bottom-left selection
  chip) and re-applied the bare edits by hand: presentation → `bare`, theme layout effect, outer
  `role` region when bare, body ref/transparent surface, rail + header rows behind `!bare`,
  selection chrome behind `!bare`. 774 lines (< 800 gate).
- AddWidgetGallery hit 804 lines on the new base (800-line hard gate). `Hub.tsx` now exports
  `HUB_TEMPLATES`, spread into the gallery, builder-preview and worker maps (gallery 796 lines).

Evidence on the rebased tree: `pnpm typecheck` 0; `pnpm lint` 0 (16 pre-existing warnings);
`pnpm gates` (quality-gates) 0; app vitest 167 files / 2013 tests; core vitest 286 / 5233;
Playwright hub-templates + widget-builder + canvas + canvas-keyboard + canvas-arrange +
custom-widgets on desktop + mobile: 136 passed, 2 skipped (incl. the intentional mobile skip).

## Format gate — 2026-10-05

`format:check:changed --base loop/rc` failed on this journal only (Prettier markdown wrapping).
Ran Prettier on it; the check now passes for all 22 changed files. No code changes.
