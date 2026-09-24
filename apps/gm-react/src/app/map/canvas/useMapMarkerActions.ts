import type { MapFogRegion } from '@dndtools/core';
import { useCallback } from 'react';
import type { MapEditorApi } from '../useMapEditor';
import type { Pt } from './editorCanvasTypes';
import { useCombatTemplates } from './useCombatTemplates';
export function useMapMarkerActions(
	editor: MapEditorApi,
	activeId: string | null,
	fogLayerId: string | null,
	announce: (message: string) => void,
	quickMapMode: boolean,
) {
	const { tool, options, t } = editor;
	const handleSelectPoi = useCallback(
		(id: string | null) => {
			editor.setSelection(id ? [id] : []);
			if (id) editor.setDock('inspector');
		},
		[editor],
	);
	const handleSelectToken = useCallback(
		(id: string | null) => {
			editor.setSelection(id ? [id] : []);
			if (id) editor.setDock('inspector');
		},
		[editor],
	);
	const handlePlace = useCallback(
		(pos: Pt) => {
			if (tool === 'poi') {
				const id = editor.nextId('poi');
				void editor
					.run({
						type: 'map.create-poi',
						actorId: editor.actorId,
						payload: {
							mapId: editor.mapId,
							id,
							layerId: activeId,
							label: t('mapEdit.newPoi'),
							category: 'landmark',
							position: pos,
							visibility: options.newVisibility,
						},
					} as never)
					.then((accepted) => {
						if (!accepted) return;
						editor.setSelection([id]);
						editor.setDock('inspector');
						announce(t('mapEdit.poiPlaced'));
						if (quickMapMode) editor.setTool('pan');
					});
			} else if (tool === 'token') {
				const id = editor.nextId('token');
				void editor
					.run({
						type: 'map.create-token',
						actorId: editor.actorId,
						payload: {
							mapId: editor.mapId,
							id,
							layerId: activeId,
							label: t('mapEdit.newToken', { count: (editor.map?.tokens.length ?? 0) + 1 }),
							linkedActorId: null,
							position: pos,
							size: 1,
							visibility: options.newVisibility,
							controllerActorId: null,
						},
					} as never)
					.then((accepted) => {
						if (!accepted) return;
						editor.setSelection([id]);
						editor.setDock('inspector');
						announce(t('mapEdit.tokenPlaced'));
						if (quickMapMode) editor.setTool('pan');
					});
			}
		},
		[tool, editor, activeId, options.newVisibility, announce, quickMapMode, t],
	);
	const handleFog = useCallback(
		(region: MapFogRegion) => {
			if (!fogLayerId) return;
			void editor
				.run({
					type: 'map.append-fog',
					actorId: editor.actorId,
					payload: {
						mapId: editor.mapId,
						id: editor.nextId('fog'),
						layerId: fogLayerId,
						kind: options.fogMode,
						region,
						...(options.fogFeather > 0 ? { feather: Math.min(0.2, options.fogFeather) } : {}),
						visibility: 'shared',
						connectionState: 'connected',
					},
				} as never)
				.then((accepted) => {
					if (!accepted) return;
					announce(
						options.fogMode === 'reveal' ? t('mapEdit.fogRevealed') : t('mapEdit.fogConcealed'),
					);
					if (quickMapMode) editor.setTool('pan');
				});
		},
		[fogLayerId, editor, options.fogMode, options.fogFeather, announce, quickMapMode, t],
	);
	// RC-MAP-2.1 — the running combat's tokens. `undoable: false`: moving a creature mid-fight is a
	// live-play act in the SESSION slice, not a map edit, and it must never land on the editor's local
	// map undo stack where Ctrl+Z would teleport a combatant back mid-turn.
	// RC-MAP-2.2 — one read serves both combat layers: the tokens AND the areas of effect standing on
	// this map, so the token layer and the range/AoE layer never run the actor-scoped queries twice.
	const combatModel = useCombatTemplates(editor.mapId, editor.actorId);
	const combat = combatModel.combat;
	const moveCombatToken = useCallback(
		(combatantId: string, position: Pt) =>
			editor.run(
				{
					type: 'combat.move-token',
					actorId: editor.actorId,
					payload: { combatantId, x: position.x, y: position.y },
				} as never,
				{ undoable: false },
			),
		[editor],
	);

	// Selecting a combatant hands the Inspector over to it, so the map's own object selection steps
	// aside — two selections showing at once is how a DM edits the wrong noun.
	const onSelectCombatant = useCallback(
		(combatantId: string | null) => {
			if (!combatantId) return;
			editor.setSelection([]);
			editor.setDock('inspector');
		},
		[editor],
	);

	const handleMovePoi = useCallback(
		(poiId: string, position: Pt) =>
			void editor.run({
				type: 'map.update-poi',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, poiId, position },
			} as never),
		[editor],
	);
	const handleMoveToken = useCallback(
		(tokenId: string, position: Pt) =>
			void editor.run({
				type: 'map.move-token',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, tokenId, position },
			} as never),
		[editor],
	);
	return {
		handleSelectPoi,
		handleSelectToken,
		handlePlace,
		handleFog,
		combatModel,
		combat,
		moveCombatToken,
		onSelectCombatant,
		handleMovePoi,
		handleMoveToken,
	};
}
