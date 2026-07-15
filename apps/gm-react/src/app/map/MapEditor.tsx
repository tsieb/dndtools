import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GENERATORS, exportUvttJson } from '@dndtools/core';
import {
	Button,
	CommandPalette,
	Dialog,
	Icon,
	IconButton,
	Popover,
	Sheet,
	Tabs,
	VisibilityChip,
} from '../../ds';
import { T } from '../screen-kit';
import { useViewport } from '../useViewport';
import { useRuntime } from '../../runtime/RuntimeContext';
import { ImportMapDialog, VIS_CHIP } from '../MapBuilder';
import { useMapEditor, type FogMode } from './useMapEditor';
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
	const editor = useMapEditor(mapId, initialTool);
	const runtime = useRuntime();
	const viewport = useViewport();
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
	const rootRef = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

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
		openPalette: () => setPaletteOpen(true),
		openHelp: () => setHelpOpen(true),
		announce,
	});

	// Focus containment (dialog semantics): focus the shell on open, restore the opener on close.
	useEffect(() => {
		const opener = document.activeElement as HTMLElement | null;
		rootRef.current?.focus();
		return () => opener?.focus?.();
	}, []);

	// aria-modal Tab trap — keep Tab inside the shell (AppShell stays mounted underneath). Open
	// dialogs/palette/sheets own their own Tab cycle, so skip the trap while one is up.
	const overlayUp = paletteOpen || helpOpen || importOpen || exportOpen || (isPhone && mobileDock);
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

	function exportUvtt() {
		const entity = runtime.state.maps.maps[mapId];
		if (!entity) return;
		const blob = new Blob([exportUvttJson(entity)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${(editor.map?.name ?? 'map').replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'map'}.dd2vtt`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		announce('UVTT scene exported.');
		setExportOpen(false);
	}

	async function projectToPlayers() {
		const players = Object.values(runtime.state.permissions.actors).filter(
			(a) => a.role === 'player',
		);
		if (players.length === 0) {
			editor.setNotice('Add at least one player before projecting a map.');
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
		const tools = [...TOOLS_BY_ID.values()].map((t) => ({
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
				label: 'Export UVTT (.dd2vtt)',
				group: 'Actions',
				icon: 'download',
				run: exportUvtt,
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
	}, [editor.layers, editor.canUndo, editor.canRedo]);

	if (!editor.map) {
		return (
			<div
				className="app-fixed-viewport"
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

	const dockBody = generating ? (
		<GeneratePanel
			editor={editor}
			setPreview={setPreview}
			announce={announce}
			initialGeneratorId={primeGen}
			onExit={() => {
				setPreview(null);
				editor.setTool('select');
			}}
		/>
	) : (
		<>
			<Tabs
				value={editor.dock}
				onChange={(v: string) => editor.setDock(v as typeof editor.dock)}
				tabs={[
					{ id: 'inspector', label: 'Inspector', icon: 'sliders' },
					{ id: 'layers', label: 'Layers', icon: 'layers' },
					{ id: 'assets', label: 'Assets', icon: 'tool-stamp' },
					{ id: 'history', label: 'History', icon: 'recent' },
				]}
			/>
			<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
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
					padding: isPhone ? '7px 6px' : '8px 14px',
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
				<VisibilityChip level={VIS_CHIP[map.visibility] ?? 'dm-only'} />
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
				<div style={{ position: 'relative' }}>
					<Button
						variant="secondary"
						size="sm"
						icon="download"
						iconRight="chevron-down"
						onClick={() => setExportOpen((v) => !v)}
						aria-expanded={exportOpen}
						aria-label="Export"
					>
						{isPhone ? '' : 'Export'}
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
									label="Export UVTT (.dd2vtt)"
									onClick={exportUvtt}
								/>
								<HeaderMenuItem
									icon="import"
									label="Import map…"
									onClick={() => {
										setExportOpen(false);
										setImportOpen(true);
									}}
								/>
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
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: '8px 14px',
						background: T.alt,
						borderBottom: `1px solid ${T.bd}`,
						font: `12.5px ${T.sans}`,
						color: T.sub,
					}}
				>
					<Icon name="info" size={15} color={T.info} />
					<span style={{ flex: 1 }}>{editor.notice}</span>
					<button
						type="button"
						onClick={() => editor.setNotice(null)}
						aria-label="Dismiss"
						style={{
							border: 'none',
							background: 'transparent',
							cursor: 'pointer',
							display: 'inline-flex',
							padding: 2,
						}}
					>
						<Icon name="close" size={14} color={T.ter} />
					</button>
				</div>
			)}

			{/* ── workspace ── */}
			{isPhone ? (
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
							variant={mobileDock ? 'primary' : 'outline'}
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

			<StatusBar editor={editor} cursor={cursor} activeLayerName={activeLayerName} />

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
