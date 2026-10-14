import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	screenLayoutPolicy,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { useRuntime } from '../runtime/RuntimeContext';
import type { ZoomPreset } from '../app/SceneBoardCanvas';
import { BoardLayoutsPanel } from './BoardLayoutsPanel';
import { boardWidgetsOf, payloadIndex, type BoardWidget } from '../app/board-helpers';
import { useViewport } from '../app/useViewport';
import { usePanelFocusReturn } from '../app/usePanelFocusReturn';
import { registerCanvasSurface } from '../app/shortcuts/registry';
import { useStackedPosture } from '../app/canvas/StackedBoard';
import { SessionActionBar } from '../app/canvas/SessionActionBar';
import * as Phone from '../app/canvas/PhoneNavigator';
import { useI18n } from '../i18n';
import {
	BoardEmptyState,
	useBoardPreviouslyFilled,
	BoardPlayerNotice,
} from './board/BoardPlayerNotice';
import { useBoardLayouts } from './board/useBoardLayouts';
import { useBoardActions } from './board/useBoardActions';
import { BoardSurface } from './board/BoardSurface';
import { BoardStatus } from './board/BoardStatus';
import { BoardDialogs } from './board/BoardDialogs';
import { GmScreenUnavailable } from './board/GmScreenUnavailable';
import { useAddWidgetIntent } from './board/useAddWidgetIntent';
import { boardRootStyle } from './board/boardRootStyle';
import { AddWidgetGallery } from '../app/canvas/AddWidgetGallery';
import { BoardLayoutBanner } from './board/BoardLayoutBanner';
import { TemplateStartEntry } from '../app/canvas/TemplatePicker';
import {
	ScreenEditClip,
	ScreenInspector,
	ScreenPreviewOverlay,
	useQuietPlacement,
} from './sceneEditor';
import { ScreenToolbar } from './sceneEditor/SceneToolbar';
import { usePreviewActions } from '../app/ViewAsControl';
import { readPlayerPreview } from './sceneEditor/playerPreview';

/**
 * Board — the board engine behind `/screen/:id` (ADR-041): one screen rendered by its layout policy
 * and wired to the REAL Processing Core. The screen's widgets read out of `getSceneForActor`; they
 * move/resize through `scene.move-widget` / `scene.resize-widget`; new widgets come from the
 * profile-evaluated widget library; and the GM screen (the board the home pointer names) is
 * recoverable through the core's preset + auto-save safe-point commands (CMD-008).
 *
 * RC-CAN-7.9 — the engine only ever renders a screen. The bespoke `/board` page it used to be (the
 * home board without a screen header, provisioning it on first load) is retired: `/board` resolves
 * to the GM screen's `/screen/:id`, and a `Board` handed no screen (what `BoardAlias` mounts for a
 * non-GM, or after its provisioning write failed) draws `GmScreenUnavailable` instead of a board.
 *
 * It uses the BOUNDED canvas policy (glanceable, scrolls, keyboard-first) — the accessibility answer
 * the prototype's `scene-canvas.jsx` describes for the home surface. RC-CAN-3.1 fixed what "bounded"
 * means: the board has no free zoom slider, only the three named steps Fit, Comfortable and Detail
 * (`0`/`1`/`2`, cycled with `+`/`-`), so a DM can name where they are instead of hunting for a
 * percentage. Fit scales the authored layout into the pane but stops at 0.5 — below that the widget
 * titles are unreadable, so the surface SCROLLS (both axes) rather than shrinking further, and
 * Comfortable/Detail deliberately overflow a narrow window for the same reason. RC-CAN-3.2 made
 * reaching that scroll range "scroll-natural": wheel, Shift+wheel, trackpad two-finger and a single
 * touch-finger all scroll it natively, and a middle-mouse drag pans it directly (SceneBoardCanvas's
 * `scroll-pan`) for the one gesture a real scroll container doesn't grant for free — and never
 * pinch-zoom. A PHONE defaults to `StackedBoard`'s panel list (RC-CAN-5.1, List); its Layout view
 * is `PhoneNavigator` around the canvas (RC-CAN-5.4), and it never paints text under 12px.
 *
 * RC-CAN-7.3 — the screen a `/screen/:id` route hands the board engine: which scene to render, what
 * to call it, and the header actions (the switcher, the pin) that sit beside its name.
 */
export interface BoardScreen {
	id: string;
	title: string;
	summary: string;
	icon: string;
	actions: ReactNode;
}

export function Board({ screen }: { screen?: BoardScreen } = {}) {
	return screen ? <ScreenBoard screen={screen} /> : <GmScreenUnavailable />;
}

