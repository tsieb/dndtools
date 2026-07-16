import { useEffect } from 'react';
import type { MapEditorApi } from './useMapEditor';
import { SHORTCUT_TO_TOOL, type ToolId } from './tools';

/**
 * MAP-021 — the editor keymap. Single-key tool shortcuts (the industry-standard V/B/E/… set),
 * `[`/`]` brush size, Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo, `+`/`−`/`0` zoom, Delete, Esc
 * (cancel → deselect → exit tool → close), `?` shortcut overlay, and Cmd/Ctrl+K for the command
 * palette. Arrow keys NUDGE the selected POI/token — the WCAG 2.5.7 non-drag alternative to dragging a
 * marker. Everything is ignored while a text field is focused, so typing a label never fires a tool.
 */
export function useMapKeyboard(
	editor: MapEditorApi,
	handlers: {
		onClose: () => void;
		openPalette: () => void;
		openHelp: () => void;
		announce: (message: string) => void;
		/** Android quick mode never lets a hidden precision tool be armed by a hardware keyboard. */
		isToolAllowed?: (tool: ToolId) => boolean;
		/** Escape returns to touch navigation before it leaves the fullscreen editor. */
		navigationTool?: ToolId;
	},
) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const typing = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
			const mod = e.ctrlKey || e.metaKey;

			// Command palette — works even while typing elsewhere is not desired, so require no text field.
			if (mod && (e.key === 'k' || e.key === 'K')) {
				e.preventDefault();
				handlers.openPalette();
				return;
			}
			// Undo / redo.
			if (mod && (e.key === 'z' || e.key === 'Z')) {
				e.preventDefault();
				if (e.shiftKey) void editor.redo();
				else void editor.undo();
				return;
			}
			if (mod && (e.key === 'y' || e.key === 'Y')) {
				e.preventDefault();
				void editor.redo();
				return;
			}

			if (typing) return; // never fire a tool/nudge while a field is focused

			// Shortcut overlay.
			if (e.key === '?') {
				e.preventDefault();
				handlers.openHelp();
				return;
			}

			// Zoom.
			if (e.key === '+' || e.key === '=') {
				e.preventDefault();
				editor.setZoom(Math.min(6, +(editor.zoom + 0.2).toFixed(2)));
				return;
			}
			if (e.key === '-' || e.key === '_') {
				e.preventDefault();
				editor.setZoom(Math.max(0.4, +(editor.zoom - 0.2).toFixed(2)));
				return;
			}
			if (e.key === '0') {
				e.preventDefault();
				editor.setZoom(1);
				editor.setCenter({ x: 0.5, y: 0.5 });
				return;
			}

			// Brush size.
			if (e.key === '[') {
				e.preventDefault();
				editor.setOption('brushSize', Math.max(5, editor.options.brushSize - 4));
				return;
			}
			if (e.key === ']') {
				e.preventDefault();
				editor.setOption('brushSize', Math.min(200, editor.options.brushSize + 4));
				return;
			}

			// Escape: cancel / deselect / exit tool → select. (Path tools consume their own Escape in the
			// canvas capture phase, so a half-drawn wall's Escape never reaches here.)
			if (e.key === 'Escape') {
				const navigationTool = handlers.navigationTool ?? 'select';
				if (editor.selection.length > 0) {
					editor.clearSelection();
					return;
				}
				if (editor.tool !== navigationTool) {
					editor.setTool(navigationTool);
					return;
				}
				handlers.onClose();
				return;
			}

			// Delete the selected POIs/tokens.
			if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selection.length > 0) {
				e.preventDefault();
				deleteSelection(editor, handlers.announce);
				return;
			}

			// Arrow-key nudge of the selected POI / token — the drag alternative.
			if (e.key.startsWith('Arrow') && editor.selection.length === 1) {
				const grid = editor.map?.overlay?.gridSize ?? 0;
				const base = grid > 0 ? 1 / grid : 0.01;
				const step = e.shiftKey ? base * 4 : base;
				const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
				const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
				if (dx === 0 && dy === 0) return;
				nudge(editor, dx, dy);
				e.preventDefault();
				return;
			}

			// Single-key tool shortcut.
			if (!mod && e.key.length === 1) {
				const toolId = SHORTCUT_TO_TOOL.get(e.key.toLowerCase());
				if (toolId && (handlers.isToolAllowed?.(toolId) ?? true)) {
					editor.setTool(toolId);
					e.preventDefault();
				}
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [editor, handlers]);
}

function nudge(editor: MapEditorApi, dx: number, dy: number) {
	const id = editor.selection[0]!;
	const poi = editor.map?.pois.find((p) => p.id === id);
	if (poi) {
		void editor.run({
			type: 'map.update-poi',
			actorId: editor.actorId,
			payload: {
				mapId: editor.mapId,
				poiId: id,
				position: { x: clamp(poi.position.x + dx), y: clamp(poi.position.y + dy) },
			},
		} as never);
		return;
	}
	const token = editor.map?.tokens.find((t) => t.id === id);
	if (token) {
		void editor.run({
			type: 'map.move-token',
			actorId: editor.actorId,
			payload: {
				mapId: editor.mapId,
				tokenId: id,
				position: { x: clamp(token.position.x + dx), y: clamp(token.position.y + dy) },
			},
		} as never);
	}
}

function deleteSelection(editor: MapEditorApi, announce: (m: string) => void) {
	const ids = editor.selection;
	for (const id of ids) {
		const poi = editor.map?.pois.find((p) => p.id === id);
		if (poi) {
			void editor.run({
				type: 'map.delete-poi',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, poiId: id },
			} as never);
			continue;
		}
		const token = editor.map?.tokens.find((t) => t.id === id);
		if (token)
			void editor.run({
				type: 'map.delete-token',
				actorId: editor.actorId,
				payload: { mapId: editor.mapId, tokenId: id },
			} as never);
	}
	editor.clearSelection();
	announce('Deleted selection.');
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
