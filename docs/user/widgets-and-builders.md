# Widgets & builders

Keep the tools you reach for close at hand. A widget is a tile on your GM screen or scene: a map, a note, a tracker, or another piece of the table.

## Arrange your screen

Open **GM screen** and use its widget library to add a tile. Choose a widget that fits the surface you are working on. Arrange and resize the tiles for your session, then set each tile's options. A widget that needs a character, map, or note must be connected to that content before it can show it.

If a tile says its content is missing or unavailable, check the selected content and who is allowed to see it. Giving someone a view of a tile does not automatically give them permission to change it. Keep GM-only tiles out of the player view and check the preview before presenting.

## Build a widget

Open **Extensions → Plugins → Build a widget**. Work through identity, layout, data, configuration, commands, and style, using the preview as you go. Review the result before installing. Start with a template for a tracker or information panel; use Advanced only when you intend to supply custom code.

## Review a package

Installation, trust review, and enabling are separate steps. Read the requested permissions before trusting a custom package. Approve only the capabilities you intend it to use; an omitted permission stays denied. An update asking for new permissions needs another review.

If a widget fails, its tile shows a diagnostic while the rest of the screen can keep working. Background widgets currently do not run in the packaged desktop shell. Use another widget for that job until the build supports it.

## Implementation references

Source review: 2026-09-12, repository baseline `b54cf4c7` (app 0.3.7). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [SceneBoardCanvas.tsx](../../apps/gm-react/src/app/SceneBoardCanvas.tsx)
- [WidgetBuilder.tsx](../../apps/gm-react/src/screens/extensions/WidgetBuilder.tsx)
- [widget-package.ts](../../packages/core/src/commands/widget-package.ts)
- [widget-builder.spec.ts](../../apps/gm-react/tests/e2e/widget-builder.spec.ts)
- [widget-trust-review.spec.ts](../../apps/gm-react/tests/e2e/widget-trust-review.spec.ts)

Additional source check: 2026-09-20, task baseline `45f59ee4` (app 0.3.7).

- [WorkerHost.ts](../../apps/gm-react/src/app/widgets/WorkerHost.ts)
