import type React from 'react';
import './sceneEditor.css';
import { BoardEmptyState, useBoardPreviouslyFilled } from '../board/BoardPlayerNotice';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	screenLayoutPolicy,
	type ScreenLayoutPolicy,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Icon } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { SceneBoardCanvas } from '../../app/SceneBoardCanvas';
import { FlowBoard } from '../../app/canvas/FlowBoard';
import { registerCanvasSurface } from '../../app/shortcuts/registry';
import { StackedBoard, useStackedPosture } from '../../app/canvas/StackedBoard';
import { boardWidgetsOf, payloadIndex, type BoardWidget } from '../../app/board-helpers';
import { useViewport } from '../../app/useViewport';
import { usePanelFocusReturn } from '../../app/usePanelFocusReturn';
import { AddWidgetGallery } from '../../app/canvas/AddWidgetGallery';
import { TemplatePicker, TemplateStartEntry } from '../../app/canvas/TemplatePicker';
import { SceneMetaPanel } from './SceneMetaPanel';
import { GenerateDialog } from '../../app/widgetBuilder/GenerateDialog';
import { WidgetBuilder } from '../extensions/WidgetBuilder';
import { Inspector } from './Inspector';
import { useI18n } from '../../i18n';
import { usePreviewActions } from '../../app/ViewAsControl';
import { PlayerPreviewOverlay } from './PlayerPreviewOverlay';
import { readPlayerPreview } from './playerPreview';
import { SceneToolbar } from './SceneToolbar';
import { SceneUnavailable } from './SceneUnavailable';
import { useSceneCommands, type SceneMetadataDraft } from './useSceneCommands';

/**
 * Actor-filtered widgets edited via core commands; canvas and flow share instances (ADR-041), and
 * phones read stacked panels outside layout editing. Generated widgets stay staged for review:
 * nothing is installed or placed without the DM. Player preview dims withheld tiles; Escape exits.
 */
