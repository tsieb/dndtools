<script lang="ts">
	/**
	 * Characters roster tile (Command Center redesign §2): the party as a thumbnail grid (initial
	 * avatars, names, optional HP/AC vitals), linking into the Characters surface. The roster is
	 * the Processing Core's actor-filtered party overview — hidden members are absent, and the
	 * observer ceiling denies the data wholesale upstream.
	 */
	import { getPartyOverviewForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	interface Props {
		config: Record<string, unknown>;
	}

	const { config }: Props = $props();
	const runtime = useRuntime();

	const showVitals = $derived(config.showVitals !== false);

	const party = $derived(
		getPartyOverviewForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.defaultActorId,
		),
	);

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
	}
</script>

<div class="chars-tile">
	{#if party.members.length === 0}
		<p class="chars-empty">No party members yet — add characters to see the roster here.</p>
	{:else}
		<ul class="chars-grid" data-testid="characters-widget-grid">
			{#each party.members as member (member.characterId)}
				<li>
					<a href="/characters/" data-testid={`characters-widget-${member.characterId}`}>
						<span class="chars-avatar" aria-hidden="true">{initials(member.name)}</span>
						<span class="chars-name">{member.name}</span>
						{#if showVitals}
							<span class="chars-vitals">HP {member.hp}/{member.maxHp} · AC {member.ac}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.chars-tile {
		height: 100%;
	}
	.chars-grid {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
		gap: var(--space-2);
	}
	.chars-grid a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2);
		min-height: var(--touch-target-min);
		color: var(--color-text-primary);
		text-decoration: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.chars-grid a:hover {
		background: var(--color-interactive-hover);
	}
	.chars-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-full);
		background: var(--color-accent-subtle);
		color: var(--color-text-primary);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-bold);
	}
	.chars-name {
		font-size: var(--text-xs);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
	.chars-vitals {
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
	}
	.chars-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
</style>
