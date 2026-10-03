import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	screenLayoutPolicy,
	type WidgetLibraryEntry,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Button, Icon, Callout, Toolbar, Switch, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { widgetRejectionMessage } from '../app/widget-rejection';
import { SceneBoardCanvas, type ZoomPreset } from '../app/SceneBoardCanvas';
import { ZoomPresetGroup } from '../app/canvas/ZoomCluster';
import { BoardLayoutsPanel } from './BoardLayoutsPanel';
import {
	addTileCommand,
	boardLayoutIssues,
	boardWidgetsOf,
	clampToColumns,
	clampWidthToColumns,
	defaultTileSize,
	payloadIndex,
	repackBoardColumns,
	type BoardWidget,
} from '../app/board-helpers';
import { useViewport } from '../app/useViewport';
import { usePanelFocusReturn } from '../app/usePanelFocusReturn';
import { useLayoutHistory } from '../app/canvas/useLayoutHistory';
import { registerCanvasSurface } from '../app/shortcuts/registry';
import { StackedBoard, useStackedPosture } from '../app/canvas/StackedBoard';
import { SessionActionBar } from '../app/canvas/SessionActionBar';
import * as Phone from '../app/canvas/PhoneNavigator';
import { srOnly } from '../app/screen-kit';
import { useI18n } from '../i18n';
import {
	BoardEmptyState,
	useBoardPreviouslyFilled,
	BoardPlayerNotice,
} from './board/BoardPlayerNotice';
import { useBoardLayouts } from './board/useBoardLayouts';
import { AddWidgetGallery, nextFreeSlot } from '../app/canvas/AddWidgetGallery';
import { FlowBoard } from '../app/canvas/FlowBoard';
import { BoardHeading } from './board/BoardHeading';
import { BoardLayoutBanner } from './board/BoardLayoutBanner';
import { TemplatePicker, TemplateStartEntry } from '../app/canvas/TemplatePicker';
import { GenerateDialog } from '../app/widgetBuilder/GenerateDialog';
import { WidgetBuilder } from './extensions/WidgetBuilder';

/**
 * Board (`/board`) — the Command Center spatial board: the application's home Scene rendered as a
 * canvas of system widgets, ported from the prototype's bounded "Home" scene and wired to the REAL
 * Processing Core, mirroring the archived Svelte `board/+page.svelte`. The DM's home Scene is materialized the first time
 * the board loads (`command-center.ensure-home`, CMD-001); its seeded system widgets then read out of
 * `getSceneForActor`. Widgets move/resize through `scene.move-widget` / `scene.resize-widget`; new
 * widgets come from the profile-evaluated widget library; and the layout is recoverable through the
 * core's preset + auto-save safe-point commands (CMD-008).
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
 */
// `SceneRuntime.dispatchNow` RETHROWS after a failed `persistFullState`, and every caller here is
// fire-and-forget (`void onMove(...)`, `onClick={savePreset}`), so an IndexedDB quota or
// private-mode failure produced an unhandled rejection, no message at all, and the optimistic
// draft was dropped — the widget silently snapped back to where it had been.
const PERSIST_FAILED =
	"That change couldn't be saved to this device. Check storage space and try again.";

/**
 * RC-CAN-7.3 — the screen a `/screen/:id` route hands the board engine: which scene to render, what
 * to call it, and the header actions (the switcher, the pin) that sit beside its name. Without one,
 * the board renders the vault's home scene as `/board` always has.
 */
export interface BoardScreen {
	id: string;
	title: string;
	summary: string;
	icon: string;
	actions: ReactNode;
}

