import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
	findWidgetDefinition,
	getSceneForActor,
	resolveAddWidgetCommand,
	screenLayoutPolicy,
	type ScreenLayoutPolicy,
	type WidgetLibraryEntry,
	type WidgetPackageDefinition,
} from '@dndtools/core';
import { Button, Card, Icon, IconButton, Switch, Toaster } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { widgetRejectionMessage } from '../../app/widget-rejection';
import { SceneBoardCanvas } from '../../app/SceneBoardCanvas';
import { FlowBoard } from '../../app/canvas/FlowBoard';
import { useLayoutHistory } from '../../app/canvas/useLayoutHistory';
import { registerCanvasSurface } from '../../app/shortcuts/registry';
import { boardWidgetsOf, payloadIndex, type BoardWidget } from '../../app/board-helpers';
import { Seg } from '../../app/screen-kit';
import { useViewport } from '../../app/useViewport';
import { usePanelFocusReturn } from '../../app/usePanelFocusReturn';
import { AddWidgetGallery } from '../../app/canvas/AddWidgetGallery';
import { TemplatePicker, TemplateStartEntry } from '../../app/canvas/TemplatePicker';
import { type Visibility } from './shared';
import { SceneMetaPanel } from './SceneMetaPanel';
import { GenerateDialog } from '../../app/widgetBuilder/GenerateDialog';
import { WidgetBuilder } from '../extensions/WidgetBuilder';
import { Inspector } from './Inspector';
import { useI18n } from '../../i18n';
import { ViewAsControl, usePreviewActions } from '../../app/ViewAsControl';
import { PlayerPreviewOverlay } from './PlayerPreviewOverlay';
import { readPlayerPreview } from './playerPreview';

/**
 * SceneEditor (`/scene/:id`) — the prototype's scene canvas (`scene-shell.jsx` + `scene-canvas.jsx`)
 * ported as a React screen and wired to the REAL Processing Core widget platform, mirroring the
 * archived Svelte `scene/[id]/+page.svelte`. The scene + its widgets come from `getSceneForActor`
 * (CANVAS-009, which surfaces hidden / conflicted / missing binding states); every edit flows through
 * the single dispatch choke point: `scene.add-widget`, `scene.move-widget`, `scene.resize-widget`,
 * `scene.configure-widget`, `scene.destroy-widget`.
 *
 * "Generate widget" (RC-WID-3.2) opens the assistant's widget dialog: the run STAGES a proposal and
 * the manual builder opens on it for review, so nothing is installed or placed without the DM.
 *
 * RC-CAN-7.7 / ADR-041: the scene carries a LAYOUT POLICY, and this screen is the surface that both
 * renders it and changes it. `canvas` is the free spatial editor this screen has always been;
 * `flow` is the responsive column grid hub screens use. Both host the same widget instances and the
 * same commands — the policy picks the engine, it converts nothing.
 *
 * "What player X sees" (RC-CAN-6.1): while the runtime previews as another role — from the canvas's
 * own switcher or the top bar's — an overlay covers the canvas, dims every tile the previewed actor's
 * read withholds and says why, and editing is suspended underneath it. Escape leaves preview.
 */
