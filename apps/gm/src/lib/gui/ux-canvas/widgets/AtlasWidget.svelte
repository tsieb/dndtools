<script lang="ts">
	/**
	 * Atlas thumbnail tile (Command Center redesign §2): the most relevant maps as named thumbnail
	 * cards linking into the map surface. Uses the actor-filtered map list — a DM-only map never
	 * renders for a non-DM viewer. The Command Center's active-map projection controls live in the
	 * same dashboard block, rendered by the route (they are session controls, not list data).
	 */
	import { listMapsForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	interface Props {
		config: Record<string, unknown>;
	}

	const { config }: Props = $props();
	const runtime = useRuntime();

	const limit = $derived.by(() => {
		const parsed = Number.parseInt(String(config.thumbnails ?? '3'), 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
	});

	const maps = $derived(
		listMapsForActor(
			runtime.state.maps,
			runtime.state.permissions,
			runtime.defaultActorId,
		).slice(0, limit),
	);
</script>

<div class="atlas-tile">
	{#if maps.length === 0}
		<p class="atlas-empty">No maps yet — import or create one in the Atlas.</p>
	{:else}
		<ul class="atlas-grid" data-testid="atlas-widget-grid">
			{#each maps as map (map.id)}
				<li>
					<a href="/atlas/" data-testid={`atlas-widget-${map.id}`}>
						<span class="atlas-thumb" aria-hidden="true">🗺</span>
						<span class="atlas-name">{map.name}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	<a class="atlas-launch" href="/atlas/" data-testid="atlas-widget-launch">Open Atlas →</a>
</div>

<style>
	.atlas-tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		height: 100%;
	}
	.atlas-grid {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
		gap: var(--space-2);
	}
	.atlas-grid a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--touch-target-min);
		padding: var(--space-2);
		color: var(--color-text-primary);
		text-decoration: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.atlas-grid a:hover {
		background: var(--color-interactive-hover);
	}
	.atlas-thumb {
		font-size: var(--text-lg);
		filter: grayscale(0.4);
	}
	.atlas-name {
		font-size: var(--text-xs);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.atlas-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.atlas-launch {
		margin-top: auto;
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		color: var(--color-text-link);
		text-decoration: none;
	}
	.atlas-launch:hover {
		text-decoration: underline;
	}
</style>
