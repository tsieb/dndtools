# Widgets & builders

Keep the tools you reach for close at hand. A widget is a tile on your GM screen or scene: a map, a note, a tracker, or another piece of the table.

## Arrange your screen

Open **GM screen** and use its widget library to add a tile. Choose a widget that fits the surface you are working on. Arrange and resize the tiles for your session, then set each tile's options. A widget that needs a character, map, or note must be connected to that content before it can show it.

<!-- keyboard -->

With a keyboard, press A on a screen in edit mode to add a widget, and ? for the canvas keys. The **Screens** guide lists them.

<!-- touch -->

On a phone, choose **Edit layout**, then **Add**, and pick a widget from the library. Each tile's actions menu moves, resizes, configures or removes it.

If a tile says its content is missing or unavailable, check the selected content and who is allowed to see it. Giving someone a view of a tile does not automatically give them permission to change it. Keep GM-only tiles out of the player view and check the preview before presenting.

## Build a widget

There are two tracks, and both make the same editable widget package.

**Quick** opens from the Command Center’s **New widget** or the screen gallery’s **Build your own**. It stays on your screen and asks three questions:

1. **What is it?** Choose Party list, Counter or clock, Table of things, Note for the table, Buttons, Stat block, Chart, or Form.
2. **Show what?** Pick the characters or other data, a note, the number and range, or buttons. The preview uses your vault. A note copies its current text into the message; later edits to the source note do not change that copy.
3. **Done.** Keep the suggested name or change it, choose **Players can see this**, then **Add to screen**. Player visibility respects the underlying data permissions. Party lists and counters work in Standby, without starting a session. Use the counter’s **Configure…** menu to change its count or range.

**More options** continues in the Full builder at the relevant step, keeping everything you have entered. Exporting and importing a Quick widget uses the same package format as Full.

**Full** opens from **Extensions → Plugins → Build a widget**. Work through identity, layout, data, configuration, commands, and style, using the preview as you go. Review the result before installing. Start with a template for a tracker or information panel; use Advanced only when you intend to supply custom code.

The keyboard works throughout: Tab reaches every recipe and control; Enter chooses a recipe or advances. Escape offers to keep or discard an unfinished draft. A kept draft resumes in Full.

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

Quick track source check: 2026-10-08, task base `9752d983`.

- [QuickBuilder.tsx](../../apps/gm-react/src/app/widgetBuilder/QuickBuilder.tsx)
- [quickRecipes.ts](../../apps/gm-react/src/app/widgetBuilder/quickRecipes.ts)
- [widget-quick-builder.spec.ts](../../apps/gm-react/tests/e2e/widget-quick-builder.spec.ts)
