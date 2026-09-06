import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	listWidgetLibrary,
	resolveAddWidgetCommand,
	type WidgetLibraryEntry,
} from '@dndtools/core';
import { Button, Card, Icon, IconButton, Switch, Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { widgetRejectionMessage } from '../../app/widget-rejection';
import { SceneBoardCanvas } from '../../app/SceneBoardCanvas';
import { useLayoutHistory } from '../../app/canvas/useLayoutHistory';
import { boardWidgetsOf, payloadIndex, type BoardWidget } from '../../app/board-helpers';
import { useViewport } from '../../app/useViewport';
import { usePanelFocusReturn } from '../../app/usePanelFocusReturn';
import { widgetProfileForRuntime } from '../../platform/capabilities';
import { type Visibility } from './shared';
import { SceneMetaPanel } from './SceneMetaPanel';
import { AddWidgetPanel } from './AddWidgetPanel';
import { Inspector } from './Inspector';
import { useI18n } from '../../i18n';

/**
 * SceneEditor (`/scene/:id`) — the prototype's scene canvas (`scene-shell.jsx` + `scene-canvas.jsx`)
 * ported as a React screen and wired to the REAL Processing Core widget platform, mirroring the
 * archived Svelte `scene/[id]/+page.svelte`. The scene + its widgets come from `getSceneForActor`
 * (CANVAS-009, which surfaces hidden / conflicted / missing binding states); every edit flows through
 * the single dispatch choke point: `scene.add-widget`, `scene.move-widget`, `scene.resize-widget`,
 * `scene.configure-widget`, `scene.destroy-widget`.
 *
 * Honest deferrals (mock-only in the prototype, no clean core command yet): the AI-generate dialog,
 * the custom-code widget builder, and local undo/redo (the core has no layout history command).
 */
export function SceneEditor() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const { id = '' } = useParams();
	const actorId = runtime.defaultActorId;
	const viewport = useViewport();

	const [editing, setEditing] = useState(false);
	const [snap, setSnap] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [metaOpen, setMetaOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// `/scene/:id` is ONE route element, so React Router reuses this component across param changes and
	// never unmounts it on a scene→scene navigation (the sidebar and ⌘K both do exactly that). Every
	// piece of per-scene UI state below therefore leaked onto the next scene: an open details panel
	// kept showing — and SAVING — the previous scene's name/description/tags, and a rejection from
	// scene A was displayed under scene B's header.
	useEffect(() => {
		setMetaOpen(false);
		setAddOpen(false);
		setSelectedId(null);
		setEditing(false);
		setError(null);
	}, [id]);

	const summary = getSceneForActor(runtime.state.scenes, runtime.state.permissions, actorId, id, {
		widgetPackages: runtime.state.widgets,
	});
	const denied = 'kind' in summary;
	const rawScene = runtime.state.scenes.scenes[id];

	const widgets: BoardWidget[] = useMemo(() => {
		if (denied || !rawScene) return [];
		return boardWidgetsOf(
			rawScene.widgets,
			payloadIndex(summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
		);
		// `rawScene` + `runtime.state.widgets` are fresh references after each dispatch (immutable
		// reducer updates), so this recomputes whenever the scene or widget packages change.
	}, [denied, rawScene, runtime.state.widgets, summary]);

	const library = denied
		? []
		: listWidgetLibrary(runtime.state.widgets, runtime.state.permissions, actorId, {
				profileId: widgetProfileForRuntime(),
				includeUnavailable: false,
			});

	const selectedInstance = rawScene?.widgets.find((w) => w.id === selectedId) ?? null;
	const selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;

	// Each of these panels has a path that unmounts it while focus is still inside: a successful Add,
	// a saved metadata edit, the Inspector's Close, a deselect. See usePanelFocusReturn.
	usePanelFocusReturn(metaOpen || addOpen);
	usePanelFocusReturn(!!(editing && selectedWidget && selectedInstance && !addOpen && !metaOpen));

	// `SceneRuntime.dispatchNow` RETHROWS after a failed `persistFullState`, and every caller here is
	// fire-and-forget (`void onMove(...)`, `onClick={savePreset}`), so an IndexedDB quota or
	// private-mode failure produced an unhandled rejection, no message at all, and the optimistic
	// draft was dropped — the widget silently snapped back to where it had been.
	const PERSIST_FAILED =
		"That change couldn't be saved to this device. Check storage space and try again.";
	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		// Clear before the attempt: `error` lives in a `role="alert"`, which announces on INSERTION,
		// and re-setting the identical string is an `Object.is` bail-out — so a REPEATED identical
		// failure re-rendered nothing and was announced only the first time.
		setError(null);
		let result;
		try {
			result = await runtime.dispatch(command);
		} catch {
			setError(PERSIST_FAILED);
			return false;
		}
		if (result.status === 'rejected') {
			setError(widgetRejectionMessage(result.rejection));
			return false;
		}
		setError(null);
		return true;
	}

	// RC-CAN-1.3: the local, never-synced undo stack for this scene. It is cleared whenever `id`
	// changes, so Ctrl+Z on one scene can never dispatch an inverse addressed to the previous one.
	const history = useLayoutHistory({ sceneId: id ?? null, runtime, dispatch });
	// The Undo toast's callback outlives the render that raised it (the toast store is outside React),
	// so it reads the stack through a ref rather than closing over one render's copy.
	const historyRef = useRef(history);
	historyRef.current = history;
	const titleOf = (widgetInstanceId: string) =>
		widgets.find((w) => w.id === widgetInstanceId)?.title ?? 'widget';

	function move(widgetInstanceId: string, x: number, y: number) {
		return history.run(
			{
				type: 'scene.move-widget',
				actorId,
				payload: { sceneId: id, widgetInstanceId, x, y },
			},
			`Moved ${titleOf(widgetInstanceId)}`,
		);
	}
	function resize(widgetInstanceId: string, w: number, h: number) {
		return history.run(
			{
				type: 'scene.resize-widget',
				actorId,
				payload: { sceneId: id, widgetInstanceId, w, h },
			},
			`Resized ${titleOf(widgetInstanceId)}`,
		);
	}
	async function addWidget(entry: WidgetLibraryEntry) {
		const count = rawScene?.widgets.length ?? 0;
		const cascade = (count % 6) * 28;
		const command = resolveAddWidgetCommand(entry, id, { x: 48 + cascade, y: 48 + cascade });
		if (!command) return;
		const ok = await dispatch({ type: command.type, actorId, payload: command.payload });
		if (ok) {
			setAddOpen(false);
			if (!editing) setEditing(true);
		}
	}
	// Removing a widget used to stage a confirm dialog, because a destroy took the instance's
	// configuration with it for good. RC-CAN-1.2 gave the core `scene.restore-widget`, so both entry
	// points (the Inspector's Remove button and Delete/Backspace on a focused frame) now just do it
	// and offer Undo — in a toast that holds open until it is taken or dismissed, and on Ctrl+Z.
	async function destroy(widgetInstanceId: string) {
		const title = titleOf(widgetInstanceId);
		setSelectedId(null);
		const ok = await history.run(
			{
				type: 'scene.destroy-widget',
				actorId,
				payload: { sceneId: id, widgetInstanceId },
			},
			`Removed ${title}`,
		);
		if (ok) {
			Toaster.show({
				message: `Removed ${title}`,
				action: 'Undo',
				onAction: () => {
					void historyRef.current.undo();
				},
			});
		}
	}
	// VIEW-mode widget operation (SES-005/SES-003): dispatch a widget-DECLARED durable command through
	// the one envelope the core accepts — fresh idempotencyKey per press + the scene's current revision
	// (`expectedRevision`, packages/core/src/commands/widget-command.ts).
	function operateWidget(
		widgetInstanceId: string,
		commandType: string,
		payload: Record<string, unknown>,
	) {
		if (!rawScene) return;
		return dispatch({
			type: 'widget.dispatch-command',
			actorId,
			idempotencyKey: crypto.randomUUID(),
			payload: {
				sceneId: id,
				widgetInstanceId,
				commandType,
				payload,
				expectedRevision: rawScene.ownership.revision,
			},
		});
	}
	// SCENE METADATA (scene.update-metadata) — scenes are no longer permanently named at creation.
	async function saveMetadata(meta: { name: string; description: string; tags: string[] }) {
		const ok = await dispatch({
			type: 'scene.update-metadata',
			actorId,
			payload: { sceneId: id, name: meta.name, description: meta.description, tags: meta.tags },
		});
		if (ok) setMetaOpen(false);
	}
	// CANVAS-016 — pin the selected widget's explicit keyboard traversal position (null clears it back
	// to the core's derived order).
	function setFocusOrder(widgetInstanceId: string, focusOrder: number | null) {
		return dispatch({
			type: 'scene.set-focus-order',
			actorId,
			payload: { sceneId: id, widgetInstanceId, focusOrder },
		});
	}
	function setVisibility(visibility: Visibility) {
		return setConfig('visibility', visibility);
	}
	// Round-trip a single declared config field through the core. A free-form configuration merge —
	// exactly what `scene.configure-widget` persists — so the canvas body re-renders from the new value
	// and the edit survives reload identically to any other authored change.
	function setConfig(key: string, value: unknown) {
		if (!selectedInstance) return;
		return dispatch({
			type: 'scene.configure-widget',
			actorId,
			payload: {
				sceneId: id,
				widgetInstanceId: selectedInstance.id,
				configuration: { ...selectedInstance.configuration, [key]: value },
			},
		});
	}

	if (denied || !rawScene) {
		return (
			<div style={{ maxWidth: 720, margin: '0 auto' }}>
				<Card
					elevation="raised"
					padding="lg"
					style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
				>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							color: 'var(--color-status-error-text)',
						}}
					>
						<Icon name="error" size="sm" />
						<span style={{ font: '700 var(--text-lg) var(--font-display)' }}>
							{t('sceneEditor.unavailable')}
						</span>
					</div>
					<div
						style={{
							font: 'var(--text-sm) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{denied && 'kind' in summary
							? t('sceneEditor.cannotOpen', { reason: summary.reason })
							: t('sceneEditor.noLongerExists')}
					</div>
					<Button
						variant="secondary"
						icon="arrow-left"
						onClick={() => navigate('/scenes')}
						style={{ alignSelf: 'flex-start' }}
					>
						{t('sceneEditor.backToScenes')}
					</Button>
				</Card>
			</div>
		);
	}

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				// `<main>` is already the bounded pane: viewport-height minus the top bar and (on
				// phone) the tab bar. Asking for the full 100dvh here overflowed by ~94px and pushed
				// the canvas zoom cluster below the fold — and zoom is a required affordance
				// (UX-CANVAS). Subtracting a constant only moved the error: it was still measured off
				// the WHOLE window, so desktop still overflowed. `100%` tracks the pane exactly at
				// every window size. Same fix Board.tsx makes; locked by responsive.spec.ts.
				height: '100%',
				minHeight: 360,
				// Bypassing `<Page>` also meant bypassing its gutters: heading, toolbar and canvas all
				// sat flush against the pane edges. `border-box` keeps `height:'100%'` exact. Phone is
				// exempt for the same reason as Board.tsx — the bounded fit scale is width-derived and
				// already too small there.
				boxSizing: 'border-box',
				padding: viewport === 'phone' ? 0 : '16px 28px',
			}}
		>
			{/* edit toolbar */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-2)',
					// Without wrapping, edit mode's back + edit + snap + add + done controls consumed the
					// whole 393px phone width and ellipsised the scene name to a couple of glyphs.
					// Board.tsx's equivalent toolbar row already wraps.
					flexWrap: 'wrap',
					flex: '0 0 auto',
				}}
			>
				<IconButton
					icon="arrow-left"
					label={t('sceneEditor.backToScenes')}
					variant="ghost"
					onClick={() => navigate('/scenes')}
				/>
				<div style={{ minWidth: 0 }}>
					{/* The shell's only <h1> is the section label ("Scenes"), so without a heading here
					    the page announced no way to tell WHICH scene is open. */}
					<h2
						style={{
							margin: 0,
							font: '700 var(--text-xl) var(--font-display)',
							color: 'var(--color-text-primary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{summary.name}
					</h2>
					<div
						style={{
							font: 'var(--text-2xs) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
						}}
					>
						{t('sceneEditor.widgetSummary', { count: widgets.length })}
					</div>
				</div>
				<IconButton
					icon="edit"
					label={t('sceneEditor.editMeta')}
					variant="ghost"
					size="sm"
					// Both of this toolbar's disclosures were silent about their own state, unlike the
					// equivalent controls on /board. The label is left alone deliberately —
					// canvas.spec.ts locates this button and the Add button by name.
					aria-expanded={metaOpen}
					onClick={() => {
						setMetaOpen((v) => !v);
						setAddOpen(false);
					}}
				/>
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
									{t('sceneEditor.snap')}
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
								setMetaOpen(false);
							}}
						>
							{t('sceneEditor.add')}
						</Button>
					</>
				)}
				<Button
					variant={editing ? 'primary' : 'secondary'}
					size="sm"
					icon={editing ? 'check' : 'edit'}
					onClick={() => {
						setEditing((v) => !v);
						setSelectedId(null);
						setAddOpen(false);
						// …and the details panel too: it also gates the Inspector off, so leaving it
						// open across the Edit-layout toggle made every later widget click inert.
						setMetaOpen(false);
					}}
				>
					{editing ? 'Done' : 'Edit layout'}
				</Button>
			</div>

			{error && (
				<div
					// Rejected layout writes were announced to nobody; Campaign.tsx already does this.
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
					<Icon name="error" size="sm" /> {error}
				</div>
			)}

			{/* canvas + side panels */}
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
					policy="canvas"
					editing={editing}
					snap={snap}
					selectedId={selectedId}
					// The Inspector below is gated `!addOpen && !metaOpen`, but selection was not — so
					// with "Scene details" open, clicking a widget painted its selection ring and title
					// chip and opened no editor at all: a dead end with a visible selection and nothing
					// to do with it. Selecting a widget is about that widget, so it closes the
					// scene-level details panel.
					onSelect={(id) => {
						setSelectedId(id);
						if (id) setMetaOpen(false);
					}}
					onMove={move}
					onResize={resize}
					focusOrder={summary.focusOrder.map((entry) => entry.widgetInstanceId)}
					onRemove={destroy}
					onWidgetCommand={operateWidget}
					history={history}
					emptyHint={
						editing
							? 'Press Add to place your first widget.'
							: 'Press Edit layout, then Add to place a widget.'
					}
				/>

				{metaOpen && (
					<SceneMetaPanel
						// Its three fields are `useState(prop)` drafts with no prop→draft sync, and its Save
						// is a full metadata REPLACEMENT addressed by the route id — with no key tied to the
						// scene, navigating scene→scene with the panel open wrote the OLD scene's name,
						// description and tags onto the new one. `Inspector` below keys on its selected
						// instance for exactly this reason.
						key={id}
						name={summary.name}
						description={summary.description}
						tags={summary.tags}
						phone={viewport === 'phone'}
						onSave={saveMetadata}
						onClose={() => setMetaOpen(false)}
					/>
				)}

				{addOpen && !metaOpen && (
					<AddWidgetPanel
						library={library}
						phone={viewport === 'phone'}
						onAdd={addWidget}
						onClose={() => setAddOpen(false)}
					/>
				)}

				{editing && selectedWidget && selectedInstance && !addOpen && !metaOpen && (
					<Inspector
						key={selectedInstance.id}
						widget={selectedWidget}
						phone={viewport === 'phone'}
						focusOrder={selectedInstance.layout.focusOrder}
						onVisibility={setVisibility}
						onConfigure={setConfig}
						onResize={(w, h) => resize(selectedInstance.id, w, h)}
						onFocusOrder={(order) => setFocusOrder(selectedInstance.id, order)}
						onRemove={() => destroy(selectedInstance.id)}
						onClose={() => setSelectedId(null)}
					/>
				)}
			</div>
		</div>
	);
}
