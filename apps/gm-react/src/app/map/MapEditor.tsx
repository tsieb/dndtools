import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GENERATORS, exportUvttJson } from '@dndtools/core';
import {
	Button,
	CommandPalette,
	Icon,
	IconButton,
	Popover,
	Sheet,
	Tabs,
	tabPanelProps,
	VisibilityChip,
} from '../../ds';
import { T } from '../screen-kit';
import { useViewport, useViewportHeight } from '../useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { ImportMapDialog } from './ImportMapDialog';
import { VIS_CHIP } from './mapVisibility';
import { useMapEditor, type FogMode, type MapNoticeTone } from './useMapEditor';
import type { ToolId } from './tools';
import { TOOLS_BY_ID } from './tools';
import { useI18n } from '../../i18n';
import { useMapKeyboard } from './keyboard';
import { ToolRail } from './ToolRail';
import { ToolOptionsBar } from './ToolOptionsBar';
import { StatusBar } from './StatusBar';
import { InspectorPanel } from './dock/InspectorPanel';
import { LayersPanel } from './dock/LayersPanel';
import { AssetsPanel } from './dock/AssetsPanel';
import { HistoryPanel } from './dock/HistoryPanel';
import { HeaderMenuItem, QuickToolStrip, ShortcutOverlay } from './MapEditorChrome';

/** A11Y-011: severity must survive grayscale, so each notice tone gets a DISTINCT glyph shape. */
const NOTICE_ICON: Record<MapNoticeTone, string> = {
	warning: 'warning',
	success: 'check',
	info: 'info',
};
import { GeneratePanel, type GenPreview } from './generate/GeneratePanel';
import { EditorCanvas } from './canvas/EditorCanvas';
import { pickRasterAssetId } from '../mapGeometry';
import { usePlatformCapabilities } from '../../platform/capabilities';
import { registerBackHandler } from '../../platform/backNavigation';
import { QuickMapRail } from './QuickMapRail';
import { ListView } from './ListView';
import { isQuickMapTool, normalizeQuickMapTool } from './quickMap';
import { exportFile, FileExportError } from '../../platform/download';
import { isolateModalSiblings } from '../../platform/modalIsolation';

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const srOnly: React.CSSProperties = {
	position: 'absolute',
	width: 1,
	height: 1,
	padding: 0,
	margin: -1,
	overflow: 'hidden',
	clip: 'rect(0,0,0,0)',
	whiteSpace: 'nowrap',
	border: 0,
};

/**
 * MAP-021 — the rebuilt map editor shell. A professional creative-app layout: header (Back · breadcrumb
 * with the single <h1> · visibility · Undo/Redo · Export · Project) → context-sensitive tool-options bar
 * → Foundry-style tool rail · canvas well with on-canvas HUD · four-tab dock → status bar. Generation is
 * a TOOL, not a tab: picking it swaps the dock for the registry-driven Generate panel that previews onto
 * the canvas and produces ordinary editable features. Everything binds to the one `useMapEditor` hook.
 */
