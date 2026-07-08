<script lang="ts">
	/**
	 * Stat-block template (the Character widget). Renders the bound character's vitals (HP / AC) and,
	 * when enabled, ability scores. The character is read through the actor-filtered character query,
	 * so a hidden character never resolves for a non-DM viewer (no-leak).
	 */
	import { listCharactersForActor, type WidgetDefinition, type WidgetInstance } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
	}
	const { widget = null, config }: Props = $props();
	const runtime = useRuntime();

	const showAbilities = $derived(config.showAbilities !== false);
	const boundId = $derived(
		widget?.binding?.source.entityType === 'character' ? widget.binding.source.entityId : null,
	);
	const character = $derived.by(() => {
		if (!boundId) return null;
		return (
			listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.defaultActorId).find(
				(c) => c.id === boundId,
			) ?? null
		);
	});
	const combat = $derived(
		character ? (character.combat as unknown as { hp?: number; maxHp?: number; ac?: number }) : null,
	);
	const abilities = $derived(character ? Object.entries(character.abilityScores ?? {}) : []);
</script>

<div class="tpl-stat-block" data-widget-template="stat-block">
	{#if !character}
		<p class="tpl-empty">
			{boundId ? 'Bound character is unavailable.' : 'Bind a character to show its stats.'}
		</p>
	{:else}
		<p class="tpl-name" data-testid="widget-character-name">{character.name}</p>
		<div class="tpl-vitals">
			<span class="tpl-stat"><span class="tpl-label">HP</span> {combat?.hp ?? '–'}/{combat?.maxHp ?? '–'}</span>
			<span class="tpl-stat"><span class="tpl-label">AC</span> {combat?.ac ?? '–'}</span>
		</div>
		{#if showAbilities && abilities.length > 0}
			<dl class="tpl-abilities" data-testid="widget-character-abilities">
				{#each abilities as [key, value] (key)}
					<div>
						<dt>{key}</dt>
						<dd>{value}</dd>
					</div>
				{/each}
			</dl>
		{/if}
	{/if}
</div>

<style>
	.tpl-stat-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		color: var(--widget-text, var(--color-text-primary));
	}
	.tpl-name {
		margin: 0;
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
	}
	.tpl-vitals {
		display: flex;
		gap: var(--space-2);
	}
	.tpl-stat {
		padding: var(--space-0-5) var(--space-2);
		font-size: var(--text-sm);
		background: color-mix(in srgb, var(--widget-accent, var(--color-accent)) 12%, transparent);
		border-radius: var(--radius-sm);
	}
	.tpl-label {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.tpl-abilities {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr));
		gap: var(--space-1);
		margin: 0;
	}
	.tpl-abilities div {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--space-0-5);
		border: 1px solid var(--widget-border, var(--color-border));
		border-radius: var(--radius-sm);
	}
	.tpl-abilities dt {
		font-size: var(--text-xs);
		text-transform: uppercase;
		color: var(--color-text-secondary);
	}
	.tpl-abilities dd {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
	}
	.tpl-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
</style>
