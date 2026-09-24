import { useSessionSelection } from '../../session/SessionSelection';
import { useCombatTokens } from '../canvas/useCombatTokens';
import type { MapEditorApi } from '../useMapEditor';
import { CombatantInspector, MultiInspector } from './InspectorSections';
import { MapInspector } from './MapInspector';
import { PoiInspector, TokenInspector } from './MarkerInspectors';

/**
 * MAP-021 — the Inspector: parameters of the NOUN. It is selection-driven and mutates existing content.
 * EMPTY selection ⇒ the map/scene properties (name, description, scale, projection, grid/overlay), a
 * UVTT export, and a derive-features action. One POI / token ⇒ that object's editable fields. Multiple
 * ⇒ bulk visibility + delete.
 */
export function InspectorPanel({
	editor,
	announce,
}: {
	editor: MapEditorApi;
	announce: (message: string) => void;
}) {
	const selected = editor.selection;
	const pois = editor.map?.pois ?? [];
	const tokens = editor.map?.tokens ?? [];
	// RC-MAP-2.1 — the shared combatant selection. Both hooks run unconditionally (rules of hooks); a
	// combatant only takes the panel when NO map object is selected, so selecting a POI never yanks the
	// Inspector away from the object the DM is editing.
	const combat = useCombatTokens(editor.mapId, editor.actorId);
	const { selectedCombatantId, selectCombatant } = useSessionSelection();

	if (selected.length === 1) {
		const poi = pois.find((p) => p.id === selected[0]);
		if (poi) return <PoiInspector editor={editor} poi={poi} announce={announce} />;
		const token = tokens.find((t) => t.id === selected[0]);
		if (token) return <TokenInspector editor={editor} token={token} announce={announce} />;
	}
	if (selected.length > 1) {
		return <MultiInspector editor={editor} announce={announce} />;
	}
	if (selected.length === 0 && combat.running && selectedCombatantId) {
		const row = combat.roster.find((entry) => entry.combatantId === selectedCombatantId);
		// A stale id (combat ended, the combatant was removed) degrades to "nothing selected" rather
		// than to a panel about a creature that is no longer there.
		if (row) {
			const token = combat.tokens.find((entry) => entry.combatantId === selectedCombatantId);
			return (
				<CombatantInspector
					row={row}
					position={token?.position ?? null}
					onClear={() => selectCombatant(null)}
				/>
			);
		}
	}
	return (
		<MapInspector
			editor={editor}
			announce={announce}
			combatRoster={combat.running ? combat : null}
			selectedCombatantId={selectedCombatantId}
			onSelectCombatant={selectCombatant}
		/>
	);
}