export function MapEditor({
	mapId,
	initialTool = 'select',
	initialFogMode = 'reveal',
	onClose,
}: {
	mapId: string;
	initialTool?: ToolId;
	initialFogMode?: FogMode;
	onClose: () => void;
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
	// RC-MAP-2.5 — the palette's "Mark party here" reads the LIVE viewport center, not the one
	// baked into the palette-items memo (which does not depend on `editor.center` so it is not
	// rebuilt on every pan/zoom).
	const centerRef = useRef(editor.center);
	centerRef.current = editor.center;
	const viewport = useViewport();
	const viewportHeight = useViewportHeight();
	const isPhone = viewport === 'phone';

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
				if (quickMapMode && editor.tool !== 'pan') {
					setPreview(null);
					editor.setTool('pan');
					return true;
				}
				onCloseRef.current();
				return true;
			}),
		[quickMapMode, editor.tool, editor.setTool],
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

	useEffect(() => {
		if (!quickMapMode) return;
		if (!isQuickMapTool(editor.tool)) editor.setTool('pan');
		if (editor.tool === 'generate' || editor.selection.length > 0) {
			setMobileDock(true);
		}
	}, [quickMapMode, editor.tool, editor.selection.length, editor.setTool]);

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

	async function exportUvtt() {
		const entity = runtime.state.maps.maps[mapId];
		if (!entity) return;
		const blob = new Blob([exportUvttJson(entity)], { type: 'application/json' });
		const filename = `${(editor.map?.name ?? 'map').replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'map'}.dd2vtt`;
		try {
			const result = await exportFile({
				filename,
				blob,
				title: `Export ${editor.map?.name ?? 'map'}`,
			});
			announce(
				result.status === 'cancelled'
					? 'Map export cancelled.'
					: quickMapMode
						? 'Map sent to the Android share/save sheet.'
						: 'Map exported for other VTTs (.dd2vtt).',
			);
			// Export is not a command, so `editor.run`'s notice-clearing never applied to it — a failed
			// export left its warning banner standing over every later SUCCESSFUL one.
			editor.setNotice(null);
			setExportOpen(false);
		} catch (error) {
			// …and the popover stayed open on failure, covering the very notice this writes.
			setExportOpen(false);
			editor.setNotice(
				error instanceof FileExportError
					? error.message
					: 'The map could not be exported. Check available storage and try again.',
			);
		}
	}

	async function projectToPlayers() {
		const players = Object.values(runtime.state.permissions.actors).filter(
			(a) => a.role === 'player',
		);
		if (players.length === 0) {
			editor.setNotice(
				'No players yet — add players in Settings → Players before projecting a map.',
			);
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
				announce(`Projected to ${players.length} player${players.length === 1 ? '' : 's'}.`);
				editor.setNotice(
					`Projected “${editor.map?.name ?? 'map'}” to ${players.length} player${players.length === 1 ? '' : 's'}.`,
					'success',
				);
			} else {
				editor.setNotice(projected.rejection.message);
			}
		} catch (err) {
			editor.setNotice(
				err instanceof Error ? err.message : 'The map couldn’t be projected — try again.',
			);
		} finally {
			setProjecting(false);
		}
	}

	// ── command palette entries: tools · layers · generators · actions ────────────────────────────
	const paletteCommands = useMemo(() => {
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

	if (!editor.map) {
		return (
			<div
				className="app-fixed-viewport"
				ref={rootRef}
				tabIndex={-1}
				role="dialog"
				aria-modal="true"
				aria-label={t('mapEditor.dialogLabel')}
				style={{
					position: 'fixed',
					inset: 0,
					zIndex: 300,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 14,
					background: T.bg,
					color: T.sub,
					font: `13px ${T.sans}`,
				}}
			>
				{t('mapEditor.unavailable')}
				<Button variant="secondary" size="sm" icon="arrow-left" onClick={onClose}>
					{t('mapEditor.backToAtlas')}
				</Button>
			</div>
		);
	}
	const map = editor.map;
	const generating = editor.tool === 'generate';
	const quickSheetMax = Math.max(260, Math.round(viewportHeight * 0.82));
	const clampQuickSheet = (height: number) => Math.min(quickSheetMax, Math.max(220, height));
	const onSheetResizeDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		sheetResizeRef.current = { startY: event.clientY, startHeight: quickSheetHeight };
	};
	const onSheetResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const resize = sheetResizeRef.current;
		if (!resize) return;
		setQuickSheetHeight(clampQuickSheet(resize.startHeight + resize.startY - event.clientY));
	};
	const onSheetResizeEnd = () => {
		sheetResizeRef.current = null;
	};

	// RC-MAP-4.1 — the inventory toggle. A TEXT button, not an icon: the registry has no list glyph
	// (docs/reference/ICON_VOCABULARY.md) and inventing an unnamed shape for the app's only non-visual
	// route into a map is the wrong trade. On a plain phone it does NOT go in the header — that header
	// already has six children with hard minimums and a seventh takes its width straight out of the
	// map name (measured: the <h1> fell from 90px to 38px on a 393px handset). It rides the bottom
	// tool bar there instead, beside the Panels toggle it behaves like.
	const phoneBar = isPhone && !quickMapMode;
	const listToggle = (
		<Button
			variant="secondary"
			size="sm"
			// The accessible name stays the full verb phrase everywhere; only the printed text shortens.
			aria-label={listView ? t('mapEditor.showMap') : t('mapEditor.showList')}
			onClick={() => {
				const next = !listView;
				setListView(next);
				announce(next ? t('mapEditor.listShown') : t('mapEditor.mapShown'));
			}}
		>
			{isPhone || quickMapMode
				? listView
					? t('mapEditor.showMapShort')
					: t('mapEditor.showListShort')
				: listView
					? t('mapEditor.showMap')
					: t('mapEditor.showList')}
		</Button>
	);

	// RC-MAP-4.1 — what fills the canvas well: the pointer-driven drawing surface, or the accessible
	// inventory of the same map. `listView` is honoured on every profile, because the profile that
	// most needs a non-canvas path is whichever one the reader is on.
	const well = (quick: boolean) =>
		listView ? (
			<ListView
				editor={editor}
				announce={announce}
				// No announcement here: the live region holds one message at a time and ListView has
				// already spoken the useful one ("Moved to <name>."). Speaking again would erase it.
				onNavigate={() => setListView(false)}
			/>
		) : (
			<EditorCanvas
				editor={editor}
				previewLayers={preview?.layers ?? null}
				announce={announce}
				rasterAssetId={rasterAssetId}
				onCursor={setCursor}
				quickMapMode={quick}
			/>
		);

	const dockBody = generating ? (
		<GeneratePanel
			editor={editor}
			setPreview={setPreview}
			announce={announce}
			initialGeneratorId={primeGen}
			quickMapMode={quickMapMode}
			onExit={() => {
				setPreview(null);
				editor.setTool(quickMapMode ? 'pan' : 'select');
				if (quickMapMode) setMobileDock(false);
			}}
		/>
	) : (
		<>
			<Tabs
				aria-label={t('mapEditor.panelsLabel')}
				value={editor.dock}
				idBase="map-dock"
				onChange={(v: string) => editor.setDock(v as typeof editor.dock)}
				tabs={[
					{ id: 'inspector', label: t('mapEditor.dock.inspector'), icon: 'sliders' },
					{ id: 'layers', label: t('mapEditor.dock.layers'), icon: 'layers' },
					...(!quickMapMode
						? [{ id: 'assets', label: t('mapEditor.dock.assets'), icon: 'tool-stamp' }]
						: []),
					{ id: 'history', label: t('mapEditor.dock.history'), icon: 'recent' },
				]}
			/>
			<div
				{...tabPanelProps('map-dock', editor.dock)}
				style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}
			>
				{editor.dock === 'inspector' && <InspectorPanel editor={editor} announce={announce} />}
				{editor.dock === 'layers' && <LayersPanel editor={editor} announce={announce} />}
				{editor.dock === 'assets' && (
					<AssetsPanel
						editor={editor}
						recent={assetRecent}
						setRecent={setAssetRecent}
						favorites={assetFavorites}
						setFavorites={setAssetFavorites}
					/>
				)}
				{editor.dock === 'history' && <HistoryPanel editor={editor} />}
			</div>
		</>
	);

	return (
		<div
			className="app-fixed-viewport"
			ref={rootRef}
			tabIndex={-1}
			role="dialog"
			aria-modal="true"
			data-fullscreen-overlay="map-editor"
			data-quick-map={quickMapMode ? 'true' : undefined}
			aria-label={`Map editor — ${map.name}`}
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 300,
				display: 'flex',
				flexDirection: 'column',
				background: T.bg,
				color: T.ink,
				fontFamily: T.sans,
				outline: 'none',
			}}
		>
			<div aria-live="polite" aria-atomic="true" style={srOnly}>
				{announcement}
			</div>

			{/* ── header ── */}
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: isPhone ? 4 : 10,
					padding: quickMapMode
						? 'calc(6px + var(--safe-area-top, 0px)) max(8px, var(--safe-area-right, 0px)) 6px max(8px, var(--safe-area-left, 0px))'
						: isPhone
							? '7px 6px'
							: '8px 14px',
					borderBottom: `1px solid ${T.bd}`,
					background: T.surf,
					flex: '0 0 auto',
					minWidth: 0,
				}}
			>
				<IconButton
					icon="arrow-left"
					label={t('mapEditor.backToAtlas')}
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
				<nav
					aria-label={t('mapEditor.breadcrumb')}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 7,
						minWidth: 0,
						flex: isPhone ? 1 : undefined,
					}}
				>
					{!isPhone && (
						<span style={{ font: `12px ${T.sans}`, color: T.ter }}>{t('mapEditor.atlas')}</span>
					)}
					{!isPhone && <Icon name="chevron-right" size={13} color={T.ter} />}
					<h1
						style={{
							margin: 0,
							font: `700 14px ${T.disp}`,
							color: T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							minWidth: 0,
						}}
					>
						{map.name}
					</h1>
				</nav>
				{/* Compact on a phone: the full "DM ONLY" pill is ~97px, and the header's other six
				    children all have hard minimums, so on a 393px handset it left the map-name <h1>
				    about 46px — four characters and an ellipsis. `clippedControls()` cannot see an
				    element that merely SHRINKS, so no gate was ever going to catch it. Compact keeps
				    the icon (and moves the label onto `title` + the icon's accessible name). */}
				{!quickMapMode && (
					<VisibilityChip level={VIS_CHIP[map.visibility] ?? 'dm-only'} compact={isPhone} />
				)}
				{!isPhone && <div style={{ flex: 1 }} />}
				{!isPhone && (
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 6,
							font: `11.5px ${T.sans}`,
							color: T.ter,
						}}
					>
						<Icon
							name={editor.busy ? 'loading' : 'success'}
							size={13}
							color={editor.busy ? T.ter : T.ok}
						/>
						{editor.busy ? t('mapEditor.saving') : t('mapEditor.saved')}
					</span>
				)}
				{!quickMapMode && (
					<>
						<button
							type="button"
							onClick={() => setPaletteOpen(true)}
							aria-label={t('mapEditor.searchPalette')}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 8,
								padding: '6px 10px',
								borderRadius: 8,
								border: `1px solid ${T.bd}`,
								background: T.raised,
								color: T.sub,
								cursor: 'pointer',
								font: `12px ${T.sans}`,
							}}
						>
							<Icon name="search" size={14} />
							{!isPhone && <span>{t('mapEditor.search')}</span>}
							{!isPhone && (
								<kbd
									style={{
										font: `10px ${T.mono}`,
										color: T.ter,
										border: `1px solid ${T.bd}`,
										borderRadius: 5,
										padding: '0 4px',
									}}
								>
									⌘K
								</kbd>
							)}
						</button>
						<div style={{ display: 'flex', gap: 2 }}>
							<IconButton
								icon="undo"
								label={t('common.action.undo')}
								variant="ghost"
								size="sm"
								disabled={!editor.canUndo}
								onClick={() => void editor.undo()}
							/>
							<IconButton
								icon="redo"
								label={t('mapEditor.redo')}
								variant="ghost"
								size="sm"
								disabled={!editor.canRedo}
								onClick={() => void editor.redo()}
							/>
						</div>
					</>
				)}
				{!phoneBar && listToggle}
				<div style={{ position: 'relative' }}>
					{/* display:contents adds no box of its own — it exists only to give the Popover a handle
					    on its own trigger, so an outside-pointerdown close cannot race the button's click. */}
					<span ref={exportTriggerRef} style={{ display: 'contents' }}>
						<Button
							variant="secondary"
							size="sm"
							icon={quickMapMode ? 'more' : 'download'}
							iconRight="chevron-down"
							onClick={() => setExportOpen((v) => !v)}
							aria-expanded={exportOpen}
							aria-label={quickMapMode ? t('mapEditor.moreActions') : t('mapEditor.export')}
						>
							{isPhone || quickMapMode ? '' : t('mapEditor.export')}
						</Button>
					</span>
					{exportOpen && (
						<Popover
							open
							onClose={() => setExportOpen(false)}
							triggerRef={exportTriggerRef}
							// Named without a visible header, exactly as the two sibling map popovers are:
							// `Popover` derives its accessible name only from a STRING `title`, so this one
							// rendered an unnamed `role="dialog"` (axe `aria-dialog-name`). The axe gate never
							// opens a popover, so nothing was going to catch it.
							aria-label={quickMapMode ? t('mapEditor.moreActions') : t('mapEditor.exportMenu')}
							width={220}
							placement="bottom"
							style={{
								position: 'absolute',
								right: 0,
								top: 'calc(100% + 6px)',
								transform: 'none',
								zIndex: 30,
							}}
						>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
								<HeaderMenuItem
									icon="download"
									label={t('mapEditor.exportUvtt')}
									onClick={() => void exportUvtt()}
								/>
								<HeaderMenuItem
									icon="import"
									label={t('mapEditor.importMap')}
									onClick={() => {
										setExportOpen(false);
										setImportOpen(true);
									}}
								/>
								{quickMapMode && (
									<HeaderMenuItem
										icon="info"
										label={t('mapEditor.aboutAdvanced')}
										onClick={() => {
											setExportOpen(false);
											editor.setNotice(t('mapEditor.advancedNotice'), 'info');
										}}
									/>
								)}
							</div>
						</Popover>
					)}
				</div>
				{editor.isDm && (
					<Button
						variant="primary"
						size="sm"
						icon="visibility-players"
						onClick={() => void projectToPlayers()}
						disabled={editor.busy || projecting}
						aria-label={t('mapEditor.projectToPlayers')}
					>
						{isPhone ? '' : t('mapEditor.project')}
					</Button>
				)}
			</header>

			{editor.notice && (
				<div
					// `setNotice` is where useMapEditor funnels EVERY command rejection and thrown error,
					// and the editor's only live region is fed by `announce()`, which setNotice never
					// calls — so "layer is locked" was silent to AT and looked like a neutral FYI.
					// The skin used to be hard-coded to WARNING, but `projectToPlayers` reports its success
					// through the same banner: "Projected “Docks” to 3 players." arrived yellow, behind a
					// warning triangle, indistinguishable from a refusal. Tone now travels with the text.
					role={editor.noticeTone === 'warning' ? 'alert' : 'status'}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: '8px 14px',
						background: `var(--color-status-${editor.noticeTone}-subtle)`,
						borderBottom: `1px solid var(--color-status-${editor.noticeTone}-border)`,
						font: `12.5px ${T.sans}`,
						color: `var(--color-status-${editor.noticeTone}-text)`,
					}}
				>
					<Icon name={NOTICE_ICON[editor.noticeTone]} size={15} />
					<span style={{ flex: 1 }}>{editor.notice}</span>
					<button
						type="button"
						onClick={() => editor.setNotice(null)}
						aria-label={t('mapEditor.dismiss')}
						// ~18px around a 14px glyph — under the 24px WCAG 2.5.8 minimum.
						style={{
							border: 'none',
							background: 'transparent',
							cursor: 'pointer',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							minWidth: 24,
							minHeight: 24,
							padding: 2,
						}}
					>
						<Icon name="close" size={14} color={T.ter} />
					</button>
				</div>
			)}

			{/* ── workspace ── */}
			{quickMapMode ? (
				<>
					<QuickToolStrip editor={editor} />
					<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{well(true)}</div>
					<QuickMapRail
						activeTool={editor.tool}
						onSelect={editor.setTool}
						canUndo={editor.canUndo}
						canRedo={editor.canRedo}
						onUndo={() => void editor.undo()}
						onRedo={() => void editor.redo()}
						onPanels={() => setMobileDock(true)}
					/>
					{mobileDock && (
						<Sheet
							open
							side="bottom"
							title={generating ? 'Generate map' : 'Map details'}
							description="Drag the resize handle or use the arrow keys. Back closes this sheet first."
							size={`${quickSheetHeight}px`}
							onClose={() => {
								setMobileDock(false);
								if (generating) {
									setPreview(null);
									editor.setTool('pan');
								}
							}}
						>
							<div
								role="separator"
								aria-label={t('mapEditor.resizeSheet')}
								aria-orientation="horizontal"
								aria-valuemin={220}
								aria-valuemax={quickSheetMax}
								aria-valuenow={quickSheetHeight}
								tabIndex={0}
								onPointerDown={onSheetResizeDown}
								onPointerMove={onSheetResizeMove}
								onPointerUp={onSheetResizeEnd}
								onPointerCancel={onSheetResizeEnd}
								onKeyDown={(event) => {
									if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
									event.preventDefault();
									setQuickSheetHeight((height) =>
										clampQuickSheet(height + (event.key === 'ArrowUp' ? 40 : -40)),
									);
								}}
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									height: 48,
									margin: '-20px -20px 8px',
									cursor: 'ns-resize',
									touchAction: 'none',
								}}
							>
								<span
									aria-hidden
									style={{ width: 64, height: 5, borderRadius: 999, background: T.bdS }}
								/>
							</div>
							<div
								style={{
									paddingBottom: 'var(--safe-area-bottom, 0px)',
									minHeight: 0,
								}}
							>
								{dockBody}
							</div>
						</Sheet>
					)}
				</>
			) : isPhone ? (
				<>
					<ToolOptionsBar editor={editor} />
					<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{well(false)}</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							borderTop: `1px solid ${T.bd}`,
							background: T.surf,
						}}
					>
						<div style={{ flex: 1, minWidth: 0 }}>
							<ToolRail
								activeTool={editor.tool}
								onSelect={editor.setTool}
								orientation="horizontal"
							/>
						</div>
						{listToggle}
						<IconButton
							icon="layers"
							label={t('mapEditor.panels')}
							// IconButton has no "primary" variant — it silently fell through to `ghost`, so
							// the open state lost its border and read as disabled. It is also a toggle.
							variant={mobileDock ? 'accent' : 'outline'}
							aria-pressed={mobileDock}
							size="sm"
							// It advertises `aria-pressed`, so it has to be a real toggle: pressing it
							// while pressed used to be a no-op, i.e. a control a screen reader calls
							// "pressed" that cannot be un-pressed.
							onClick={() => setMobileDock((v) => !v)}
						/>
					</div>
					{mobileDock && (
						<Sheet
							open
							side="bottom"
							title={t('mapEditor.mapPanels')}
							onClose={() => setMobileDock(false)}
						>
							{dockBody}
						</Sheet>
					)}
				</>
			) : (
				<div
					style={{
						flex: 1,
						minHeight: 0,
						display: 'grid',
						gridTemplateColumns: '56px minmax(0,1fr) 348px',
						position: 'relative',
						overflow: 'hidden',
					}}
				>
					<div
						style={{
							borderRight: `1px solid ${T.bd}`,
							background: T.surf,
							position: 'relative',
							overflow: 'visible',
						}}
					>
						<ToolRail activeTool={editor.tool} onSelect={editor.setTool} />
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
						<ToolOptionsBar editor={editor} />
						<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{well(false)}</div>
					</div>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							minHeight: 0,
							borderLeft: `1px solid ${T.bd}`,
							background: T.surf,
						}}
					>
						{dockBody}
					</div>
				</div>
			)}

			{!quickMapMode && (
				<StatusBar editor={editor} cursor={cursor} activeLayerName={activeLayerName} />
			)}

			{/* ── overlays ── */}
			{paletteOpen && (
				<CommandPalette
					open
					onClose={() => setPaletteOpen(false)}
					commands={paletteCommands}
					groupOrder={[
						t('mapEditor.palette.group.tools'),
						t('mapEditor.palette.group.layers'),
						t('mapEditor.palette.group.generators'),
						t('mapEditor.palette.group.actions'),
					]}
					placeholder={t('mapEditor.palettePlaceholder')}
				/>
			)}
			{importOpen && (
				<ImportMapDialog mapId={mapId} mapName={map.name} onClose={() => setImportOpen(false)} />
			)}
			{helpOpen && <ShortcutOverlay onClose={() => setHelpOpen(false)} />}
		</div>
	);
}
