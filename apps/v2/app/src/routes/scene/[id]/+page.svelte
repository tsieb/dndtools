<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		EMPTY_WIDGET_DATA_ENVIRONMENT,
		getPlayerViewForActor,
		getSceneForActor,
		listWidgetLayoutCommands,
		resolveLayoutCommandPayload,
		type PlayerViewProjectionKind,
		type SceneLayoutCommand,
		type WidgetBindingPayload,
		type WidgetInstance,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import SceneOutline from '$lib/gui/a11y/SceneOutline.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import { arrowDirection, useLiveAnnouncer } from '$lib/gui/a11y';
	import type { OutlineWidgetInput, Viewer } from '$lib/gui/a11y';
	import CanvasViewport from '$lib/gui/canvas/CanvasViewport.svelte';
	import type { CanvasTile, CanvasTileState, MinimapMode } from '$lib/gui/canvas/types';
	import { ViewportController, screenToWorld } from '$lib/canvas-runtime';
	import {
		CanvasManipulationController,
		defaultSizeForType,
		placementTopLeft,
		placedAnnouncement,
		resolveCanvasShortcut,
		toShortcutEvent,
		type ManipWidget,
	} from '$lib/gui/ux-canvas';
	import WidgetLibrary from '$lib/gui/ux-canvas/WidgetLibrary.svelte';
	import SelectionToolbar from '$lib/gui/ux-canvas/SelectionToolbar.svelte';
	import TransformPanel from '$lib/gui/ux-canvas/TransformPanel.svelte';
	import KeyboardShortcutsHelp from '$lib/gui/ux-canvas/KeyboardShortcutsHelp.svelte';

	const { data } = $props();
	const runtime = useRuntime();
	const profile = useProfile();
	const announcer = useLiveAnnouncer();

	// PLAT-003: on a compact (mobile) profile the dense widget grid and the persistent
	// "Add widget" panel do not fit. The shell shows ONE focused widget at a time (a focused
	// view) with prev/next, and the add-widget form collapses into a drawer — both backed by
	// the SAME Scene state and dispatching the SAME commands. No alternate data model is
	// created; only the presentation density changes (Contract 1 Slimmer Device Definition).
	let focusedIndex = $state(0);
	let addWidgetOpen = $state(false);

	const sceneId = $derived(data.id);
	// Resolve widget bindings through the Processing Core data layer (CANVAS-009)
	// so hidden, conflicted, missing, and unbound states are surfaced explicitly.
	const summary = $derived(
		getSceneForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			runtime.defaultActorId,
			sceneId,
			{ widgetPackages: runtime.state.widgets, dataEnvironment: EMPTY_WIDGET_DATA_ENVIRONMENT },
		),
	);

	// Raw Scene for actor-scoped layout command descriptors (CANVAS-012). The GUI may
	// know which command descriptors are available for visible controls (Contract 1);
	// it never mutates layout directly.
	const rawScene = $derived(runtime.state.scenes.scenes[sceneId]);

	let widgetType = $state('note');
	let widgetVersion = $state('1.0.0');
	// UX-A11Y-004/008: per-widget visibility for the Scene Outline no-leak boundary. Stored in the
	// widget configuration so it survives reload; the outline classifies each widget by it (defaulting
	// to the scene's own visibility) and filters DM-only widgets out of a player's outline.
	let widgetVisibility = $state<'dm-only' | 'shared' | 'player-visible'>('player-visible');
	let widgetX = $state(40);
	let widgetY = $state(40);
	let widgetW = $state(240);
	let widgetH = $state(160);
	let bindEntityType = $state('');
	let bindEntityId = $state('');
	let bindSelector = $state('');
	let playerPreviewId = $state('actor-player');
	let projectionKind = $state<PlayerViewProjectionKind>('scene');

	// Widgets selected for a grouping operation (keyboard/touch reachable, no drag).
	const selectedForGroup = new SvelteSet<string>();
	const playerView = $derived(
		getPlayerViewForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			runtime.state.session,
			playerPreviewId,
			{ widgetPackages: runtime.state.widgets, dataEnvironment: EMPTY_WIDGET_DATA_ENVIRONMENT },
		),
	);

	// Render widgets in declared focus-traversal order (CANVAS-016) so DOM tab order
	// follows z-order/grouping/dock/pin/explicit metadata rather than insertion order.
	const orderedWidgets = $derived.by(() => {
		if ('kind' in summary) return [] as Array<{ tabIndex: number; payload: WidgetBindingPayload }>;
		const byId = new SvelteMap<string, WidgetBindingPayload>();
		for (const payload of summary.widgets) {
			const id =
				payload.kind === 'available' || payload.kind === 'degraded'
					? payload.widget.id
					: payload.widgetInstanceId;
			byId.set(id, payload);
		}
		const out: Array<{ tabIndex: number; payload: WidgetBindingPayload }> = [];
		for (const entry of summary.focusOrder) {
			const payload = byId.get(entry.widgetInstanceId);
			if (payload) out.push({ tabIndex: entry.tabIndex, payload });
		}
		return out;
	});

	// PLAT-003 focused view: the same ordered widgets, presented one at a time on compact
	// profiles. The index is clamped to the current widget count so adds/removes stay valid.
	const focusedWidget = $derived(
		orderedWidgets.length === 0
			? null
			: orderedWidgets[Math.min(focusedIndex, orderedWidgets.length - 1)],
	);
	function focusPrev() {
		focusedIndex = Math.max(0, Math.min(focusedIndex, orderedWidgets.length - 1) - 1);
	}
	function focusNext() {
		focusedIndex = Math.min(orderedWidgets.length - 1, focusedIndex + 1);
	}

	function widgetAccessibleName(widget: WidgetInstance): string {
		const boundTo = widget.binding ? ` bound to ${widget.binding.source.entityId}` : '';
		return `${widget.type} widget${boundTo}`;
	}

	// UX-A11Y-008: the viewer the Scene Outline is rendered for. Fail-closed to the most restrictive
	// non-DM role when the active actor is unknown, so an unidentified viewer never sees DM-only items.
	const viewer = $derived.by<Viewer>(() => {
		const actor = runtime.state.permissions.actors[runtime.activeActorId];
		return { role: actor?.role ?? 'observer', actorId: runtime.activeActorId };
	});

	function widgetVisibilityOf(widget: WidgetInstance): 'dm-only' | 'shared' | 'player-visible' {
		const declared = widget.configuration?.visibility;
		if (declared === 'dm-only' || declared === 'shared' || declared === 'player-visible') {
			return declared;
		}
		// No per-widget visibility ⇒ inherit the scene's visibility (the spatial container's level).
		return rawScene?.visibility ?? 'dm-only';
	}

	// UX-A11Y-004: map the raw scene widgets onto the Scene Outline input shape. The outline itself
	// (buildSceneOutline) filters DM-only widgets out for non-DM viewers BEFORE computing any name, so
	// this mapping may safely run over the full widget set on the DM's device (UX-A11Y-008).
	const outlineWidgets = $derived.by<OutlineWidgetInput[]>(() => {
		if (!rawScene) return [];
		return rawScene.widgets.map((widget, index) => ({
			id: widget.id,
			type: widget.type,
			name: widget.binding?.source.entityId,
			layerOrder: widget.layout.focusOrder ?? widget.layout.z ?? index,
			groupId: widget.layout.groupId,
			visibility: widgetVisibilityOf(widget),
			sharedWith: rawScene.sharingTargets,
		}));
	});

	// UX-CANVAS-001/014/016: the spatial canvas tiles. Built from the raw Scene widgets (which always
	// carry a layout rect) joined with the actor-FILTERED binding state, and gated by the same
	// DM-only no-leak rule the Scene Outline uses — a non-DM viewer's canvas never renders a DM-only
	// widget (UX-A11Y-008). The data state drives the skeleton / placeholder rendering (UX-CANVAS-014).
	const canvasTileState = $derived.by<SvelteMap<string, CanvasTileState>>(() => {
		const map = new SvelteMap<string, CanvasTileState>();
		if ('kind' in summary) return map;
		for (const payload of summary.widgets) {
			const id =
				payload.kind === 'available' || payload.kind === 'degraded'
					? payload.widget.id
					: payload.widgetInstanceId;
			switch (payload.kind) {
				case 'missing':
					map.set(id, 'missing');
					break;
				case 'conflicted':
					map.set(id, 'conflicted');
					break;
				case 'unbound':
				case 'disabled':
					map.set(id, 'unbound');
					break;
				default:
					map.set(id, 'ready');
			}
		}
		return map;
	});

	function rotationOf(widget: WidgetInstance): number {
		const r = widget.configuration?.rotation;
		return typeof r === 'number' && Number.isFinite(r) ? r : 0;
	}

	const canvasTiles = $derived.by<CanvasTile[]>(() => {
		if (!rawScene) return [];
		return rawScene.widgets
			.filter((widget) => viewer.role === 'dm' || widgetVisibilityOf(widget) !== 'dm-only')
			.map((widget) => ({
				id: widget.id,
				x: widget.layout.x,
				y: widget.layout.y,
				w: widget.layout.w,
				h: widget.layout.h,
				z: widget.layout.z,
				rotation: rotationOf(widget),
				type: widget.type,
				title: widget.binding ? `Bound to ${widget.binding.source.entityId}` : `${widget.type} widget`,
				visibility: widgetVisibilityOf(widget),
				state: canvasTileState.get(widget.id) ?? 'ready',
			}));
	});

	// UX-CANVAS-002/003/004/005/006/009/012: the editor-side manipulation surface. The widget list is the
	// SAME viewer-FILTERED set the canvas/outline use, so selection, marquee, alignment, z-order, and the
	// transform panel can never reach a DM-only widget for a player/observer (no-leak). Editing is offered
	// only to the DM/owner viewer; the processing core re-checks co-editor rights on every command.
	const canEdit = $derived(viewer.role === 'dm');

	const manipWidgets = $derived.by<ManipWidget[]>(() => {
		if (!rawScene) return [];
		return rawScene.widgets
			.filter((widget) => viewer.role === 'dm' || widgetVisibilityOf(widget) !== 'dm-only')
			.map((widget) => ({
				id: widget.id,
				x: widget.layout.x,
				y: widget.layout.y,
				w: widget.layout.w,
				h: widget.layout.h,
				z: widget.layout.z,
				type: widget.type,
				label: widget.binding ? `${widget.type} (${widget.binding.source.entityId})` : `${widget.type} widget`,
				rotation: rotationOf(widget),
				configuration: widget.configuration ?? {},
			}));
	});

	// One shared viewport controller so placement can resolve the viewport centre in world space and the
	// canvas drives a single pan/zoom runtime (foundational-canvas reuse).
	const viewportController = new ViewportController();

	const manipulation = new CanvasManipulationController({
		get sceneId() {
			return sceneId;
		},
		widgets: () => manipWidgets,
		dispatch: async (commands) => {
			for (const command of commands) {
				const result = await runtime.dispatch({
					type: command.type as never,
					actorId: runtime.defaultActorId,
					payload: command.payload,
				});
				if (result.status !== 'accepted') return false;
			}
			return true;
		},
		announce: (message) => announcer?.announce(message, 'polite'),
	});

	// Keep the selection valid when widgets are removed or the viewer switches (no stale/leaked ids).
	$effect(() => {
		void manipWidgets;
		manipulation.reconcile();
	});

	// The primary selected widget, surfaced to the transform panel + canvas handles.
	const primaryWidget = $derived.by<ManipWidget | null>(() => {
		const id = manipulation.primaryId;
		return id ? (manipWidgets.find((w) => w.id === id) ?? null) : null;
	});

	let libraryOpen = $state(false);
	let helpOpen = $state(false);
	let deleteTargetId = $state<string | null>(null);

	const deleteTarget = $derived(
		deleteTargetId ? (manipWidgets.find((w) => w.id === deleteTargetId) ?? null) : null,
	);

	async function placeFromLibrary(type: string) {
		const size = defaultSizeForType(type);
		const center = screenToWorld(
			viewportController.viewport,
			viewportController.centerAnchor.x || 200,
			viewportController.centerAnchor.y || 150,
		);
		const topLeft = placementTopLeft(center, size);
		const before = new Set((rawScene?.widgets ?? []).map((w) => w.id));
		const result = await runtime.dispatch({
			type: 'scene.add-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId,
				widget: {
					type,
					version: '1.0.0',
					layout: { x: topLeft.x, y: topLeft.y, w: size.w, h: size.h },
					configuration: { visibility: 'player-visible' },
					binding: null,
				},
			},
		});
		if (result.status === 'accepted') {
			const added = (runtime.state.scenes.scenes[sceneId]?.widgets ?? []).find((w) => !before.has(w.id));
			if (added) manipulation.select(added.id);
			announcer?.announce(placedAnnouncement(type), 'polite');
		}
	}

	async function groupManipulationSelection() {
		if (manipulation.selectionCount < 2) return;
		await runtime.dispatch({
			type: 'scene.group-widgets',
			actorId: runtime.defaultActorId,
			payload: { sceneId, widgetInstanceIds: [...manipulation.selectedIds] },
		});
	}

	function requestDelete(id: string | null = manipulation.primaryId) {
		if (id) deleteTargetId = id;
	}

	async function confirmDelete() {
		if (deleteTargetId) await manipulation.destroy(deleteTargetId);
		deleteTargetId = null;
	}

	// UX-CANVAS-015: canvas-level keyboard model. The host gets first crack at canvas keys so a selected
	// widget's arrow-key MOVE wins over arrow-key pan, and the manipulation/history shortcuts dispatch the
	// same core commands the toolbar does. Returns true when a key was handled (CanvasViewport then
	// preventDefaults and skips the viewport pan/zoom handler).
	function onManipulationKey(event: KeyboardEvent): boolean {
		if (!canEdit) return false;
		const dir = arrowDirection(event.key);
		if (dir && manipulation.selectionCount > 0) {
			const mod = event.ctrlKey || event.metaKey;
			const size = mod && event.shiftKey ? 'large' : event.shiftKey ? 'nudge' : 'fine';
			void manipulation.nudge(dir, size);
			return true;
		}
		const action = resolveCanvasShortcut(toShortcutEvent(event));
		switch (action) {
			case 'open-library':
				libraryOpen = true;
				return true;
			case 'undo':
				void manipulation.undo();
				return true;
			case 'redo':
				void manipulation.redo();
				return true;
			case 'select-all':
				manipulation.selectAll();
				return true;
			case 'group':
				void groupManipulationSelection();
				return true;
			case 'duplicate':
				return true;
			case 'z-front':
				void manipulation.zOrder('front');
				return true;
			case 'z-back':
				void manipulation.zOrder('back');
				return true;
			case 'z-forward':
				void manipulation.zOrder('forward');
				return true;
			case 'z-backward':
				void manipulation.zOrder('backward');
				return true;
			case 'toggle-grid':
				manipulation.gridEnabled = !manipulation.gridEnabled;
				return true;
			case 'delete':
				requestDelete();
				return true;
			case 'help':
				helpOpen = true;
				return true;
			case 'escape':
				manipulation.clearSelection();
				return true;
			default:
				return false;
		}
	}

	function reorderFromOutline(id: string, direction: 'up' | 'down') {
		void manipulation.zOrder(direction === 'up' ? 'forward' : 'backward', id);
	}

	// UX-CANVAS-001 §Minimap: persistent on Desktop, toggleable on Tablet, hidden by default on Mobile.
	const minimapMode = $derived<MinimapMode>(
		profile.isCompact ? 'hidden' : profile.viewportClass === 'medium' ? 'toggle' : 'persistent',
	);

	// UX-A11Y-004 AC2: activating an outline item scrolls to and focuses the widget on the canvas.
	function focusWidgetOnCanvas(id: string) {
		const idx = orderedWidgets.findIndex((entry) => {
			const payload = entry.payload;
			const widgetId =
				payload.kind === 'available' || payload.kind === 'degraded'
					? payload.widget.id
					: payload.widgetInstanceId;
			return widgetId === id;
		});
		if (idx >= 0) focusedIndex = idx;
		const el = document.querySelector(`[data-testid="widget-${id}"]`);
		if (el instanceof HTMLElement) {
			el.scrollIntoView({ block: 'nearest' });
			if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
			el.focus({ preventScroll: true });
		}
	}

	function layoutCommandsFor(widget: WidgetInstance): SceneLayoutCommand[] {
		if (!rawScene) return [];
		return listWidgetLayoutCommands(
			rawScene,
			widget,
			runtime.state.permissions,
			runtime.defaultActorId,
		);
	}

	async function runLayoutCommand(command: SceneLayoutCommand, widget: WidgetInstance) {
		if (!rawScene) return;
		const resolved = resolveLayoutCommandPayload(command, rawScene, widget);
		if (!resolved) return;
		await runtime.dispatch({
			type: resolved.type,
			actorId: runtime.defaultActorId,
			payload: resolved.payload,
		});
	}

	function toggleGroupSelection(id: string, checked: boolean) {
		if (checked) selectedForGroup.add(id);
		else selectedForGroup.delete(id);
	}

	async function groupSelected() {
		if (selectedForGroup.size < 2) return;
		await runtime.dispatch({
			type: 'scene.group-widgets',
			actorId: runtime.defaultActorId,
			payload: { sceneId, widgetInstanceIds: [...selectedForGroup] },
		});
		selectedForGroup.clear();
	}

	async function projectPlayerView(connectionState: 'connected' | 'offline') {
		const selectedIds = [...selectedForGroup];
		const widgetInstanceIds = projectionKind === 'scene' ? null : selectedIds;
		if (projectionKind !== 'scene' && selectedIds.length === 0) return;
		await runtime.dispatch({
			type: 'session.project-player-view',
			actorId: runtime.defaultActorId,
			payload: {
				playerActorIds: [playerPreviewId],
				connectionState,
				target: {
					kind: projectionKind,
					sceneId,
					sectionIds: null,
					widgetInstanceIds,
					displayState:
						projectionKind === 'display-state' ? { mode: 'spotlight', source: 'scene-ui' } : null,
					mapRegion:
						projectionKind === 'map-region' ? { mapId: 'demo-map', regionId: 'demo-region' } : null,
				},
			},
		});
	}

	async function revokePlayerView() {
		await runtime.dispatch({
			type: 'session.revoke-player-view',
			actorId: runtime.defaultActorId,
			payload: { playerActorIds: [playerPreviewId] },
		});
	}

	async function addWidget(event: SubmitEvent) {
		event.preventDefault();
		const entityType = bindEntityType.trim();
		const entityId = bindEntityId.trim();
		const selector = bindSelector.trim();
		const binding =
			entityType && entityId
				? {
						source: { entityType, entityId, ...(selector ? { selector } : {}) },
						mode: 'read' as const,
						requiredCapability: 'viewer' as const,
					}
				: null;
		const result = await runtime.dispatch({
			type: 'scene.add-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId,
				widget: {
					type: widgetType,
					version: widgetVersion,
					layout: { x: widgetX, y: widgetY, w: widgetW, h: widgetH },
					configuration: { visibility: widgetVisibility },
					binding,
				},
			},
		});
		// PLAT-003: close the compact add-widget drawer after a successful add and focus the
		// newly added widget in the focused view (it is appended at the end of the order).
		if (result.status === 'accepted') {
			addWidgetOpen = false;
			// Focus the newly added widget. It is appended at the end of the order; the focused
			// view clamps the index to the current count, so a high value lands on the newest.
			focusedIndex = Number.MAX_SAFE_INTEGER;
		}
	}

	async function destroyWidget(id: string) {
		await runtime.dispatch({
			type: 'scene.destroy-widget',
			actorId: runtime.defaultActorId,
			payload: { sceneId, widgetInstanceId: id },
		});
	}

	async function startTimer(id: string) {
		if ('kind' in summary) return;
		await runtime.dispatch({
			type: 'widget.dispatch-command',
			actorId: runtime.defaultActorId,
			idempotencyKey: `timer-start-${id}-${Date.now()}`,
			payload: {
				sceneId,
				widgetInstanceId: id,
				commandType: 'timer.start',
				payload: { durationSeconds: 60 },
				expectedRevision: summary.ownership.revision,
			},
		});
	}

	async function saveTemplate() {
		if ('kind' in summary) return;
		await runtime.dispatch({
			type: 'scene.save-template',
			actorId: runtime.defaultActorId,
			payload: { sourceSceneId: sceneId, templateName: `${summary.name} (template)` },
		});
	}
