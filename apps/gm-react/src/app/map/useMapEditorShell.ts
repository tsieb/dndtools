import { exportUvttJson, getMapBreadcrumbForActor } from '@dndtools/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { registerBackHandler } from '../../platform/backNavigation';
import { usePlatformCapabilities } from '../../platform/capabilities';
import { exportFile, FileExportError } from '../../platform/download';
import { isolateModalSiblings } from '../../platform/modalIsolation';
import { useRuntime } from '../../runtime/RuntimeContext';
import { pickRasterAssetId } from '../mapGeometry';
import { useViewport, useViewportHeight } from '../useViewport';
import { type GenPreview } from './generate/GeneratePanel';
import { useMapKeyboard } from './keyboard';
import { isQuickMapTool, normalizeQuickMapTool } from './quickMap';
import { type ToolId } from './tools';
import { useMapEditor, type FogMode } from './useMapEditor';
import { useMapEditorPalette } from './useMapEditorPalette';
export function useMapEditorShell({
	mapId,
	initialTool = 'select',
	initialFogMode = 'reveal',
	onClose,
	onNavigateToMap,
}: {
	mapId: string;
	initialTool?: ToolId;
	initialFogMode?: FogMode;
	onClose: () => void;
	/** RC-MAP-3.8 — drill to a different map (a breadcrumb ancestor, or a `map-link` POI) without
	 * leaving the editor. Optional: a caller that only ever opens one map at a time can omit it, and
	 * the breadcrumb then shows the current map's name alone, same as before this story. */
	onNavigateToMap?: (mapId: string) => void;
}) {
	const { t } = useI18n();
	const capabilities = usePlatformCapabilities();
	const quickMapMode = capabilities.quickMapMode;
	const editor = useMapEditor(
		mapId,
		quickMapMode
			? initialTool === 'select'
				? 'pan'
				: normalizeQuickMapTool(initialTool)
			: initialTool,
	);
	const runtime = useRuntime();
	const { tool: activeTool, setTool, selection } = editor;
	// RC-MAP-2.5 — the palette's "Mark party here" reads the LIVE viewport center, not the one
	// baked into the palette-items memo (which does not depend on `editor.center` so it is not
	// rebuilt on every pan/zoom).
	const centerRef = useRef(editor.center);
	centerRef.current = editor.center;
	const viewport = useViewport();
	const viewportHeight = useViewportHeight();
	const isPhone = viewport === 'phone';
	const compactHeader = viewport !== 'desktop';

	const [preview, setPreview] = useState<GenPreview | null>(null);
	const [announcement, setAnnouncement] = useState('');
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [helpOpen, setHelpOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);
	const exportTriggerRef = useRef<HTMLSpanElement>(null);
	const [mobileDock, setMobileDock] = useState(false);
	// RC-MAP-4.1 — the canvas well shows either the drawing surface or the accessible inventory. It is
	// a swap, not an overlay: two views of the same map are two `role="application"`/table readings of
	// the same content, and leaving both mounted would make a screen reader walk the map twice.
	const [listView, setListView] = useState(false);
	// `projectToPlayers` does not go through `editor.run`, so `editor.busy` never latched for it and
	// the button's own `disabled` was decorative — a double-click projected twice.
	const [projecting, setProjecting] = useState(false);
	// AssetsPanel is one of four dock TABS, so it unmounts on every tab change. Its Recents and
	// Favorites lists therefore have to live out here or they wipe each time you glance at Layers.
	const [assetRecent, setAssetRecent] = useState<string[]>([]);
	const [assetFavorites, setAssetFavorites] = useState<string[]>([]);
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
	const [primeGen, setPrimeGen] = useState<string | undefined>(undefined);
	const [quickSheetHeight, setQuickSheetHeight] = useState(() =>
		Math.max(240, Math.round(viewportHeight * 0.56)),
	);
	const sheetResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(
		() =>
			registerBackHandler('fullscreen', () => {
				if (quickMapMode && activeTool !== 'pan') {
					setPreview(null);
					setTool('pan');
					return true;
				}
				onCloseRef.current();
				return true;
			}),
		[quickMapMode, activeTool, setTool],
	);

	const announce = useCallback((message: string) => {
		// Toggle a trailing space so an identical consecutive message still re-announces.
		setAnnouncement((prev) =>
			prev === message ? message + String.fromCharCode(32) + String.fromCharCode(8203) : message,
		);
	}, []);

	// Seed the fog mode the fog tool starts in (Atlas's Conceal shortcut opens straight into conceal).
	const seededFog = useRef(false);
	useEffect(() => {
		if (seededFog.current) return;
		seededFog.current = true;
		editor.setOption('fogMode', initialFogMode);
	}, [editor, initialFogMode]);

	// The editor keymap is a `document`-level listener, so while the command palette, the shortcut
	// overlay or the import/export dialogs were up, `v`/`b`/`[`/`0` still armed tools and moved the
	// viewport BEHIND them — and Escape raced the dialog's own handler. A dialog owns the keyboard.
	const dialogUp = paletteOpen || helpOpen || importOpen || exportOpen;
	useMapKeyboard(editor, {
		suspended: dialogUp,
		onClose,
		openPalette: () => {
			if (!quickMapMode) setPaletteOpen(true);
		},
		openHelp: () => setHelpOpen(true),
		announce,
		...(quickMapMode ? { isToolAllowed: isQuickMapTool, navigationTool: 'pan' as const } : {}),
	});

	// Quick map has no side dock, so a selection (or arming Generate) raises the bottom sheet that
	// stands in for it — on the TRANSITION only. Re-asserting it on every render where a selection
	// merely exists put the sheet back up the moment the DM changed tool with a marker still
	// selected: the sheet they had just closed sprang back, and its scrim — a modal layer above the
	// editor — swallowed the next press on the canvas, so the marker could not be dragged at all.
	const dockTrigger = useRef({ selected: false, generating: false });
	useEffect(() => {
		if (!quickMapMode) return;
		if (!isQuickMapTool(activeTool)) setTool('pan');
		const now = { selected: selection.length > 0, generating: activeTool === 'generate' };
		const was = dockTrigger.current;
		if ((now.selected && !was.selected) || (now.generating && !was.generating)) setMobileDock(true);
		dockTrigger.current = now;
	}, [quickMapMode, activeTool, selection.length, setTool]);

	useEffect(() => {
		if (!quickMapMode) return;
		setQuickSheetHeight((height) =>
			Math.min(Math.max(260, Math.round(viewportHeight * 0.82)), Math.max(220, height)),
		);
	}, [quickMapMode, viewportHeight]);

	// Focus containment (dialog semantics): focus the shell on open, restore the opener on close.
	useEffect(() => {
		const opener = document.activeElement as HTMLElement | null;
		const root = rootRef.current;
		const restoreIsolation = root ? isolateModalSiblings(root) : () => {};
		root?.focus();
		return () => {
			restoreIsolation();
			opener?.focus?.();
		};
	}, []);

	// aria-modal Tab trap — keep Tab inside the shell (AppShell stays mounted underneath). Open
	// dialogs/palette/sheets own their own Tab cycle, so skip the trap while one is up.
	const overlayUp = dialogUp || ((quickMapMode || isPhone) && mobileDock);
	useEffect(() => {
		if (overlayUp) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Tab') return;
			const root = rootRef.current;
			if (!root) return;
			const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
				(n) => n.offsetParent !== null,
			);
			if (nodes.length === 0) {
				e.preventDefault();
				root.focus();
				return;
			}
			const first = nodes[0]!;
			const last = nodes[nodes.length - 1]!;
			const active = document.activeElement;
			if (e.shiftKey && (active === first || active === root)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			} else if (active instanceof HTMLElement && !root.contains(active)) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [overlayUp]);

	const rasterAssetId = useMemo(() => {
		const entity = runtime.state.maps.maps[mapId];
		return entity ? pickRasterAssetId(entity.assetIds, runtime.state.maps.assets) : null;
	}, [runtime.state.maps, mapId]);

	const activeLayerName = useMemo(() => {
		const id = editor.activeLayerId;
		return editor.layers.find((l) => l.layerId === id)?.name ?? editor.layers[0]?.name ?? null;
	}, [editor.activeLayerId, editor.layers]);

	// RC-MAP-3.8 — the full nesting ancestry for the breadcrumb (root-first). Falls back to just this
	// map's name when the map is unavailable (should not happen while the editor has it open) so the
	// header never renders an empty trail.
	const breadcrumb = useMemo(() => {
		const result = getMapBreadcrumbForActor(
			runtime.state.maps,
			runtime.state.permissions,
			editor.actorId,
			mapId,
		);
		return result.kind === 'available'
			? result.crumbs
			: [{ mapId, name: editor.map?.name ?? mapId }];
	}, [runtime.state.maps, runtime.state.permissions, editor.actorId, mapId, editor.map?.name]);

	async function exportUvtt() {
		const entity = runtime.state.maps.maps[mapId];
		if (!entity) return;
		const blob = new Blob([exportUvttJson(entity)], { type: 'application/json' });
		const filename = `${(editor.map?.name ?? 'map').replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'map'}.dd2vtt`;
		try {
			const result = await exportFile({
				filename,
				blob,
				title: t('mapEditor.exportTitle', { name: editor.map?.name ?? '' }),
			});
			announce(
				result.status === 'cancelled'
					? t('mapEditor.exportCancelled')
					: quickMapMode
						? t('mapEditor.exportShared')
						: t('mapEditor.exported'),
			);
			// Export is not a command, so `editor.run`'s notice-clearing never applied to it — a failed
			// export left its warning banner standing over every later SUCCESSFUL one.
			editor.setNotice(null);
			setExportOpen(false);
		} catch (error) {
			// …and the popover stayed open on failure, covering the very notice this writes.
			setExportOpen(false);
			editor.setNotice(
				error instanceof FileExportError ? error.message : t('mapEditor.exportFailed'),
			);
		}
	}

	async function projectToPlayers() {
		const players = Object.values(runtime.state.permissions.actors).filter(
			(a) => a.role === 'player',
		);
		if (players.length === 0) {
			editor.setNotice(t('atlas.noPlayers'));
			return;
		}
		// These were the last two bare dispatches in the editor. `runtime.dispatch` THROWS while
		// previewing (PREVIEW_READONLY_MESSAGE) and rethrows on a persist failure, and this button
		// renders regardless of preview state — so Project used to do nothing at all, print nothing,
		// and leave an unhandled rejection. It also bypasses `editor.run`, so the `disabled={busy}`
		// on the button was dead and a double-click fired the projection twice; `projecting` is the
		// real latch.
		if (projecting) return;
		setProjecting(true);
		try {
			const staged = await runtime.dispatch({
				type: 'session.set-active-map',
				actorId: editor.actorId,
				payload: { mapId },
			} as never);
			if (staged.status !== 'accepted') {
				editor.setNotice(staged.rejection.message);
				return;
			}
			const projected = await runtime.dispatch({
				type: 'session.project-active-map',
				actorId: editor.actorId,
				payload: { playerActorIds: players.map((p) => p.id) },
			} as never);
			if (projected.status === 'accepted') {
				announce(t('mapEditor.projectAnnounced', { count: players.length }));
				editor.setNotice(
					t('atlas.projected', { name: editor.map?.name ?? '', count: players.length }),
					'success',
				);
			} else {
				editor.setNotice(projected.rejection.message);
			}
		} catch (err) {
			editor.setNotice(err instanceof Error ? err.message : t('mapEditor.projectFailed'));
		} finally {
			setProjecting(false);
		}
	}

	const paletteCommands = useMapEditorPalette({
		editor,
		quickMapMode,
		setPrimeGen,
		exportUvtt,
		setImportOpen,
		projectToPlayers,
		setHelpOpen,
		centerRef,
	});

	return {
		mapId,
		onClose,
		onNavigateToMap,
		t,
		quickMapMode,
		editor,
		viewportHeight,
		isPhone,
		compactHeader,
		preview,
		setPreview,
		announcement,
		paletteOpen,
		setPaletteOpen,
		helpOpen,
		setHelpOpen,
		importOpen,
		setImportOpen,
		exportOpen,
		setExportOpen,
		exportTriggerRef,
		mobileDock,
		setMobileDock,
		listView,
		setListView,
		projecting,
		assetRecent,
		setAssetRecent,
		assetFavorites,
		setAssetFavorites,
		cursor,
		setCursor,
		primeGen,
		quickSheetHeight,
		setQuickSheetHeight,
		sheetResizeRef,
		rootRef,
		announce,
		rasterAssetId,
		activeLayerName,
		breadcrumb,
		exportUvtt,
		projectToPlayers,
		paletteCommands,
	};
}

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
