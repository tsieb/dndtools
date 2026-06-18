<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import {
		EMPTY_WIDGET_DATA_ENVIRONMENT,
		findWidgetDefinition,
		getPlayerViewForActor,
		getSceneForActor,
		listCharactersForActor,
		listScenesForActor,
		listWidgetLayoutCommands,
		readStyleTokenOverrides,
		resolveLayoutCommandPayload,
		type PlayerViewProjectionKind,
		type SceneLayoutCommand,
		type WidgetBindingPayload,
		type WidgetInstance,
		type WidgetWizardDraft,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import { widgetAccessibleName } from '$lib/a11y/widget-name';
	import SceneOutline from '$lib/gui/a11y/SceneOutline.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import { arrowDirection, useLiveAnnouncer } from '$lib/gui/a11y';
	import { isVisibleToViewer, type OutlineWidgetInput, type Viewer } from '$lib/gui/a11y';
	import CanvasViewport from '$lib/gui/canvas/CanvasViewport.svelte';
	import type { CanvasTile, CanvasTileState, MinimapMode } from '$lib/gui/canvas/types';
	import { ViewportController, screenToWorld } from '$lib/canvas-runtime';
	import {
		CanvasManipulationController,
		bindingChrome,
		bindingState,
		builtInById,
		defaultSizeForType,
		instantiatedSceneName,
		isCollapsed,
		missingBindingBanner,
		placementTopLeft,
		placedAnnouncement,
		previewEnterAnnouncement,
		previewViewer,
		PREVIEW_EXIT_ANNOUNCEMENT,
		resolveCanvasShortcut,
		safeBindingEntityId,
		safeWidgetTitle,
		toShortcutEvent,
		type BindableEntity,
		type BindingResolutionKind,
		type ManipWidget,
		type TemplateEntry,
	} from '$lib/gui/ux-canvas';
	import WidgetLibrary from '$lib/gui/ux-canvas/WidgetLibrary.svelte';
	import SelectionToolbar from '$lib/gui/ux-canvas/SelectionToolbar.svelte';
	import TransformPanel from '$lib/gui/ux-canvas/TransformPanel.svelte';
	import KeyboardShortcutsHelp from '$lib/gui/ux-canvas/KeyboardShortcutsHelp.svelte';
	import WidgetChromePanel from '$lib/gui/ux-canvas/WidgetChromePanel.svelte';
	import BindingInspector from '$lib/gui/ux-canvas/BindingInspector.svelte';
	import CanvasTemplatesDialog from '$lib/gui/ux-canvas/CanvasTemplatesDialog.svelte';
	import CustomWidgetAuthoringDialog from '$lib/gui/ux-canvas/CustomWidgetAuthoringDialog.svelte';
	import PlayerViewPreviewBanner from '$lib/gui/ux-canvas/PlayerViewPreviewBanner.svelte';
	import EmptyCanvasState from '$lib/gui/ux-canvas/EmptyCanvasState.svelte';
	import WidgetView from '$lib/gui/ux-canvas/widgets/WidgetView.svelte';
	import WidgetCustomizePanel from '$lib/gui/ux-canvas/widgets/WidgetCustomizePanel.svelte';

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
			// UX-CANVAS-008 no-leak: the bound entity id is part of the outline name only when the viewer
			// may see it. A player-visible widget bound to a DM-only entity shows just its type to a player.
			name: safeEntityNameFor(widget),
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

	// UX-CANVAS-007/008: per-widget binding-resolution kind for the ACTIVE viewer, read off the Processing
	// Core summary (already actor-redacted). Drives the chain-link state and the SAFE entity-name choke
	// point — a non-DM never gets the entity id unless their own resolution returned the widget available.
	const bindingResolutionByWidgetId = $derived.by<SvelteMap<string, BindingResolutionKind>>(() => {
		const map = new SvelteMap<string, BindingResolutionKind>();
		if ('kind' in summary) return map;
		for (const payload of summary.widgets) {
			const id =
				payload.kind === 'available' || payload.kind === 'degraded'
					? payload.widget.id
					: payload.widgetInstanceId;
			map.set(id, payload.kind);
		}
		return map;
	});

	// The DM-safe entity name for a widget's binding, given the active viewer (UX-CANVAS-008 no-leak).
	function safeEntityNameFor(widget: WidgetInstance): string | undefined {
		if (!widget.binding) return undefined;
		const resolution = bindingResolutionByWidgetId.get(widget.id) ?? 'none';
		return safeBindingEntityId(resolution, widget.binding.source.entityId, viewer.role);
	}

	function rotationOf(widget: WidgetInstance): number {
		const r = widget.configuration?.rotation;
		return typeof r === 'number' && Number.isFinite(r) ? r : 0;
	}

	// UX-CANVAS-007/008/013: the DM canvas tiles, carrying chrome (collapse + binding indicator) and a
	// SAFE title that never embeds a hidden bound entity id. Actor-filtered (no DM-only leak to players).
	const canvasTiles = $derived.by<CanvasTile[]>(() => {
		if (!rawScene) return [];
		return rawScene.widgets
			.filter((widget) => viewer.role === 'dm' || widgetVisibilityOf(widget) !== 'dm-only')
			.map((widget) => {
				const safeName = safeEntityNameFor(widget);
				const state = bindingState(
					widget.binding !== null,
					bindingResolutionByWidgetId.get(widget.id) ?? 'none',
				);
				const chrome = bindingChrome(state, safeName);
				return {
					id: widget.id,
					x: widget.layout.x,
					y: widget.layout.y,
					w: widget.layout.w,
					h: widget.layout.h,
					z: widget.layout.z,
					rotation: rotationOf(widget),
					type: widget.type,
					title: safeWidgetTitle(widget.type, safeName),
					visibility: widgetVisibilityOf(widget),
					state: canvasTileState.get(widget.id) ?? 'ready',
					collapsed: isCollapsed(widget.configuration ?? {}),
					binding:
						state === 'none'
							? undefined
							: { state, label: chrome.label, ariaLabel: chrome.ariaLabel },
				} satisfies CanvasTile;
			});
	});

	// UX-CANVAS-011 §Player-view preview: the same canvas rendered as the chosen player would see it.
	// A pure UI overlay over already-loaded data — filtered through the SAME visibility boundary the real
	// player canvas uses; widget chrome / DM badges / bound entity ids are stripped, so nothing leaks.
	const previewedViewer = $derived(
		previewViewer(
			playerPreviewId,
			runtime.state.permissions.actors[playerPreviewId]?.role ?? 'player',
		),
	);
	const previewTiles = $derived.by<CanvasTile[]>(() => {
		if (!rawScene) return [];
		return rawScene.widgets
			.filter((widget) =>
				isVisibleToViewer(
					{ visibility: widgetVisibilityOf(widget), sharedWith: rawScene.sharingTargets },
					previewedViewer,
				),
			)
			.map((widget) => ({
				id: widget.id,
				x: widget.layout.x,
				y: widget.layout.y,
				w: widget.layout.w,
				h: widget.layout.h,
				z: widget.layout.z,
				rotation: rotationOf(widget),
				type: widget.type,
				// Player canvas hides chrome + bound entity ids (UX-CANVAS-011 §Player view canvas).
				title: safeWidgetTitle(widget.type),
				visibility: widgetVisibilityOf(widget),
				state: canvasTileState.get(widget.id) ?? 'ready',
				collapsed: isCollapsed(widget.configuration ?? {}),
			}));
	});

	const playerLabelFor = $derived(
		runtime.state.permissions.actors[playerPreviewId]?.displayName ?? playerPreviewId,
	);

	// UX-CANVAS-002/003/004/005/006/009/012: the editor-side manipulation surface. The widget list is the
	// SAME viewer-FILTERED set the canvas/outline use, so selection, marquee, alignment, z-order, and the
	// transform panel can never reach a DM-only widget for a player/observer (no-leak). Editing is offered
	// only to the DM/owner viewer; the processing core re-checks co-editor rights on every command.
	const canEdit = $derived(viewer.role === 'dm');

	const manipWidgets = $derived.by<ManipWidget[]>(() => {
		if (!rawScene) return [];
		return rawScene.widgets
			.filter((widget) => viewer.role === 'dm' || widgetVisibilityOf(widget) !== 'dm-only')
			.map((widget) => {
				const safeName = safeEntityNameFor(widget);
				return {
					id: widget.id,
					x: widget.layout.x,
					y: widget.layout.y,
					w: widget.layout.w,
					h: widget.layout.h,
					z: widget.layout.z,
					type: widget.type,
					// SAFE label — entity id only when the viewer may see it (never to a player).
					label: safeWidgetTitle(widget.type, safeName),
					rotation: rotationOf(widget),
					configuration: widget.configuration ?? {},
					visibility: widgetVisibilityOf(widget),
					collapsed: isCollapsed(widget.configuration ?? {}),
					binding: widget.binding,
					bindingState: bindingState(
						widget.binding !== null,
						bindingResolutionByWidgetId.get(widget.id) ?? 'none',
					),
				} satisfies ManipWidget;
			});
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
	let customWidgetOpen = $state(false);
	let customWidgetIdSuffix = $state(runtime.newId());
	let helpOpen = $state(false);
	let bindingOpen = $state(false);
	let templatesOpen = $state(false);
	let showBindings = $state(false);
	let previewActive = $state(false);
	let deleteTargetId = $state<string | null>(null);

	// UX-CANVAS-008: DM-scoped bindable entities for the inspector (characters + scenes). This surface is
	// DM-only (rendered under `canEdit`), so listing ids here is safe; the no-leak boundary protects the
	// player view, never the DM's own binding UI.
	const bindableEntities = $derived.by<BindableEntity[]>(() => {
		const characters = listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.defaultActorId,
		).map((c) => ({ entityType: 'character', entityId: c.id, label: c.name }));
		const scenes = listScenesForActor(
			runtime.state.scenes,
			runtime.state.permissions,
			runtime.defaultActorId,
		)
			.filter((s) => s.id !== sceneId && !s.isTemplate)
			.map((s) => ({ entityType: 'scene', entityId: s.id, label: s.name }));
		return [...characters, ...scenes];
	});

	// User-saved templates (already DM-only filtered by the Core query) for the templates dialog.
	const userTemplates = $derived(
		listScenesForActor(runtime.state.scenes, runtime.state.permissions, runtime.defaultActorId)
			.filter((s) => s.isTemplate)
			.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt })),
	);

	// UX-CANVAS-010 AC2: surface a missing-binding banner whenever any widget in this canvas is in the
	// missing state (e.g. a template instantiated against a now-deleted entity).
	const missingBindingCount = $derived.by(() => {
		if ('kind' in summary) return 0;
		return summary.widgets.filter((p) => p.kind === 'missing').length;
	});
	const missingBanner = $derived(missingBindingBanner(missingBindingCount));

	// The players a preview may render as (UX-CANVAS-011 §Player selector).
	const previewablePlayers = $derived(
		runtime.actors
			.filter((a) => a.role !== 'dm')
			.map((a) => ({ id: a.id, label: `${a.displayName} (${a.role})` })),
	);

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
			const added = (runtime.state.scenes.scenes[sceneId]?.widgets ?? []).find(
				(w) => !before.has(w.id),
			);
			if (added) manipulation.select(added.id);
			announcer?.announce(placedAnnouncement(type), 'polite');
		}
	}

	function openCustomWidgetAuthoring() {
		customWidgetIdSuffix = runtime.newId();
		customWidgetOpen = true;
	}

	async function createCustomWidget(draft: WidgetWizardDraft) {
		const widget = draft.package.widgets[0];
		if (!widget) throw new Error('Custom widget draft has no widget definition.');
		const install = await runtime.dispatch({
			type: 'widget.package.install',
			actorId: runtime.defaultActorId,
			payload: { package: draft.package },
		});
		if (install.status !== 'accepted') throw new Error(install.rejection.message);
		const enabled = await runtime.dispatch({
			type: 'widget.package.enable',
			actorId: runtime.defaultActorId,
			payload: { packageId: draft.package.id },
		});
		if (enabled.status !== 'accepted') throw new Error(enabled.rejection.message);
		const center = screenToWorld(
			viewportController.viewport,
			viewportController.centerAnchor.x || 200,
			viewportController.centerAnchor.y || 150,
		);
		const size = { w: widget.defaultSize.width, h: widget.defaultSize.height };
		const topLeft = placementTopLeft(center, size);
		const before = new Set((rawScene?.widgets ?? []).map((w) => w.id));
		const addedResult = await runtime.dispatch({
			type: 'scene.add-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId,
				widget: {
					type: widget.type,
					version: widget.version,
					layout: { x: topLeft.x, y: topLeft.y, w: size.w, h: size.h },
					configuration: { visibility: 'player-visible' },
					binding: null,
				},
			},
		});
		if (addedResult.status !== 'accepted') throw new Error(addedResult.rejection.message);
		const added = (runtime.state.scenes.scenes[sceneId]?.widgets ?? []).find(
			(w) => !before.has(w.id),
		);
		if (added) manipulation.select(added.id);
		announcer?.announce(placedAnnouncement(widget.type), 'polite');
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

	// --- Widget chrome / binding (UX-CANVAS-007 / UX-CANVAS-008) -----------------------------------
	// The tile `⋯` actions trigger: select the widget so its chrome panel reflects it (the pointer entry
	// into the accessible chrome panel, whose buttons are the real keyboard/AT path).
	function openActionsFor(id: string) {
		manipulation.select(id);
	}
	function toggleCollapseFor(id: string) {
		void manipulation.toggleCollapse(id);
	}
	function openBindingFor(id: string) {
		manipulation.select(id);
		bindingOpen = true;
	}
	function openBindingForPrimary() {
		if (manipulation.primaryId) bindingOpen = true;
	}
	async function doBind(binding: Parameters<typeof manipulation.bind>[1], entityLabel: string) {
		if (manipulation.primaryId)
			await manipulation.bind(manipulation.primaryId, binding, entityLabel);
	}
	async function doUnbind() {
		if (manipulation.primaryId) await manipulation.unbind(manipulation.primaryId);
	}

	// --- Templates (UX-CANVAS-010) -----------------------------------------------------------------
	async function saveTemplateNamed(templateName: string) {
		await runtime.dispatch({
			type: 'scene.save-template',
			actorId: runtime.defaultActorId,
			payload: { sourceSceneId: sceneId, templateName },
		});
	}

	async function instantiateTemplate(entry: TemplateEntry) {
		let newSceneId: string | null = null;
		if (entry.kind === 'user') {
			const result = await runtime.dispatch({
				type: 'scene.instantiate-template',
				actorId: runtime.defaultActorId,
				payload: { templateSceneId: entry.id, newSceneName: instantiatedSceneName(entry.name) },
			});
			if (result.status === 'accepted') {
				const event = result.events.find((e) => e.kind === 'scene.template-instantiated');
				if (event && event.kind === 'scene.template-instantiated') newSceneId = event.newSceneId;
			}
		} else {
			// Built-in starter: create a fresh scene, then add its preset widgets (same commands a manual
			// build would use). Never overwrites an existing scene (UX-CANVAS-010 §Instant recall).
			const recipe = builtInById(entry.id);
			if (!recipe) return;
			const created = await runtime.dispatch({
				type: 'scene.create',
				actorId: runtime.defaultActorId,
				payload: { name: instantiatedSceneName(recipe.name), visibility: 'dm-only' },
			});
			if (created.status !== 'accepted') return;
			const createdEvent = created.events.find((e) => e.kind === 'scene.created');
			if (!createdEvent || createdEvent.kind !== 'scene.created') return;
			newSceneId = createdEvent.sceneId;
			for (const w of recipe.widgets) {
				await runtime.dispatch({
					type: 'scene.add-widget',
					actorId: runtime.defaultActorId,
					payload: {
						sceneId: newSceneId,
						widget: {
							type: w.type,
							version: '1.0.0',
							layout: { x: w.x, y: w.y, w: w.w, h: w.h },
							configuration: { visibility: w.visibility },
							binding: null,
						},
					},
				});
			}
		}
		templatesOpen = false;
		if (newSceneId) await goto(`../${newSceneId}/`);
	}

	// --- Player-view preview (UX-CANVAS-011) -------------------------------------------------------
	function enterPreview() {
		if (previewablePlayers.length === 0) return;
		if (!previewablePlayers.some((p) => p.id === playerPreviewId)) {
			playerPreviewId = previewablePlayers[0]!.id;
		}
		previewActive = true;
		manipulation.clearSelection();
		announcer?.announce(previewEnterAnnouncement(playerLabelFor), 'assertive');
	}
	function exitPreview() {
		if (!previewActive) return;
		previewActive = false;
		announcer?.announce(PREVIEW_EXIT_ANNOUNCEMENT, 'polite');
	}
	function togglePreview() {
		if (previewActive) exitPreview();
		else enterPreview();
	}

	// UX-CANVAS-015: canvas-level keyboard model. The host gets first crack at canvas keys so a selected
	// widget's arrow-key MOVE wins over arrow-key pan, and the manipulation/history shortcuts dispatch the
	// same core commands the toolbar does. Returns true when a key was handled (CanvasViewport then
	// preventDefaults and skips the viewport pan/zoom handler).
	function onManipulationKey(event: KeyboardEvent): boolean {
		if (!canEdit) return false;
		// UX-CANVAS-011: Shift+P toggles the player-view preview from anywhere on the canvas.
		if (event.shiftKey && (event.key === 'P' || event.key === 'p')) {
			togglePreview();
			return true;
		}
		// While previewing, the canvas is read-only: Escape exits; every edit key is swallowed.
		if (previewActive) {
			if (event.key === 'Escape') exitPreview();
			return true;
		}
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
			case 'binding-panel':
				openBindingForPrimary();
				return true;
			case 'collapse':
				if (manipulation.primaryId) void manipulation.toggleCollapse(manipulation.primaryId);
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

	// What the viewport renders: the DM canvas normally, or the read-only player-view preview overlay.
	const displayTiles = $derived(previewActive ? previewTiles : canvasTiles);
	const displayInteractive = $derived(canEdit && !previewActive);

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

	// --- Unified widget rendering + customization (widget platform) -------------------------------
	// Resolve a widget's definition so WidgetView can render its template/builtin/custom view.
	function widgetDefinitionOf(type: string) {
		return findWidgetDefinition(runtime.state.widgets, type) ?? null;
	}

	// Dispatch a widget command (timer/dice/…) for a scene widget instance, supplying the scene
	// context (sceneId + expectedRevision) a template renderer cannot know. Returns the dispatcher,
	// or undefined while previewing (the player-view preview canvas is read-only).
	function widgetCommandDispatcher(widgetInstanceId: string) {
		if (previewActive || 'kind' in summary) return undefined;
		return async (commandType: string, payload: Record<string, unknown>) => {
			if ('kind' in summary) return;
			await runtime.dispatch({
				type: 'widget.dispatch-command',
				actorId: runtime.defaultActorId,
				idempotencyKey: `${commandType}-${widgetInstanceId}-${Date.now()}`,
				payload: {
					sceneId,
					widgetInstanceId,
					commandType,
					payload,
					expectedRevision: summary.ownership.revision,
				},
			});
		};
	}

	// The Customize panel target (a selected widget). Edits write through scene.configure-widget
	// (config + per-instance style tokens, both stored in `configuration`) and scene.resize-widget.
	let customizeTargetId = $state<string | null>(null);
	const customizeWidget = $derived(
		customizeTargetId ? (rawScene?.widgets.find((w) => w.id === customizeTargetId) ?? null) : null,
	);
	const customizeDefinition = $derived(
		customizeWidget ? widgetDefinitionOf(customizeWidget.type) : null,
	);
	const customizeStyleTokens = $derived(readStyleTokenOverrides(customizeWidget?.configuration));

	function openCustomize(id: string) {
		manipulation.select(id);
		customizeTargetId = id;
	}

	async function configureWidget(configuration: Record<string, unknown>) {
		if (!customizeWidget) return;
		await runtime.dispatch({
			type: 'scene.configure-widget',
			actorId: runtime.defaultActorId,
			payload: { sceneId, widgetInstanceId: customizeWidget.id, configuration },
		});
	}
	function setWidgetConfigKey(key: string, value: unknown) {
		if (!customizeWidget) return;
		void configureWidget({ ...customizeWidget.configuration, [key]: value });
	}
	function setWidgetStyleToken(name: string, value: string) {
		if (!customizeWidget) return;
		const tokens = { ...customizeStyleTokens };
		if (value) tokens[name] = value;
		else delete tokens[name];
		void configureWidget({ ...customizeWidget.configuration, styleTokens: tokens });
	}
	async function resizeCustomizeWidget(w: number, h: number) {
		if (!customizeWidget) return;
		await runtime.dispatch({
			type: 'scene.resize-widget',
			actorId: runtime.defaultActorId,
			payload: { sceneId, widgetInstanceId: customizeWidget.id, w, h },
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
				{#if canEdit}
					<button
						class="button secondary"
						data-testid="open-templates"
						onclick={() => (templatesOpen = true)}
					>
						Templates
					</button>
					<button
						class="button secondary"
						data-testid="preview-player-view-toggle"
						aria-pressed={previewActive}
						onclick={togglePreview}
					>
						{previewActive ? 'Exit player preview' : 'Preview player view'}
					</button>
				{/if}
			</div>
		</header>

		{#if missingBanner}
			<!-- UX-CANVAS-010 AC2: bindings that could not be resolved on this canvas (e.g. a template
			     instantiated against a deleted entity) are surfaced in a non-blocking alert banner. -->
			<p class="missing-banner" role="alert" data-testid="missing-binding-banner">
				{missingBanner}
			</p>
		{/if}

		<!-- UX-CANVAS-001/014/016: the spatial canvas viewport. Pan/zoom with cursor-anchored zoom,
		     on-screen zoom controls, a minimap, keyboard parity, virtualization, skeletons, and
		     poster-frame degradation. UX-CANVAS-002/003/004/005/006/009/012/015 layer the editor model on
		     top: a widget library, selection + marquee, move/resize/rotate, alignment, z-order, undo/redo,
		     and the keyboard model. Tiles are actor-filtered (no DM-only leak to a player view). -->
		<section data-testid="scene-canvas-section" aria-label="Scene canvas viewport">
			{#if previewActive}
				<!-- UX-CANVAS-011: the persistent player-view preview banner; editing is suspended while shown. -->
				<PlayerViewPreviewBanner
					playerLabel={playerLabelFor}
					players={previewablePlayers}
					selectedPlayerId={playerPreviewId}
					onselect={(id) => (playerPreviewId = id)}
					onexit={exitPreview}
				/>
			{/if}
			{#if displayInteractive}
				<!-- Canvas command bar: the non-gesture entry points for placement, grid, history, and help.
				     Every one has a keyboard shortcut too (UX-CANVAS-015), but the buttons guarantee parity
				     on touch/no-keyboard profiles. -->
				<div
					class="canvas-command-bar"
					role="toolbar"
					aria-label="Canvas tools"
					data-testid="canvas-command-bar"
				>
					<button
						type="button"
						class="button"
						data-testid="open-widget-library"
						onclick={() => (libraryOpen = true)}
					>
						+ Add widget
					</button>
					<button
						type="button"
						class="button secondary"
						data-testid="open-custom-widget-authoring"
						onclick={openCustomWidgetAuthoring}
					>
						Custom widget
					</button>
					<label class="grid-toggle">
						<input
							type="checkbox"
							data-testid="canvas-grid-toggle"
							bind:checked={manipulation.gridEnabled}
						/>
						<span>Snap to grid</span>
					</label>
					<label class="grid-toggle">
						<input type="checkbox" data-testid="canvas-show-bindings" bind:checked={showBindings} />
						<span>Show bindings</span>
					</label>
					<button
						type="button"
						class="button secondary"
						data-testid="canvas-undo"
						aria-label={manipulation.undoLabel
							? `Undo ${manipulation.undoLabel}`
							: 'Nothing to undo'}
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
						aria-label={manipulation.redoLabel
							? `Redo ${manipulation.redoLabel}`
							: 'Nothing to redo'}
						aria-disabled={!manipulation.canRedo}
						disabled={!manipulation.canRedo}
						onclick={() => manipulation.redo()}
					>
						Redo
					</button>
					<button
						type="button"
						class="button secondary"
						data-testid="canvas-shortcuts-open"
						onclick={() => (helpOpen = true)}
					>
						Keyboard shortcuts
					</button>
					{#if manipulation.undoLimitReached && !manipulation.canUndo}
						<span class="canvas-toast" role="status" data-testid="canvas-undo-limit"
							>Undo limit reached</span
						>
					{/if}
				</div>
			{/if}

			<CanvasViewport
				controller={viewportController}
				tiles={displayTiles}
				minimap={minimapMode}
				label={previewActive ? `${summary.name} — player view preview` : `${summary.name} canvas`}
				interactive={displayInteractive}
				selectedIds={manipulation.selectedIds}
				primaryId={manipulation.primaryId}
				selectionBounds={manipulation.selectionBounds}
				{showBindings}
				onSelectTile={(id, mode) => manipulation.select(id, mode)}
				onMarquee={(start, end, additive) => manipulation.marquee(start, end, additive)}
				onMoveCommit={(id, x, y) => manipulation.moveTo(id, x, y)}
				onResizeCommit={(id, w, h) => manipulation.resizeTo(id, w, h)}
				onRotateCommit={(id, deg, free) => manipulation.rotateTo(id, deg, free)}
				onToggleCollapse={toggleCollapseFor}
				onOpenActions={openActionsFor}
				onRebind={openBindingFor}
				tileTypeLabel={(t) => widgetDefinitionOf(t.type)?.displayName ?? t.type}
				{onManipulationKey}
			>
				{#snippet tileBody(tile)}
					<!-- UX: live widget visuals on the canvas. The canvas world is presentational
					     (aria-hidden); the body is `inert` so its controls are not focusable here — the
					     interactive, accessible path is the widget card + Customize panel below.
					     UX-CANVAS-011 no-leak: never render the raw DM-resolved body while previewing a
					     player view — that resolves widget data against the DM actor and would leak
					     field-level DM-only content into the "player view" preview. The preview keeps
					     correct geometry / visibility / chrome and shows a neutral "hidden in preview"
					     affordance so the tile reads as intentional rather than blank. (Rendering the
					     body with the previewed player's filtered data is a tracked enhancement.) -->
					{@const cw = rawScene?.widgets.find((x) => x.id === tile.id) ?? null}
					{@const cdef = cw ? widgetDefinitionOf(cw.type) : null}
					{#if cw && cdef}
						{#if previewActive}
							<div class="canvas-widget-preview" aria-hidden="true">
								<span class="canvas-widget-preview-icon">◌</span>
								<span>Content hidden in preview</span>
							</div>
						{:else}
							<div class="canvas-widget-body" inert>
								<WidgetView definition={cdef} widget={cw} surface="scene" />
							</div>
						{/if}
					{/if}
				{/snippet}
				{#snippet emptyState()}
					<!-- UX-CANVAS-013: empty-canvas teaching state — only for the editing DM; a player just
					     sees an empty canvas. The CTA opens the widget library (same as the W shortcut). -->
					{#if displayInteractive}
						<EmptyCanvasState compact={profile.isCompact} onAdd={() => (libraryOpen = true)} />
					{/if}
				{/snippet}
			</CanvasViewport>

			{#if displayInteractive}
				<SelectionToolbar
					controller={manipulation}
					ongroup={groupManipulationSelection}
					ondelete={() => requestDelete()}
				/>
				<WidgetChromePanel
					controller={manipulation}
					widget={primaryWidget}
					onbind={openBindingForPrimary}
				/>
				<TransformPanel controller={manipulation} widget={primaryWidget} />
			{/if}
		</section>

		{#if canEdit}
			<WidgetLibrary
				bind:open={libraryOpen}
				profile={profile.profileId}
				onplace={placeFromLibrary}
			/>
			<CustomWidgetAuthoringDialog
				bind:open={customWidgetOpen}
				idSuffix={customWidgetIdSuffix}
				oncreate={createCustomWidget}
				onclose={() => (customWidgetOpen = false)}
			/>
			<Dialog
				open={customizeTargetId !== null}
				title="Customize widget"
				testid="widget-customize-dialog"
				onclose={() => (customizeTargetId = null)}
			>
				{#if customizeWidget && customizeDefinition}
					<WidgetCustomizePanel
						definition={customizeDefinition}
						config={customizeWidget.configuration}
						styleTokens={customizeStyleTokens}
						size={{ w: customizeWidget.layout.w, h: customizeWidget.layout.h }}
						onConfig={setWidgetConfigKey}
						onStyleToken={setWidgetStyleToken}
						onSize={resizeCustomizeWidget}
					/>
				{/if}
			</Dialog>
			<KeyboardShortcutsHelp bind:open={helpOpen} />
			<BindingInspector
				bind:open={bindingOpen}
				widget={primaryWidget}
				entities={bindableEntities}
				onbind={doBind}
				onunbind={doUnbind}
			/>
			<CanvasTemplatesDialog
				bind:open={templatesOpen}
				sourceName={summary.name}
				{userTemplates}
				onsave={saveTemplateNamed}
				oninstantiate={instantiateTemplate}
			/>
			<Dialog
				open={deleteTargetId !== null}
				title="Delete widget?"
				role="alertdialog"
				testid="delete-confirm"
				closeOnBackdrop={false}
				onclose={() => (deleteTargetId = null)}
			>
				<p>
					Remove <strong>{deleteTarget?.label ?? 'this widget'}</strong> from the scene? The bound entity
					is not deleted.
				</p>
				{#snippet footer()}
					<button
						type="button"
						class="button secondary"
						data-testid="delete-cancel"
						onclick={() => (deleteTargetId = null)}
					>
						Cancel
					</button>
					<button
						type="button"
						class="button"
						data-testid="delete-confirm-button"
						onclick={confirmDelete}
					>
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
					{@const def = widgetDefinitionOf(w.type)}
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
								<span><strong>{def?.displayName ?? w.type}</strong> <span class="meta">v{w.version}</span></span>
							</label>
							{#if payload.kind === 'degraded'}
								<div class="layout" data-testid={`degraded-${w.id}`}>
									degraded: {payload.unavailableHostPermissions.join(', ')} unavailable
								</div>
							{/if}
							<div class="layout">
								x {w.layout.x.toFixed(0)} • y {w.layout.y.toFixed(0)} • w {w.layout.w.toFixed(0)} • h
								{w.layout.h.toFixed(0)} • z {w.layout.z}
								{#if w.layout.dock}• docked {w.layout.dock}{/if}
								{#if w.layout.pinned}• pinned{/if}
								{#if w.layout.groupId}• grouped{/if}
								{#if w.layout.focusOrder !== null}• focus {w.layout.focusOrder}{/if}
								{#if timer}
									• timer {timer.status}
								{/if}
							</div>
							{#if def}
								<!-- The live, interactive widget — the accessible render of its definition (template /
								     builtin / custom), token-styled and config-driven. Timer/dice commands dispatch
								     through the Processing Core with this scene's context. -->
								<div class="widget-card-render" data-testid={`render-${w.id}`}>
									<WidgetView
										definition={def}
										widget={w}
										surface="scene"
										onCommand={widgetCommandDispatcher(w.id)}
									/>
								</div>
							{/if}
						</div>
						<div
							class="row-actions"
							role="toolbar"
							aria-label={`Layout controls for ${widgetAccessibleName(payload)}`}
							data-testid={`layout-toolbar-${w.id}`}
						>
							{#if canEdit}
								<button
									type="button"
									data-testid={`customize-${w.id}`}
									aria-label={`Customize ${widgetAccessibleName(payload)}`}
									onclick={() => openCustomize(w.id)}
								>
									Customize
								</button>
							{/if}
							{#each layoutCommandsFor(w) as command (command.id)}
								{#if command.targets === 'self'}
									<button
										type="button"
										data-testid={`layout-${command.id}-${w.id}`}
										aria-label={`${command.label} — ${widgetAccessibleName(payload)}`}
										onclick={() => runLayoutCommand(command, w)}
									>
										{command.label}
									</button>
								{/if}
							{/each}
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
				selectedIds={displayInteractive ? manipulation.selectedIds : undefined}
				onselect={displayInteractive ? (id, mode) => manipulation.select(id, mode) : undefined}
				onreorder={displayInteractive ? reorderFromOutline : undefined}
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
	.missing-banner {
		margin: 0 0 var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-status-warning);
		background: var(--color-status-warning-subtle);
		color: var(--color-status-warning-text);
		font-size: var(--text-sm);
	}
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
	[data-testid='scene-canvas-section'] :global(.chrome-panel),
	[data-testid='scene-canvas-section'] :global(.transform-panel) {
		margin-top: var(--space-2);
	}
	/* The inert, visual widget render inside a canvas tile (interactivity lives in the card). */
	.canvas-widget-body {
		height: 100%;
		min-height: 0;
		overflow: hidden;
		pointer-events: none;
	}
	/* Player-view preview: a neutral placeholder instead of the (DM-resolved) live body, so the
	   tile reads as intentionally hidden rather than as an empty/broken box. */
	.canvas-widget-preview {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		align-items: center;
		justify-content: center;
		height: 100%;
		min-height: 0;
		padding: var(--space-2);
		font-size: var(--text-xs);
		text-align: center;
		color: var(--color-text-secondary);
		pointer-events: none;
	}
	.canvas-widget-preview-icon {
		font-size: var(--text-lg);
		opacity: 0.7;
	}
	/* The live, interactive widget render inside a widget card. */
	.widget-card-render {
		margin-top: var(--space-1);
		padding-top: var(--space-1);
		border-top: 1px solid var(--color-border);
	}
</style>
