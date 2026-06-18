<script lang="ts">
	/**
	 * Map widget (built-in renderer). Shows the bound map's name and its regions, linking into the
	 * Atlas. Uses the actor-filtered map list, so a DM-only map never renders for a non-DM viewer.
	 */
	import { listMapsForActor, type WidgetDefinition, type WidgetInstance } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
	}
	const { widget = null }: Props = $props();
	const runtime = useRuntime();

	const boundId = $derived(
		widget?.binding?.source.entityType === 'map' ? widget.binding.source.entityId : null,
	);
	// UX-CANVAS-007/008: only show a map when this widget is actually BOUND to one. An unbound widget
	// renders the explicit "No map bound" state — never an arbitrary first map presented as if bound.
	const map = $derived.by(() => {
		if (!boundId) return null;
		const maps = listMapsForActor(runtime.state.maps, runtime.state.permissions, runtime.defaultActorId);
		return maps.find((m) => m.id === boundId) ?? null;
	});
	// The filtered list proves the map is visible to this actor; its regions come from the raw entity.
	const regions = $derived(map ? (runtime.state.maps.maps[map.id]?.regions ?? []) : []);
</script>

<div class="map-widget" data-widget-builtin="map">
	{#if !map}
		<p class="map-empty">No map bound — bind one or create a map in the Atlas.</p>
	{:else}
		<div class="map-stage" aria-hidden="true"><span>🗺</span></div>
		<p class="map-name" data-testid="widget-map-name">{map.name}</p>
		{#if regions.length > 0}
			<ul class="map-regions">
				{#each regions.slice(0, 4) as region (region.id)}
					<li>{region.name}</li>
				{/each}
			</ul>
		{/if}
	{/if}
	<a
		class="map-launch"
		href={map ? `/atlas/?map=${map.id}` : '/atlas/'}
		data-testid="widget-map-launch">Open Atlas →</a
	>
</div>

<style>
	.map-widget {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		height: 100%;
		color: var(--widget-text, var(--color-text-primary));
	}
	.map-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1 1 auto;
		min-height: 3rem;
		font-size: var(--text-2xl, 2rem);
		background: color-mix(in srgb, var(--widget-accent, var(--color-accent)) 8%, transparent);
		border: 1px solid var(--widget-border, var(--color-border));
		border-radius: var(--radius-sm);
	}
	.map-name {
		margin: 0;
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-sm);
	}
	.map-regions {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.map-regions li {
		padding: 0 var(--space-1);
		border: 1px solid var(--widget-border, var(--color-border));
		border-radius: var(--radius-full);
	}
	.map-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.map-launch {
		margin-top: auto;
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		color: var(--widget-accent, var(--color-text-link));
		text-decoration: none;
	}
	.map-launch:hover {
		text-decoration: underline;
	}
</style>
