<script lang="ts">
	/**
	 * Combat quick-launch tile (Command Center redesign §2): the live tracker glance (status /
	 * round / turn) plus the most recently touched encounter, with a single launch action into the
	 * Session tools. All reads are actor-filtered core queries (encounters are DM-only by core
	 * contract; a non-DM viewer simply gets an empty list — but this widget only renders on the DM
	 * dashboard anyway).
	 */
	import { getCombatTrackerForActor, listEncountersForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	interface Props {
		config: Record<string, unknown>;
	}

	const { config }: Props = $props();
	const runtime = useRuntime();

	const showChallenge = $derived(config.showChallenge !== false);

	const tracker = $derived(
		getCombatTrackerForActor(
			runtime.state.session.combat,
			runtime.state.permissions,
			runtime.defaultActorId,
		),
	);

	const recentEncounter = $derived.by(() => {
		const encounters = listEncountersForActor(
			runtime.state.encounters,
			runtime.state.permissions,
			runtime.defaultActorId,
		);
		if (encounters.length === 0) return null;
		return [...encounters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
	});
</script>

<div class="combat-tile">
	<p class="combat-status" data-testid="combat-widget-status">
		{#if tracker.status === 'running'}
			Round {tracker.round} · turn {tracker.turn + 1} of {tracker.combatants.length}
		{:else}
			No combat running
		{/if}
	</p>
	{#if recentEncounter}
		<p class="combat-recent" data-testid="combat-widget-recent">
			<span class="combat-recent-label">Recent:</span>
			{recentEncounter.title}
			{#if showChallenge}
				<span class="combat-cr">{recentEncounter.challenge.difficulty}</span>
			{/if}
		</p>
	{:else}
		<p class="combat-recent combat-empty">No encounters prepared yet.</p>
	{/if}
	<a class="combat-launch" href="/session/" data-testid="combat-widget-launch">
		Open combat tools →
	</a>
</div>

<style>
	.combat-tile {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		height: 100%;
	}
	.combat-status {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}
	.combat-recent {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-primary);
	}
	.combat-recent-label {
		color: var(--color-text-secondary);
	}
	.combat-cr {
		margin-left: var(--space-1);
		padding: 0 var(--space-1);
		font-size: var(--text-2xs);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		color: var(--color-text-secondary);
	}
	.combat-empty {
		color: var(--color-text-secondary);
	}
	.combat-launch {
		margin-top: auto;
		display: inline-flex;
		align-items: center;
		min-height: var(--touch-target-min);
		font-size: var(--text-sm);
		color: var(--color-text-link);
		text-decoration: none;
	}
	.combat-launch:hover {
		text-decoration: underline;
	}
</style>