export function Board({ screen }: { screen?: BoardScreen } = {}) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const viewport = useViewport();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const [editing, setEditing] = useState(false);
	const [snap, setSnap] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	// RC-CAN-4.4 — the scene-template picker, opened from the empty board or the gallery header.
	const [templatesOpen, setTemplatesOpen] = useState(false);
	// RC-CAN-4.1 — the gallery's "Generate with assistant" and "Build your own" entries. `builder.pkg`
	// is the assistant's staged proposal, or null for a blank widget; neither is durable.
	const [generateOpen, setGenerateOpen] = useState(false);
	const [builder, setBuilder] = useState<{ pkg: WidgetPackageDefinition | null } | null>(null);
	// RC-CAN-3.1: the board's zoom lives here, not in the canvas, so the control can sit in the
	// toolbar. The bounded canvas IS its own scroll container, so an in-canvas control would scroll
	// away from the widgets it applies to and sit on top of the top-left widget while it did.
	const phone = viewport === 'phone';
	// A phone's Layout opens at Comfortable, the real tiles at 1:1; its Fit is the titles-only overview.
	const [zoom, setZoom] = useState<ZoomPreset>(phone ? 'comfortable' : 'fit');
	const steps = Phone.phoneZoomSteps(phone, editing, zoom);
	const posture = useStackedPosture(phone && !editing);
	const [layoutFull, setLayoutFull] = useState(false);
	const chromeHidden = posture.hideChrome || layoutFull;
	// The Layouts panel used to render unconditionally whenever edit mode was on, with no close
	// control and no Escape handler — so on a phone (where it is a 280px absolute overlay) it
	// covered all but ~97px of the board and could not be dismissed without leaving edit mode.
	// It is now a peer of the Add panel: a toolbar toggle, a Close button and Escape.
	const [layoutsOpen, setLayoutsOpen] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const ensuringRef = useRef(false);

	// A successful Add, or a saved layout preset, unmounts the panel with focus still inside it — the
	// browser then resets focus to <body> and Tab restarts at the skip link. See usePanelFocusReturn.
	usePanelFocusReturn(addOpen || (editing && layoutsOpen));

	// Create-intent handoff from "New widget" launchers (home hub): arrive in edit mode with the
	// Add-widget panel already open. Consumed once, then cleared.
	const navigate = useNavigate();
	const location = useLocation();
	useEffect(() => {
		const intent = (location.state ?? null) as { addWidget?: boolean } | null;
		if (intent?.addWidget) {
			setEditing(true);
			setAddOpen(true);
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.state, location.pathname, navigate]);

	// The home scene backs `/board`; a screen route names its own scene and never provisions one.
	const homeSceneId = screen ? screen.id : runtime.state.commandCenter.homeSceneId;
	const boardScene = homeSceneId ? runtime.state.scenes.scenes[homeSceneId] : undefined;
	// Presets and safe points are `command-center.*` commands on the HOME board, so only it offers them.
	const isHomeBoard = homeSceneId === runtime.state.commandCenter.homeSceneId;
	const flow = !!boardScene && screenLayoutPolicy(boardScene) === 'flow';
	const summary = homeSceneId
		? getSceneForActor(runtime.state.scenes, runtime.state.permissions, actorId, homeSceneId, {
				widgetPackages: runtime.state.widgets,
			})
		: null;
	const ready = summary !== null && !('kind' in summary);
	// Core-computed keyboard traversal order (CANVAS-016) + the scene revision the durable widget
	// command envelope must carry (`expectedRevision`, packages/core/src/commands/widget-command.ts).
	const focusOrder = ready ? summary.focusOrder.map((entry) => entry.widgetInstanceId) : [];
	const sceneRevision = ready ? summary.ownership.revision : 0;

	// CMD-001: create the DM's home Scene from the system template the first time the board loads.
	useEffect(() => {
		if (screen || !runtime.loaded || !isDm || ensuringRef.current) return;
		const danglingHome = !!homeSceneId && !!summary && 'kind' in summary;
		if (homeSceneId && !danglingHome) return;
		ensuringRef.current = true;
		void runtime
			.dispatch({ type: 'command-center.ensure-home', actorId, payload: {} })
			// `dispatchNow` RETHROWS a persist failure. With only a `.finally()` here, a full or
			// read-only IndexedDB left the home scene uncreated, `ready` false, and the board parked
			// on "Setting up your GM Screen…" FOREVER — the effect's deps never change, so it never
			// retries, and nothing told the DM anything had gone wrong.
			.catch(() => {
				setError(PERSIST_FAILED);
			})
			.finally(() => {
				ensuringRef.current = false;
			});
	}, [runtime, runtime.loaded, isDm, homeSceneId, summary, actorId, screen]);

	const previouslyFilled = useBoardPreviouslyFilled(
		homeSceneId,
		!!homeSceneId && (runtime.state.scenes.scenes[homeSceneId]?.widgets.length ?? 0) > 0,
	);

	const widgets: BoardWidget[] = useMemo(() => {
		if (!ready || !homeSceneId) return [];
		const rawScene = runtime.state.scenes.scenes[homeSceneId];
		if (!rawScene) return [];
		// RC-ENG-10.2 — outside the DM's own edit view, only what this actor's read delivered.
		return boardWidgetsOf(
			rawScene.widgets,
			payloadIndex(summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
			{ includeUndelivered: isDm && editing },
		);
	}, [ready, homeSceneId, runtime.state.scenes, runtime.state.widgets, summary, isDm, editing]);

	const presets = Object.values(runtime.state.commandCenter.presets).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		// Clear before the attempt, not only after it. `error` renders inside a `role="alert"`, which
		// announces on INSERTION — and setting the identical string again is an `Object.is` bail-out,
		// so React never re-renders and a REPEATED identical failure (press save, it fails, press save,
		// it fails again) was announced exactly once. Clearing first guarantees the region is removed
		// and re-inserted, and the await below always puts the two updates in separate ticks.
		setError(null);
		let result;
		try {
			result = await runtime.dispatch(command);
		} catch {
			setStatus(null);
			setError(PERSIST_FAILED);
			return false;
		}
		if (result.status === 'rejected') {
			// A rejection is NOT a confirmation: routing both into `status` rendered "that change
			// couldn't be applied" in the same neutral grey, with the same info icon, as "Layout saved".
			setStatus(null);
			setError(widgetRejectionMessage(result.rejection));
			return false;
		}
		setError(null);
		// A confirmation describes ONE action. `status` was only ever cleared on rejection, so a
		// "Layout 'Combat night' saved." (or the restore-a-safe-point offer) survived every later move,
		// resize, add and preset apply — the live region kept asserting something that was no longer
		// true. Callers that want a message set it immediately after their own dispatch resolves.
		setStatus(null);
		return true;
	}

	const {
		presetName,
		setPresetName,
		savePreset,
		snapshotSafePoint,
		applyPreset,
		restoreSafePoint,
	} = useBoardLayouts({ runtime, actorId, dispatch, setStatus });

	const history = useLayoutHistory({ sceneId: homeSceneId ?? null, runtime, dispatch });
	// A stable callback for the Undo toast: the toast store lives outside React, so the closure it
	// keeps must not capture a particular render's stack.
	const historyRef = useRef(history);
	historyRef.current = history;
	const undoRemoval = () => {
		void historyRef.current.undo();
	};

	// RC-CAN-1.3: every layout write goes through the local undo stack, so `Ctrl+Z` and the canvas's
	// Undo button reverse it by dispatching the core-built inverse — an ordinary durable command.
	const titleOf = (widgetInstanceId: string) =>
		widgets.find((w) => w.id === widgetInstanceId)?.title ?? 'widget';

	// RC-CAN-3.3: the bounded board has no free horizontal scroll (SceneBoardCanvas fit-scales its
	// whole extent to the pane), so a drag or arrow-nudge past the board's own right edge either
	// dragged that scale down for every widget or landed invisibly on another one. Every move/resize
	// is clamped to the board's columns here, at the one place both the pointer and keyboard paths
	// (SceneBoardCanvas's `onMove`/`onResize`) commit through — the drop is "snapped back" onto the
	// grid instead of silently growing the board.
	function move(widgetInstanceId: string, x: number, y: number) {
		if (!homeSceneId) return;
		const widget = widgets.find((w) => w.id === widgetInstanceId);
		// Flow has no columns to fall off: its x is an order key (FlowBoard computes it).
		const clampedX = widget && !flow ? clampToColumns(x, widget.w) : x;
		return history.run(
			{
				type: 'scene.move-widget',
				actorId,
				payload: { sceneId: homeSceneId, widgetInstanceId, x: clampedX, y: Math.max(0, y) },
			},
			`Moved ${titleOf(widgetInstanceId)}`,
		);
	}
	function resize(widgetInstanceId: string, w: number, h: number) {
		if (!homeSceneId) return;
		const widget = widgets.find((wid) => wid.id === widgetInstanceId);
		const clampedW = widget && !flow ? clampWidthToColumns(widget.x, w) : w;
		return history.run(
			{
				type: 'scene.resize-widget',
				actorId,
				payload: { sceneId: homeSceneId, widgetInstanceId, w: clampedW, h },
			},
			`Resized ${titleOf(widgetInstanceId)}`,
		);
	}
	// The banner's fix: a deterministic greedy repack of every widget back into the board's columns,
	// each changed position committed as its own `scene.move-widget` (the same undoable path a drag
	// takes), so "Fix layout" is a real durable action rather than a client-only visual snap.
	const layoutIssues = flow ? [] : boardLayoutIssues(widgets);
	async function fixLayout() {
		if (!homeSceneId) return;
		const next = repackBoardColumns(widgets);
		for (const widget of widgets) {
			const pos = next.get(widget.id);
			if (!pos || (pos.x === widget.x && pos.y === widget.y)) continue;
			await move(widget.id, pos.x, pos.y);
		}
		setStatus(t('board.layoutFixed'));
	}
	// RC-CAN-3.4 — "Select" on a listed issue puts the offender under the SAME selection state a
	// pointer click on the canvas sets (`SceneBoardCanvas` only paints the selected outline in edit
	// mode), so it has to also enter edit mode rather than selecting a widget the canvas can't show
	// as selected yet.
	function selectIssue(widgetId: string) {
		setSelectedId(widgetId);
		if (!editing) setEditing(true);
	}
	// Delete/Backspace on a focused widget frame is the ONLY widget-lifecycle operation on `/board`
	// (there is no Inspector here). It used to stage a confirm dialog, because a destroy could not be
	// taken back. RC-CAN-1.2 gave the core `scene.restore-widget`, so the removal now just happens and
	// offers Undo in a toast — the toast holds open until it is taken or dismissed (Toast.jsx pins any
	// toast carrying an action), and the same reversal is on `Ctrl+Z`.
	async function remove(widgetInstanceId: string) {
		if (!homeSceneId) return;
		const title = titleOf(widgetInstanceId);
		setSelectedId((cur) => (cur === widgetInstanceId ? null : cur));
		const ok = await history.run(
			{
				type: 'scene.destroy-widget',
				actorId,
				payload: { sceneId: homeSceneId, widgetInstanceId },
			},
			`Removed ${title}`,
		);
		if (ok) Toaster.show({ message: `Removed ${title}`, action: 'Undo', onAction: undoRemoval });
	}
	// VIEW-mode widget operation (SES-005/SES-003): a widget-DECLARED durable command through the one
	// envelope the core accepts — fresh idempotencyKey per press + the scene's current revision.
	async function operateWidget(
		widgetInstanceId: string,
		commandType: string,
		payload: Record<string, unknown>,
	) {
		if (!homeSceneId) return;
		const ok = await dispatch({
			type: 'widget.dispatch-command',
			actorId,
			idempotencyKey: crypto.randomUUID(),
			payload: {
				sceneId: homeSceneId,
				widgetInstanceId,
				commandType,
				payload,
				expectedRevision: sceneRevision,
			},
		});
		if (ok) setStatus(null);
	}
	// RC-CAN-4.1: the gallery chooses the slot (the first open spot on the board's columns, where the
	// old cascade stacked each new widget over the seeded ones) and focuses the placed tile.
	// RC-CAN-8.1: sized from the one default-size table, and an undo step like every other edit. The
	// gallery searched its slot at the definition's own size; the board's columns need the table's,
	// so a bounded board re-finds the first open spot for the size the tile will really have.
	async function addWidget(entry: WidgetLibraryEntry, position: { x: number; y: number }) {
		if (!homeSceneId) return false;
		const policy = flow ? 'flow' : 'bounded';
		const at = flow
			? position
			: nextFreeSlot(widgets, defaultTileSize(entry.defaultSize, policy, entry.minSize));
		const command = addTileCommand(entry, homeSceneId, at, policy);
		if (!command) return false;
		const ok = await history.run(
			{ type: command.type, actorId, payload: command.payload },
			`Added ${entry.displayName}`,
		);
		if (ok && !editing) setEditing(true);
		return ok;
	}

	// The Edit-layout / Done button's handler, shared with the command palette's Toggle edit row.
	function enterEditing(next: boolean) {
		if (next && isHomeBoard) void snapshotSafePoint();
		setEditing(next);
		setSelectedId(null);
		setAddOpen(false);
		setLayoutsOpen(false);
	}

	// RC-CAN-4.3 — lend the palette this canvas's edit toggle and undo stack while it is mounted.
	useEffect(() => {
		if (!isDm || !homeSceneId) return;
		return registerCanvasSurface({
			sceneId: homeSceneId,
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

	if (!isDm) return <BoardPlayerNotice />;

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				// `<main>` is ALREADY the bounded pane: `flex:1; min-height:0; overflow-y:auto`
				// (AppShell.tsx), i.e. the viewport minus the top bar and, on a phone, minus the tab
				// bar. Sizing off `--app-viewport-height` measured from the WHOLE window instead, so a
				// constant allowance could only ever be right at one window size — desktop overflowed
				// `<main>` by ~43px (a second, nested scrollbar) while a phone left space unused.
				// `100%` tracks the pane exactly at every size. Locked by responsive.spec.ts.
				height: '100%',
				minHeight: posture.stacked ? 0 : 360,
				// `/board` and `/scene/:id` are the only two screens that bypass `<Page>`, so without
				// this they rendered flush against the pane edges — heading, toolbar and the canvas's
				// own rounded border all touching, so the border read as a crop. `border-box` keeps
				// `height:'100%'` exact.
				// NOT on phone: the bounded canvas derives its fit scale from the AVAILABLE WIDTH
				// (SceneBoardCanvas `boundedScale`), which on a 375px handset is already ~0.45 and too
				// small to read. A gutter there would shrink it further to buy whitespace it cannot
				// afford — and it measurably tipped the phone board out of its own scroll range.
				boxSizing: 'border-box',
				padding: phone ? 0 : '16px 28px',
				...(phone && Phone.PHONE_TEXT_FLOOR),
			}}
		>
			<Toolbar
				ariaLabel={screen?.title ?? t('board.title')}
				style={{
					display: chromeHidden ? 'none' : 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					flex: '0 0 auto',
					flexWrap: 'wrap',
				}}
			>
				<BoardHeading
					icon={screen?.icon ?? 'home'}
					title={screen?.title ?? t('board.title')}
					summary={screen?.summary ?? t('board.widgetCount', { count: widgets.length })}
				/>
				{screen?.actions}
				<div style={{ flex: 1 }} />
				{editing && (
					<>
						<Switch
							checked={snap}
							onChange={setSnap}
							label={
								<span
									style={{
										font: 'var(--text-2xs) var(--font-sans)',
										color: 'var(--color-text-secondary)',
									}}
								>
									{t('board.snap')}
								</span>
							}
						/>
						<Button
							variant="secondary"
							size="sm"
							icon="add"
							aria-expanded={addOpen}
							onClick={() => {
								setAddOpen((v) => !v);
								setLayoutsOpen(false);
							}}
						>
							{t('board.add')}
						</Button>
						{/* Add and Layouts share the same side slot, so opening one closes the other. */}
						{isHomeBoard && (
							<Button
								variant="secondary"
								size="sm"
								icon="scene"
								aria-expanded={layoutsOpen}
								onClick={() => {
									setLayoutsOpen((v) => !v);
									setAddOpen(false);
								}}
							>
								{t('board.layouts')}
							</Button>
						)}
					</>
				)}
				<Phone.PhoneViewSwitch posture={posture} />
				{/* The named zoom steps, in both modes — but not on the stacked list, which has none. */}
				{!posture.stacked && !flow && (
					<ZoomPresetGroup value={steps.pressed} presets={steps.presets} onChange={setZoom} />
				)}
				<Button
					variant={editing ? 'accent' : 'secondary'}
					size="sm"
					icon={editing ? 'check' : 'edit'}
					onClick={() => enterEditing(!editing)}
				>
					{editing ? t('board.done') : t('board.editLayout')}
				</Button>
			</Toolbar>

			{/* Every board write's confirmation surfaces here, so it has to be a live region (WCAG
			    4.1.3) — but a polite region must ALREADY be in the DOM for a content change to be
			    announced. Mounting `<div role="status">Layout saved.</div>` inserts the host and its
			    text in one mutation, which screen readers routinely drop. So the host is permanent and
			    only its contents change.
			    ⚠️ It used to collapse with `display:'none'`, which takes the node out of the
			    ACCESSIBILITY TREE — so flipping to `inline-flex` WITH content was the exact
			    insert-region-and-text-together mutation the comment above warns about, and every board
			    confirmation ("Layout saved.", "Layout applied.", "Previous layout restored.") was
			    silent. It now collapses with `srOnly` instead: absolutely positioned, so it is not a
			    flex item and contributes no box and no parent `gap`, but it stays in the a11y tree. */}
			<div
				role="status"
				aria-live="polite"
				data-testid="board-status"
				style={
					status
						? {
								display: 'inline-flex',
								alignItems: 'center',
								gap: 6,
								font: 'var(--text-xs) var(--font-sans)',
								color: 'var(--color-text-secondary)',
								flex: '0 0 auto',
							}
						: srOnly
				}
			>
				{status && (
					<>
						<Icon name="info" size="sm" /> {status}
					</>
				)}
			</div>

			{error && (
				<Callout tone="error" role="alert">
					{error}
				</Callout>
			)}

			{layoutIssues.length > 0 && !chromeHidden && (
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
				<div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex' }}>
					{posture.stacked ? (
						<StackedBoard
							sceneId={homeSceneId}
							widgets={widgets}
							onWidgetCommand={operateWidget}
							emptyHint={ready ? '' : t('board.preparingHint')}
							emptyTitle={ready ? '' : t('board.preparingTitle')}
							onMaximizedChange={posture.onMaximizedChange}
						/>
					) : flow ? (
						<FlowBoard
							widgets={widgets}
							tier={viewport}
							editing={editing}
							selectedId={selectedId}
							onSelect={setSelectedId}
							onMove={move}
							onResize={resize}
							onRemove={remove}
							onWidgetCommand={operateWidget}
							history={history}
							emptyTitle=""
							emptyHint=""
						/>
					) : (
						<Phone.PhoneNavigator
							active={phone}
							editing={editing}
							widgets={widgets}
							zoom={zoom}
							onZoom={setZoom}
							onWidgetCommand={operateWidget}
							onFullScreenChange={setLayoutFull}
						>
							<SceneBoardCanvas
								widgets={widgets}
								policy="bounded"
								editing={editing}
								snap={snap}
								selectedId={selectedId}
								onSelect={setSelectedId}
								onMove={move}
								onResize={resize}
								focusOrder={focusOrder}
								onRemove={remove}
								onWidgetCommand={operateWidget}
								emptyHint={ready ? '' : t('board.preparingHint')}
								// The illustrated overlay owns the ready-empty copy; keep the canvas mounted for shortcuts.
								emptyTitle={ready ? '' : t('board.preparingTitle')}
								history={history}
								zoomPreset={steps.canvas}
								onZoomPresetChange={setZoom}
							/>
						</Phone.PhoneNavigator>
					)}
					{ready && widgets.length === 0 && (
						<BoardEmptyState
							title={t('board.emptyTitle')}
							repeat={previouslyFilled}
							testId="board-empty-templates"
							onAdd={() => {
								setEditing(true);
								setAddOpen(true);
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
					open={addOpen}
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
					error={error}
					onGenerate={() => setGenerateOpen(true)}
					onBuild={() => setBuilder({ pkg: null })}
					startAction={
						<TemplateStartEntry
							onPick={() => {
								setAddOpen(false);
								setTemplatesOpen(true);
							}}
						/>
					}
				/>

				{editing && layoutsOpen && isHomeBoard && (
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
			</div>
			{/* RC-CAN-5.2 — the phone's live-session bar; renders nothing unless the session is live. */}
			{viewport === 'phone' && !editing && <SessionActionBar />}
			<TemplatePicker
				open={templatesOpen}
				onClose={() => setTemplatesOpen(false)}
				viewport={viewport}
				sceneId={ready ? homeSceneId : null}
				// The applied layout is a good checkpoint to fall back to, and the DM picked it to adjust it.
				onApplied={() => {
					if (isHomeBoard) void snapshotSafePoint();
					setEditing(true);
				}}
			/>
			<GenerateDialog
				open={generateOpen}
				onClose={() => setGenerateOpen(false)}
				onGenerated={(pkg) => {
					setGenerateOpen(false);
					setBuilder({ pkg });
				}}
			/>
			{builder && <WidgetBuilder generatedPackage={builder.pkg} onClose={() => setBuilder(null)} />}
		</div>
	);
}
