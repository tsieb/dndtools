import {
	Button,
	EmptyState,
	CommandPalette,
	IconButton,
	Sheet,
	tabPanelProps,
	Tabs,
} from '../../ds';
import { T, srOnly } from '../screen-kit';
import { MapEditorNotice } from './MapEditorNotice';
import { EditorCanvas } from './canvas/EditorCanvas';
import { AssetsPanel } from './dock/AssetsPanel';
import { GraphPanel } from './dock/GraphPanel';
import { HistoryPanel } from './dock/HistoryPanel';
import { InspectorPanel } from './dock/InspectorPanel';
import { LayersPanel } from './dock/LayersPanel';
import { GeneratePanel } from './generate/GeneratePanel';
import { ImportMapDialog } from './ImportMapDialog';
import { ListView } from './ListView';
import {
	MapEditorCoach,
	MapViewToggle,
	QuickMapActions,
	QuickToolStrip,
	ShortcutOverlay,
} from './MapEditorChrome';
import { MapEditorHeader } from './MapEditorHeader';
import { StatusBar } from './StatusBar';
import { ToolOptionsBar } from './ToolOptionsBar';
import { ToolRail } from './ToolRail';
import { type ToolId } from './tools';
import { type FogMode } from './useMapEditor';
import { useMapEditorShell } from './useMapEditorShell';

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
	const model = useMapEditorShell({ mapId, initialTool, initialFogMode, onClose, onNavigateToMap });
	const {
		t,
		quickMapMode,
		editor,
		viewportHeight,
		isPhone,
		preview,
		setPreview,
		announcement,
		paletteOpen,
		setPaletteOpen,
		helpOpen,
		setHelpOpen,
		importOpen,
		setImportOpen,
		mobileDock,
		setMobileDock,
		listView,
		setListView,
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
		paletteCommands,
	} = model;

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
					gap: 'var(--space-3)',
					background: T.bg,
					color: T.sub,
					font: `13px ${T.sans}`,
				}}
			>
				<EmptyState
					illustration="map-library"
					title={t('mapEditor.unavailable')}
					description={t('mapEditor.unavailableHint')}
				/>
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
		<MapViewToggle
			listView={listView}
			compact={model.compactHeader || quickMapMode}
			onChange={setListView}
			announce={announce}
		/>
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
						? [
								{ id: 'assets', label: t('mapEditor.dock.assets'), icon: 'tool-stamp' },
								// RC-MAP-3.4 — `layer-roads` is Waypoints: the node-and-link glyph, and the
								// closest thing the registered icon vocabulary has to a graph.
								{ id: 'graph', label: t('mapEditor.dock.graph'), icon: 'layer-roads' },
							]
						: []),
					{ id: 'history', label: t('mapEditor.dock.history'), icon: 'recent' },
				]}
			/>
			<div
				{...tabPanelProps('map-dock', editor.dock)}
				style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-3)' }}
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
				{editor.dock === 'graph' && <GraphPanel editor={editor} announce={announce} />}
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
			aria-label={t('mapEditor.namedDialog', { name: map.name })}
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
			<MapEditorHeader
				model={model}
				onClose={onClose}
				onNavigateToMap={onNavigateToMap}
				phoneBar={phoneBar}
				listToggle={listToggle}
			/>

			<MapEditorCoach
				rootRef={rootRef}
				compact={isPhone || quickMapMode}
				quick={quickMapMode}
				activity={`${editor.tool}:${editor.selection.join(',')}`}
			/>

			<MapEditorNotice editor={editor} />

			{/* ── workspace ── */}
			{quickMapMode ? (
				<>
					<div data-map-coach="options" style={{ flexShrink: 0 }}>
						<QuickToolStrip editor={editor} />
					</div>
					<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{well(true)}</div>
					<QuickMapActions editor={editor} onPanels={() => setMobileDock(true)} />
					{mobileDock && (
						<Sheet
							open
							side="bottom"
							title={t(generating ? 'mapEditor.generateSheet' : 'mapEditor.detailsSheet')}
							description={t('mapEditor.resizeHint')}
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
									margin: 'calc(-1 * var(--space-5)) calc(-1 * var(--space-5)) var(--space-2)',
									cursor: 'ns-resize',
									touchAction: 'none',
								}}
							>
								<span
									aria-hidden
									style={{
										width: 64,
										height: 5,
										borderRadius: 'var(--radius-full)',
										background: T.bdS,
									}}
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
					<div data-map-coach="options" style={{ flexShrink: 0 }}>
						<ToolOptionsBar editor={editor} announce={announce} />
					</div>
					<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{well(false)}</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
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
							data-map-coach="dock"
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
						<div data-map-coach="options" style={{ flexShrink: 0 }}>
							<ToolOptionsBar editor={editor} announce={announce} />
						</div>
						<div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{well(false)}</div>
					</div>
					<div
						data-map-coach="dock"
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