function ScreenBoard({ screen }: { screen: BoardScreen }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const viewport = useViewport();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const [searchParams, setSearchParams] = useSearchParams();
	const editing = searchParams.get('edit') === '1';
	function setEditing(next: boolean) {
		setSearchParams(
			(params) => {
				if (next) params.set('edit', '1');
				else params.delete('edit');
				return params;
			},
			{ replace: true, state: location.state },
		);
	}
	const [metaOpen, setMetaOpen] = useState(false);
	const preview = runtime.preview;
	const previewActions = usePreviewActions();
	const stageRef = useRef<HTMLDivElement>(null);
	const previewTriggerRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		stageRef.current?.toggleAttribute('inert', !!preview);
	});
	const [snap, setSnap] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const quiet = useQuietPlacement();
	function pick(id: string | null) {
		setSelectedId(id);
		quiet.clear();
		setMetaOpen(false);
	}
	const [addOpen, setAddOpen] = useState(false);
	// RC-CAN-4.4 — the scene-template picker, opened from the empty board or the gallery header.
	const [templatesOpen, setTemplatesOpen] = useState(false);
	// RC-CAN-4.1 — the gallery's "Generate with assistant" and "Build your own" entries. `builder.pkg`
	// is the assistant's staged proposal, or null for a blank widget; neither is durable.
	const [generateOpen, setGenerateOpen] = useState(false);
	const [builder, setBuilder] = useState<{ pkg: WidgetPackageDefinition | null } | null>(null);
	// RC-WID-6.2 — what the builder installed enabled, until the gallery has placed it.
	const [built, setBuilt] = useState<WidgetPackageDefinition | null>(null);
	// RC-CAN-3.1: the board's zoom lives here, not in the canvas, so the control can sit in the
	// toolbar. The bounded canvas IS its own scroll container, so an in-canvas control would scroll
	// away from the widgets it applies to and sit on top of the top-left widget while it did.
	const phone = viewport === 'phone';
	// A phone's Layout opens at Comfortable, the real tiles at 1:1; its Fit is the titles-only overview.
	const [zoom, setZoom] = useState<ZoomPreset>(phone ? 'comfortable' : 'fit');
	const steps = Phone.phoneZoomSteps(phone, editing, zoom);
	// The screen route names the scene; the board never provisions one.
	const sceneId = screen.id;
	const boardScene = runtime.state.scenes.scenes[sceneId];
	const flow = !!boardScene && screenLayoutPolicy(boardScene) === 'flow';
	// The panel list stands in for a CANVAS on a phone. A flow screen already collapses to one column
	// of its own content (ADR-041), so it reads through FlowBoard on every tier (RC-CAN-7.6).
	const posture = useStackedPosture(phone && !editing && !flow);
	const [layoutFull, setLayoutFull] = useState(false);
	const chromeHidden = posture.hideChrome || layoutFull;
	// The Layouts panel used to render unconditionally whenever edit mode was on, with no close
	// control and no Escape handler — so on a phone (where it is a 280px absolute overlay) it
	// covered all but ~97px of the board and could not be dismissed without leaving edit mode.
	// It is now a peer of the Add panel: a toolbar toggle, a Close button and Escape.
	const [layoutsOpen, setLayoutsOpen] = useState(false);

	// A successful Add, or a saved layout preset, unmounts the panel with focus still inside it — the
	// browser then resets focus to <body> and Tab restarts at the skip link. See usePanelFocusReturn.
	usePanelFocusReturn(addOpen || (editing && layoutsOpen));

	// Create-intent handoff from "New widget" launchers (home hub): arrive in edit mode with the
	// Add-widget panel already open.
	const location = useAddWidgetIntent(() => {
		setAddOpen(true);
		setMetaOpen(false);
	});

	// Presets and safe points are `command-center.*` commands on the HOME board, so only it offers them.
	const isHomeBoard = sceneId === runtime.state.commandCenter.homeSceneId;
	const summary = getSceneForActor(
		runtime.state.scenes,
		runtime.state.permissions,
		actorId,
		sceneId,
		{ widgetPackages: runtime.state.widgets },
	);
	const ready = !('kind' in summary);
	const previewBlocked =
		!!preview && !ready && (summary.reason === 'dm-only' || summary.reason === 'not-shared');
	const previewRead =
		preview && boardScene ? readPlayerPreview(runtime.state, preview.actorId, sceneId) : null;
	// Core-computed keyboard traversal order (CANVAS-016) + the scene revision the durable widget
	// command envelope must carry (`expectedRevision`, packages/core/src/commands/widget-command.ts).
	const focusOrder = ready ? summary.focusOrder.map((entry) => entry.widgetInstanceId) : [];
	const sceneRevision = ready ? summary.ownership.revision : 0;

	const previouslyFilled = useBoardPreviouslyFilled(sceneId, (boardScene?.widgets.length ?? 0) > 0);

	const widgets: BoardWidget[] = useMemo(() => {
		if ((!ready && !previewBlocked) || !boardScene) return [];
		// RC-ENG-10.2 — outside the DM's own edit view, only what this actor's read delivered.
		return boardWidgetsOf(
			boardScene.widgets,
			payloadIndex('kind' in summary ? [] : summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
			{ includeUndelivered: previewBlocked || (isDm && editing && !preview) },
		);
	}, [ready, boardScene, runtime.state.widgets, summary, isDm, editing, preview, previewBlocked]);

	const {
		status,
		setStatus,
		error,
		dispatch,
		history,
		historyRef,
		titleOf,
		move,
		resize,
		layoutIssues,
		fixLayout,
		remove,
		operateWidget,
		addWidget,
	} = useBoardActions({
		runtime,
		sceneId,
		sceneRevision,
		widgets,
		flow,
		editing,
		setEditing,
		setSelectedId,
		// The board's platform-access exception (`board-idempotency-key-crypto`) covers this key.
		newIdempotencyKey: () => crypto.randomUUID(),
	});

	const {
		presetName,
		setPresetName,
		savePreset,
		snapshotSafePoint,
		applyPreset,
		restoreSafePoint,
	} = useBoardLayouts({ runtime, actorId, dispatch, setStatus });
	const presets = Object.values(runtime.state.commandCenter.presets).sort((a, b) =>
		a.name.localeCompare(b.name),
	);

	// RC-CAN-3.4 — "Select" on a listed issue puts the offender under the SAME selection state a
	// pointer click on the canvas sets (`SceneBoardCanvas` only paints the selected outline in edit
	// mode), so it has to also enter edit mode rather than selecting a widget the canvas can't show
	// as selected yet.
	function selectIssue(widgetId: string) {
		pick(widgetId);
		if (!editing) setEditing(true);
	}
	// The Edit-layout / Done button's handler, shared with the command palette's Toggle edit row.
	function enterEditing(next: boolean) {
		if (next && isHomeBoard) void snapshotSafePoint();
		setEditing(next);
		setSelectedId(null);
		setAddOpen(false);
		setLayoutsOpen(false);
		setMetaOpen(false);
	}

	// RC-CAN-4.3 — lend the palette this canvas's edit toggle and undo stack while it is mounted.
	useEffect(() => {
		if (!isDm || preview) return;
		return registerCanvasSurface({
			sceneId,
			policy: flow ? 'flow' : 'bounded',
			widgets,
			editable: true,
			editing,
			setEditing: enterEditing,
			canUndo: history.canUndo,
			undoLabel: history.undoLabel,
			undo: () => void historyRef.current.undo(),
		});
	});

	if (!isDm && !preview) return <BoardPlayerNotice />;

	return (
		<div className="scene-editor" style={boardRootStyle(phone, posture.stacked)}>
			<ScreenToolbar
				screen={screen}
				chromeHidden={chromeHidden}
				editing={editing}
				preview={!!preview}
				flow={flow}
				snap={snap}
				setSnap={setSnap}
				metaOpen={metaOpen}
				addOpen={addOpen}
				layoutsOpen={layoutsOpen}
				isHomeBoard={isHomeBoard}
				phone={phone}
				posture={posture}
				steps={steps}
				setZoom={setZoom}
				previewTriggerRef={previewTriggerRef}
				enterEditing={enterEditing}
				onToggleMeta={() => {
					setSelectedId(null);
					setMetaOpen((open) => !open);
					setAddOpen(false);
					setLayoutsOpen(false);
				}}
				onToggleAdd={() => {
					setAddOpen((open) => !open);
					setMetaOpen(false);
					setLayoutsOpen(false);
				}}
				onToggleLayouts={() => {
					setLayoutsOpen((open) => !open);
					setMetaOpen(false);
					setAddOpen(false);
				}}
				onLayoutPolicy={(layoutPolicy) =>
					void dispatch({
						type: 'scene.set-layout-policy',
						actorId,
						payload: { sceneId, layoutPolicy },
					})
				}
			/>

			{editing && <ScreenEditClip />}
			<BoardStatus status={status} error={error} />

			{layoutIssues.length > 0 && !chromeHidden && !preview && (
				<BoardLayoutBanner
					issues={layoutIssues}
					titleOf={titleOf}
					onFix={fixLayout}
					onSelect={selectIssue}
				/>
			)}

			<div
				style={{
					flex: 1,
					minHeight: posture.regionMinHeight,
					display: 'flex',
					gap: 'var(--space-3)',
					position: 'relative',
				}}
			>
				<div
					ref={stageRef}
					data-testid="screen-stage"
					onPointerDownCapture={quiet.wake}
					onKeyDownCapture={quiet.wake}
					style={{
						flex: 1,
						minWidth: 0,
						minHeight: 0,
						display: 'flex',
						gap: 'var(--space-3)',
						position: 'relative',
					}}
				>
					<div
						style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex' }}
					>
						<BoardSurface
							posture={posture}
							flow={flow}
							phone={phone}
							viewport={viewport}
							editing={editing && !preview}
							ready={ready}
							sceneId={sceneId}
							widgets={widgets}
							history={history}
							selectedId={selectedId}
							onSelect={pick}
							onMove={move}
							onResize={resize}
							onRemove={remove}
							onWidgetCommand={operateWidget}
							snap={snap}
							focusOrder={focusOrder}
							zoom={zoom}
							onZoom={setZoom}
							canvasZoom={steps.canvas}
							onFullScreenChange={setLayoutFull}
						/>
						{ready && widgets.length === 0 && (
							<BoardEmptyState
								title={t('board.emptyTitle')}
								repeat={previouslyFilled}
								testId="board-empty-templates"
								onAdd={() => {
									setEditing(true);
									setAddOpen(true);
									setMetaOpen(false);
									setLayoutsOpen(false);
								}}
								onTemplate={() => {
									setTemplatesOpen(true);
									setAddOpen(false);
									setLayoutsOpen(false);
								}}
							/>
						)}
					</div>

					<AddWidgetGallery
						open={addOpen && !metaOpen}
						onClose={() => setAddOpen(false)}
						viewport={viewport}
						policy={flow ? 'flow' : 'bounded'}
						widgets={widgets}
						onDone={() => {
							setEditing(false);
							setSelectedId(null);
							setLayoutsOpen(false);
						}}
						onAdd={addWidget}
						onPlaced={(id) => {
							setSelectedId(id);
							quiet.placed(id, phone);
						}}
						error={error}
						onGenerate={() => setGenerateOpen(true)}
						onBuild={() => setBuilder({ pkg: null })}
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

					{editing && layoutsOpen && !metaOpen && isHomeBoard && (
						<BoardLayoutsPanel
							t={t}
							viewport={viewport}
							onClose={() => setLayoutsOpen(false)}
							presetName={presetName}
							onPresetNameChange={setPresetName}
							onSave={savePreset}
							presets={presets}
							onApplyPreset={applyPreset}
							autoSaveEnabled={!!runtime.state.commandCenter.autoSave}
							onRestoreSafePoint={restoreSafePoint}
						/>
					)}
					{editing && !addOpen && !layoutsOpen && (
						<ScreenInspector
							sceneId={sceneId}
							widgets={widgets}
							selectedId={selectedId === quiet.id ? null : selectedId}
							metaOpen={metaOpen}
							phone={phone}
							history={history}
							dispatch={dispatch}
							onMove={move}
							onResize={resize}
							onRemove={remove}
							onClose={() => {
								setMetaOpen(false);
								setSelectedId(null);
							}}
						/>
					)}
				</div>
				{previewRead && preview && (
					<ScreenPreviewOverlay
						widgets={widgets}
						read={previewRead}
						label={preview.label}
						phone={phone}
						onExit={(focusWasInOverlay) => {
							previewActions.exit();
							if (focusWasInOverlay || document.activeElement === document.body)
								previewTriggerRef.current?.querySelector('button')?.focus();
						}}
					/>
				)}
			</div>
			{/* RC-CAN-5.2 — the phone's live-session bar; renders nothing unless the session is live. */}
			{viewport === 'phone' && !editing && !preview && <SessionActionBar />}
			<BoardDialogs
				viewport={viewport}
				sceneId={ready ? sceneId : null}
				templatesOpen={templatesOpen}
				onTemplatesClose={() => setTemplatesOpen(false)}
				// The applied layout is a good checkpoint to fall back to, and the DM picked it to adjust it.
				onTemplateApplied={() => {
					if (isHomeBoard) void snapshotSafePoint();
					setEditing(true);
				}}
				generateOpen={generateOpen}
				onGenerateClose={() => setGenerateOpen(false)}
				builder={builder}
				onBuilder={setBuilder}
				onBuilt={setBuilt}
			/>
		</div>
	);
}
