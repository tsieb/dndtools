import { GENERATORS } from '@dndtools/core/map-generators';
import { useMemo, type MutableRefObject } from 'react';
import { useI18n } from '../../i18n';
import { isQuickMapTool } from './quickMap';
import { TOOLS_BY_ID } from './tools';
import type { MapEditorApi } from './useMapEditor';
export function useMapEditorPalette({
	editor,
	quickMapMode,
	setPrimeGen,
	exportUvtt,
	setImportOpen,
	projectToPlayers,
	setHelpOpen,
	centerRef,
}: {
	editor: MapEditorApi;
	quickMapMode: boolean;
	setPrimeGen: (id: string) => void;
	exportUvtt: () => Promise<void>;
	setImportOpen: (open: boolean) => void;
	projectToPlayers: () => Promise<void>;
	setHelpOpen: (open: boolean) => void;
	centerRef: MutableRefObject<{ x: number; y: number }>;
}) {
	const { t } = useI18n();
	// ── command palette entries: tools · layers · generators · actions ────────────────────────────
	return useMemo(() => {
		const tools = [...TOOLS_BY_ID.values()]
			.filter((tool) => !quickMapMode || isQuickMapTool(tool.id))
			.map((tool) => ({
				id: `tool-${tool.id}`,
				label: t('mapEditor.palette.tool', { name: t(tool.label) }),
				group: t('mapEditor.palette.group.tools'),
				icon: tool.icon,
				shortcut: tool.shortcut ? tool.shortcut.toUpperCase() : undefined,
				keywords: t(tool.hint),
				run: () => editor.setTool(tool.id),
			}));
		const layerCmds = editor.layers.map((l) => ({
			id: `layer-${l.layerId}`,
			label: t('mapEditor.palette.layer', { name: l.name }),
			group: t('mapEditor.palette.group.layers'),
			icon: 'layers',
			run: () => {
				editor.setActiveLayerId(l.layerId);
				editor.setDock('layers');
			},
		}));
		const genCmds = GENERATORS.map((g) => ({
			id: `gen-${g.id}`,
			label: t('mapEditor.palette.generate', { name: g.label }),
			group: t('mapEditor.palette.group.generators'),
			icon: 'tool-generate',
			keywords: `${g.description} ${g.bestFor}`,
			run: () => {
				setPrimeGen(g.id);
				editor.setTool('generate');
			},
		}));
		const actions = [
			{
				id: 'act-undo',
				label: t('common.action.undo'),
				group: t('mapEditor.palette.group.actions'),
				icon: 'undo',
				shortcut: ['⌘', 'Z'],
				disabled: !editor.canUndo,
				run: () => void editor.undo(),
			},
			{
				id: 'act-redo',
				label: t('mapEditor.redo'),
				group: t('mapEditor.palette.group.actions'),
				icon: 'redo',
				disabled: !editor.canRedo,
				run: () => void editor.redo(),
			},
			{
				id: 'act-export',
				label: t('mapEditor.exportUvtt'),
				group: t('mapEditor.palette.group.actions'),
				icon: 'download',
				run: () => void exportUvtt(),
			},
			{
				id: 'act-import',
				label: t('mapEditor.palette.import'),
				group: t('mapEditor.palette.group.actions'),
				icon: 'import',
				run: () => setImportOpen(true),
			},
			{
				id: 'act-project',
				label: t('mapEditor.projectToPlayers'),
				group: t('mapEditor.palette.group.actions'),
				icon: 'visibility-players',
				run: () => void projectToPlayers(),
			},
			{
				id: 'act-help',
				label: t('mapEditor.shortcuts'),
				group: t('mapEditor.palette.group.actions'),
				icon: 'info',
				shortcut: '?',
				run: () => setHelpOpen(true),
			},
		];
		// RC-MAP-2.5 — the keyboard equivalent (WCAG 2.5.7 / guardrail #7) of the canvas's right-click
		// "Mark party here": no pointer position to anchor to from the keyboard, so it marks the
		// current viewport center — the same point the canvas is scrolled to look at.
		if (editor.isDm) {
			actions.push({
				id: 'act-mark-party',
				label: t('mapEditor.markPartyHere'),
				group: t('mapEditor.palette.group.actions'),
				icon: 'pin',
				run: () => void editor.markPartyHere(centerRef.current),
			});
		}
		return [...tools, ...layerCmds, ...genCmds, ...actions];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor.layers, editor.canUndo, editor.canRedo, quickMapMode]);
}
