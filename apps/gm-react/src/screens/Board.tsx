import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type WidgetLibraryEntry,
} from '@dndtools/core';
import { Button, Card, Icon, IconButton, Input, Switch, Toaster } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { widgetRejectionMessage } from '../app/widget-rejection';
import { SceneBoardCanvas, WidgetGlyph } from '../app/SceneBoardCanvas';
import {
	boardHasLayoutIssues,
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
import { Page, srOnly } from '../app/screen-kit';
import { useI18n } from '../i18n';
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
 * the prototype's `scene-canvas.jsx` describes for the home surface.
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
	// The Layouts panel used to render unconditionally whenever edit mode was on, with no close
	// control and no Escape handler — so on a phone (where it is a 280px absolute overlay) it
	// covered all but ~97px of the board and could not be dismissed without leaving edit mode.
	// It is now a peer of the Add panel: a toolbar toggle, a Close button and Escape.
	const [layoutsOpen, setLayoutsOpen] = useState(false);
	const [presetName, setPresetName] = useState('');
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
	const layoutIssues = boardHasLayoutIssues(widgets);
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
	async function savePreset() {
		if (!presetName.trim()) return;
		const ok = await dispatch({
			type: 'command-center.save-preset',
			actorId,
			payload: { name: presetName.trim() },
		});
		if (ok) {
			setStatus(t('board.layoutSaved', { name: presetName.trim() }));
			setPresetName('');
		}
	}
	// Capture the current layout as the auto-save safe point (CMD-008). Best-effort and silent — it is
	// an automatic checkpoint, not a user action, so a rejection (e.g. before the home Scene exists)
	// must not surface as a status message. Taken when an edit session begins and before a preset is
	// applied, so "Restore previous layout" can always revert the last destructive change.
	async function snapshotSafePoint() {
		// `SceneRuntime.dispatchNow` RETHROWS on a persist failure, and this is awaited FIRST inside
		// `applyPreset` — so a failed checkpoint used to throw straight out of the function before
		// the user's own guarded dispatch ever ran: "Apply a saved layout" did nothing, said
		// nothing, and left an unhandled rejection. A best-effort checkpoint must never veto the
		// action it precedes.
		try {
			await runtime.dispatch({ type: 'command-center.snapshot-auto-save', actorId, payload: {} });
		} catch {
			/* silent by design — see above */
		}
	}
	async function applyPreset(presetId: string, name: string) {
		await snapshotSafePoint();
		const ok = await dispatch({
			type: 'command-center.apply-preset',
			actorId,
			payload: { presetId },
		});
		if (ok) setStatus(t('board.layoutApplied', { name }));
	}
	async function restoreSafePoint() {
		const ok = await dispatch({ type: 'command-center.restore-auto-save', actorId, payload: {} });
		if (ok) setStatus(t('board.layoutRestored'));
	}

	if (!isDm) {
		return (
			// `<Page>` rather than a bare max-width div: the raw div has no padding, so on a phone this
			// explainer Card sat flush against both screen edges — every other screen's non-DM/empty
			// state goes through Page and gets the profile's gutters.
			<Page max={640}>
				<Card
					elevation="raised"
					padding="lg"
					style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
				>
					<span
						style={{
							font: '700 var(--text-lg) var(--font-display)',
							color: 'var(--color-text-primary)',
						}}
					>
						{t('board.playerTitle')}
					</span>
					<span
						style={{
							font: 'var(--text-sm) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{t('board.playerBody')}
					</span>
				</Card>
			</Page>
		);
	}

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

			{/* RC-CAN-3.3: a widget dragged (or preset-applied) past the board's columns is clamped back
			    onto the grid at the point it commits, but that snap can still land it on top of another
			    widget. This banner names that honestly instead of leaving an invisible overlap, and
			    offers the one-click fix. */}
			{layoutIssues && (
				<Card
					elevation="flat"
					padding="sm"
					data-testid="board-layout-banner"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						flex: '0 0 auto',
						borderColor: 'var(--color-status-warning)',
					}}
				>
					<Icon name="warning" size="sm" />
					<span style={{ flex: 1, font: 'var(--text-xs) var(--font-sans)' }}>
						{t('board.layoutIssues')}
					</span>
					<Button variant="secondary" size="sm" onClick={() => void fixLayout()}>
						{t('board.fixLayout')}
					</Button>
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
					<Card
						elevation="overlay"
						padding="md"
						data-testid="board-layouts-panel"
						onKeyDown={(e: React.KeyboardEvent) => {
							if (e.key === 'Escape') {
								e.stopPropagation();
								setLayoutsOpen(false);
							}
						}}
						style={{
							width: viewport === 'phone' ? 'min(280px, 100%)' : 260,
							flex: '0 0 auto',
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-3)',
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
								{t('board.layouts')}
							</span>
							<IconButton
								icon="close"
								label={t('board.closeLayouts')}
								variant="ghost"
								size="sm"
								onClick={() => setLayoutsOpen(false)}
							/>
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							<span
								style={{
									font: '600 var(--text-xs) var(--font-sans)',
									color: 'var(--color-text-secondary)',
								}}
							>
								{t('board.saveCurrentLayout')}
							</span>
							<div style={{ display: 'flex', gap: 6 }}>
								<Input
									value={presetName}
									aria-label={t('board.layoutName')}
									onChange={(e: { target: { value: string } }) => setPresetName(e.target.value)}
									placeholder={t('board.layoutNamePlaceholder')}
								/>
								<Button
									variant="secondary"
									size="sm"
									icon="check"
									disabled={!presetName.trim()}
									onClick={savePreset}
								>
									{t('common.action.save')}
								</Button>
							</div>
						</div>
						{presets.length > 0 && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
								<span
									style={{
										font: '600 var(--text-xs) var(--font-sans)',
										color: 'var(--color-text-secondary)',
									}}
								>
									{t('board.applySavedLayout')}
								</span>
								{presets.map((preset) => (
									<Button
										key={preset.id}
										variant="ghost"
										size="sm"
										icon="scene"
										onClick={() => applyPreset(preset.id, preset.name)}
										style={{ justifyContent: 'flex-start' }}
									>
										{preset.name}
									</Button>
								))}
							</div>
						)}
						{runtime.state.commandCenter.autoSave && (
							<Button
								variant="ghost"
								size="sm"
								icon="retry"
								onClick={restoreSafePoint}
								style={{ alignSelf: 'flex-start' }}
							>
								{t('board.restorePrevious')}
							</Button>
						)}
					</Card>
				)}
			</div>
		</div>
	);
}
