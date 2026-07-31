import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type WidgetLibraryEntry,
} from '@dndtools/core';
import { Button, Card, Dialog, Icon, IconButton, Input, Switch } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { widgetRejectionMessage } from '../app/widget-rejection';
import { SceneBoardCanvas, WidgetGlyph } from '../app/SceneBoardCanvas';
import { boardWidgetsOf, payloadIndex, type BoardWidget } from '../app/board-helpers';
import { useViewport } from '../app/useViewport';
import { usePanelFocusReturn } from '../app/usePanelFocusReturn';
import { Page, srOnly } from '../app/screen-kit';
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
	const [pendingDestroyId, setPendingDestroyId] = useState<string | null>(null);
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

	const pendingDestroy = widgets.find((w) => w.id === pendingDestroyId) ?? null;

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

	function move(widgetInstanceId: string, x: number, y: number) {
		if (!homeSceneId) return;
		return dispatch({
			type: 'scene.move-widget',
			actorId,
			payload: { sceneId: homeSceneId, widgetInstanceId, x, y },
		});
	}
	function resize(widgetInstanceId: string, w: number, h: number) {
		if (!homeSceneId) return;
		return dispatch({
			type: 'scene.resize-widget',
			actorId,
			payload: { sceneId: homeSceneId, widgetInstanceId, w, h },
		});
	}
	// Delete/Backspace on a focused widget frame is the ONLY widget-lifecycle operation on `/board`
	// (there is no Inspector here), and `scene.destroy-widget` has no restore counterpart — it takes
	// the instance's configuration (a note's text, a timer's duration, a map binding) with it. So a
	// bare Backspace while arrow-navigating frames stages a confirm, exactly as SceneEditor does.
	function remove(widgetInstanceId: string) {
		if (!homeSceneId) return;
		setPendingDestroyId(widgetInstanceId);
	}
	function confirmDestroy(widgetInstanceId: string) {
		if (!homeSceneId) return;
		setPendingDestroyId(null);
		setSelectedId((cur) => (cur === widgetInstanceId ? null : cur));
		return dispatch({
			type: 'scene.destroy-widget',
			actorId,
			payload: { sceneId: homeSceneId, widgetInstanceId },
		});
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
			setStatus(`Layout “${presetName.trim()}” saved.`);
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
		if (ok) setStatus(`Layout “${name}” applied — you can restore the previous layout.`);
	}
	async function restoreSafePoint() {
		const ok = await dispatch({ type: 'command-center.restore-auto-save', actorId, payload: {} });
		if (ok) setStatus('Previous layout restored.');
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
						The GM Screen is the DM&apos;s control board
					</span>
					<span
						style={{
							font: 'var(--text-sm) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						Only the DM can arrange it. Switch back to the DM view to make changes.
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
						GM Screen
					</h2>
					<div
						style={{
							font: 'var(--text-2xs) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{widgets.length} widget{widgets.length === 1 ? '' : 's'} · your home board
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
									Snap
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
							Add
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
							Layouts
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
					{editing ? 'Done' : 'Edit layout'}
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
					emptyHint={
						ready ? 'Press Edit layout, then Add to place a widget.' : 'Preparing your GM Screen…'
					}
					// Both branches are named: falling through to the canvas default meant a DM who removed
					// every widget from the GM Screen was told "An empty scene" — scene vocabulary on a
					// surface that is deliberately not a scene.
					emptyTitle={ready ? 'Your GM Screen is empty' : 'Setting up your GM Screen'}
				/>

				<Dialog
					open={!!pendingDestroy}
					onClose={() => setPendingDestroyId(null)}
					title={`Remove “${pendingDestroy?.title ?? 'this widget'}”?`}
					description="The widget and its configuration leave your GM Screen. There is no undo for a removed widget — you would have to add and configure a new one."
					icon="delete"
					size="sm"
					footer={
						<>
							<Button variant="secondary" size="sm" onClick={() => setPendingDestroyId(null)}>
								Keep
							</Button>
							<Button
								variant="danger"
								size="sm"
								icon="delete"
								onClick={() => {
									if (pendingDestroyId) void confirmDestroy(pendingDestroyId);
								}}
							>
								Remove widget
							</Button>
						</>
					}
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
								Add widget
							</span>
							<IconButton
								icon="close"
								label="Close"
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
								No widgets are available to add right now.
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
								Layouts
							</span>
							<IconButton
								icon="close"
								label="Close layouts"
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
								Save current layout
							</span>
							<div style={{ display: 'flex', gap: 6 }}>
								<Input
									value={presetName}
									aria-label="Layout name"
									onChange={(e: { target: { value: string } }) => setPresetName(e.target.value)}
									placeholder="e.g. Combat night"
								/>
								<Button
									variant="secondary"
									size="sm"
									icon="check"
									disabled={!presetName.trim()}
									onClick={savePreset}
								>
									Save
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
									Apply a saved layout
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
								Restore previous layout
							</Button>
						)}
					</Card>
				)}
			</div>
		</div>
	);
}
