# RC-POL-1.2 — Polish: GM Screen board

Run journal, attempt 1. Branch `dispatch/dndtools/5a54ee88b64a4c345673`, based on `74efcfe2`.
Scope: `screens/Board.tsx`, `screens/BoardLayoutsPanel.tsx`, `screens/board`, `screens/screen`,
`app/SceneBoardCanvas.tsx`, `app/SceneBoardModel.ts`, `app/board-helpers.ts`, `app/canvas`, plus
manifest companions (catalogs, pseudo catalog, e2e/visual specs and baselines, unit tests and
snapshots, lint allow-lists, FEATURE-GAPS, DEBT). No push, promotion, dispatcher-state change or
additional agent. Raw logs stay in `/tmp/pol12/` and are summarised here.

## Starting point (measured on `74efcfe2`)

- Owned `.tsx` over the 500-line target (`pnpm gates` warns): `screens/Board.tsx` 800,
  `app/SceneBoardCanvas.tsx` 791, `app/canvas/PhoneNavigator.tsx` 796, `WidgetFrame.tsx` 789,
  `TileActionMenu.tsx` 789, `AddWidgetGallery.tsx` 771, `FlowBoard.tsx` 763, `StackedBoard.tsx` 570,
  `TemplatePicker.tsx` 544, `WidgetFrame.test.tsx` 590, `useLayoutHistory.test.tsx` 637.
  Owned `.ts` over 500 (not counted by the gate, but the story says every file):
  `app/board-helpers.ts` 818, `app/canvas/useLayoutHistory.ts` 538.
- Raw-style allowances: `WidgetFrame.tsx` 6, `ZoomCluster.tsx` 2, `Board.tsx` 3,
  `BoardLayoutsPanel.tsx` 2. Literal-JSX-text allowance: `FlowBoard.tsx` 2.
- Visual: `board--{tavern,parchment,high-contrast}` × 3 tiers and `board-layouts-panel` × 3 tiers;
  no Scholar/Dungeon coverage. Budget 37,681.4 / 37,888 KiB.

## Progress log

- (in progress)
