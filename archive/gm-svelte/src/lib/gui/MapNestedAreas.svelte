<script lang="ts">
	import {
		resolveEmbedsForActor,
		computeTransitionIntoChild,
		type MapTransition,
		type MapViewport,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	/**
	 * MAP-008 / MAP-009 / MAP-017 — the nested-areas surface for the resolved map.
	 *
	 * This renders the ACTOR-FILTERED embed model from the Processing Core. An embed whose child is
	 * visible to the actor shows the child's name and a "Zoom into" transition control (MAP-008,
	 * MAP-009). An embed whose child is hidden, deleted, or not cached collapses to a SINGLE generic
	 * "unavailable area" placeholder that names nothing about the child — indistinguishable from a
	 * missing one (MAP-017 AC3). The DM-only child of a player-visible parent therefore appears as a
	 * named, openable area to the DM and as a bare unavailable placeholder to a player (MAP-008 AC2).
	 *
	 * Per ADR-014 the pixel renderer is deferred, so the "transition" here surfaces the LOGICAL target
	 * viewport the core computes (no animation). The GUI never mutates durable state (Contract 1).
	 */
	interface Props {
		mapId: string;
	}
	const { mapId }: Props = $props();
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId]);

	// The single actor-filtered read path. A non-DM never receives a hidden child's name/transform.
	const embeds = $derived(resolveEmbedsForActor(runtime.state.maps.maps, mapId, actor));

	// A GUI-local viewport zoomed in past the embed's threshold, so the "Zoom into" control produces a
	// real transition. Presentation-only (Contract 1) — it never touches durable state.
	const zoomedViewport: MapViewport = { x: 0.5, y: 0.18, w: 0.3, h: 0.3 };

	// The last computed transition, surfaced so the demo shows the logical child-space viewport.
	let lastTransition = $state<MapTransition | null>(null);

	function zoomInto(embedId: string) {
		lastTransition = computeTransitionIntoChild(
			runtime.state.maps.maps,
			mapId,
			embedId,
			zoomedViewport,
			actor,
		);
	}
</script>

<section class="nested-areas" data-testid="map-nested-areas" aria-label="Nested map areas">
	<h3 id={`nested-${mapId}`}>Nested areas</h3>
	{#if embeds.length === 0}
		<p class="meta" data-testid="nested-empty">This map embeds no other maps.</p>
	{:else}
		<ul class="nested-list" data-testid="nested-list">
			{#each embeds as embed (embed.embedId)}
				<li class="nested-item" data-kind={embed.kind} data-testid={`nested-${embed.embedId}`}>
					{#if embed.kind === 'available'}
						<div class="nested-row">
							<span class="nested-name" data-testid={`nested-name-${embed.embedId}`}>
								{embed.childName}
							</span>
							<span class="nested-transform" data-testid={`nested-transform-${embed.embedId}`}>
								scale {embed.transform.scale}, rot {embed.transform.rotationDegrees}°
							</span>
							<button
								type="button"
								class="button secondary"
								data-testid={`nested-zoom-${embed.embedId}`}
								onclick={() => zoomInto(embed.embedId)}
							>
								Zoom into area
							</button>
						</div>
					{:else}
						<!-- MAP-017 AC3: one generic, non-leaking placeholder. It names NOTHING about the
						     child and is identical whether the child is hidden, deleted, or uncached. -->
						<p
							class="nested-unavailable"
							role="status"
							data-testid={`nested-unavailable-${embed.embedId}`}
						>
							{embed.message}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if lastTransition}
		<section
			class="transition-result"
			data-testid="nested-transition"
			aria-label="Transition result"
		>
			{#if lastTransition.kind === 'transition'}
				<p class="meta" data-testid="transition-target">
					Transitioned into child map <strong>{lastTransition.childMapId}</strong>. Child viewport:
					x{lastTransition.targetViewport.x.toFixed(2)} y{lastTransition.targetViewport.y.toFixed(
						2,
					)}
					w{lastTransition.targetViewport.w.toFixed(2)} h{lastTransition.targetViewport.h.toFixed(
						2,
					)}.
				</p>
			{:else if lastTransition.kind === 'unavailable'}
				<p role="status" data-testid="transition-unavailable">{lastTransition.message}</p>
			{:else}
				<p class="meta" data-testid="transition-none">
					Zoom in further to transition into the nested map.
				</p>
			{/if}
		</section>
	{/if}
</section>

<style>
	.nested-areas {
		margin-top: var(--space-4);
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.nested-areas h3 {
		margin: 0;
		font-size: var(--text-md);
	}
	.nested-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.nested-item {
		border: 1px solid var(--color-border);
		background: var(--color-surface-raised);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
	}
	/* UX-MAP-008 — an openable nested area reads as a map thumbnail: a faint warm tactical grid
	   (--map-grid-line) laid over the surface. Low-alpha, decorative, so body text keeps full
	   contrast; the solid --map-canvas-bg fill is left to the deferred canvas renderer. */
	.nested-item[data-kind='available'] {
		background-image:
			linear-gradient(var(--map-grid-line) 1px, transparent 1px),
			linear-gradient(90deg, var(--map-grid-line) 1px, transparent 1px);
		background-size: 16px 16px;
	}
	.nested-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.nested-name {
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}
	.nested-transform {
		font-size: var(--text-2xs);
		padding: 0 var(--space-1-5);
		border-radius: var(--radius-full);
		color: var(--color-text-secondary);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
	}
	.nested-unavailable {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.transition-result {
		margin-top: var(--space-1);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}
</style>
