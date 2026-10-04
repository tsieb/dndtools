# Screens

A screen is a workspace for running the table: the widgets you want in reach, laid out the way you like them.

## Open and switch screens

**Command Center** and the **GM screen** are screens, and **Screens** lists every one you can open. Pin the screens you use most so they sort first, and search by name, description or tag. Each card's menu renames, duplicates or deletes its screen; a deleted screen can be restored from the message that follows.

To start a new workspace, choose **New screen**, pick a template such as **Combat scene**, **Prep** or **Blank**, and give it a name. You can change everything later. Inside a screen, **Switch screen** in its header moves to another without going back to the list.

## Arrange the widgets

Choose **Edit layout**, then **Add** to place a widget from the library. Move and resize tiles until the screen suits the evening, and choose **Done** when you are finished. On the GM screen, **Layouts** saves the current arrangement under a name, applies a saved one, or restores the layout you had before.

<!-- keyboard -->

With a keyboard, Tab reaches the canvas and the arrow keys move between widgets. Enter opens the focused widget. While editing, Space picks a widget up so the arrow keys move it, Shift with the arrow keys resizes it, Delete removes it, and Ctrl+Z (⌘Z on a Mac) undoes the last change. Press ? for the full list.

<!-- touch -->

On a phone, a screen opens as a **List** of its widgets so each one is full width; switch to **Layout** to see them in place, and use **Jump to tile** to go straight to one. **Edit layout** works here too: each tile's actions menu moves, resizes, duplicates or removes it.

A widget that needs a character, map or note shows what is missing until you connect it. The **Widgets & builders** guide covers building your own.

## Implementation references

Source review: 2026-10-04, repository baseline `9a7b675d` (app 0.3.7, RC-UX-6.6). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [ScreenView.tsx](../../apps/gm-react/src/screens/screen/ScreenView.tsx)
- [Board.tsx](../../apps/gm-react/src/screens/Board.tsx)
- [PhoneNavigator.tsx](../../apps/gm-react/src/app/canvas/PhoneNavigator.tsx)
- [registry.ts](../../apps/gm-react/src/app/shortcuts/registry.ts)
