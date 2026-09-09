import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	getContentItemsForActor,
	type MapPoiView,
	type SceneVisibility,
} from '@dndtools/core';
import { POIPopover } from '../../../ds';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { POI_MARKER_CAT, dsToVis, visToDs } from '../mapVisibility';
import type { MapEditorApi } from '../useMapEditor';

/**
 * RC-MAP-3.10 — the map editor's POI popover: the marker's detail card, with the linked note's
 * opening lines and a "Read note" action that opens the note itself.
 *
 * Dismissal is the subtle part. `Popover` closes on ANY outside pointerdown, and closing used to
 * `clearSelection()` — so the DM's first click into the dock deselected the POI, the Inspector
 * snapped back to the map properties before the click landed, and no POI control in the dock was
 * pointer-operable at all. A POINTER dismissal now only puts the popover away; the selection is the
 * Inspector's input and survives. Escape and the header Close still clear it, keeping the editor's
 * documented "Escape deselects, then exits the tool" contract (`keyboard.ts:153`) exactly as it was.
 */

/** The opening three non-empty lines of a note body: what the popover previews, and no more. */
function notePreviewLines(body: string): string {
	return body
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.slice(0, 3)
		.join('\n');
}

/**
 * Dismissal state for the selected POI's popover. `dismissed` is reset whenever the selection moves,
 * and `byPointer` reports whether the CURRENT close came from a pointer: the flag is raised on window
 * capture (which runs before Popover's document-capture dismissal) and lowered on the next macrotask,
 * i.e. after the whole pointerdown dispatch and before any later keystroke can arrive. A microtask is
 * too early — the browser runs a checkpoint between listeners — and a timestamp window is worse: a
 * keypress inside it reads as a click.
 */
export function usePoiPopoverDismissal(selectedPoiId: string | null) {
	const [dismissed, setDismissed] = useState(false);
	useEffect(() => setDismissed(false), [selectedPoiId]);
	const inPointerDown = useRef(false);
	useEffect(() => {
		let timer = 0;
		const onDown = () => {
			inPointerDown.current = true;
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				inPointerDown.current = false;
			}, 0);
		};
		window.addEventListener('pointerdown', onDown, true);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener('pointerdown', onDown, true);
		};
	}, []);
	return { dismissed, dismiss: () => setDismissed(true), byPointer: inPointerDown };
}

export function EditorPoiPopover({
	editor,
	poi,
	anchor,
	placement,
	dismissal,
}: {
	editor: MapEditorApi;
	poi: MapPoiView;
	anchor: { x: string; y: string };
	placement: 'top' | 'bottom';
	dismissal: ReturnType<typeof usePoiPopoverDismissal>;
}) {
	const navigate = useNavigate();
	const runtime = useRuntime();
	const noteId = poi.linkedEntityType === CONTENT_ITEM_ENTITY_TYPE ? poi.linkedEntityId : null;
	// Read ACTOR-SCOPED: the preview shows only what the core already decided this actor may see, so
	// a player can never be handed a hidden note's opening lines through a POI.
	const note = useMemo(() => {
		if (noteId === null) return null;
		const item = getContentItemsForActor(
			runtime.state.content,
			runtime.state.permissions,
			editor.actorId,
		).find((candidate) => candidate.id === noteId);
		return item ? { title: item.title, preview: notePreviewLines(item.body) } : null;
	}, [runtime.state.content, runtime.state.permissions, editor.actorId, noteId]);

	return (
		<POIPopover
			poi={{
				name: poi.label,
				category: POI_MARKER_CAT[poi.category] ?? 'location',
				categoryLabel: poi.category,
				visibility: visToDs(poi.visibility),
				linkedNote: note?.title,
				notePreview: note?.preview,
			}}
			anchor={anchor}
			placement={placement}
			readOnly={!editor.isDm}
			onClose={() => {
				if (dismissal.byPointer.current) dismissal.dismiss();
				else editor.clearSelection();
			}}
			onVisibilityChange={(v: string) =>
				void editor.run({
					type: 'map.update-poi',
					actorId: editor.actorId,
					payload: {
						mapId: editor.mapId,
						poiId: poi.id,
						visibility: dsToVis(v) as SceneVisibility,
					},
				} as never)
			}
			onEdit={() => editor.setDock('inspector')}
			onFocus={() => editor.setDock('inspector')}
			onOpenNote={note === null ? undefined : () => navigate(`/knowledge/${noteId}`)}
		/>
	);
}
