<script lang="ts">
	/**
	 * Tools & Layouts Command Center widget: the home-scene tool grid (move tools), the widget-library
	 * quick-access drawer (CMD-005/009), and the layout presets + recoverable safe point (CMD-008).
	 * Self-contained: all data is the actor-filtered home-scene read model, all mutations dispatch
	 * directly. The home-scene bootstrap + auto-save baseline remain route lifecycle concerns.
	 */
	import {
		DEFAULT_COMMAND_CENTER_TOOLS,
		getSceneForActor,
		listWidgetLibrary,
		resolveAddWidgetCommand,
		type WidgetBindingPayload,
		type WidgetLibraryEntry,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import CoachMark from '$lib/gui/ux-onb/CoachMark.svelte';

	const runtime = useRuntime();
	const profile = useProfile();

	const TOOL_LABELS = new Map(DEFAULT_COMMAND_CENTER_TOOLS.map((t) => [t.type, t.label]));
	function toolLabel(type: string): string {
		return TOOL_LABELS.get(type) ?? type;
	}

	let presetName = $state('');
	let lastRestore = $state<{ restored: number; missing: string[] } | null>(null);
	let autoSaveStatus = $state<string | null>(null);
	let librarySearch = $state('');
	let libraryOpen = $state(false);
	let snapshotting = $state(false);
	let librarySearchEl = $state<HTMLInputElement | null>(null);

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
	type LiveWidget = Extract<WidgetBindingPayload, { kind: 'available' | 'degraded' }>;
	const liveWidgets = $derived<LiveWidget[]>(
		summary && !('kind' in summary)
			? summary.widgets.filter((w): w is LiveWidget => w.kind === 'available' || w.kind === 'degraded')
			: [],
	);
	const presets = $derived(
		Object.values(runtime.state.commandCenter.presets).sort((a, b) => a.name.localeCompare(b.name)),
	);
	const autoSave = $derived(runtime.state.commandCenter.autoSave ?? null);
	const library = $derived<WidgetLibraryEntry[]>(
		listWidgetLibrary(runtime.state.widgets, runtime.state.permissions, runtime.defaultActorId, {
			profileId: profile.profileId,
			filter: librarySearch,
		}),
	);

	$effect(() => {
		if (!libraryOpen || !librarySearchEl) return;
		const el = librarySearchEl;
		const timer = setTimeout(() => el.focus(), 0);
		return () => clearTimeout(timer);
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

{#if homeSceneId}
	<div class="row-actions">
		<a class="button secondary" href={`scene/${homeSceneId}/`} data-testid="cc-open-editor">
			Open in Scene editor
		</a>
	</div>
{/if}

<section aria-label="DM tools">
	<h3>Tools</h3>
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
					<button type="button" aria-label="Move tool left" onclick={() => moveWidget(w.id, -20, 0)}
						>←</button
					>
					<button type="button" aria-label="Move tool right" onclick={() => moveWidget(w.id, 20, 0)}
						>→</button
					>
					<button type="button" aria-label="Move tool up" onclick={() => moveWidget(w.id, 0, -20)}
						>↑</button
					>
					<button type="button" aria-label="Move tool down" onclick={() => moveWidget(w.id, 0, 20)}
						>↓</button
					>
				</div>
			</article>
		{/each}
		{#if liveWidgets.length === 0}
			<p class="meta">No tools on this Command Center yet.</p>
		{/if}
	</div>
</section>

<section aria-label="Widget library">
	<h3>Widget library</h3>
	<p class="meta">Search available widget types and add them to the Command Center.</p>
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

<section aria-label="Command Center presets">
	<h3>Presets</h3>
	<form class="form" onsubmit={savePreset} aria-label="Save Command Center preset">
		<label>
			<span>Preset name</span>
			<input data-testid="cc-preset-name" bind:value={presetName} autocomplete="off" />
		</label>
		<button class="button" type="submit" data-testid="cc-save-preset" disabled={!presetName.trim()}>
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
					<button type="button" data-testid={`cc-apply-${preset.id}`} onclick={() => applyPreset(preset.id)}>
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
				Last safe point: {autoSave.widgets.length} widget{autoSave.widgets.length === 1 ? '' : 's'} • captured
				{autoSave.capturedAt}
			</p>
		{:else}
			<p class="meta" data-testid="cc-autosave-empty">No safe point captured yet.</p>
		{/if}
		{#if autoSaveStatus}
			<p class="meta" role="status" data-testid="cc-autosave-status">{autoSaveStatus}</p>
		{/if}
	</div>
</section>

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
