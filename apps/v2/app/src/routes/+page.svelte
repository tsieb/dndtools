<script lang="ts">
	import {
		DEFAULT_COMMAND_CENTER_TOOLS,
		getSceneForActor,
		listWidgetLibrary,
		resolveAddWidgetCommand,
		type WidgetBindingPayload,
		type WidgetLibraryEntry,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';

	const runtime = useRuntime();
	const profile = useProfile();

	const TOOL_LABELS = new Map(DEFAULT_COMMAND_CENTER_TOOLS.map((t) => [t.type, t.label]));
	function toolLabel(type: string): string {
		return TOOL_LABELS.get(type) ?? type;
	}

	let ensuring = $state(false);
	let presetName = $state('');
	let selectedWidgetId = $state<string | null>(null);
	let lastRestore = $state<{ restored: number; missing: string[] } | null>(null);
	let librarySearch = $state('');

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
	// system template the first time the home surface loads (CMD-001).
	$effect(() => {
		if (!runtime.loaded || ensuring) return;
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
		<h2>Command Center</h2>
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

	{#if !summary}
		<p class="loading" role="status" data-testid="cc-preparing">Preparing your Command Center…</p>
	{:else if 'kind' in summary}
		<p class="error" role="alert" data-testid="cc-denied">
			Command Center unavailable: {summary.reason}
		</p>
	{:else}
		<section aria-label="DM tools">
			<h3>Tools</h3>
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
			<h3>Presets</h3>
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
			<h3>Widget library</h3>
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
