<script lang="ts">
	import {
		DEFAULT_COMMAND_CENTER_TOOLS,
		SESSION_WORKFLOW_STATES,
		getActiveMapViewForActor,
		getPlayerViewController,
		getSceneForActor,
		getSessionParticipantStatus,
		getSessionWidgetMode,
		listWidgetLibrary,
		resolveAddWidgetCommand,
		resolveOnboarding,
		type MapEntity,
		type SessionWorkflowState,
		type WidgetBindingPayload,
		type WidgetLibraryEntry,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import { useFeatureTier } from '$lib/state/feature-tier.svelte';
	import FirstRun from '$lib/gui/FirstRun.svelte';

	const runtime = useRuntime();
	const profile = useProfile();
	const featureTier = useFeatureTier();

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

	let ensuring = $state(false);
	let presetName = $state('');
	let selectedWidgetId = $state<string | null>(null);
	let lastRestore = $state<{ restored: number; missing: string[] } | null>(null);
	let librarySearch = $state('');
	let selectedMapId = $state('');
	let selectedRegionId = $state<string | null>(null);
	let activeMapStatus = $state<string | null>(null);
	let playerViewSceneSelections = $state<Record<string, string>>({});
	let playerViewStatus = $state<string | null>(null);

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

	async function savePreset(event: SubmitEvent) {
		event.preventDefault();
		if (!presetName.trim()) return;
		const result = await runtime.dispatch({
			type: 'command-center.save-preset',
			actorId: runtime.defaultActorId,
			payload: { name: presetName.trim() },
		});
		if (result.status === 'accepted') presetName = '';
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
		const result = await runtime.dispatch({
			type: 'session.project-active-map',
			actorId: runtime.defaultActorId,
			payload: { playerActorIds: ['actor-player'], connectionState },
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

<section class="command-center" data-testid="command-center" aria-label="Command Center">
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

	<FirstRun
		view={onboarding}
		tiers={featureTier.tiers}
		activeTier={featureTier.tier}
		onSelectTier={(tier) => featureTier.setTier(tier)}
	/>

	{#if !summary}
		<p class="loading" role="status" data-testid="cc-preparing">Preparing your Command Center…</p>
	{:else if 'kind' in summary}
		<p class="error" role="alert" data-testid="cc-denied">
			Command Center unavailable: {summary.reason}
		</p>
	{:else}
		<section aria-label="Session workflow" data-testid="session-workflow">
			<h2>Session workflow</h2>
			<div class="workflow-strip" role="toolbar" aria-label="Session workflow states">
				{#each SESSION_WORKFLOW_STATES as workflow}
					<button
						type="button"
						data-testid={`session-workflow-${workflow}`}
						aria-pressed={runtime.state.session.workflow === workflow}
						class:selected={runtime.state.session.workflow === workflow}
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
			{/if}
		</section>

		<section aria-label="Active map" data-testid="cc-active-map">
			<h2>Active map</h2>
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
					class="button"
					type="button"
					data-testid="cc-active-map-bind"
					disabled={!selectedMapId}
					onclick={bindActiveMap}
				>
					Set active map
				</button>
				<button
					type="button"
					data-testid="cc-active-map-project"
					disabled={activeMap.kind !== 'available' || runtime.state.session.workflow !== 'active'}
					onclick={() => projectActiveMap('connected')}
				>
					Project
				</button>
				<button
					type="button"
					data-testid="cc-active-map-queue"
					disabled={activeMap.kind !== 'available' || runtime.state.session.workflow !== 'active'}
					onclick={() => projectActiveMap('offline')}
				>
					Queue
				</button>
			</div>
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

		<section aria-label="Player View controller" data-testid="cc-player-view-controller">
			<h2>Player views</h2>
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

		<section aria-label="DM tools">
			<h2>Tools</h2>
			{#if profile.isCompact}
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
			{:else}
				<div class="widget-grid" data-testid="cc-widget-grid">
					{#each liveWidgets as payload (payload.widget.id)}
						{@const w = payload.widget}
						<article class="widget-row" data-testid={`cc-widget-${w.type}`}>
							<div>
								<strong>{toolLabel(w.type)}</strong>
								<div class="layout" data-testid={`cc-widget-pos-${w.id}`}>
									x {w.layout.x.toFixed(0)} • y {w.layout.y.toFixed(0)} • z {w.layout.z}
								</div>
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
								<button
									type="button"
									aria-label="Move tool up"
									onclick={() => moveWidget(w.id, 0, -20)}>↑</button
								>
								<button
									type="button"
									aria-label="Move tool down"
									onclick={() => moveWidget(w.id, 0, 20)}>↓</button
								>
							</div>
						</article>
					{/each}
					{#if liveWidgets.length === 0}
						<p class="meta">No tools on this Command Center yet.</p>
					{/if}
				</div>
			{/if}
		</section>

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
		</section>

		<section aria-label="Widget library">
			<h2>Widget library</h2>
			<p class="meta">Search available widget types and add them to the Command Center.</p>
			<label class="library-search">
				<span class="visually-hidden">Search widgets</span>
				<input
					data-testid="cc-library-search"
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
								onclick={() => addFromLibrary(entry)}
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
		</section>
	{/if}
</section>