</script>

{#if 'kind' in summary}
	<p class="error" role="alert" data-testid="scene-denied">
		Cannot open scene: {summary.reason}
	</p>
{:else}
	<section class="scene-editor" data-testid="scene-editor">
		<header>
			<a href="../../scenes/" data-testid="back-to-scenes">← Back</a>
			<p class="scene-title" data-testid="scene-name">{summary.name}</p>
			<p class="meta">
				visibility {summary.visibility} • rev {summary.ownership.revision} •
				{summary.widgets.length} widget{summary.widgets.length === 1 ? '' : 's'}
			</p>
			<div class="row-actions">
				<button class="button secondary" data-testid="save-template" onclick={saveTemplate}>
					Save as Template
				</button>
			</div>
		</header>

		<!-- UX-CANVAS-001/014/016: the spatial canvas viewport. Pan/zoom with cursor-anchored zoom,
		     on-screen zoom controls, a minimap, keyboard parity, virtualization, skeletons, and
		     poster-frame degradation. UX-CANVAS-002/003/004/005/006/009/012/015 layer the editor model on
		     top: a widget library, selection + marquee, move/resize/rotate, alignment, z-order, undo/redo,
		     and the keyboard model. Tiles are actor-filtered (no DM-only leak to a player view). -->
		<section data-testid="scene-canvas-section" aria-label="Scene canvas viewport">
			{#if canEdit}
				<!-- Canvas command bar: the non-gesture entry points for placement, grid, history, and help.
				     Every one has a keyboard shortcut too (UX-CANVAS-015), but the buttons guarantee parity
				     on touch/no-keyboard profiles. -->
				<div class="canvas-command-bar" role="toolbar" aria-label="Canvas tools" data-testid="canvas-command-bar">
					<button type="button" class="button" data-testid="open-widget-library" onclick={() => (libraryOpen = true)}>
						+ Add widget
					</button>
					<label class="grid-toggle">
						<input type="checkbox" data-testid="canvas-grid-toggle" bind:checked={manipulation.gridEnabled} />
						<span>Snap to grid</span>
					</label>
					<button
						type="button"
						class="button secondary"
						data-testid="canvas-undo"
						aria-label={manipulation.undoLabel ? `Undo ${manipulation.undoLabel}` : 'Nothing to undo'}
						aria-disabled={!manipulation.canUndo}
						disabled={!manipulation.canUndo}
						onclick={() => manipulation.undo()}
					>
						Undo
					</button>
					<button
						type="button"
						class="button secondary"
						data-testid="canvas-redo"
						aria-label={manipulation.redoLabel ? `Redo ${manipulation.redoLabel}` : 'Nothing to redo'}
						aria-disabled={!manipulation.canRedo}
						disabled={!manipulation.canRedo}
						onclick={() => manipulation.redo()}
					>
						Redo
					</button>
					<button type="button" class="button secondary" data-testid="canvas-shortcuts-open" onclick={() => (helpOpen = true)}>
						Keyboard shortcuts
					</button>
					{#if manipulation.undoLimitReached && !manipulation.canUndo}
						<span class="canvas-toast" role="status" data-testid="canvas-undo-limit">Undo limit reached</span>
					{/if}
				</div>
			{/if}

			<CanvasViewport
				controller={viewportController}
				tiles={canvasTiles}
				minimap={minimapMode}
				label={`${summary.name} canvas`}
				interactive={canEdit}
				selectedIds={manipulation.selectedIds}
				primaryId={manipulation.primaryId}
				selectionBounds={manipulation.selectionBounds}
				onSelectTile={(id, mode) => manipulation.select(id, mode)}
				onMarquee={(start, end, additive) => manipulation.marquee(start, end, additive)}
				onMoveCommit={(id, x, y) => manipulation.moveTo(id, x, y)}
				onResizeCommit={(id, w, h) => manipulation.resizeTo(id, w, h)}
				onRotateCommit={(id, deg, free) => manipulation.rotateTo(id, deg, free)}
				{onManipulationKey}
			/>

			{#if canEdit}
				<SelectionToolbar
					controller={manipulation}
					ongroup={groupManipulationSelection}
					ondelete={() => requestDelete()}
				/>
				<TransformPanel controller={manipulation} widget={primaryWidget} />
			{/if}
		</section>

		{#if canEdit}
			<WidgetLibrary bind:open={libraryOpen} profile={profile.profileId} onplace={placeFromLibrary} />
			<KeyboardShortcutsHelp bind:open={helpOpen} />
			<Dialog
				open={deleteTargetId !== null}
				title="Delete widget?"
				role="alertdialog"
				testid="delete-confirm"
				closeOnBackdrop={false}
				onclose={() => (deleteTargetId = null)}
			>
				<p>
					Remove <strong>{deleteTarget?.label ?? 'this widget'}</strong> from the scene? The bound entity is
					not deleted.
				</p>
				{#snippet footer()}
					<button type="button" class="button secondary" data-testid="delete-cancel" onclick={() => (deleteTargetId = null)}>
						Cancel
					</button>
					<button type="button" class="button" data-testid="delete-confirm-button" onclick={confirmDelete}>
						Delete widget
					</button>
				{/snippet}
			</Dialog>
		{/if}

		<section data-testid="add-widget-section">
			<div class="widgets-head">
				<h2 id="add-widget-heading">Add widget</h2>
				{#if profile.isCompact}
					<!-- PLAT-003 AC2: on compact there is no room for a persistent add panel, so the
					     same add-widget command is reached through a drawer toggle. The form and its
					     command are identical to the desktop panel. -->
					<button
						type="button"
						class="button secondary"
						data-testid="toggle-add-widget"
						aria-expanded={addWidgetOpen}
						aria-controls="add-widget-form"
						onclick={() => (addWidgetOpen = !addWidgetOpen)}
					>
						{addWidgetOpen ? 'Close' : 'Add widget'}
					</button>
				{/if}
			</div>
			{#if !profile.isCompact || addWidgetOpen}
				<form
					id="add-widget-form"
					class="form"
					class:drawer={profile.isCompact}
					onsubmit={addWidget}
					aria-label="Add widget"
				>
				<label>
					<span>Type</span>
					<input bind:value={widgetType} data-testid="widget-type" required />
				</label>
				<label>
					<span>Version</span>
					<input bind:value={widgetVersion} data-testid="widget-version" required />
				</label>
				<label>
					<span>x</span>
					<input type="number" bind:value={widgetX} data-testid="widget-x" />
				</label>
				<label>
					<span>y</span>
					<input type="number" bind:value={widgetY} data-testid="widget-y" />
				</label>
				<label>
					<span>w</span>
					<input type="number" min="1" bind:value={widgetW} data-testid="widget-w" />
				</label>
				<label>
					<span>h</span>
					<input type="number" min="1" bind:value={widgetH} data-testid="widget-h" />
				</label>
				<label>
					<span>Bind entity type</span>
					<input bind:value={bindEntityType} data-testid="bind-entity-type" autocomplete="off" />
				</label>
				<label>
					<span>Bind entity id</span>
					<input bind:value={bindEntityId} data-testid="bind-entity-id" autocomplete="off" />
				</label>
				<label>
					<span>Bind selector</span>
					<input bind:value={bindSelector} data-testid="bind-selector" autocomplete="off" />
				</label>
				<label>
					<span>Visibility</span>
					<select bind:value={widgetVisibility} data-testid="widget-visibility">
						<option value="player-visible">Player visible</option>
						<option value="shared">Shared</option>
						<option value="dm-only">DM only</option>
					</select>
				</label>
				<button class="button" type="submit" data-testid="widget-add">Add widget</button>
				</form>
			{/if}
		</section>

		<section>
			<div class="widgets-head">
				<h2>Widgets</h2>
				<button
					type="button"
					class="button secondary"
					data-testid="group-selected"
					disabled={selectedForGroup.size < 2}
					onclick={groupSelected}
				>
					Group selected ({selectedForGroup.size})
				</button>
			</div>
			<p class="meta">Tab order follows the declared Scene focus order.</p>

			<!-- PLAT-003: the per-widget card is a single snippet rendered in BOTH the dense grid
			     (expanded) and the focused stacked view (compact). Same Scene state, same commands,
			     same widget identity — only the surrounding density changes. -->
			{#snippet widgetCard(tabIndex: number, payload: WidgetBindingPayload)}
				{#if payload.kind === 'available' || payload.kind === 'degraded'}
						{@const w = payload.widget}
						{@const timer = runtime.state.session.timers[w.id]}
						<article class="widget-row" data-testid={`widget-${w.id}`} data-focus-index={tabIndex}>
							<div>
								<label class="select-widget">
									<input
										type="checkbox"
										data-testid={`select-${w.id}`}
										checked={selectedForGroup.has(w.id)}
										onchange={(e) => toggleGroupSelection(w.id, e.currentTarget.checked)}
									/>
									<span><strong>{w.type}</strong> <span class="meta">v{w.version}</span></span>
								</label>
								{#if payload.kind === 'degraded'}
									<div class="layout" data-testid={`degraded-${w.id}`}>
										degraded: {payload.unavailableHostPermissions.join(', ')} unavailable
									</div>
								{/if}
								<div class="layout">
									x {w.layout.x.toFixed(0)} • y {w.layout.y.toFixed(0)} • w {w.layout.w.toFixed(0)} •
									h {w.layout.h.toFixed(0)} • z {w.layout.z}
									{#if w.layout.dock}• docked {w.layout.dock}{/if}
									{#if w.layout.pinned}• pinned{/if}
									{#if w.layout.groupId}• grouped{/if}
									{#if w.layout.focusOrder !== null}• focus {w.layout.focusOrder}{/if}
									{#if timer}
										• timer {timer.status}
									{/if}
								</div>
							</div>
							<div
								class="row-actions"
								role="toolbar"
								aria-label={`Layout controls for ${widgetAccessibleName(w)}`}
								data-testid={`layout-toolbar-${w.id}`}
							>
								{#each layoutCommandsFor(w) as command (command.id)}
									{#if command.targets === 'self'}
										<button
											type="button"
											data-testid={`layout-${command.id}-${w.id}`}
											aria-label={`${command.label} — ${widgetAccessibleName(w)}`}
											onclick={() => runLayoutCommand(command, w)}
										>
											{command.label}
										</button>
									{/if}
								{/each}
								{#if w.type === 'timer'}
									<button
										type="button"
										data-testid={`start-timer-${w.id}`}
										onclick={() => startTimer(w.id)}
									>
										Start
									</button>
								{/if}
							</div>
						</article>
					{:else if payload.kind === 'disabled'}
						<article
							class="widget-row"
							data-testid={`disabled-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">disabled: {payload.reason}</div>
							</div>
							<div class="row-actions">
								<button
									type="button"
									onclick={() => destroyWidget(payload.widgetInstanceId)}
									data-testid={`destroy-${payload.widgetInstanceId}`}
								>
									Remove
								</button>
							</div>
						</article>
					{:else if payload.kind === 'missing'}
						<article
							class="widget-row"
							data-testid={`missing-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">binding missing</div>
							</div>
						</article>
					{:else if payload.kind === 'conflicted'}
						<article
							class="widget-row"
							data-testid={`conflicted-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">binding conflicted: {payload.conflictPaths.join(', ')}</div>
							</div>
						</article>
					{:else if payload.kind === 'unbound'}
						<article
							class="widget-row"
							data-testid={`unbound-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">needs a data source</div>
							</div>
						</article>
					{:else}
						<article
							class="widget-row"
							data-testid={`hidden-${payload.widgetInstanceId}`}
							data-focus-index={tabIndex}
						>
							<div>
								<strong>{payload.type}</strong>
								<div class="layout">hidden in this view</div>
							</div>
						</article>
					{/if}
			{/snippet}

			{#if summary.widgets.length === 0}
				<p class="meta" data-testid="widgets-empty">No widgets yet — add one above.</p>
			{:else if profile.isCompact}
				<!-- PLAT-003 AC1: compact profiles show ONE focused widget at a time (a focused
				     view), navigated with prev/next, backed by the same ordered Scene state. -->
				<div class="focused-view" data-testid="focused-widget-view">
					<div class="focused-view-nav">
						<button
							type="button"
							data-testid="focus-prev-widget"
							disabled={focusedIndex <= 0}
							onclick={focusPrev}
						>
							‹ Prev
						</button>
						<span class="meta" data-testid="focus-position">
							{Math.min(focusedIndex, orderedWidgets.length - 1) + 1} of {orderedWidgets.length}
						</span>
						<button
							type="button"
							data-testid="focus-next-widget"
							disabled={focusedIndex >= orderedWidgets.length - 1}
							onclick={focusNext}
						>
							Next ›
						</button>
					</div>
					{#if focusedWidget}
						{@render widgetCard(focusedWidget.tabIndex, focusedWidget.payload)}
					{/if}
				</div>
			{:else}
				<div class="widget-grid" data-testid="widget-grid">
					{#each orderedWidgets as { tabIndex, payload } (payload.kind === 'available' || payload.kind === 'degraded' ? payload.widget.id : payload.widgetInstanceId)}
						{@render widgetCard(tabIndex, payload)}
					{/each}
				</div>
			{/if}
		</section>

		<!-- UX-A11Y-004: the Scene Outline — the structural, screen-reader path to the canvas widgets.
		     Built through the visibility boundary for the active "view as" actor, so a player's outline
		     never lists a DM-only widget (UX-A11Y-008). Activating an item focuses the widget. -->
		<section data-testid="scene-outline-section">
			<SceneOutline
				widgets={outlineWidgets}
				{viewer}
				onactivate={focusWidgetOnCanvas}
				selectedIds={canEdit ? manipulation.selectedIds : undefined}
				onselect={canEdit ? (id, mode) => manipulation.select(id, mode) : undefined}
				onreorder={canEdit ? reorderFromOutline : undefined}
			/>
		</section>

		<section>
			<h2>Player View</h2>
			<div class="form projection-form" aria-label="Project Player View">
				<label>
					<span>Player</span>
					<input bind:value={playerPreviewId} data-testid="projection-player" autocomplete="off" />
				</label>
				<label>
					<span>Target</span>
					<select bind:value={projectionKind} data-testid="projection-kind">
						<option value="scene">Scene</option>
						<option value="widget-subset">Widget subset</option>
						<option value="handout">Handout</option>
						<option value="map-region">Map region</option>
						<option value="display-state">Display state</option>
					</select>
				</label>
				<div class="row-actions">
					<button
						type="button"
						data-testid="project-player-view"
						onclick={() => projectPlayerView('connected')}
						disabled={projectionKind !== 'scene' && selectedForGroup.size === 0}
					>
						Project
					</button>
					<button
						type="button"
						data-testid="queue-player-view"
						onclick={() => projectPlayerView('offline')}
						disabled={projectionKind !== 'scene' && selectedForGroup.size === 0}
					>
						Queue
					</button>
					<button type="button" data-testid="revoke-player-view" onclick={revokePlayerView}>
						Revoke
					</button>
				</div>
			</div>
			{#if playerView.kind === 'unassigned'}
				<p class="meta" data-testid="player-view-empty">No active Player View.</p>
			{:else if playerView.kind === 'denied'}
				<p class="error" role="alert" data-testid="player-view-denied">
					Player View unavailable: {playerView.reason}
				</p>
			{:else}
				<div class="player-view-preview" data-testid="player-view-preview">
					<div class="meta">
						{playerView.projectionKind} • {playerView.deliveryStatus}
						{#if playerView.deliveryReason === 'offline'}• offline{/if}
						• {playerView.widgets.length} widget{playerView.widgets.length === 1 ? '' : 's'}
					</div>
					<ul>
						{#each playerView.widgets as payload (payload.kind === 'available' || payload.kind === 'degraded' ? payload.widget.id : payload.widgetInstanceId)}
							<li data-testid={`player-view-${payload.kind}`}>
								{#if payload.kind === 'available' || payload.kind === 'degraded'}
									{payload.widget.type}
								{:else}
									{payload.type}: {payload.kind}
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	</section>
{/if}

<style>
	.canvas-command-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.grid-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.canvas-toast {
		padding: var(--space-0-5) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--color-status-warning-surface, var(--color-surface-raised));
		color: var(--color-status-warning-text);
		font-size: var(--text-sm);
	}
	[data-testid='scene-canvas-section'] :global(.selection-toolbar),
	[data-testid='scene-canvas-section'] :global(.transform-panel) {
		margin-top: var(--space-2);
	}
</style>
