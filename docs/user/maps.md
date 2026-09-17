# Maps

Give the table a place to stand, then reveal the world at the pace of the story.

## Choose and prepare a map

Open **Maps** and select a map from the map list. Use its layers to control what you see while preparing, and points of interest to mark places worth returning to. A point of interest can carry a label and notes so you do not have to keep everything in your head.

Use the fog controls to manage explored and concealed areas. Check the player view before sharing: your own editing view can contain information the table should not see yet. Layer visibility in your editor is not a substitute for checking what players receive.

## Put it before the players

With a live session ready, choose **Project to players**. Read the result message. Without a live session, the app refuses the projection; start the session and try again. When you change maps, check the selection before projecting the next one.

Use the session's map and combat controls together during an encounter. The **Running a session** guide covers going live, and **Remote play** covers connecting the people who will receive the view.

## Work on a smaller screen

On Android the map editor opens in a reduced, touch-first form: the canvas leads, every control is at least 48dp, and the precision drawing tools are absent. Existing geometry stays visible and is preserved; authoring it belongs on desktop. **More map actions → About advanced drawing** says so in the app. Navigation is the default; use two fingers to pan without drawing. Prepare detailed geometry on desktop, then carry the map to the table on the phone.

## Implementation references

Source review: 2026-09-12, repository baseline `b54cf4c7` (app 0.3.7). These are
local implementation and existing test references, not a claim that device, network,
or release-installation checks were run for this guide.

- [index.tsx](../../apps/gm-react/src/screens/atlas/index.tsx)
- [FogPanel.tsx](../../apps/gm-react/src/screens/atlas/FogPanel.tsx)
- [atlas.spec.ts](../../apps/gm-react/tests/e2e/atlas.spec.ts)
- [android-quick-map.spec.ts](../../apps/gm-react/tests/e2e/android-quick-map.spec.ts)
