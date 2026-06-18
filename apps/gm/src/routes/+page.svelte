<script lang="ts">
	import {
		DEFAULT_COMMAND_CENTER_TOOLS,
		SESSION_WORKFLOW_STATES,
		getActiveMapProjectionSummary,
		getActiveMapViewForActor,
		getPlayerViewController,
		getSceneForActor,
		getSessionParticipantStatus,
		getSessionWidgetMode,
		isTransitionAllowed,
		listWidgetLibrary,
		listWidgetsForSurface,
		resolveAddWidgetCommand,
		resolveCommandCenterHome,
		resolveOnboarding,
		type MapEntity,
		type SessionWorkflowState,
		type WidgetBindingPayload,
		type WidgetDefinition,
		type WidgetLibraryEntry,
	} from '@dndtools/core';
	import { onMount } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import { useFeatureTier } from '$lib/state/feature-tier.svelte';
	import { ViewportController, type Vec2 } from '$lib/canvas-runtime';
	import CanvasViewport from '$lib/gui/canvas/CanvasViewport.svelte';
	import type { CanvasTile } from '$lib/gui/canvas/types';
	import FirstRun from '$lib/gui/FirstRun.svelte';
	import CoachMark from '$lib/gui/ux-onb/CoachMark.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import SessionStatusStrip from '$lib/gui/ux-cmd/SessionStatusStrip.svelte';
	import ParticipantHome from '$lib/gui/ux-cmd/ParticipantHome.svelte';
	import SessionPhaseControls from '$lib/gui/ux-cmd/SessionPhaseControls.svelte';
	import PlayerViewPreviewModal from '$lib/gui/ux-cmd/PlayerViewPreviewModal.svelte';
	import HandoutPushFlow from '$lib/gui/ux-cmd/HandoutPushFlow.svelte';
	import {
		CanvasModeStore,
		provideCanvasMode,
	} from '$lib/gui/ux-canvas/dashboard/canvas-mode.svelte';
	import {
		COMMAND_CENTER_LAYOUT_KEY,
		DashboardLayoutStore,
		blockTitle,
		commandCenterDefaultBlocks,
	} from '$lib/gui/ux-canvas/dashboard/dashboard-layout.svelte';
	import DashboardBlockFrame from '$lib/gui/ux-canvas/dashboard/DashboardBlock.svelte';
	import CanvasPropertiesPanel from '$lib/gui/ux-canvas/CanvasPropertiesPanel.svelte';
	import WidgetView from '$lib/gui/ux-canvas/widgets/WidgetView.svelte';
	import { provideCommandCenter } from '$lib/gui/ux-canvas/widgets/command-center-context';

	const runtime = useRuntime();
	const profile = useProfile();
	const featureTier = useFeatureTier();

	// Command Center widgets reach the two route-owned modal flows (push-handout, player-view
	// preview) through this context; everything else they derive + dispatch themselves.
	provideCommandCenter({
		openPush: (recipientId) => openPush(recipientId),
		openPreview: (actorId, displayName) => openPreview(actorId, displayName),
	});

	// PLAT-013: the onboarding view is computed by the Processing Core from durable state + the
	// active (device-local) feature tier. The GUI renders it; it never derives fresh-vault /
	// tier-visibility itself (Contract 1). The active tier drives the progressive-disclosure
	// feature list (and the advanced surfaces on Settings); the Must-have session-running tools
	// below stay available on every tier (slim / Must-have contract).
	const onboarding = $derived(
		resolveOnboarding(runtime.state, runtime.defaultActorId, featureTier.tier),
	);

	const TOOL_LABELS = new Map(DEFAULT_COMMAND_CENTER_TOOLS.map((t) => [t.type, t.label]));
	function toolLabel(type: string): string {
		return TOOL_LABELS.get(type) ?? type;
	}

	// UX-CMD-012: the role-differentiated home decision. This single viewer-gated read model decides
	// whether the `/` route renders the DM dashboard or a player/observer's own controlled view. The DM
	// dashboard markup below is gated entirely behind `homeView.kind === 'dm'`, so a player/observer
	// never receives the DM surface, its controls, or any DM-only content/count/title (the home is the
	// product's most dangerous leak surface; this is the choke point — see core command-center-home.ts).
	const homeView = $derived(
		resolveCommandCenterHome(runtime.state, runtime.defaultActorId, {
			widgetPackages: runtime.state.widgets,
		}),
	);

	let ensuring = $state(false);
	let snapshotting = $state(false);
	let presetName = $state('');
	let selectedWidgetId = $state<string | null>(null);
	let lastRestore = $state<{ restored: number; missing: string[] } | null>(null);
	let autoSaveStatus = $state<string | null>(null);
	let librarySearch = $state('');
	let selectedMapId = $state('');
	let selectedRegionId = $state<string | null>(null);
	let activeMapStatus = $state<string | null>(null);
	let playerViewSceneSelections = $state<Record<string, string>>({});
	let playerViewStatus = $state<string | null>(null);
	// UX-CMD-005 — the DM-only player-view preview modal target.
	let previewTarget = $state<{ actorId: string; displayName: string } | null>(null);
	let previewOpen = $state(false);
	// UX-CMD-006 — the push-handout flow (optionally pre-targeted at one participant row).
	let pushOpen = $state(false);
	let pushRecipientId = $state<string | null>(null);
	// UX-CMD-009 — the widget library quick-access drawer.
	let libraryOpen = $state(false);
	let librarySearchEl = $state<HTMLInputElement | null>(null);

	// --- Spatial mission-control board (Command Center redesign) ---------------------------------
	// The DM home on a non-compact profile is a full-viewport spatial canvas: the dashboard widget
	// BLOCKS below are GUI display state (device-local layout persistence), while the home Scene's
	// tool widgets inside the Tools block remain core-owned (scene.move-widget / presets / safe
	// point). View/Edit mode + single selection live in the shared CanvasModeStore (context, §8.3).
	const canvasMode = provideCanvasMode(new CanvasModeStore());
	const board = new DashboardLayoutStore({
		storageKey: COMMAND_CENTER_LAYOUT_KEY,
		defaults: commandCenterDefaultBlocks(),
		locked: true, // §4: the Command Center widget set is fixed — move/resize/configure only.
	});
	const boardController = new ViewportController();
	// §3: zoom-to-fit clears the floating chrome groups (identity/actions above, zoom group below),
	// so the default view never parks a widget's controls underneath them.
	boardController.setFitInsets({ top: 64, right: 24, bottom: 64, left: 24 });
	onMount(() => board.load());

	// The Command Center widgets are real, surface-scoped widget DEFINITIONS now. Each board block
	// renders its definition through the shared WidgetView (titles/config/render come from the def);
	// only geometry stays device-local in the DashboardLayoutStore.
	const ccDefinitionByType = $derived.by(() => {
		const map = new SvelteMap<string, WidgetDefinition>();
		for (const def of listWidgetsForSurface(runtime.state.widgets, 'command-center')) {
			map.set(def.type, def);
		}
		return map;
	});

	const boardTiles = $derived<CanvasTile[]>(
		board.blocks.map((block) => ({
			id: block.id,
			type: block.type,
			title: blockTitle(block, ccDefinitionByType.get(block.type)?.displayName ?? block.type),
			x: block.rect.x,
			y: block.rect.y,
			w: block.rect.w,
			h: block.rect.h,
			z: block.z,
			visibility: 'dm-only' as const,
		})),
	);
	const selectedTileIds = $derived.by(() => {
		const ids = new SvelteSet<string>();
		if (canvasMode.selectedId) ids.add(canvasMode.selectedId);
		return ids;
	});
	const selectedBlock = $derived(
		canvasMode.selectedId ? (board.get(canvasMode.selectedId) ?? null) : null,
	);

	function nudgeBlock(id: string, dx: number, dy: number): void {
		const block = board.get(id);
		if (!block) return;
		board.move(id, block.rect.x + dx, block.rect.y + dy);
	}
	function growBlock(id: string, dw: number, dh: number): void {
		const block = board.get(id);
		if (!block) return;
		board.resize(id, block.rect.w + dw, block.rect.h + dh);
	}
	function onBoardMarquee(start: Vec2, end: Vec2): void {
		// Single-selection board: a click on empty canvas (zero-area marquee) clears the selection.
		if (Math.abs(end.x - start.x) < 2 && Math.abs(end.y - start.y) < 2) canvasMode.select(null);
	}
	function onBoardKey(event: KeyboardEvent): boolean {
		// Escape exits Edit Mode from the canvas region itself (§4 keyboard path).
		if (event.key === 'Escape' && canvasMode.isEdit) {
			canvasMode.setMode('view');
			return true;
		}
		return false;
	}

	// UX-CMD-009: the search field is auto-focused when the drawer opens (after the dialog's focus
	// trap takes its initial focus, hence the queued task).
	$effect(() => {
		if (!libraryOpen || !librarySearchEl) return;
		const el = librarySearchEl;
		const timer = setTimeout(() => el.focus(), 0);
		return () => clearTimeout(timer);
	});

	const homeSceneId = $derived(runtime.state.commandCenter.homeSceneId);
	const summary = $derived(
		homeSceneId
			? getSceneForActor(
					runtime.state.scenes,
					runtime.state.permissions,
					runtime.defaultActorId,
					homeSceneId,
					{ widgetPackages: runtime.state.widgets },
				)
			: null,
	);
	const presets = $derived(
		Object.values(runtime.state.commandCenter.presets).sort((a, b) => a.name.localeCompare(b.name)),
	);
	const maps = $derived<MapEntity[]>(
		Object.values(runtime.state.maps.maps).sort((a, b) => a.name.localeCompare(b.name)),
	);
	const selectedMap = $derived(maps.find((map) => map.id === selectedMapId) ?? maps[0] ?? null);
	const activeMap = $derived(
		getActiveMapViewForActor(
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			runtime.defaultActorId,
		),
	);
	const playerActiveMap = $derived(
		getActiveMapViewForActor(
			runtime.state.maps,
			runtime.state.permissions,
			runtime.state.session,
			'actor-player',
		),
	);
	const sessionMode = $derived(getSessionWidgetMode(runtime.state.session));
	const playerSessionStatus = $derived(
		getSessionParticipantStatus(runtime.state.session, runtime.state.permissions, 'actor-player'),
	);
	const playerViewController = $derived(
		getPlayerViewController(runtime.state, runtime.defaultActorId),
	);
	const playerViewSceneOptions = $derived(
		playerViewController.kind === 'available' ? playerViewController.sceneOptions : [],
	);
	// UX-CMD-007 — the DM-only "Projecting" glance state of the active-map embed.
	const projectionSummary = $derived(
		getActiveMapProjectionSummary(runtime.state, runtime.defaultActorId),
	);
	// Why Project / Queue are unavailable, as a VISIBLE inline hint (parity with the desktop AtlasWidget;
	// a title tooltip never shows on the touch/compact profile this snippet serves).
	const projectionDisabledHint = $derived(
		runtime.state.session.workflow !== 'active'
			? 'Start the session to project to players'
			: activeMap.kind !== 'available'
				? 'Set an active map to project to players'
				: undefined,
	);

	// §3 top-right chrome: the notifications badge counts QUEUED deliveries (offline projections +
	// queued player-view assignments) — real session signals, derived from the same core read models
	// the Player Views block renders.
	const queuedDeliveries = $derived.by(() => {
		let queued = projectionSummary?.projecting ? 0 : (projectionSummary?.queuedCount ?? 0);
		if (playerViewController.kind === 'available') {
			for (const participant of playerViewController.participants) {
				if (participant.assignment?.deliveryStatus === 'queued') queued += 1;
			}
		}
		return queued;
	});

	function openPreview(actorId: string, displayName: string): void {
		previewTarget = { actorId, displayName };
		previewOpen = true;
	}

	function closePreview(): void {
		previewOpen = false;
		previewTarget = null;
		// Palette parity (UX-CMD-011): when the preview was opened via /?preview-view=…, closing it
		// returns to the clean home URL so the modal does not re-open on the next navigation.
		if (page.url.searchParams.has('preview-view')) void goto('/');
	}

	function openPush(recipientId: string | null): void {
		pushRecipientId = recipientId;
		pushOpen = true;
	}

	function closePush(): void {
		pushOpen = false;
		pushRecipientId = null;
		// Palette parity (UX-CMD-011): when the flow was opened via /?push-handout=1, closing it
		// returns to the clean home URL so the flow does not re-open on the next navigation.
		if (page.url.searchParams.has('push-handout')) void goto('/');
	}

	// UX-CMD-011 — "Push handout to players…" from the command palette routes here with
	// ?push-handout=1 and opens the SAME confirmed flow the visible push buttons open. Each param
	// occurrence is handled once (same race-guard pattern as the preview param below).
	let handledPushParam = $state(false);
	$effect(() => {
		const requested = page.url.searchParams.has('push-handout');
		if (!requested) {
			handledPushParam = false;
			return;
		}
		if (handledPushParam || homeView.kind !== 'dm') return;
		handledPushParam = true;
		openPush(null);
	});

	// UX-CMD-011 — "Preview <player>'s view" from the command palette routes here with
	// ?preview-view=<actorId>. Resolve it against the DM's player-view controller (DM-only by
	// construction: the controller is denied for any other actor, so the modal never opens for them).
	// Each param value is handled ONCE, so closing the modal (which clears the URL asynchronously)
	// can never race the effect into re-opening it.
	let handledPreviewParam = $state<string | null>(null);
	$effect(() => {
		const requested = page.url.searchParams.get('preview-view');
		if (!requested) {
			handledPreviewParam = null;
			return;
		}
		if (handledPreviewParam === requested) return;
		if (homeView.kind !== 'dm' || playerViewController.kind !== 'available') return;
		const participant = playerViewController.participants.find(
			(entry) => entry.actorId === requested,
		);
		if (!participant) return;
		handledPreviewParam = requested;
		openPreview(participant.actorId, participant.displayName);
	});

	// Quick-access widget library (CMD-005): the Processing Core decides which widget
	// types exist, their required bindings, and whether each runs on the active
	// platform profile. The GUI only renders entries and dispatches the resolved
	// scene.add-widget command.
	const library = $derived<WidgetLibraryEntry[]>(
		listWidgetLibrary(runtime.state.widgets, runtime.state.permissions, runtime.defaultActorId, {
			profileId: profile.profileId,
			filter: librarySearch,
		}),
	);

	type LiveWidget = Extract<WidgetBindingPayload, { kind: 'available' | 'degraded' }>;
	const liveWidgets = $derived<LiveWidget[]>(
		summary && !('kind' in summary)
			? summary.widgets.filter(
					(w): w is LiveWidget => w.kind === 'available' || w.kind === 'degraded',
				)
			: [],
	);

	// The Command Center is the application home Scene. Create the default from the
	// system template the first time the home surface loads (CMD-001). Only the DM may
	// author it, so when viewing as a player/observer ("view as") this stays inert
	// rather than dispatching a command the core would reject.
	$effect(() => {
		if (!runtime.loaded || ensuring) return;
		if (runtime.state.permissions.actors[runtime.defaultActorId]?.role !== 'dm') return;
		const missingHome = !homeSceneId;
		const danglingHome =
			!!homeSceneId && !!summary && 'kind' in summary && summary.reason === 'scene-not-found';
		if (!missingHome && !danglingHome) return;
		ensuring = true;
		void runtime
			.dispatch({
				type: 'command-center.ensure-home',
				actorId: runtime.defaultActorId,
				payload: {},
			})
			.finally(() => {
				ensuring = false;
			});
	});

	// Keep a valid focused panel selection for the compact profile.
	$effect(() => {
		const ids = liveWidgets.map((w) => w.widget.id);
		if (ids.length === 0) {
			selectedWidgetId = null;
		} else if (!selectedWidgetId || !ids.includes(selectedWidgetId)) {
			selectedWidgetId = ids[0] ?? null;
		}
	});

	$effect(() => {
		if (maps.length === 0) {
			selectedMapId = '';
			selectedRegionId = null;
			return;
		}
		if (!selectedMapId || !maps.some((map) => map.id === selectedMapId)) {
			const first = maps[0]!;
			selectedMapId = first.id;
			selectedRegionId = first.defaultRegionId;
		}
	});

	async function moveWidget(id: string, deltaX: number, deltaY: number) {
		if (!homeSceneId) return;
		const target = liveWidgets.find((w) => w.widget.id === id);
		if (!target) return;
		await runtime.dispatch({
			type: 'scene.move-widget',
			actorId: runtime.defaultActorId,
			payload: {
				sceneId: homeSceneId,
				widgetInstanceId: id,
				x: target.widget.layout.x + deltaX,
				y: target.widget.layout.y + deltaY,
			},
		});
	}

	// UX-CMD-008: the recoverable last-known-good layout slot.
	const autoSave = $derived(runtime.state.commandCenter.autoSave ?? null);

	async function captureSafePoint(): Promise<void> {
		if (!homeSceneId || snapshotting) return;
		snapshotting = true;
		try {
			await runtime.dispatch({
				type: 'command-center.snapshot-auto-save',
				actorId: runtime.defaultActorId,
				payload: {},
			});
		} finally {
			snapshotting = false;
		}
	}

	// Establish a baseline last-known-good as soon as the DM's home is ready, so a crash or an unwanted
	// experimental change is always recoverable (CMD-008). Raw widget moves intentionally do NOT
	// re-checkpoint — they are exactly what "Restore" rolls back.
	$effect(() => {
		if (!runtime.loaded || homeView.kind !== 'dm') return;
		if (!homeSceneId || !summary || 'kind' in summary) return;
		if (autoSave || snapshotting) return;
		void captureSafePoint();
	});

	async function savePreset(event: SubmitEvent) {
		event.preventDefault();
		if (!presetName.trim()) return;
		const result = await runtime.dispatch({
			type: 'command-center.save-preset',
			actorId: runtime.defaultActorId,
			payload: { name: presetName.trim() },
		});
		if (result.status === 'accepted') {
			presetName = '';
			// A saved preset is a deliberate good state — refresh the recoverable safe point too.
			await captureSafePoint();
		}
	}

	async function applyPreset(presetId: string) {
		const result = await runtime.dispatch({
			type: 'command-center.apply-preset',
			actorId: runtime.defaultActorId,
			payload: { presetId },
		});
		if (result.status === 'accepted') {
			const event = result.events.find((e) => e.kind === 'command-center.preset-restored');
			if (event && event.kind === 'command-center.preset-restored') {
				lastRestore = { restored: event.restoredWidgetCount, missing: event.missingWidgetTypes };
			}
		}
	}

	async function restoreSafePoint(): Promise<void> {
		const result = await runtime.dispatch({
			type: 'command-center.restore-auto-save',
			actorId: runtime.defaultActorId,
			payload: {},
		});
		if (result.status === 'accepted') {
			const event = result.events.find((e) => e.kind === 'command-center.auto-save-restored');
			autoSaveStatus =
				event && event.kind === 'command-center.auto-save-restored'
					? `Layout restored from safe point (${event.restoredWidgetCount} widget${
							event.restoredWidgetCount === 1 ? '' : 's'
						}).`
					: 'Layout restored from safe point.';
		} else {
			autoSaveStatus = result.rejection.message;
		}
	}

	function selectMap(mapId: string) {
		selectedMapId = mapId;
		const nextMap = maps.find((map) => map.id === mapId) ?? null;
		selectedRegionId = nextMap?.defaultRegionId ?? null;
	}

	async function setWorkflow(workflow: SessionWorkflowState) {
		const payload: { workflow: SessionWorkflowState; activeSceneId?: string | null } = { workflow };
		if (
			workflow === 'active' ||
			workflow === 'prep' ||
			workflow === 'paused' ||
			workflow === 'ending'
		) {
			payload.activeSceneId = runtime.state.session.activeSceneId ?? homeSceneId;
		}
		await runtime.dispatch({
			type: 'session.set-workflow',
			actorId: runtime.defaultActorId,
			payload,
		});
	}

	// SES-001 — RECOVER an archived session back into recap review. The button is shown only when an
	// archive exists; the Processing Core fails closed if recovery is not allowed from the current state.
	async function recoverSession() {
		await runtime.dispatch({
			type: 'session.recover',
			actorId: runtime.defaultActorId,
			payload: {},
		});
	}

	async function bindActiveMap() {
		if (!selectedMapId) return;
		const result = await runtime.dispatch({
			type: 'session.set-active-map',
			actorId: runtime.defaultActorId,
			payload: { mapId: selectedMapId, regionId: selectedRegionId },
		});
		activeMapStatus =
			result.status === 'accepted' ? 'Active map updated.' : result.rejection.message;
	}

	async function projectActiveMap(connectionState: 'connected' | 'offline') {
		// Project to every connected player (the same recipient set the palette's
		// "Project active map to players" command carries — UX-CMD-011 parity).
		const playerActorIds = runtime.actors
			.filter((actor) => actor.role === 'player')
			.map((actor) => actor.id)
			.sort();
		const result = await runtime.dispatch({
			type: 'session.project-active-map',
			actorId: runtime.defaultActorId,
			payload: { playerActorIds, connectionState },
		});
		activeMapStatus =
			result.status === 'accepted'
				? connectionState === 'offline'
					? 'Projection queued.'
					: 'Projection delivered.'
				: result.rejection.message;
	}

	function selectedPlayerViewSceneId(actorId: string, assignedSceneId: string | null): string {
		return (
			playerViewSceneSelections[actorId] ?? assignedSceneId ?? playerViewSceneOptions[0]?.id ?? ''
		);
	}

	function selectPlayerViewScene(actorId: string, sceneId: string) {
		playerViewSceneSelections = { ...playerViewSceneSelections, [actorId]: sceneId };
	}

	async function assignPlayerView(actorId: string, connectionState: 'connected' | 'offline') {
		const participant =
			playerViewController.kind === 'available'
				? playerViewController.participants.find((entry) => entry.actorId === actorId)
				: null;
		const sceneId = selectedPlayerViewSceneId(actorId, participant?.assignment?.sceneId ?? null);
		if (!sceneId) return;
		const result = await runtime.dispatch({
			type: 'session.project-player-view',
			actorId: runtime.defaultActorId,
			payload: {
				playerActorIds: [actorId],
				connectionState,
				target: {
					kind: 'scene',
					sceneId,
					sectionIds: null,
					widgetInstanceIds: null,
					displayState: null,
					mapRegion: null,
				},
			},
		});
		playerViewStatus =
			result.status === 'accepted'
				? connectionState === 'offline'
					? 'Player View assignment queued.'
					: 'Player View assignment delivered.'
				: result.rejection.message;
	}

	async function revokeCommandCenterPlayerView(actorId: string) {
		const result = await runtime.dispatch({
			type: 'session.revoke-player-view',
			actorId: runtime.defaultActorId,
			payload: { playerActorIds: [actorId] },
		});
		playerViewStatus =
			result.status === 'accepted' ? 'Player View assignment revoked.' : result.rejection.message;
	}

	// Add an available library widget to the Command Center. resolveAddWidgetCommand
	// returns null for any widget that is unsupported on the current profile, so an
	// unavailable widget can never be added (CMD-005 AC2).
	async function addFromLibrary(entry: WidgetLibraryEntry) {
		if (!homeSceneId) return;
		const command = resolveAddWidgetCommand(entry, homeSceneId);
		if (!command) return;
		await runtime.dispatch({
			type: command.type,
			actorId: runtime.defaultActorId,
			payload: command.payload,
		});
	}
