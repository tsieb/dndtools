import { useEffect, useMemo, useRef, useState } from 'react';
import {
	findWidgetDefinition,
	getSceneForActor,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type WidgetLibraryEntry,
} from '@dndtools/core';
import { Button, Card, Icon, IconButton, Input, Switch } from '../ds';
import { useRuntime } from '../runtime/RuntimeContext';
import { SceneBoardCanvas, WidgetGlyph } from '../app/SceneBoardCanvas';
import { boardWidgetsOf, payloadIndex, type BoardWidget } from '../app/board-helpers';

/**
 * Board (`/board`) — the Command Center spatial board: the application's home Scene rendered as a
 * canvas of system widgets, ported from the prototype's bounded "Home" scene and wired to the REAL
 * Processing Core, mirroring `board/+page.svelte`. The DM's home Scene is materialized the first time
 * the board loads (`command-center.ensure-home`, CMD-001); its seeded system widgets then read out of
 * `getSceneForActor`. Widgets move/resize through `scene.move-widget` / `scene.resize-widget`; new
 * widgets come from the profile-evaluated widget library; and the layout is recoverable through the
 * core's preset + auto-save safe-point commands (CMD-008).
 *
 * It uses the BOUNDED canvas policy (glanceable, scrolls, keyboard-first) — the accessibility answer
 * the prototype's `scene-canvas.jsx` describes for the home surface.
 */
