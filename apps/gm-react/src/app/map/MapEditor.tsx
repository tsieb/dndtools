import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GENERATORS, exportUvttJson } from '@dndtools/core';
import {
	Button,
	CommandPalette,
	Dialog,
	Icon,
	IconButton,
	Popover,
	SegmentedControl,
	Sheet,
	Tabs,
	tabPanelProps,
	VisibilityChip,
} from '../../ds';
import { T } from '../screen-kit';
import { useViewport, useViewportHeight } from '../useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { ImportMapDialog, VIS_CHIP } from '../MapBuilder';
import { useMapEditor, type FogMode, type MapEditorApi } from './useMapEditor';
import type { ToolId } from './tools';
import { TOOL_GROUPS, TOOLS_BY_ID } from './tools';
import { useMapKeyboard } from './keyboard';
import { ToolRail } from './ToolRail';
import { ToolOptionsBar } from './ToolOptionsBar';
import { StatusBar } from './StatusBar';
import { InspectorPanel } from './dock/InspectorPanel';
import { LayersPanel } from './dock/LayersPanel';
import { AssetsPanel } from './dock/AssetsPanel';
import { HistoryPanel } from './dock/HistoryPanel';
import { GeneratePanel, type GenPreview } from './generate/GeneratePanel';
import { EditorCanvas } from './canvas/EditorCanvas';
import { pickRasterAssetId } from '../mapGeometry';
import { usePlatformCapabilities } from '../../platform/capabilities';
import { registerBackHandler } from '../../platform/backNavigation';
import { QuickMapRail } from './QuickMapRail';
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
	const viewport = useViewport();
	const viewportHeight = useViewportHeight();
	const isPhone = viewport === 'phone';

	const [preview, setPreview] = useState<GenPreview | null>(null);
	const [announcement, setAnnouncement] = useState('');
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [helpOpen, setHelpOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);
	const [mobileDock, setMobileDock] = useState(false);
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

	useMapKeyboard(editor, {
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
	const overlayUp =
		paletteOpen ||
		helpOpen ||
		importOpen ||
		exportOpen ||
		((quickMapMode || isPhone) && mobileDock);
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
			setExportOpen(false);
		} catch (error) {
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
			);
		} else {
			editor.setNotice(projected.rejection.message);
		}
	}

	// ── command palette entries: tools · layers · generators · actions ────────────────────────────
	const paletteCommands = useMemo(() => {
		const tools = [...TOOLS_BY_ID.values()]
			.filter((tool) => !quickMapMode || isQuickMapTool(tool.id))
			.map((t) => ({
				id: `tool-${t.id}`,
				label: `Tool: ${t.label}`,
				group: 'Tools',
				icon: t.icon,
				shortcut: t.shortcut ? t.shortcut.toUpperCase() : undefined,
				keywords: t.hint,
				run: () => editor.setTool(t.id),
			}));
		const layerCmds = editor.layers.map((l) => ({
			id: `layer-${l.layerId}`,
			label: `Layer: ${l.name}`,
			group: 'Layers',
			icon: 'layers',
			run: () => {
				editor.setActiveLayerId(l.layerId);
				editor.setDock('layers');
			},
		}));
		const genCmds = GENERATORS.map((g) => ({
			id: `gen-${g.id}`,
			label: `Generate: ${g.label}`,
			group: 'Generators',
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
				label: 'Undo',
				group: 'Actions',
				icon: 'undo',
				shortcut: ['⌘', 'Z'],
				disabled: !editor.canUndo,
				run: () => void editor.undo(),
			},
			{
				id: 'act-redo',
				label: 'Redo',
				group: 'Actions',
				icon: 'redo',
				disabled: !editor.canRedo,
				run: () => void editor.redo(),
			},
			{
				id: 'act-export',
				label: 'Export for other VTTs (.dd2vtt)',
				group: 'Actions',
				icon: 'download',
				run: () => void exportUvtt(),
			},
			{
				id: 'act-import',
				label: 'Import map',
				group: 'Actions',
				icon: 'import',
				run: () => setImportOpen(true),
			},
			{
				id: 'act-project',
				label: 'Project to players',
				group: 'Actions',
				icon: 'visibility-players',
				run: () => void projectToPlayers(),
			},
			{
				id: 'act-help',
				label: 'Keyboard shortcuts',
				group: 'Actions',
				icon: 'info',
				shortcut: '?',
				run: () => setHelpOpen(true),
			},
		];
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
				aria-label="Map editor"
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
				This map is unavailable to you.
				<Button variant="secondary" size="sm" icon="arrow-left" onClick={onClose}>
					Back to Atlas
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
				value={editor.dock}
				idBase="map-dock"
				onChange={(v: string) => editor.setDock(v as typeof editor.dock)}
				tabs={[
					{ id: 'inspector', label: 'Selected', icon: 'sliders' },
					{ id: 'layers', label: 'Layers', icon: 'layers' },
					...(!quickMapMode ? [{ id: 'assets', label: 'Assets', icon: 'tool-stamp' }] : []),
					{ id: 'history', label: 'History', icon: 'recent' },
				]}
			/>
			<div
				{...tabPanelProps('map-dock', editor.dock)}
				style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}
			>
				{editor.dock === 'inspector' && <InspectorPanel editor={editor} announce={announce} />}
				{editor.dock === 'layers' && <LayersPanel editor={editor} announce={announce} />}
				{editor.dock === 'assets' && <AssetsPanel editor={editor} />}
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
			<div aria-live="polite" style={srOnly}>
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
					label="Back to Atlas"
					variant="ghost"
					size="sm"
					onClick={onClose}
				/>
				<nav
					aria-label="Breadcrumb"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 7,
						minWidth: 0,
						flex: isPhone ? 1 : undefined,
					}}
				>
					{!isPhone && <span style={{ font: `12px ${T.sans}`, color: T.ter }}>Atlas</span>}
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
				{!quickMapMode && <VisibilityChip level={VIS_CHIP[map.visibility] ?? 'dm-only'} />}
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
						{editor.busy ? 'Saving…' : 'Saved on this device'}
					</span>
				)}
				{!quickMapMode && (
					<>
						<button
							type="button"
							onClick={() => setPaletteOpen(true)}
							aria-label="Search — command palette"
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
							{!isPhone && <span>Search</span>}
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
								label="Undo"
								variant="ghost"
								size="sm"
								disabled={!editor.canUndo}
								onClick={() => void editor.undo()}
							/>
							<IconButton
								icon="redo"
								label="Redo"
								variant="ghost"
								size="sm"
								disabled={!editor.canRedo}
								onClick={() => void editor.redo()}
							/>
						</div>
					</>
				)}
				<div style={{ position: 'relative' }}>
					<Button
						variant="secondary"
						size="sm"
						icon={quickMapMode ? 'more' : 'download'}
						iconRight="chevron-down"
						onClick={() => setExportOpen((v) => !v)}
						aria-expanded={exportOpen}
						aria-label={quickMapMode ? 'More map actions' : 'Export'}
					>
						{isPhone || quickMapMode ? '' : 'Export'}
					</Button>
					{exportOpen && (
						<Popover
							open
							onClose={() => setExportOpen(false)}
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
									label="Export for other VTTs (.dd2vtt)"
									onClick={() => void exportUvtt()}
								/>
								<HeaderMenuItem
									icon="import"
									label="Import map…"
									onClick={() => {
										setExportOpen(false);
										setImportOpen(true);
									}}
								/>
								{quickMapMode && (
									<HeaderMenuItem
										icon="info"
										label="About advanced drawing"
										onClick={() => {
											setExportOpen(false);
											editor.setNotice(
												'Advanced map drawing is available in the desktop app. Everything drawn there stays visible and safe here.',
											);
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
						disabled={editor.busy}
						aria-label="Project to players"
					>
						{isPhone ? '' : 'Project'}
					</Button>
				)}
			</header>

			{editor.notice && (
				<div
					// `setNotice` is where useMapEditor funnels EVERY command rejection and thrown error,
					// and the editor's only live region is fed by `announce()`, which setNotice never
					// calls — so "layer is locked" was silent to AT and looked like a neutral FYI.
					role="alert"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: '8px 14px',
						background: 'var(--color-status-warning-subtle)',
						borderBottom: `1px solid var(--color-status-warning-border)`,
						font: `12.5px ${T.sans}`,
						color: 'var(--color-status-warning-text)',
					}}
				>
					<Icon name="warning" size={15} />
					<span style={{ flex: 1 }}>{editor.notice}</span>
					<button
						type="button"
						onClick={() => editor.setNotice(null)}
						aria-label="Dismiss"
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
					<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
						<EditorCanvas
							editor={editor}
							previewLayers={preview?.layers ?? null}
							announce={announce}
							rasterAssetId={rasterAssetId}
							onCursor={setCursor}
							quickMapMode
						/>
					</div>
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
								aria-label="Resize map details sheet"
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
					<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
						<EditorCanvas
							editor={editor}
							previewLayers={preview?.layers ?? null}
							announce={announce}
							rasterAssetId={rasterAssetId}
							onCursor={setCursor}
						/>
					</div>
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
						<IconButton
							icon="layers"
							label="Panels"
							// IconButton has no "primary" variant — it silently fell through to `ghost`, so
						// the open state lost its border and read as disabled. It is also a toggle.
						variant={mobileDock ? 'accent' : 'outline'}
						aria-pressed={mobileDock}
							size="sm"
							onClick={() => setMobileDock(true)}
						/>
					</div>
					{mobileDock && (
						<Sheet open side="bottom" title="Map panels" onClose={() => setMobileDock(false)}>
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
						<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
							<EditorCanvas
								editor={editor}
								previewLayers={preview?.layers ?? null}
								announce={announce}
								rasterAssetId={rasterAssetId}
								onCursor={setCursor}
							/>
						</div>
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
					groupOrder={['Tools', 'Layers', 'Generators', 'Actions']}
					placeholder="Search tools, layers, generators, actions…"
				/>
			)}
			{importOpen && (
				<ImportMapDialog mapId={mapId} mapName={map.name} onClose={() => setImportOpen(false)} />
			)}
			{helpOpen && <ShortcutOverlay onClose={() => setHelpOpen(false)} />}
		</div>
	);
}

function QuickToolStrip({ editor }: { editor: MapEditorApi }) {
	const definition = TOOLS_BY_ID.get(editor.tool);
	const editing = !['pan', 'select'].includes(editor.tool);
	const guidance =
		editor.tool === 'pan'
			? 'Drag to navigate. Pinch with two fingers to zoom around the gesture.'
			: editor.tool === 'select'
				? 'Tap a token or POI to select it; drag to move it. Properties open in the sheet.'
				: editor.tool === 'generate'
					? 'Choose a preset in the sheet, preview it on the canvas, then accept once.'
					: 'Edit mode armed. Complete one placement or fog gesture to return to Navigate.';
	return (
		<div
			role="status"
			aria-live="polite"
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				flexWrap: 'wrap',
				minHeight: 50,
				padding:
					'6px max(10px, var(--safe-area-right, 0px)) 6px max(10px, var(--safe-area-left, 0px))',
				borderBottom: `1px solid ${T.bd}`,
				background: editing ? T.accSub : T.surf,
				overflow: 'hidden',
			}}
		>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					font: `700 12px ${T.sans}`,
					color: editing ? T.acc : T.ink,
					whiteSpace: 'nowrap',
				}}
			>
				<Icon name={definition?.icon ?? 'tool-select'} size={16} />
				{editor.tool === 'pan' ? 'Navigate' : definition?.label}
				{editing ? ' · armed' : ''}
			</span>
			{editor.tool === 'fog' && (
				<SegmentedControl
					ariaLabel="Fog mode"
					value={editor.options.fogMode}
					onChange={(value: string) =>
						editor.setOption('fogMode', value as typeof editor.options.fogMode)
					}
					options={[
						{ value: 'reveal', label: 'Reveal' },
						{ value: 'conceal', label: 'Conceal' },
					]}
				/>
			)}
			<span style={{ flex: 1, minWidth: 150, font: `11.5px ${T.sans}`, color: T.sub }}>
				{guidance}
			</span>
		</div>
	);
}