export function SceneEditor() {
	const { t } = useI18n();
	const runtime = useRuntime();
	const navigate = useNavigate();
	const { id = '' } = useParams();
	const actorId = runtime.defaultActorId;
	const viewport = useViewport();
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
	const [metaOpen, setMetaOpen] = useState(false);
	// RC-CAN-4.4 — the scene-template picker, opened from the empty canvas or the gallery header.
	const [templatesOpen, setTemplatesOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
		setError(null);
	}, [id]);

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

	const widgets: BoardWidget[] = useMemo(() => {
		if ((denied && !previewBlocked) || !rawScene) return [];
		return boardWidgetsOf(
			rawScene.widgets,
			payloadIndex('kind' in summary ? [] : summary.widgets),
			(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
		);
		// `rawScene` + `runtime.state.widgets` are fresh references after each dispatch (immutable
		// reducer updates), so this recomputes whenever the scene or widget packages change.
	}, [denied, previewBlocked, rawScene, runtime.state.widgets, summary]);

	// ADR-041 — which engine this scene renders in. `screenMetaOf` defaults to `canvas`, so every
	// scene authored before screens existed keeps exactly the surface it had.
	const layoutPolicy: ScreenLayoutPolicy = rawScene ? screenLayoutPolicy(rawScene) : 'canvas';

	const selectedInstance = rawScene?.widgets.find((w) => w.id === selectedId) ?? null;
	const selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;

	// Each of these panels has a path that unmounts it while focus is still inside: a successful Add,
	// a saved metadata edit, the Inspector's Close, a deselect. See usePanelFocusReturn.
	usePanelFocusReturn(metaOpen || addOpen);
	usePanelFocusReturn(!!(editing && selectedWidget && selectedInstance && !addOpen && !metaOpen));

	// RC-CAN-6.1 — editing is SUSPENDED while previewing, not torn down: the canvas, its selection and
	// any open panel (with its unsaved draft) stay exactly as they were under the overlay, out of reach,
	// and come back untouched on exit. React 18 has no `inert` prop, so it is set on the node.
	const previewing = previewRead !== null;
	useEffect(() => {
		stageRef.current?.toggleAttribute('inert', previewing);
	});

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
	// The policy is durable scene state, not a view toggle: `scene.set-layout-policy` writes the
	// policy and nothing else, so widget identity, configuration and bindings come through untouched.
	function setLayoutPolicy(next: string) {
		if (next === layoutPolicy) return;
		return dispatch({
			type: 'scene.set-layout-policy',
			actorId,
			payload: { sceneId: id, layoutPolicy: next },
		});
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
	// RC-CAN-4.1: the gallery picks the first open slot and focuses the placed tile.
	async function addWidget(entry: WidgetLibraryEntry, position: { x: number; y: number }) {
		const command = resolveAddWidgetCommand(entry, id, position);
		if (!command) return false;
		const ok = await dispatch({ type: command.type, actorId, payload: command.payload });
		if (ok && !editing) setEditing(true);
		return ok;
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
	// Escape and "Exit preview" both land here. The overlay — and the button that may hold focus —
	// unmounts on exit, so focus goes to this scene's own switcher instead of falling to <body>.
	function exitPreview(focusWasInOverlay: boolean) {
		previewActions.exit();
		if (focusWasInOverlay || document.activeElement === document.body) {
			previewTriggerRef.current?.querySelector('button')?.focus();
		}
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
			undo: () => void historyRef.current.undo(),
		});
	});

	if ((denied && !previewBlocked) || !rawScene) {
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

	const emptyHint = editing
		? 'Press Add to place your first widget.'
		: 'Press Edit layout, then Add to place a widget.';
	// A preview-blocked scene has no actor summary; its header and details come from the raw scene.
	const shown = 'kind' in summary ? rawScene : summary;

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
						{shown.name}
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
				{!previewing && (
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
				)}
				<div style={{ flex: 1 }} />
				{editing && !previewing && (
					<>
						{/* ADR-041 — the policy picker. It is a durable scene property, so it lives beside
						    the other layout controls rather than in a settings dialog. */}
						<Seg
							ariaLabel={t('sceneEditor.layout')}
							value={layoutPolicy}
							onChange={setLayoutPolicy}
							options={[
								{
									value: 'flow',
									label: t('sceneEditor.layoutFlow'),
									title: t('sceneEditor.layoutFlowHint'),
								},
								{
									value: 'canvas',
									label: t('sceneEditor.layoutCanvas'),
									title: t('sceneEditor.layoutCanvasHint'),
								},
							]}
						/>
						{/* Snap is a CANVAS affordance: flow has no free coordinates to snap to. */}
						{layoutPolicy === 'canvas' && (
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
						)}
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
						<Button
							variant="secondary"
							size="sm"
							icon="sparkle"
							onClick={() => {
								setGenerateOpen(true);
								setAddOpen(false);
								setMetaOpen(false);
							}}
						>
							{t('widgetGen.title')}
						</Button>
					</>
				)}
				{/* RC-CAN-6.1 — this canvas's own "what player X sees" switcher. */}
				<div ref={previewTriggerRef} style={{ display: 'contents' }}>
					<ViewAsControl placement="scene" compact={viewport === 'phone'} />
				</div>
				{/* The subtle accent, as on the GM Screen: one gold primary per region (RC-ENG-8.4). */}
				{!previewing && (
					<Button
						variant={editing ? 'accent' : 'secondary'}
						size="sm"
						icon={editing ? 'check' : 'edit'}
						onClick={() => enterEditing(!editing)}
					>
						{editing ? 'Done' : 'Edit layout'}
					</Button>
				)}
			</div>

			{/* RC-CAN-4.4 — the empty-state moment for templates. The canvas's own empty message sits under
			    `pointer-events: none`, so the offer lives in the page flow above it instead. */}
			{widgets.length === 0 && !previewing && (
				<div
					data-testid="scene-empty-templates"
					style={{
						display: 'flex',
						alignItems: 'center',
						flexWrap: 'wrap',
						gap: 'var(--space-2)',
						flex: '0 0 auto',
						font: 'var(--text-xs) var(--font-sans)',
						color: 'var(--color-text-secondary)',
					}}
				>
					<span>{t('sceneEditor.emptyTemplatesHint')}</span>
					<Button
						variant="secondary"
						size="sm"
						icon="layers"
						onClick={() => {
							setTemplatesOpen(true);
							setAddOpen(false);
							setMetaOpen(false);
						}}
					>
						{t('sceneEditor.useTemplate')}
					</Button>
				</div>
			)}

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

			{/* canvas + side panels, with the player-view preview overlay above them (RC-CAN-6.1) */}
			<div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
				<div
					ref={stageRef}
					data-testid="scene-editor-stage"
					style={{
						flex: 1,
						minHeight: 0,
						minWidth: 0,
						display: 'flex',
						gap: 'var(--space-3)',
						position: 'relative',
					}}
				>
					{/* ADR-041 — one policy, one engine. Both read the SAME `widgets` view-model and commit
				    through the SAME `move`/`resize`/`destroy`/`operateWidget`; switching the policy
				    changes no widget, no configuration and no binding.

				    `focusOrder` goes only to the canvas. Flow's layout order IS its focus order, so it
				    accepts no traversal override — see `FlowBoardProps`. */}
					{layoutPolicy === 'flow' ? (
						<FlowBoard
							widgets={widgets}
							tier={viewport}
							editing={editing}
							selectedId={selectedId}
							onSelect={(id) => {
								setSelectedId(id);
								if (id) setMetaOpen(false);
							}}
							onMove={move}
							onResize={resize}
							onRemove={destroy}
							onWidgetCommand={operateWidget}
							history={history}
							emptyHint={emptyHint}
						/>
					) : (
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
							focusOrder={
								'kind' in summary ? [] : summary.focusOrder.map((entry) => entry.widgetInstanceId)
							}
							onRemove={destroy}
							onWidgetCommand={operateWidget}
							history={history}
							emptyHint={emptyHint}
						/>
					)}

					{metaOpen && (
						<SceneMetaPanel
							// Its three fields are `useState(prop)` drafts with no prop→draft sync, and its Save
							// is a full metadata REPLACEMENT addressed by the route id — with no key tied to the
							// scene, navigating scene→scene with the panel open wrote the OLD scene's name,
							// description and tags onto the new one. `Inspector` below keys on its selected
							// instance for exactly this reason.
							key={id}
							name={shown.name}
							description={shown.description}
							tags={shown.tags}
							phone={viewport === 'phone'}
							onSave={saveMetadata}
							onClose={() => setMetaOpen(false)}
						/>
					)}

					<AddWidgetGallery
						open={addOpen && !metaOpen}
						onClose={() => setAddOpen(false)}
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
				{previewRead && preview && (
					<PlayerPreviewOverlay
						widgets={widgets}
						read={previewRead}
						label={preview.label}
						phone={viewport === 'phone'}
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
				/>
			)}
		</div>
	);
}
