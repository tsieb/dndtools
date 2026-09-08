import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type WidgetLibraryEntry,
} from '@dndtools/core';
import { Button, Card, Icon, IconButton, Popover, Switch, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { widgetRejectionMessage } from '../app/widget-rejection';
import {
	SceneBoardCanvas,
	WidgetGlyph,
	ZOOM_PRESETS,
	ZOOM_PRESET_KEY,
	type ZoomPreset,
} from '../app/SceneBoardCanvas';
import { BoardLayoutsPanel } from './BoardLayoutsPanel';
import {
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
import { srOnly } from '../app/screen-kit';
import { useI18n } from '../i18n';
import { BoardPlayerNotice } from './board/BoardPlayerNotice';
import { useBoardLayouts } from './board/useBoardLayouts';
import { widgetProfileForRuntime } from '../platform/capabilities';

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
 * `scroll-pan`) for the one gesture a real scroll container doesn't grant for free. There is still no
 * free zoom slider and no pinch-zoom — only the three named steps above.
 */
// `SceneRuntime.dispatchNow` RETHROWS after a failed `persistFullState`, and every caller here is
// fire-and-forget (`void onMove(...)`, `onClick={savePreset}`), so an IndexedDB quota or
// private-mode failure produced an unhandled rejection, no message at all, and the optimistic
// draft was dropped — the widget silently snapped back to where it had been.
const PERSIST_FAILED =
	"That change couldn't be saved to this device. Check storage space and try again.";

export function Board() {
	const runtime = useRuntime();
	const { t } = useI18n();
	const viewport = useViewport();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const [editing, setEditing] = useState(false);
	const [snap, setSnap] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	// RC-CAN-3.1: the board's zoom lives here, not in the canvas, so the control can sit in the
	// toolbar. The bounded canvas IS its own scroll container, so an in-canvas control would scroll
	// away from the widgets it applies to and sit on top of the top-left widget while it did.
	const [zoom, setZoom] = useState<ZoomPreset>('fit');
	// The Layouts panel used to render unconditionally whenever edit mode was on, with no close
	// control and no Escape handler — so on a phone (where it is a 280px absolute overlay) it
	// covered all but ~97px of the board and could not be dismissed without leaving edit mode.
	// It is now a peer of the Add panel: a toolbar toggle, a Close button and Escape.
	const [layoutsOpen, setLayoutsOpen] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	// RC-CAN-3.4 — the layout quality indicator's own popover, separate from Add/Layouts so opening
	// it does not fight their shared side slot.
	const [qualityOpen, setQualityOpen] = useState(false);
	const qualityTriggerRef = useRef<HTMLButtonElement>(null);
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

	const homeSceneId = runtime.state.commandCenter.homeSceneId;
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
		if (!runtime.loaded || !isDm || ensuringRef.current) return;
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
	}, [runtime, runtime.loaded, isDm, homeSceneId, summary, actorId]);

	const widgets: BoardWidget[] = useMemo(() => {
		if (!ready || !homeSceneId) return [];
		const rawScene = runtime.state.scenes.scenes[homeSceneId];
		if (!rawScene) return [];
		return boardWidgetsOf(
			rawScene.widgets,
			payloadIndex(summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
		);
	}, [ready, homeSceneId, runtime.state.scenes, runtime.state.widgets, summary]);

	const presets = Object.values(runtime.state.commandCenter.presets).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const library = isDm
		? listWidgetLibrary(runtime.state.widgets, runtime.state.permissions, actorId, {
				profileId: widgetProfileForRuntime(),
				includeUnavailable: false,
			})
		: [];

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
		const clampedX = widget ? clampToColumns(x, widget.w) : x;
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
		const clampedW = widget ? clampWidthToColumns(widget.x, w) : w;
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
	const layoutIssues = boardLayoutIssues(widgets);
	async function fixLayout() {
		if (!homeSceneId) return;
		const next = repackBoardColumns(widgets);
		for (const widget of widgets) {
			const pos = next.get(widget.id);
			if (!pos || (pos.x === widget.x && pos.y === widget.y)) continue;
			await move(widget.id, pos.x, pos.y);
		}
		setQualityOpen(false);
		setStatus(t('board.layoutFixed'));
	}
	// RC-CAN-3.4 — "Select" on a listed issue puts the offender under the SAME selection state a
	// pointer click on the canvas sets (`SceneBoardCanvas` only paints the selected outline in edit
	// mode), so it has to also enter edit mode rather than selecting a widget the canvas can't show
	// as selected yet.
	function selectIssue(widgetId: string) {
		setSelectedId(widgetId);
		if (!editing) setEditing(true);
		setQualityOpen(false);
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
	async function addWidget(entry: WidgetLibraryEntry) {
		if (!homeSceneId) return;
		const count = widgets.length;
		const cascade = (count % 6) * 28;
		const command = resolveAddWidgetCommand(entry, homeSceneId, {
			x: 48 + cascade,
			y: 48 + cascade,
		});
		if (!command) return;
		const ok = await dispatch({ type: command.type, actorId, payload: command.payload });
		if (ok) {
			setAddOpen(false);
			if (!editing) setEditing(true);
		}
	}

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
				minHeight: 360,
				// `/board` and `/scene/:id` are the only two screens that bypass `<Page>`, so without
				// this they rendered flush against the pane edges — heading, toolbar and the canvas's
				// own rounded border all touching, so the border read as a crop. `border-box` keeps
				// `height:'100%'` exact.
				// NOT on phone: the bounded canvas derives its fit scale from the AVAILABLE WIDTH
				// (SceneBoardCanvas `boundedScale`), which on a 375px handset is already ~0.45 and too
				// small to read. A gutter there would shrink it further to buy whitespace it cannot
				// afford — and it measurably tipped the phone board out of its own scroll range.
				boxSizing: 'border-box',
				padding: viewport === 'phone' ? 0 : '16px 28px',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					flex: '0 0 auto',
					flexWrap: 'wrap',
				}}
			>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 30,
						height: 30,
						borderRadius: 'var(--radius-md)',
						background: 'var(--color-accent)',
						color: 'var(--color-accent-foreground)',
						flex: '0 0 auto',
					}}
				>
					<Icon name="home" size="sm" />
				</span>
				<div style={{ minWidth: 0, flex: '1 1 160px' }}>
					{/* The shell's <h1> lives in the top bar, outside <main>, so heading navigation
					    found nothing inside the board pane. */}
					<h2
						style={{
							margin: 0,
							font: '700 var(--text-xl) var(--font-display)',
							color: 'var(--color-text-primary)',
						}}
					>
						{t('board.title')}
					</h2>
					<div
						style={{
							font: 'var(--text-2xs) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{t('board.widgetCount', { count: widgets.length })}
					</div>
				</div>
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
					</>
				)}
				{/* The three named zoom steps. Always available: reading the board at Detail is as much
				    a viewing act as an editing one. */}
				<div
					role="group"
					aria-label={t('boardCanvas.zoomGroup')}
					data-testid="board-zoom-presets"
					// Wraps INSIDE the group: at 200% text "Comfortable" alone is a third of a 360px
					// phone, and a group that could only wrap as a unit widened `#main-content`.
					style={{ display: 'flex', flexWrap: 'wrap', gap: 2, flex: '0 1 auto', minWidth: 0 }}
				>
					{ZOOM_PRESETS.map((preset) => (
						<Button
							key={preset}
							variant={zoom === preset ? 'primary' : 'ghost'}
							size="sm"
							aria-pressed={zoom === preset}
							onClick={() => setZoom(preset)}
						>
							{t(ZOOM_PRESET_KEY[preset])}
						</Button>
					))}
				</div>
				<Button
					variant={editing ? 'primary' : 'secondary'}
					size="sm"
					icon={editing ? 'check' : 'edit'}
					onClick={() => {
						const next = !editing;
						if (next) void snapshotSafePoint();
						setEditing(next);
						setSelectedId(null);
						setAddOpen(false);
						setLayoutsOpen(false);
					}}
				>
					{editing ? t('board.done') : t('board.editLayout')}
				</Button>
			</div>

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
				<div
					// Rejections get `role="alert"` and the error tone (mirroring SceneEditor) so a failed
					// write is neither announced politely-and-late nor painted like a confirmation.
					role="alert"
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 6,
						font: 'var(--text-xs) var(--font-sans)',
						color: 'var(--color-status-error-text)',
						flex: '0 0 auto',
					}}
				>
					<Icon name="warning" size="sm" /> {error}
				</div>
			)}

			{/* RC-CAN-3.3/3.4: a widget dragged (or preset-applied) past the board's columns is clamped
			    back onto the grid at the point it commits, but that snap can still land it on top of
			    another widget. This banner names that honestly instead of leaving an invisible overlap,
			    and its own text is the quality indicator's trigger: a Popover lists every offender by
			    name (shape — warning triangle for an overflow, error circle for an overlap — carries
			    the distinction, not colour alone) with a "Select" that jumps the DM straight to it,
			    alongside the one-click "Fix layout". */}
			{layoutIssues.length > 0 && (
				<Card
					elevation="flat"
					padding="sm"
					data-testid="board-layout-banner"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						flex: '0 0 auto',
						position: 'relative',
						borderColor: 'var(--color-status-warning)',
					}}
				>
					<Icon name="warning" size="sm" />
					<button
						type="button"
						ref={qualityTriggerRef}
						aria-haspopup="true"
						aria-expanded={qualityOpen}
						data-testid="board-layout-quality-trigger"
						onClick={() => setQualityOpen((v) => !v)}
						style={{
							flex: 1,
							textAlign: 'left',
							background: 'transparent',
							border: 'none',
							padding: 0,
							cursor: 'pointer',
							font: 'var(--text-xs) var(--font-sans)',
							color: 'var(--color-text-primary)',
							textDecoration: 'underline',
							textUnderlineOffset: 2,
						}}
					>
						{t('board.layoutIssues', { count: layoutIssues.length })}
					</button>
					<Button variant="secondary" size="sm" onClick={() => void fixLayout()}>
						{t('board.fixLayout')}
					</Button>
					{qualityOpen && (
						<Popover
							triggerRef={qualityTriggerRef}
							title={t('board.layoutIssuesTitle')}
							onClose={() => setQualityOpen(false)}
							style={{ position: 'absolute', top: '100%', left: 0, marginTop: 'var(--space-1)' }}
						>
							<ul
								data-testid="board-layout-issue-list"
								style={{
									listStyle: 'none',
									margin: 0,
									padding: 0,
									display: 'flex',
									flexDirection: 'column',
									gap: 'var(--space-2)',
								}}
							>
								{layoutIssues.map((issue, index) => (
									<li
										key={`${issue.kind}-${issue.widgetId}-${issue.otherWidgetId ?? index}`}
										style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
									>
										<Icon name={issue.kind === 'overflow' ? 'warning' : 'error'} size="sm" />
										<span style={{ flex: 1, font: 'var(--text-xs) var(--font-sans)' }}>
											{issue.kind === 'overflow'
												? t('board.layoutIssueOverflow', { widget: titleOf(issue.widgetId) })
												: t('board.layoutIssueOverlap', {
														widget: titleOf(issue.widgetId),
														other: titleOf(issue.otherWidgetId!),
													})}
										</span>
										<Button variant="ghost" size="sm" onClick={() => selectIssue(issue.widgetId)}>
											{t('board.selectIssue')}
										</Button>
									</li>
								))}
							</ul>
						</Popover>
					)}
				</Card>
			)}

			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: 'flex',
					gap: 'var(--space-3)',
					position: 'relative',
				}}
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
					emptyHint={ready ? t('board.emptyHint') : t('board.preparingHint')}
					// Both branches are named: falling through to the canvas default meant a DM who removed
					// every widget from the GM Screen was told "An empty scene" — scene vocabulary on a
					// surface that is deliberately not a scene.
					emptyTitle={ready ? t('board.emptyTitle') : t('board.preparingTitle')}
					history={history}
					zoomPreset={zoom}
					onZoomPresetChange={setZoom}
				/>

				{addOpen && (
					<Card
						elevation="overlay"
						padding="md"
						onKeyDown={(e: React.KeyboardEvent) => {
							if (e.key === 'Escape') {
								e.stopPropagation();
								setAddOpen(false);
							}
						}}
						style={{
							width: viewport === 'phone' ? 'min(300px, 100%)' : 300,
							flex: '0 0 auto',
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-2)',
							maxHeight: '100%',
							overflow: 'auto',
							...(viewport === 'phone'
								? { position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 4 }
								: {}),
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
							<span
								style={{
									flex: 1,
									font: '700 var(--text-md) var(--font-display)',
									color: 'var(--color-text-primary)',
								}}
							>
								{t('board.addWidget')}
							</span>
							<IconButton
								icon="close"
								label={t('common.action.close')}
								variant="ghost"
								size="sm"
								onClick={() => setAddOpen(false)}
							/>
						</div>
						{library.length === 0 ? (
							<div
								style={{
									font: 'var(--text-xs) var(--font-sans)',
									color: 'var(--color-text-tertiary)',
								}}
							>
								{t('board.noWidgets')}
							</div>
						) : (
							library.map((entry) => (
								<button
									key={`${entry.packageId}:${entry.type}`}
									type="button"
									onClick={() => addWidget(entry)}
									style={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: 'var(--space-2)',
										padding: 'var(--space-2)',
										textAlign: 'left',
										border: '1px solid var(--color-border)',
										borderRadius: 'var(--radius-md)',
										background: 'var(--color-surface-alt)',
										cursor: 'pointer',
									}}
								>
									<WidgetGlyph icon={entry.icon ?? 'widget'} size="sm" />
									<div style={{ minWidth: 0 }}>
										<div
											style={{
												font: '600 var(--text-sm) var(--font-sans)',
												color: 'var(--color-text-primary)',
											}}
										>
											{entry.displayName}
										</div>
										{entry.description && (
											<div
												style={{
													font: 'var(--text-2xs)/1.4 var(--font-sans)',
													color: 'var(--color-text-tertiary)',
												}}
											>
												{entry.description}
											</div>
										)}
									</div>
								</button>
							))
						)}
					</Card>
				)}

				{editing && layoutsOpen && (
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
		</div>
	);
}
