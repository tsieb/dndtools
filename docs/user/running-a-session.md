# Running a session

Set the table before you bring it live. A little preparation leaves more room for the unexpected.

## Prepare the evening

Open **Session**. Gather your characters, map, and handouts before presenting anything to players.

The session controls distinguish preparation, preview, and live play. Preview lets you inspect what you are about to show. Dice, rollable tables, combat and handouts all work before the session starts: a roll made then stays in the roll history, marked "Outside a session", and is left out of the session log and recap. When ready, choose **Start session** to open the start dialog. Continue the current session, or choose **New session**, select a scene, and optionally name the evening. Confirm **Start session** in the dialog. Starting the session starts the log, the clock and the automations. If an action is unavailable, check its explanation and make sure you have left any player-view preview before trying a GM action.

## Keep play moving

Use the combat tracker for combatants, turns, hit points, and conditions. The active system supplies the available conditions and rules. Use the dice tray for rolls, and the handout controls when you are ready to share a note. Keep private preparation on your own screen; use the projection controls for the table display.

<!-- keyboard -->

With a keyboard, Ctrl+→ (⌘→ on a Mac) shows players the next queued scene card, and Ctrl+Shift+S (⌘⇧S) enters or leaves the fullscreen scene display.

<!-- touch -->

On a phone, **Start session**, **Host** and the projection controls are in **Table controls**, the button at the right of the top bar. The strip above the tab bar shows how long the session has been running.

A live session and a network connection are separate things. Use **Host** to connect other devices; the **Remote play** guide walks through approval and joining. Starting a session does not by itself bring players online.

## Close the evening

Use **End session** when you are finished. The confirmation offers ending directly or ending and reviewing the recap. Review the recap on the Session screen while the evening is fresh. Ending combat is a separate action from ending the session.

If a command is refused, read the message before repeating it. A selected map or a visible button does not mean a projection succeeded; wait for the app's result.

## Implementation references

Source review: 2026-09-12, repository baseline `b54cf4c7` (app 0.3.7). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [Lifecycle.tsx](../../apps/gm-react/src/screens/session/Lifecycle.tsx)
- [index.tsx](../../apps/gm-react/src/screens/session/index.tsx)
- [session-lifecycle.spec.ts](../../apps/gm-react/tests/e2e/session-lifecycle.spec.ts)
