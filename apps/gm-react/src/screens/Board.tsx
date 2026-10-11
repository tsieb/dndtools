import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	screenLayoutPolicy,
	type WidgetLibraryEntry,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Button, Icon, Callout, EmptyState, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { widgetRejectionMessage } from '../app/widget-rejection';
import { SceneBoardCanvas, type ZoomPreset } from '../app/SceneBoardCanvas';
import { BoardLayoutsPanel } from './BoardLayoutsPanel';
import {
	addTileCommand,
	boardLayoutIssues,
	boardWidgetsOf,
	clampToColumns,
	clampWidthToColumns,
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
import { Page, srOnly } from '../app/screen-kit';
import { useI18n } from '../i18n';
import {
	BoardEmptyState,
	useBoardPreviouslyFilled,
	BoardPlayerNotice,
} from './board/BoardPlayerNotice';
import { useBoardLayouts } from './board/useBoardLayouts';
import { AddWidgetGallery } from '../app/canvas/AddWidgetGallery';
import { FlowBoard } from '../app/canvas/FlowBoard';
import { BoardLayoutBanner } from './board/BoardLayoutBanner';
import { TemplatePicker, TemplateStartEntry } from '../app/canvas/TemplatePicker';
import { GenerateDialog } from '../app/widgetBuilder/GenerateDialog';
import { WidgetBuilder } from './extensions/WidgetBuilder';
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
 */
// `SceneRuntime.dispatchNow` RETHROWS after a failed `persistFullState`, and every caller here is
// fire-and-forget (`void onMove(...)`, `onClick={savePreset}`), so an IndexedDB quota or
// private-mode failure produced an unhandled rejection, no message at all, and the optimistic
// draft was dropped — the widget silently snapped back to where it had been.
const PERSIST_FAILED =
	"That change couldn't be saved to this device. Check storage space and try again.";

/**
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

/**
 * RC-CAN-7.9 — what `/board` draws when it cannot resolve to the GM screen, in place of the bespoke
 * board page. A non-GM gets the player notice (the GM screen is GM-only). For the GM it means the
 * provisioning write failed to persist, so it says so honestly and Retry asks again, as `/` and
 * `/session` do; once the write lands, `ScreenRouteAliases` takes `/board` to the screen.
 */
function GmScreenUnavailable() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';
	const [phase, setPhase] = useState<'failed' | 'asking' | 'done'>('failed');
	if (!isDm) return <BoardPlayerNotice />;
	if (phase === 'done') return null;
	const retry = () => {
		setPhase('asking');
		// `dispatch` rethrows a persist failure; a rejection is reported in its result.
		void Promise.resolve(
			runtime.dispatch({
				type: 'command-center.ensure-home',
				actorId,
				payload: {},
			}),
		)
			.then((result) => setPhase(result.status === 'accepted' ? 'done' : 'failed'))
			.catch(() => setPhase('failed'));
	};
	return (
		<Page>
			<EmptyState
				icon="widget"
				title={t('board.setupFailed')}
				description={t('home.setupFailedHint')}
				action={
					<Button
						variant="secondary"
						size="sm"
						icon="refresh"
						disabled={phase === 'asking'}
						onClick={retry}
					>
						{t('common.action.retry')}
					</Button>
				}
			/>
		</Page>
	);
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
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

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
			setAddOpen(true);
			setMetaOpen(false);
			const search = new URLSearchParams(location.search);
			search.set('edit', '1');
			navigate(
				{ pathname: location.pathname, search: `?${search}` },
				{ replace: true, state: null },
			);
		}
	}, [location.state, location.pathname, location.search, navigate]);

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

	const history = useLayoutHistory({ sceneId, runtime, dispatch });
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
		const widget = widgets.find((w) => w.id === widgetInstanceId);
		// Flow uses x/y as order keys, including negative y when moving before the first tile.
		const clampedX = widget && !flow ? clampToColumns(x, widget.w) : x;
		return history.run(
			{
				type: 'scene.move-widget',
				actorId,
				payload: { sceneId, widgetInstanceId, x: clampedX, y: flow ? y : Math.max(0, y) },
			},
			`Moved ${titleOf(widgetInstanceId)}`,
		);
	}
	function resize(widgetInstanceId: string, w: number, h: number) {
		const widget = widgets.find((wid) => wid.id === widgetInstanceId);
		const clampedW = widget && !flow ? clampWidthToColumns(widget.x, w) : w;
		return history.run(
			{
				type: 'scene.resize-widget',
				actorId,
				payload: { sceneId, widgetInstanceId, w: clampedW, h },
			},
			`Resized ${titleOf(widgetInstanceId)}`,
		);
	}
	// The banner's fix: a deterministic greedy repack of every widget back into the board's columns,
	// each changed position committed as its own `scene.move-widget` (the same undoable path a drag
	// takes), so "Fix layout" is a real durable action rather than a client-only visual snap.
	const layoutIssues = flow ? [] : boardLayoutIssues(widgets);
	async function fixLayout() {
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
		pick(widgetId);
		if (!editing) setEditing(true);
	}
	// Delete/Backspace and the inspector share the same recoverable removal.
	// RC-CAN-1.2 gave the core `scene.restore-widget`, so removal happens immediately and
	// offers Undo in a toast — the toast holds open until it is taken or dismissed (Toast.jsx pins any
	// toast carrying an action), and the same reversal is on `Ctrl+Z`.
	async function remove(widgetInstanceId: string) {
		const title = titleOf(widgetInstanceId);
		setSelectedId((cur) => (cur === widgetInstanceId ? null : cur));
		const ok = await history.run(
			{
				type: 'scene.destroy-widget',
				actorId,
				payload: { sceneId, widgetInstanceId },
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
		const ok = await history.run(
			{
				type: 'widget.dispatch-command',
				actorId,
				idempotencyKey: crypto.randomUUID(),
				payload: {
					sceneId,
					widgetInstanceId,
					commandType,
					payload,
					expectedRevision: sceneRevision,
				},
			},
			`Changed ${titleOf(widgetInstanceId)}`,
		);
		if (ok) setStatus(null);
	}
	// RC-CAN-4.1: the gallery chooses the slot and focuses the placed tile. RC-CAN-8.1: sized from
	// the one default-size table, and an undo step like every other edit. RC-CAN-8.5: the slot comes
	// from the shared `placeNewTile` (the first free one in view, at the size the table gives), so
	// the board takes it as given, and the gallery hands the new tile back to be selected.
	async function addWidget(entry: WidgetLibraryEntry, position: { x: number; y: number }) {
		const command = addTileCommand(entry, sceneId, position, flow ? 'flow' : 'bounded');
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
		<div
			className="scene-editor"
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
						{posture.stacked ? (
							<StackedBoard
								history={history}
								sceneId={sceneId}
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
								editing={editing && !preview}
								selectedId={selectedId}
								onSelect={pick}
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
								editing={editing && !preview}
								widgets={widgets}
								zoom={zoom}
								onZoom={setZoom}
								onWidgetCommand={operateWidget}
								onFullScreenChange={setLayoutFull}
							>
								<SceneBoardCanvas
									widgets={widgets}
									policy="bounded"
									editing={editing && !preview}
									snap={snap}
									selectedId={selectedId}
									onSelect={pick}
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
			<TemplatePicker
				open={templatesOpen}
				onClose={() => setTemplatesOpen(false)}
				viewport={viewport}
				sceneId={ready ? sceneId : null}
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
			{builder && (
				<WidgetBuilder
					generatedPackage={builder.pkg}
					onClose={() => setBuilder(null)}
					onInstalled={setBuilt}
				/>
			)}
		</div>
	);
}