function HeaderMenuItem({
	icon,
	label,
	onClick,
}: {
	icon: string;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 9,
				padding: '8px 10px',
				borderRadius: 7,
				border: 'none',
				background: 'transparent',
				cursor: 'pointer',
				color: T.ink,
				font: `12.5px ${T.sans}`,
				textAlign: 'left',
			}}
		>
			<Icon name={icon} size={14} color={T.ter} />
			{label}
		</button>
	);
}

function ShortcutOverlay({ onClose }: { onClose: () => void }) {
	const rows: Array<[string, string]> = [
		[
			'Tools',
			TOOL_GROUPS.flatMap((g) => g.tools)
				.filter((t) => t.shortcut)
				.map((t) => `${t.shortcut!.toUpperCase()} ${t.label}`)
				.join(' · '),
		],
		['Brush size', '[ smaller · ] larger'],
		['Undo / Redo', 'Ctrl/⌘+Z · Ctrl/⌘+Shift+Z'],
		['Zoom', '+ in · − out · 0 fit · wheel to cursor'],
		['Pan', 'Hold Space and drag'],
		['Nudge selection', 'Arrow keys (Shift = larger step)'],
		['Delete', 'Delete / Backspace'],
		['Cancel / deselect / exit', 'Esc'],
		['Finish a path', 'Enter or double-click'],
		['Command palette', 'Ctrl/⌘+K'],
		['This overlay', '?'],
	];
	return (
		<Dialog
			open
			onClose={onClose}
			title="Keyboard shortcuts"
			icon="info"
			size="md"
			footer={
				<Button variant="primary" size="sm" onClick={onClose}>
					Done
				</Button>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
				{rows.map(([k, v]) => (
					<div
						key={k}
						style={{
							display: 'flex',
							gap: 12,
							padding: '8px 0',
							borderBottom: `1px solid ${T.bd}`,
						}}
					>
						<span style={{ flex: '0 0 150px', font: `600 12.5px ${T.sans}`, color: T.ink }}>
							{k}
						</span>
						<span style={{ flex: 1, font: `12.5px ${T.sans}`, color: T.sub }}>{v}</span>
					</div>
				))}
			</div>
		</Dialog>
	);
}