export function Board() {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const [editing, setEditing] = useState(false);
	const [snap, setSnap] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [presetName, setPresetName] = useState('');
	const [status, setStatus] = useState<string | null>(null);
	const ensuringRef = useRef(false);

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
				profileId: 'desktop',
				includeUnavailable: false,
			})
		: [];

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			setStatus(result.rejection.message ?? 'That action could not be completed.');
			return false;
		}
		return true;
	}

	function move(widgetInstanceId: string, x: number, y: number) {
		if (!homeSceneId) return;
		return dispatch({ type: 'scene.move-widget', actorId, payload: { sceneId: homeSceneId, widgetInstanceId, x, y } });
	}
	function resize(widgetInstanceId: string, w: number, h: number) {
		if (!homeSceneId) return;
		return dispatch({ type: 'scene.resize-widget', actorId, payload: { sceneId: homeSceneId, widgetInstanceId, w, h } });
	}
	function remove(widgetInstanceId: string) {
		if (!homeSceneId) return;
		setSelectedId((cur) => (cur === widgetInstanceId ? null : cur));
		return dispatch({ type: 'scene.destroy-widget', actorId, payload: { sceneId: homeSceneId, widgetInstanceId } });
	}
	// VIEW-mode widget operation (SES-005/SES-003): a widget-DECLARED durable command through the one
	// envelope the core accepts — fresh idempotencyKey per press + the scene's current revision.
	async function operateWidget(widgetInstanceId: string, commandType: string, payload: Record<string, unknown>) {
		if (!homeSceneId) return;
		const ok = await dispatch({
			type: 'widget.dispatch-command',
			actorId,
			idempotencyKey: crypto.randomUUID(),
			payload: { sceneId: homeSceneId, widgetInstanceId, commandType, payload, expectedRevision: sceneRevision },
		});
		if (ok) setStatus(null);
	}
	async function addWidget(entry: WidgetLibraryEntry) {
		if (!homeSceneId) return;
		const count = widgets.length;
		const cascade = (count % 6) * 28;
		const command = resolveAddWidgetCommand(entry, homeSceneId, { x: 48 + cascade, y: 48 + cascade });
		if (!command) return;
		const ok = await dispatch({ type: command.type, actorId, payload: command.payload });
		if (ok) {
			setAddOpen(false);
			if (!editing) setEditing(true);
		}
	}
	async function savePreset() {
		if (!presetName.trim()) return;
		const ok = await dispatch({ type: 'command-center.save-preset', actorId, payload: { name: presetName.trim() } });
		if (ok) {
			setStatus(`Layout “${presetName.trim()}” saved.`);
			setPresetName('');
		}
	}
	// Capture the current layout as the auto-save safe point (CMD-008). Best-effort and silent — it is
	// an automatic checkpoint, not a user action, so a rejection (e.g. before the home Scene exists)
	// must not surface as a status message. Taken when an edit session begins and before a preset is
	// applied, so "Restore safe point" can always revert the last destructive change.
	async function snapshotSafePoint() {
		await runtime.dispatch({ type: 'command-center.snapshot-auto-save', actorId, payload: {} });
	}
	async function applyPreset(presetId: string, name: string) {
		await snapshotSafePoint();
		const ok = await dispatch({ type: 'command-center.apply-preset', actorId, payload: { presetId } });
		if (ok) setStatus(`Layout “${name}” applied — restore the safe point to undo.`);
	}
	async function restoreSafePoint() {
		const ok = await dispatch({ type: 'command-center.restore-auto-save', actorId, payload: {} });
		if (ok) setStatus('Layout restored from the last safe point.');
	}

	if (!isDm) {
		return (
			<div style={{ maxWidth: 640, margin: '0 auto' }}>
				<Card elevation="raised" padding="lg" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
					<span style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-primary)' }}>
						The board is the DM&apos;s home
					</span>
					<span style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-secondary)' }}>
						The Command Center board is authored by the DM. Switch back to the DM view to arrange it.
					</span>
				</Card>
			</div>
		);
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', height: 'calc(100vh - var(--space-8))' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '0 0 auto' }}>
				<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: 'var(--color-accent-foreground)', flex: '0 0 auto' }}>
					<Icon name="home" size="sm" />
				</span>
				<div style={{ minWidth: 0 }}>
					<div style={{ font: '700 var(--text-xl) var(--font-display)', color: 'var(--color-text-primary)' }}>Command Center</div>
					<div style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
						{widgets.length} widget{widgets.length === 1 ? '' : 's'} · home · fits to screen
					</div>
				</div>
				<div style={{ flex: 1 }} />
				{editing && (
					<>
						<Switch
							checked={snap}
							onChange={setSnap}
							label={<span style={{ font: 'var(--text-2xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>Snap</span>}
						/>
						<Button variant="secondary" size="sm" icon="add" onClick={() => setAddOpen((v) => !v)}>
							Add
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
					}}
				>
					{editing ? 'Done' : 'Edit layout'}
				</Button>
			</div>

			{status && (
				<div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)', flex: '0 0 auto' }}>
					<Icon name="info" size="sm" /> {status}
				</div>
			)}

			<div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 'var(--space-3)', position: 'relative' }}>
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
						ready
							? 'Press Edit layout, then Add to place a widget.'
							: 'Preparing your home board…'
					}
				/>

				{addOpen && (
					<Card elevation="overlay" padding="md" style={{ width: 300, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '100%', overflow: 'auto' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
							<span style={{ flex: 1, font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>Add widget</span>
							<IconButton icon="close" label="Close" variant="ghost" size="sm" onClick={() => setAddOpen(false)} />
						</div>
						{library.length === 0 ? (
							<div style={{ font: 'var(--text-xs) var(--font-sans)', color: 'var(--color-text-tertiary)' }}>No widgets available to add.</div>
						) : (
							library.map((entry) => (
								<button
									key={`${entry.packageId}:${entry.type}`}
									type="button"
									onClick={() => addWidget(entry)}
									style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', padding: 'var(--space-2)', textAlign: 'left', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)', cursor: 'pointer' }}
								>
									<WidgetGlyph icon={entry.icon ?? 'widget'} size="sm" />
									<div style={{ minWidth: 0 }}>
										<div style={{ font: '600 var(--text-sm) var(--font-sans)', color: 'var(--color-text-primary)' }}>{entry.displayName}</div>
										{entry.description && (
											<div style={{ font: 'var(--text-2xs)/1.4 var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{entry.description}</div>
										)}
									</div>
								</button>
							))
						)}
					</Card>
				)}

				{editing && !addOpen && (
					<Card elevation="overlay" padding="md" style={{ width: 260, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '100%', overflow: 'auto' }}>
						<span style={{ font: '700 var(--text-md) var(--font-display)', color: 'var(--color-text-primary)' }}>Layouts</span>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							<span style={{ font: '600 var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>Save current as preset</span>
							<div style={{ display: 'flex', gap: 6 }}>
								<Input
									value={presetName}
									onChange={(e: { target: { value: string } }) => setPresetName(e.target.value)}
									placeholder="e.g. Combat night"
								/>
								<Button variant="secondary" size="sm" icon="check" disabled={!presetName.trim()} onClick={savePreset}>
									Save
								</Button>
							</div>
						</div>
						{presets.length > 0 && (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
								<span style={{ font: '600 var(--text-xs) var(--font-sans)', color: 'var(--color-text-secondary)' }}>Apply a saved layout</span>
								{presets.map((preset) => (
									<Button key={preset.id} variant="ghost" size="sm" icon="scene" onClick={() => applyPreset(preset.id, preset.name)} style={{ justifyContent: 'flex-start' }}>
										{preset.name}
									</Button>
								))}
							</div>
						)}
						{runtime.state.commandCenter.autoSave && (
							<Button variant="ghost" size="sm" icon="retry" onClick={restoreSafePoint} style={{ alignSelf: 'flex-start' }}>
								Restore safe point
							</Button>
						)}
					</Card>
				)}
			</div>
		</div>
	);
}