export function SceneEditor() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const { id = '' } = useParams();
	const actorId = runtime.defaultActorId;
	const viewport = useViewport();
	const phone = viewport === 'phone';
	const preview = runtime.preview;
	const previewActions = usePreviewActions();
	const stageRef = useRef<HTMLDivElement>(null);
	const previewTriggerRef = useRef<HTMLDivElement>(null);

	const [editing, setEditing] = useState(false);
	const [snap, setSnap] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	// RC-WID-3.2 — the assistant's widget dialog, and the package it proposed while the builder
	// reviews it. Neither is durable: closing either discards the draft.
	const [generateOpen, setGenerateOpen] = useState(false);
	const [generated, setGenerated] = useState<WidgetPackageDefinition | null>(null);
	// RC-CAN-4.1 — the gallery's "Build your own" opens the builder on a blank widget.
	const [building, setBuilding] = useState(false);
	// RC-WID-6.2 — what the builder installed enabled, until the gallery has placed it.
	const [built, setBuilt] = useState<WidgetPackageDefinition | null>(null);
	const [metaOpen, setMetaOpen] = useState(false);
	const [propertiesDismissed, setPropertiesDismissed] = useState(false);
	useEffect(() => setPropertiesDismissed(false), [editing, id]);
	// RC-CAN-4.4 — the scene-template picker, opened from the empty canvas or the gallery header.
	const [templatesOpen, setTemplatesOpen] = useState(false);
	// RC-CAN-5.1: reading is stacked on phones; editing keeps the durable layout policy.
	const posture = useStackedPosture(viewport === 'phone' && !editing);

	const summary = getSceneForActor(runtime.state.scenes, runtime.state.permissions, actorId, id, {
		widgetPackages: runtime.state.widgets,
	});
	const denied = 'kind' in summary;
	const rawScene = runtime.state.scenes.scenes[id];
	// RC-CAN-6.1 — while previewing, a scene the previewed actor may not open is exactly what the
	// overlay explains, so it must not collapse into the "unavailable" card. A missing or deleted scene
	// still does: there is nothing to preview.
	const previewBlocked =
		!!preview &&
		'kind' in summary &&
		(summary.reason === 'dm-only' || summary.reason === 'not-shared');
	// The previewed actor's read of this scene, tile by tile (playerPreview.ts).
	const previewRead =
		preview && rawScene ? readPlayerPreview(runtime.state, preview.actorId, id) : null;

	const previouslyFilled = useBoardPreviouslyFilled(id, (rawScene?.widgets.length ?? 0) > 0);

	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	const widgets: BoardWidget[] = useMemo(() => {
		if ((denied && !previewBlocked) || !rawScene) return [];
		return boardWidgetsOf(
			rawScene.widgets,
			payloadIndex('kind' in summary ? [] : summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
			// RC-ENG-10.2 — a previewed actor gets only the tiles their read delivered: one outside
			// their sections is not in the DOM at all, not merely dimmed under the overlay. The two
			// exceptions keep every tile: the DM's own edit view, and a scene the previewed actor
			// cannot open, whose overlay names each withheld tile (painted `hidden`, never `available`).
			{ includeUndelivered: previewBlocked || (isDm && editing && !preview) },
		);
		// `rawScene` + `runtime.state.widgets` are fresh references after each dispatch (immutable
		// reducer updates), so this recomputes whenever the scene or widget packages change.
	}, [denied, previewBlocked, rawScene, runtime.state.widgets, summary, isDm, editing, preview]);

	const commands = useSceneCommands({ runtime, sceneId: id, scene: rawScene, widgets });
	const { history, error } = commands;

	// `/scene/:id` is ONE route element, so React Router reuses this component across param changes and
	// never unmounts it on a scene→scene navigation (the sidebar and ⌘K both do exactly that). Every
	// piece of per-scene UI state below therefore leaked onto the next scene: an open details panel
	// kept showing — and SAVING — the previous scene's name/description/tags, and a rejection from
	// scene A was displayed under scene B's header.
	useEffect(() => {
		setMetaOpen(false);
		setAddOpen(false);
		setTemplatesOpen(false);
		setSelectedId(null);
		setEditing(false);
		commands.clearError();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reset on scene change only
	}, [id]);

	// ADR-041 — which engine this scene renders in. `screenMetaOf` defaults to `canvas`, so every
	// scene authored before screens existed keeps exactly the surface it had.
	const layoutPolicy: ScreenLayoutPolicy = rawScene ? screenLayoutPolicy(rawScene) : 'canvas';

	const selectedInstance = rawScene?.widgets.find((w) => w.id === selectedId) ?? null;
	const selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;

	const propertiesOpen =
		metaOpen || (editing && !selectedWidget && !addOpen && !propertiesDismissed);

	const propertiesBelow = phone && propertiesOpen && !metaOpen;
	// Each of these panels has a path that unmounts it while focus is still inside: a successful Add,
	// a saved metadata edit, the Inspector's Close, a deselect. See usePanelFocusReturn.
	usePanelFocusReturn(propertiesOpen || addOpen);
	usePanelFocusReturn(!!(editing && selectedWidget && selectedInstance && !addOpen && !metaOpen));

	// RC-CAN-6.1 — editing is SUSPENDED while previewing, not torn down: the canvas, its selection and
	// any open panel (with its unsaved draft) stay exactly as they were under the overlay, out of reach,
	// and come back untouched on exit. React 18 has no `inert` prop, so it is set on the node.
	const previewing = previewRead !== null;
	useEffect(() => {
		stageRef.current?.toggleAttribute('inert', previewing);
	});

	async function addWidget(...args: Parameters<typeof commands.addWidget>) {
		const ok = await commands.addWidget(...args);
		if (ok && !editing) setEditing(true);
		return ok;
	}
	async function destroy(widgetInstanceId: string) {
		setSelectedId(null);
		await commands.destroy(widgetInstanceId);
	}
	async function saveMetadata(meta: SceneMetadataDraft) {
		if (await commands.saveMetadata(meta)) {
			setMetaOpen(false);
			setPropertiesDismissed(true);
		}
	}
	// Escape and "Exit preview" both land here. The overlay — and the button that may hold focus —
	// unmounts on exit, so focus goes to this scene's own switcher instead of falling to <body>.
	function exitPreview(focusWasInOverlay: boolean) {
		previewActions.exit();
		if (focusWasInOverlay || document.activeElement === document.body) {
			previewTriggerRef.current?.querySelector('button')?.focus();
		}
	}
	// Selecting a widget is about that widget, so it closes the scene-level details panel. With the
	// panel left open, a click painted a selection ring and opened no editor: the Inspector below is
	// gated `!addOpen && !metaOpen`.
	function select(widgetInstanceId: string | null) {
		setSelectedId(widgetInstanceId);
		if (widgetInstanceId) {
			setPropertiesDismissed(false);
			setMetaOpen(false);
		}
	}

	// The Edit-layout / Done button's handler, shared with the command palette's Toggle edit row.
	function enterEditing(next: boolean) {
		setEditing(next);
		setSelectedId(null);
		setAddOpen(false);
		// …and the details panel too: it also gates the Inspector off, so leaving it open across the
		// Edit-layout toggle made every later widget click inert.
		setMetaOpen(false);
	}

	// RC-CAN-4.3 — lend the palette this canvas's edit toggle and undo stack while it is mounted.
	// Editing is suspended under a player preview, so the palette may not toggle it then either.
	useEffect(() => {
		if (denied || !rawScene) return;
		return registerCanvasSurface({
			sceneId: id,
			policy: layoutPolicy,
			widgets,
			editable: !previewing,
			editing,
			setEditing: enterEditing,
			canUndo: history.canUndo,
			undoLabel: history.undoLabel,
			undo: commands.undo,
		});
	});

	if ((denied && !previewBlocked) || !rawScene) {
		return <SceneUnavailable reason={denied ? summary.reason : null} />;
	}

	const emptyHint = t(editing ? 'sceneEditor.emptyHintEditing' : 'sceneEditor.emptyHintViewing');
	// A preview-blocked scene has no actor summary; its header and details come from the raw scene.
	const shown = 'kind' in summary ? rawScene : summary;
	const canvasProps = {
		widgets,
		editing,
		selectedId,
		onSelect: select,
		onMove: commands.move,
		onResize: commands.resize,
		onRemove: destroy,
		onWidgetCommand: commands.operateWidget,
		history,
		emptyTitle: previewing ? undefined : '',
		emptyHint: previewing ? emptyHint : '',
	};

	return (
		<div
			className="scene-editor"
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				// Match the shell's pane, which already excludes the top and bottom navigation.
				height: '100%',
				// Stacked tiles scroll internally and must stay above the phone navigation.
				minHeight: posture.stacked ? 0 : 360,
				// Include gutters in the pane height; phones keep their full width for widget content.
				boxSizing: 'border-box',
				padding: phone ? 'var(--space-0)' : 'var(--space-4) calc(var(--space-6) + var(--space-1))',
			}}
		>
			<SceneToolbar
				posture={posture}
				name={shown.name}
				widgetCount={widgets.length}
				viewport={viewport}
				layoutPolicy={layoutPolicy}
				previewing={previewing}
				editing={editing}
				metaOpen={metaOpen}
				addOpen={addOpen}
				snap={snap}
				previewTriggerRef={previewTriggerRef}
				onToggleMeta={() => {
					setMetaOpen((v) => !v);
					setAddOpen(false);
				}}
				onToggleAdd={() => {
					setAddOpen((v) => !v);
					setMetaOpen(false);
				}}
				onGenerate={() => {
					setGenerateOpen(true);
					setAddOpen(false);
					setMetaOpen(false);
				}}
				onEditing={enterEditing}
				onLayoutPolicy={(next) => commands.setLayoutPolicy(layoutPolicy, next)}
				onSnap={setSnap}
			/>

			{error && (
				<div
					// Rejected layout writes were announced to nobody; Campaign.tsx already does this.
					role="alert"
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-1-5)',
						font: 'var(--text-sm) var(--font-sans)',
						color: 'var(--color-status-error-text)',
						flex: '0 0 auto',
					}}
				>
					<Icon name="error" size="sm" /> {error}
				</div>
			)}

			{/* canvas + side panels, with the player-view preview overlay above them (RC-CAN-6.1) */}
			<div
				style={{
					flex: 1,
					minHeight: posture.regionMinHeight,
					display: 'flex',
					position: 'relative',
				}}
			>
				<div
					ref={stageRef}
					data-testid="scene-editor-stage"
					onKeyDownCapture={(event: React.KeyboardEvent) => {
						// Escape dismisses the current panel without opening scene properties over the canvas.
						if (event.key === 'Escape') setPropertiesDismissed(true);
					}}
					style={{
						flex: 1,
						minHeight: 0,
						minWidth: 0,
						display: 'flex',
						gap: 'var(--space-3)',
						flexDirection: propertiesBelow ? 'column' : 'row',
						position: 'relative',
					}}
				>
					{/* ADR-041 — one policy, one engine. Both read the SAME `widgets` view-model and commit
				    through the SAME `move`/`resize`/`destroy`/`operateWidget`; switching the policy
				    changes no widget, no configuration and no binding.

				    `focusOrder` goes only to the canvas. Flow's layout order IS its focus order, so it
				    accepts no traversal override — see `FlowBoardProps`. */}
					<div
						style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex' }}
					>
						{posture.stacked ? (
							<StackedBoard
								history={history}
								sceneId={id}
								widgets={widgets}
								onWidgetCommand={commands.operateWidget}
								emptyTitle={previewing ? shown.name : ''}
								emptyHint={previewing ? emptyHint : ''}
								onMaximizedChange={posture.onMaximizedChange}
							/>
						) : layoutPolicy === 'flow' ? (
							<FlowBoard {...canvasProps} tier={viewport} />
						) : (
							<SceneBoardCanvas
								{...canvasProps}
								policy="canvas"
								snap={snap}
								focusOrder={
									'kind' in summary ? [] : summary.focusOrder.map((entry) => entry.widgetInstanceId)
								}
							/>
						)}
						{widgets.length === 0 && !previewing && (
							<BoardEmptyState
								title={t('board.emptySceneTitle')}
								repeat={previouslyFilled}
								testId="scene-empty-templates"
								onAdd={() => {
									setEditing(true);
									setAddOpen(true);
									setMetaOpen(false);
									setPropertiesDismissed(true);
								}}
								onTemplate={() => {
									setTemplatesOpen(true);
									setAddOpen(false);
									setMetaOpen(false);
									setPropertiesDismissed(true);
								}}
							/>
						)}
					</div>

					{propertiesOpen && !posture.hideChrome && (
						<SceneMetaPanel
							// Reset draft fields per scene so a save cannot reuse another scene's metadata.
							key={id}
							scene={rawScene}
							belowCanvas={propertiesBelow}
							name={shown.name}
							description={shown.description}
							tags={shown.tags}
							phone={phone}
							onSave={saveMetadata}
							onClose={() => {
								setMetaOpen(false);
								setPropertiesDismissed(true);
							}}
						/>
					)}

					<AddWidgetGallery
						open={addOpen && !metaOpen}
						onClose={() => {
							setAddOpen(false);
							setPropertiesDismissed(true);
						}}
						viewport={viewport}
						policy={layoutPolicy}
						widgets={widgets}
						onDone={() => {
							setEditing(false);
							setSelectedId(null);
							setMetaOpen(false);
						}}
						onAdd={addWidget}
						error={error}
						onGenerate={() => setGenerateOpen(true)}
						onBuild={() => setBuilding(true)}
						placePackage={built}
						onPlacePackageDone={() => setBuilt(null)}
						startAction={
							<TemplateStartEntry
								onPick={() => {
									setAddOpen(false);
									setTemplatesOpen(true);
								}}
							/>
						}
					/>

					{editing && selectedWidget && selectedInstance && !addOpen && !metaOpen && (
						<Inspector
							history={history}
							key={selectedInstance.id}
							widget={selectedWidget}
							phone={phone}
							focusOrder={selectedInstance.layout.focusOrder}
							onVisibility={(v) => commands.setConfig(selectedInstance.id, 'visibility', v)}
							onConfigure={(key, value) => commands.setConfig(selectedInstance.id, key, value)}
							onResize={(w, h) => commands.resize(selectedInstance.id, w, h)}
							onMove={(x, y) => commands.move(selectedInstance.id, x, y)}
							onFocusOrder={(order) => commands.setFocusOrder(selectedInstance.id, order)}
							onRemove={() => destroy(selectedInstance.id)}
							onClose={() => setSelectedId(null)}
						/>
					)}
				</div>
				{previewRead && preview && (
					<PlayerPreviewOverlay
						widgets={widgets}
						read={previewRead}
						label={preview.label}
						phone={phone}
						onExit={exitPreview}
					/>
				)}
			</div>
			<TemplatePicker
				open={templatesOpen}
				onClose={() => setTemplatesOpen(false)}
				viewport={viewport}
				sceneId={id}
				// The DM picked a starting layout to adjust it: land in edit mode, as a gallery add does.
				onApplied={() => setEditing(true)}
			/>
			<GenerateDialog
				open={generateOpen}
				onClose={() => setGenerateOpen(false)}
				onGenerated={(pkg) => {
					setGenerateOpen(false);
					setGenerated(pkg);
				}}
			/>
			{(generated || building) && (
				<WidgetBuilder
					generatedPackage={generated}
					onClose={() => {
						setGenerated(null);
						setBuilding(false);
					}}
					onInstalled={setBuilt}
				/>
			)}
		</div>
	);
}
