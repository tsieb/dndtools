/**
 * RC-UX-1.2 ratchet for `no-literal-jsx-text`.
 *
 * Each entry is a file that still renders untranslated user-visible text, and the number of
 * strings it is allowed to keep. The rule fails when a file exceeds its number *and* when it
 * comes in under it — a migrated screen has to lower or delete its entry in the same commit, so
 * this list can only ever get shorter.
 *
 * Adding a file here is not a way to land new untranslated copy. New screens carry no entry, so
 * the first literal they render fails the gate.
 */
export const allow = {
	'apps/gm-react/src/app/ConnectedSources.tsx': 31,
	'apps/gm-react/src/app/EncounterBuilder.tsx': 21,
	'apps/gm-react/src/app/SceneBoardCanvas.tsx': 3,
	'apps/gm-react/src/app/map/ImportMapDialog.tsx': 20,
	'apps/gm-react/src/app/map/MapEditor.tsx': 22,
	'apps/gm-react/src/app/map/ToolOptionsBar.tsx': 22,
	// Blocked on RC-STB-2.7, not on the migration: this file is a grandfathered file-size
	// exception sitting exactly at its 1079-line baseline, and the `useI18n` import plus the
	// hook call cost two lines the gate will not allow. It migrates once the file is split.
	'apps/gm-react/src/app/map/canvas/EditorCanvas.tsx': 4,
	'apps/gm-react/src/app/map/dock/AssetsPanel.tsx': 7,
	'apps/gm-react/src/app/map/dock/HistoryPanel.tsx': 7,
	'apps/gm-react/src/app/map/dock/InspectorPanel.tsx': 48,
	'apps/gm-react/src/app/map/dock/LayersPanel.tsx': 20,
	'apps/gm-react/src/app/map/generate/GeneratePanel.tsx': 19,
	'apps/gm-react/src/app/widget-bodies.tsx': 15,
	'apps/gm-react/src/screens/Board.tsx': 19,
	'apps/gm-react/src/screens/Campaign.tsx': 37,
	'apps/gm-react/src/screens/CommandCenter.tsx': 10,
	'apps/gm-react/src/screens/Graph.tsx': 18,
	'apps/gm-react/src/screens/Join.tsx': 15,
	'apps/gm-react/src/screens/SceneCardsPanel.tsx': 4,
	'apps/gm-react/src/screens/SceneDisplay.tsx': 2,
	'apps/gm-react/src/screens/ScenesCreator.tsx': 18,
	'apps/gm-react/src/screens/Upgrade.tsx': 25,
	'apps/gm-react/src/screens/WikiReader.tsx': 17,
};