</script>

<!-- ============================================================================================
     Shared DM section snippets. Each functional surface renders ONCE per profile: the compact
     profile keeps the stacked focused-panel document, the Desktop/Tablet-landscape profile hosts
     the SAME surfaces as widget blocks on the spatial mission-control canvas (redesign §1/§2).
     ============================================================================================ -->

{#snippet firstRunSection()}
	<FirstRun
		view={onboarding}
		tiers={featureTier.tiers}
		activeTier={featureTier.tier}
		onSelectTier={(tier) => featureTier.setTier(tier)}
	/>
{/snippet}

{#snippet workflowSection()}
	<section aria-label="Session workflow" data-testid="session-workflow">
		<h2>Session workflow</h2>
		<div class="workflow-strip" role="toolbar" aria-label="Session workflow states">
			{#each SESSION_WORKFLOW_STATES as workflow (workflow)}
				{@const allowed = isTransitionAllowed(runtime.state.session.workflow, workflow)}
				<button
					type="button"
					data-testid={`session-workflow-${workflow}`}
					aria-pressed={runtime.state.session.workflow === workflow}
					class:selected={runtime.state.session.workflow === workflow}
					disabled={!allowed}
					title={allowed
						? `Move session to ${workflow}`
						: `Cannot move from ${runtime.state.session.workflow} to ${workflow}`}
					onclick={() => setWorkflow(workflow)}
				>
					{workflow}
				</button>
			{/each}
		</div>
		<p class="meta" data-testid="session-workflow-status">
			{runtime.state.session.workflow} • {sessionMode.mode} • {sessionMode.status}
			{#if runtime.state.session.activeSceneId}
				• Scene {runtime.state.session.activeSceneId}
			{/if}
		</p>
		<p class="meta" data-testid="session-player-status">
			Demo Player: {playerSessionStatus.connection}
		</p>
		{#if sessionMode.recapArchiveId}
			<p class="meta" data-testid="session-recap-archive">
				Archive {sessionMode.recapArchiveId} •
				{runtime.state.session.archives[sessionMode.recapArchiveId]?.diceHistory.length ?? 0}
				rolls
			</p>
			<button
				type="button"
				class="secondary"
				data-testid="session-recover"
				disabled={!isTransitionAllowed(runtime.state.session.workflow, 'recap')}
				onclick={() => recoverSession()}
			>
				Recover archived session
			</button>
		{/if}
	</section>
{/snippet}

{#snippet activeMapSection()}
	<section
		aria-label="Active map"
		data-testid="cc-active-map"
		class="active-map-section"
		data-projecting={projectionSummary?.projecting ? 'true' : 'false'}
	>
		<h2>Active map</h2>
		<!-- UX-CMD-007: the glanceable projection state — text label, never colour alone. -->
		<p
			class="projection-state"
			data-testid="cc-map-projection-state"
			data-projecting={projectionSummary?.projecting ? 'true' : 'false'}
			role="status"
		>
			{#if projectionSummary?.projecting}
				Projecting to {projectionSummary.deliveredCount} player{projectionSummary.deliveredCount ===
				1
					? ''
					: 's'}
			{:else if projectionSummary && projectionSummary.queuedCount > 0}
				Projection queued for {projectionSummary.queuedCount} player{projectionSummary.queuedCount ===
				1
					? ''
					: 's'}
			{:else}
				Not projecting
			{/if}
		</p>
		<div class="active-map-controls">
			<label>
				<span>Map</span>
				<select
					data-testid="cc-active-map-select"
					value={selectedMapId}
					onchange={(event) => selectMap(event.currentTarget.value)}
				>
					{#each maps as map (map.id)}
						<option value={map.id}>{map.name}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>Region</span>
				<select
					data-testid="cc-active-region-select"
					value={selectedRegionId ?? ''}
					onchange={(event) => {
						selectedRegionId = event.currentTarget.value || null;
					}}
				>
					<option value="">Whole map</option>
					{#if selectedMap}
						{#each selectedMap.regions as region (region.id)}
							<option value={region.id}>{region.name}</option>
						{/each}
					{/if}
				</select>
			</label>
			<button
				class="button secondary"
				type="button"
				data-testid="cc-active-map-bind"
				disabled={!selectedMapId}
				onclick={bindActiveMap}
			>
				Set active map
			</button>
			<button
				class="button"
				type="button"
				data-testid="cc-active-map-project"
				aria-pressed={projectionSummary?.projecting ?? false}
				disabled={activeMap.kind !== 'available' || runtime.state.session.workflow !== 'active'}
				title={projectionDisabledHint}
				onclick={() => projectActiveMap('connected')}
			>
				{projectionSummary?.projecting ? 'Projecting' : 'Project to players'}
			</button>
			<button
				type="button"
				data-testid="cc-active-map-queue"
				disabled={activeMap.kind !== 'available' || runtime.state.session.workflow !== 'active'}
				title={projectionDisabledHint}
				onclick={() => projectActiveMap('offline')}
			>
				Queue
			</button>
		</div>
		{#if projectionDisabledHint}
			<p class="active-map-hint" data-testid="cc-active-map-hint">{projectionDisabledHint}</p>
		{/if}
		{#if activeMap.kind === 'available'}
			<div class="active-map-preview" data-testid="cc-active-map-preview">
				<strong>{activeMap.name}</strong>
				<span class="meta">
					{activeMap.regionName ?? 'Whole map'} • {activeMap.layers.length} layer{activeMap.layers
						.length === 1
						? ''
						: 's'}
					{#if activeMap.hiddenLayerCount > 0}
						• {activeMap.hiddenLayerCount} hidden
					{/if}
				</span>
				<ul>
					{#each activeMap.layers as layer (layer.id)}
						<li>{layer.name}</li>
					{/each}
				</ul>
			</div>
		{:else if activeMap.kind === 'missing'}
			<p class="error" role="alert" data-testid="cc-active-map-missing">
				Active map missing: {activeMap.mapId}
			</p>
		{:else}
			<p class="meta" data-testid="cc-active-map-empty">No active map selected.</p>
		{/if}
		{#if playerActiveMap.kind === 'available'}
			<div class="active-map-preview" data-testid="cc-player-map-preview">
				<strong>Demo Player</strong>
				<span class="meta">
					{playerActiveMap.deliveryStatus} • {playerActiveMap.regionName ?? 'Whole map'} •
					{playerActiveMap.layers.length} visible layer{playerActiveMap.layers.length === 1
						? ''
						: 's'}
				</span>
				<ul>
					{#each playerActiveMap.layers as layer (layer.id)}
						<li>{layer.name}</li>
					{/each}
				</ul>
			</div>
		{:else}
			<p class="meta" data-testid="cc-player-map-empty">
				Demo Player has no active map projection.
			</p>
		{/if}
		{#if activeMapStatus}
			<p class="meta" role="status" data-testid="cc-active-map-status">{activeMapStatus}</p>
		{/if}
	</section>
{/snippet}

{#snippet playerViewsSection()}
	<section aria-label="Player View controller" data-testid="cc-player-view-controller">
		<h2>Player views</h2>
		<div class="row-actions">
			<!-- UX-CMD-006: the unselected entry point — choose content, then recipients, then confirm. -->
			<button type="button" class="secondary" data-testid="cc-push-open" onclick={() => openPush(null)}>
				Push handout…
			</button>
		</div>
		{#if playerViewController.kind === 'denied'}
			<p class="error" role="alert" data-testid="cc-player-view-denied">
				Player View controller unavailable: {playerViewController.reason}
			</p>
		{:else}
			<div class="player-view-controller">
				{#each playerViewController.participants as participant (participant.actorId)}
					{@const assignment = participant.assignment}
					{@const selectedSceneId = selectedPlayerViewSceneId(
						participant.actorId,
						assignment?.sceneId ?? null,
					)}
					<article
						class="player-view-row"
						data-testid={`cc-player-view-row-${participant.actorId}`}
					>
						<div>
							<strong>{participant.displayName}</strong>
							<span class="meta"> {participant.role}</span>
							<div class="meta" data-testid={`cc-player-view-assignment-${participant.actorId}`}>
								{#if assignment}
									{#if assignment.kind === 'missing-scene'}
										Missing Scene {assignment.sceneId} • {assignment.deliveryStatus}
									{:else}
										{assignment.sceneName} • {assignment.projectionKind} •
										{assignment.deliveryStatus}
										{#if assignment.deliveryReason === 'offline'}• offline{/if}
										• {assignment.projectedWidgetCount ?? 0} widget{assignment.projectedWidgetCount ===
										1
											? ''
											: 's'}
									{/if}
								{:else}
									No assignment
								{/if}
							</div>
						</div>
						<div class="player-view-actions">
							<label>
								<span>Scene</span>
								<select
									data-testid={`cc-player-view-scene-${participant.actorId}`}
									value={selectedSceneId}
									disabled={playerViewSceneOptions.length === 0}
									onchange={(event) =>
										selectPlayerViewScene(participant.actorId, event.currentTarget.value)}
								>
									{#each playerViewSceneOptions as scene (scene.id)}
										<option value={scene.id}>
											{scene.name} ({scene.widgetCount})
										</option>
									{/each}
								</select>
							</label>
							<div class="row-actions">
								<button
									type="button"
									data-testid={`cc-player-view-deliver-${participant.actorId}`}
									disabled={!selectedSceneId}
									onclick={() => assignPlayerView(participant.actorId, 'connected')}
								>
									Deliver
								</button>
								<button
									type="button"
									data-testid={`cc-player-view-queue-${participant.actorId}`}
									disabled={!selectedSceneId}
									onclick={() => assignPlayerView(participant.actorId, 'offline')}
								>
									Queue
								</button>
								<button
									type="button"
									data-testid={`cc-player-view-revoke-${participant.actorId}`}
									disabled={!assignment}
									onclick={() => revokeCommandCenterPlayerView(participant.actorId)}
								>
									Revoke
								</button>
								<!-- UX-CMD-004/005: DM-only live preview of THIS participant's view. -->
								<button
									type="button"
									data-testid={`cc-player-view-preview-${participant.actorId}`}
									aria-label={`Preview ${participant.displayName}'s view`}
									onclick={() => openPreview(participant.actorId, participant.displayName)}
								>
									Preview
								</button>
								<!-- UX-CMD-004/006: open the push-handout flow pre-targeted at this participant. -->
								<button
									type="button"
									data-testid={`cc-player-view-push-${participant.actorId}`}
									aria-label={`Push handout to ${participant.displayName}`}
									onclick={() => openPush(participant.actorId)}
								>
									Push handout
								</button>
							</div>
						</div>
					</article>
				{/each}
				{#if playerViewController.participants.length === 0}
					<p class="meta" data-testid="cc-player-view-empty">No session participants.</p>
				{/if}
				{#if playerViewSceneOptions.length === 0}
					<p class="meta" data-testid="cc-player-view-no-scenes">No Scenes available.</p>
				{/if}
			</div>
			{#if playerViewStatus}
				<p class="meta" role="status" data-testid="cc-player-view-status">
					{playerViewStatus}
				</p>
			{/if}
		{/if}
	</section>
{/snippet}

{#snippet presetsSection()}
	<section aria-label="Command Center presets">
		<h2>Presets</h2>
		<form class="form" onsubmit={savePreset} aria-label="Save Command Center preset">
			<label>
				<span>Preset name</span>
				<input data-testid="cc-preset-name" bind:value={presetName} autocomplete="off" />
			</label>
			<button
				class="button"
				type="submit"
				data-testid="cc-save-preset"
				disabled={!presetName.trim()}
			>
				Save preset
			</button>
		</form>
		<ul class="scene-list" data-testid="cc-preset-list">
			{#each presets as preset (preset.id)}
				<li class="scene-card" data-testid={`cc-preset-${preset.id}`}>
					<div>
						<strong>{preset.name}</strong>
						<div class="meta">{preset.widgets.length} widgets • saved {preset.createdAt}</div>
					</div>
					<div class="row-actions">
						<button
							type="button"
							data-testid={`cc-apply-${preset.id}`}
							onclick={() => applyPreset(preset.id)}
						>
							Apply
						</button>
					</div>
				</li>
			{/each}
			{#if presets.length === 0}
				<li class="meta" data-testid="cc-preset-empty">No presets saved yet.</li>
			{/if}
		</ul>
		{#if lastRestore}
			<p class="meta" role="status" data-testid="cc-restore-status">
				Restored {lastRestore.restored} widget{lastRestore.restored === 1 ? '' : 's'}.
				{#if lastRestore.missing.length > 0}
					<span data-testid="cc-missing-widgets">
						Missing widget types skipped: {lastRestore.missing.join(', ')}.
					</span>
				{/if}
			</p>
		{/if}

		<!-- UX-CMD-008: the recoverable last-known-good layout. A baseline is captured automatically
		     when the home is ready; the DM can re-checkpoint or roll an unwanted change back. -->
		<div class="cc-autosave" data-testid="cc-autosave">
			<div class="row-actions">
				<button type="button" data-testid="cc-autosave-snapshot" onclick={() => captureSafePoint()}>
					Save safe point
				</button>
				<button
					type="button"
					data-testid="cc-autosave-restore"
					disabled={!autoSave}
					onclick={() => restoreSafePoint()}
				>
					Restore last safe point
				</button>
			</div>
			{#if autoSave}
				<p class="meta" data-testid="cc-autosave-meta">
					Last safe point: {autoSave.widgets.length} widget{autoSave.widgets.length === 1
						? ''
						: 's'} • captured {autoSave.capturedAt}
				</p>
			{:else}
				<p class="meta" data-testid="cc-autosave-empty">No safe point captured yet.</p>
			{/if}
			{#if autoSaveStatus}
				<p class="meta" role="status" data-testid="cc-autosave-status">{autoSaveStatus}</p>
			{/if}
		</div>
	</section>
{/snippet}

{#snippet librarySection()}
	<section aria-label="Widget library">
		<h2>Widget library</h2>
		<p class="meta">Search available widget types and add them to the Command Center.</p>
		<!-- UX-CMD-009: the library is a quick-access DRAWER, one action away (≤3 actions to add). -->
		<!-- UX-ONB-013/017 (Tier 1): a first-reach coach mark points at the add-widget affordance the
		     first time the DM reaches the Command Center. Non-blocking, fires at most once, capped. -->
		<div class="coach-anchor">
			<button class="button" type="button" data-testid="cc-add-widget" onclick={() => (libraryOpen = true)}>
				Add widget
			</button>
			<CoachMark
				id="cc-add-widget"
				title="Add a widget"
				body="Tap “Add widget” to open the library and place an initiative tracker, a map, or dice."
			/>
		</div>
	</section>
{/snippet}

<!-- The spatial board's per-tile content: each dashboard block hosts ONE real Command Center widget,
     rendered through the shared WidgetView (template/builtin/custom) from its definition. -->
{#snippet boardTile(tile: CanvasTile)}
	{@const block = board.get(tile.id)}
	{@const definition = ccDefinitionByType.get(tile.type)}
	{#if block}
		<DashboardBlockFrame
			id={block.id}
			title={blockTitle(block, definition?.displayName ?? block.type)}
			mode={canvasMode.mode}
			selected={canvasMode.selectedId === block.id}
			meta={block.type === 'session' ? runtime.state.session.workflow : undefined}
			onSelect={(id) => canvasMode.select(id)}
			onMove={nudgeBlock}
			onResize={growBlock}
			onExitEdit={() => canvasMode.setMode('view')}
		>
			{#if definition}
				<WidgetView {definition} config={block.config} surface="command-center" />
			{/if}
		</DashboardBlockFrame>
	{/if}
{/snippet}

<section
	class="command-center"
	class:is-board={homeView.kind === 'dm' && !profile.isCompact}
	data-testid="command-center"
	aria-label="Command Center"
>
	{#if homeView.kind === 'participant'}
		<!-- UX-CMD-012: a player/observer never sees the DM dashboard — only their own controlled view. -->
		<ParticipantHome view={homeView} />
	{:else if homeView.kind === 'dm'}
		{#if profile.isCompact}
			<!-- ======= Compact profile: one focused work surface at a time (Contract 1) — the
			     stacked document layout with the focused-panel tablist (CMD-002). ======= -->
			<header class="cc-header">
				<p class="meta">
					Your home Scene for active session management.
					<span data-testid="cc-profile">profile: {profile.viewportClass}</span>
				</p>
				{#if homeSceneId}
					<div class="row-actions">
						<a class="button secondary" href={`scene/${homeSceneId}/`} data-testid="cc-open-editor">
							Open in Scene editor
						</a>
					</div>
				{/if}
			</header>

			<!-- UX-CMD-003: the glanceable, always-visible session status strip. -->
			<SessionStatusStrip strip={homeView.statusStrip} />

			<!-- UX-CMD-010: the Phase badge → valid-transitions popover (pause immediate, end two-step). -->
			<SessionPhaseControls />

			{@render firstRunSection()}

			{#if !summary}
				<p class="loading" role="status" data-testid="cc-preparing">Preparing your Command Center…</p>
			{:else if 'kind' in summary}
				<p class="error" role="alert" data-testid="cc-denied">
					Command Center unavailable: {summary.reason}
				</p>
			{:else}
				{@render workflowSection()}
				{@render activeMapSection()}
				{@render playerViewsSection()}

				<section aria-label="DM tools">
					<h2>Tools</h2>
					<!-- Slim profile: one focused work surface at a time (Contract 1). -->
					<div class="cc-tablist" role="tablist" data-testid="cc-tablist">
						{#each liveWidgets as payload (payload.widget.id)}
							<button
								type="button"
								role="tab"
								aria-selected={selectedWidgetId === payload.widget.id}
								data-testid={`cc-tab-${payload.widget.type}`}
								class:selected={selectedWidgetId === payload.widget.id}
								onclick={() => (selectedWidgetId = payload.widget.id)}
							>
								{toolLabel(payload.widget.type)}
							</button>
						{/each}
					</div>
					{#each liveWidgets as payload (payload.widget.id)}
						{#if selectedWidgetId === payload.widget.id}
							{@const w = payload.widget}
							<article class="cc-panel" data-testid="cc-panel" aria-label={toolLabel(w.type)}>
								<strong>{toolLabel(w.type)}</strong>
								<div class="layout" data-testid={`cc-widget-pos-${w.id}`}>
									x {w.layout.x.toFixed(0)} • y {w.layout.y.toFixed(0)}
								</div>
								<div class="row-actions">
									<button
										type="button"
										aria-label="Move tool left"
										onclick={() => moveWidget(w.id, -20, 0)}>←</button
									>
									<button
										type="button"
										aria-label="Move tool right"
										onclick={() => moveWidget(w.id, 20, 0)}>→</button
									>
								</div>
							</article>
						{/if}
					{/each}
				</section>

				{@render presetsSection()}
				{@render librarySection()}
			{/if}
		{:else}
			<!-- ======= Desktop / Tablet landscape: the spatial mission-control board (§1–§4).
			     The entire surface is the canvas; three discontiguous chrome groups float above it
			     (top-left identity, top-right mode/actions, bottom-right zoom), and the docked
			     Properties Panel appears for the selected widget in Edit Mode. ======= -->
			<div
				class="cc-board"
				data-mode={canvasMode.mode}
				data-testid="cc-board"
			>
				{#if !summary}
					<p class="loading cc-board-loading" role="status" data-testid="cc-preparing">
						Preparing your Command Center…
					</p>
				{:else if 'kind' in summary}
					<p class="error cc-board-loading" role="alert" data-testid="cc-denied">
						Command Center unavailable: {summary.reason}
					</p>
				{:else}
					<CanvasViewport
						tiles={boardTiles}
						tileContent={boardTile}
						controller={boardController}
						label="Command Center board"
						minimap="hidden"
						chrome="minimal"
						fill
						interactive={canvasMode.isEdit}
						selectedIds={selectedTileIds}
						primaryId={canvasMode.selectedId}
						onSelectTile={(id) => canvasMode.select(id)}
						onMarquee={onBoardMarquee}
						onMoveCommit={(id, x, y) => board.move(id, x, y)}
						onResizeCommit={(id, w, h) => board.resize(id, w, h)}
						onManipulationKey={onBoardKey}
					/>
				{/if}

				<!-- §3 floating chrome — top-left: identity (the shell h1 docks above this chip). -->
				<div class="cc-chrome cc-chrome-identity" data-testid="cc-identity">
					<span class="cc-brand-mark" aria-hidden="true">⬡</span>
					<span class="meta">
						Mission control
						<span data-testid="cc-profile">profile: {profile.viewportClass}</span>
					</span>
				</div>

				<!-- §3 floating chrome — top-right: Edit Mode toggle, settings, notifications. -->
				<div class="cc-chrome cc-chrome-actions" data-testid="cc-chrome-actions">
					<button
						type="button"
						class="cc-edit-toggle"
						data-testid="cc-edit-toggle"
						aria-pressed={canvasMode.isEdit}
						onclick={() => canvasMode.toggle()}
					>
						<span aria-hidden="true">✎</span>
						{canvasMode.isEdit ? 'Done editing' : 'Edit layout'}
					</button>
					<a class="cc-chrome-icon" href="/settings/" aria-label="Settings" data-testid="cc-settings-link">
						<span aria-hidden="true">⚙</span>
					</a>
					<span
						class="cc-notify"
						role="status"
						data-testid="cc-notifications"
						aria-label={`${queuedDeliveries} queued deliver${queuedDeliveries === 1 ? 'y' : 'ies'}`}
						title={`${queuedDeliveries} queued deliver${queuedDeliveries === 1 ? 'y' : 'ies'}`}
					>
						<span aria-hidden="true">🔔</span>
						<span class="cc-notify-count" data-active={queuedDeliveries > 0}>{queuedDeliveries}</span>
					</span>
				</div>

				<!-- §4 Edit Mode indicator: an explicit, glanceable mode banner. -->
				{#if canvasMode.isEdit}
					<p class="cc-mode-banner" role="status" data-testid="cc-edit-banner">
						Editing layout — drag blocks to move, grips to resize, Esc to finish
					</p>
				{/if}

				<!-- §3 floating chrome — bottom-right: zoom level + controls (bound to the same
				     ViewportController the canvas uses). -->
				<div
					class="cc-chrome cc-chrome-zoom"
					role="toolbar"
					aria-label="Board zoom"
					data-testid="cc-zoom-group"
				>
					<button type="button" aria-label="Zoom out" data-testid="cc-zoom-out" onclick={() => boardController.zoomOutAt()}>−</button>
					<span class="cc-zoom-level" data-testid="cc-zoom-level">{boardController.zoomPercent}%</span>
					<button type="button" aria-label="Zoom in" data-testid="cc-zoom-in" onclick={() => boardController.zoomInAt()}>+</button>
					<button type="button" aria-label="Zoom to fit" data-testid="cc-zoom-fit" onclick={() => boardController.zoomToFit()}>Fit</button>
				</div>

				<!-- §5 the docked Properties Panel — only while a widget is selected in Edit Mode. -->
				{#if canvasMode.isEdit && selectedBlock}
					<CanvasPropertiesPanel
						block={selectedBlock}
						locked={board.locked}
						definition={ccDefinitionByType.get(selectedBlock.type) ?? null}
						onRect={(id, rect) => board.setRect(id, rect)}
						onConfigure={(id, key, value) => board.configure(id, key, value)}
						onBringToFront={(id) => board.bringToFront(id)}
						onClose={() => canvasMode.select(null)}
					/>
				{/if}
			</div>
		{/if}

		<!-- UX-CMD-009: the widget library quick-access drawer. The search field is the first focusable
		     element, so the dialog's focus trap auto-focuses it on open. The Processing Core decides
		     availability per profile; an unsupported widget shows its reason and cannot be added. -->
		<Dialog bind:open={libraryOpen} title="Widget library" testid="cc-library-drawer">
			<label class="library-search">
				<span class="visually-hidden">Search widgets</span>
				<input
					data-testid="cc-library-search"
					bind:this={librarySearchEl}
					bind:value={librarySearch}
					placeholder="Search widgets (e.g. dice)"
					autocomplete="off"
				/>
			</label>
			<ul class="library-list" data-testid="cc-library-list">
				{#each library as entry (entry.type)}
					{@const isAvailable = entry.availability.available}
					<li class="library-row" data-testid={`cc-library-${entry.type}`}>
						<div>
							<strong>{entry.displayName}</strong>
							<span class="meta"> v{entry.version}</span>
							{#if entry.requiredBindings.length > 0}
								<div class="meta" data-testid={`cc-library-bindings-${entry.type}`}>
									requires: {entry.requiredBindings.map((b) => b.label).join(', ')}
								</div>
							{:else}
								<div class="meta">no required bindings</div>
							{/if}
							{#if !isAvailable && entry.availability.available === false}
								<div class="meta unavailable" data-testid={`cc-library-reason-${entry.type}`}>
									{entry.availability.reason}
								</div>
							{/if}
						</div>
						<div class="row-actions">
							<button
								type="button"
								data-testid={`cc-library-add-${entry.type}`}
								disabled={!isAvailable}
								onclick={async () => {
									// UX-CMD-009 AC3: adding places the widget and closes the drawer immediately.
									await addFromLibrary(entry);
									libraryOpen = false;
								}}
							>
								Add
							</button>
						</div>
					</li>
				{/each}
				{#if library.length === 0}
					<li class="meta" data-testid="cc-library-empty">No widgets match “{librarySearch}”.</li>
				{/if}
			</ul>
		</Dialog>

		<!-- UX-CMD-005: the DM-only preview modal (renders the participant's OWN core-filtered view). -->
		{#if previewTarget}
			<PlayerViewPreviewModal
				bind:open={previewOpen}
				actorId={previewTarget.actorId}
				displayName={previewTarget.displayName}
				onclose={closePreview}
			/>
		{/if}

		<!-- UX-CMD-006: content → recipients → confirmation → deliver (cancel delivers nothing). -->
		<HandoutPushFlow bind:open={pushOpen} initialRecipientId={pushRecipientId} onclose={closePush} />
	{:else}
		<p class="error" role="alert" data-testid="cc-unknown-actor">
			Command Center unavailable.
		</p>
	{/if}
</section>
