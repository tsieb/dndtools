<script lang="ts">
	import Card from '$lib/ui/common/Card.svelte';
	import type { StatBlockObject } from '$lib/types/object.js';

	interface Props {
		object: StatBlockObject;
		compact?: boolean;
		collapsibleSections?: boolean;
	}

	let { object, compact = false, collapsibleSections = false }: Props = $props();

	const abilityOrder: Array<keyof StatBlockObject['data']['abilities']> = [
		'str',
		'dex',
		'con',
		'int',
		'wis',
		'cha',
	];

	function modifier(value: number): string {
		const computed = Math.floor((value - 10) / 2);
		return computed >= 0 ? `+${computed}` : String(computed);
	}

	function label(key: string): string {
		return key.toUpperCase();
	}

	function sectionRow(entry: { name: string; description: string }): string {
		return `${entry.name}. ${entry.description}`.trim();
	}
</script>

<div class="stat-block-view max-w-content mx-auto">
	<Card>
		<div class="stat-block-view__toprule" aria-hidden="true"></div>
		<div class="stat-block-view__header">
			<h2 class="stat-block-view__name">{object.name}</h2>
			<p class="stat-block-view__meta">
				{object.data.size ?? 'Medium'}
				{object.data.creatureType ?? 'creature'}
				{#if object.data.alignment}
					, {object.data.alignment}
				{/if}
			</p>
		</div>
		<div class="stat-block-view__divider" aria-hidden="true"></div>

		<div class="stat-block-view__fields">
			<p><strong>Armor Class</strong> {object.data.armorClass ?? '—'}</p>
			<p><strong>Hit Points</strong> {object.data.hitPoints ?? '—'}</p>
			<p><strong>Speed</strong> {object.data.speed ?? '—'}</p>
			<p><strong>Challenge</strong> {object.data.challengeRating ?? '—'}</p>
		</div>
		<div class="stat-block-view__divider" aria-hidden="true"></div>

		<div class="stat-block-view__abilities {compact ? 'stat-block-view__abilities--compact' : ''}">
			{#each abilityOrder as key (key)}
				<div class="stat-block-view__ability">
					<p class="stat-block-view__ability-label">{label(key)}</p>
					<p class="stat-block-view__ability-score">
						{object.data.abilities[key]} ({modifier(object.data.abilities[key])})
					</p>
				</div>
			{/each}
		</div>

		{#if object.data.traits.length > 0}
			<section class="stat-block-view__section">
				<h3>Traits</h3>
				{#if collapsibleSections}
					{#each object.data.traits as entry (`trait-${entry.name}`)}
						<details class="stat-block-view__collapsible" open>
							<summary>{entry.name}</summary>
							<p>{entry.description}</p>
						</details>
					{/each}
				{:else}
					{#each object.data.traits as entry (`trait-${entry.name}`)}
						<p>{sectionRow(entry)}</p>
					{/each}
				{/if}
			</section>
		{/if}

		{#if object.data.actions.length > 0}
			<section class="stat-block-view__section">
				<h3>Actions</h3>
				{#if collapsibleSections}
					{#each object.data.actions as entry (`action-${entry.name}`)}
						<details class="stat-block-view__collapsible" open>
							<summary>{entry.name}</summary>
							<p>{entry.description}</p>
						</details>
					{/each}
				{:else}
					{#each object.data.actions as entry (`action-${entry.name}`)}
						<p>{sectionRow(entry)}</p>
					{/each}
				{/if}
			</section>
		{/if}

		{#if object.data.reactions.length > 0}
			<section class="stat-block-view__section">
				<h3>Reactions</h3>
				{#if collapsibleSections}
					{#each object.data.reactions as entry (`reaction-${entry.name}`)}
						<details class="stat-block-view__collapsible" open>
							<summary>{entry.name}</summary>
							<p>{entry.description}</p>
						</details>
					{/each}
				{:else}
					{#each object.data.reactions as entry (`reaction-${entry.name}`)}
						<p>{sectionRow(entry)}</p>
					{/each}
				{/if}
			</section>
		{/if}

		{#if object.data.legendaryActions.length > 0}
			<section class="stat-block-view__section">
				<h3>Legendary Actions</h3>
				{#if collapsibleSections}
					{#each object.data.legendaryActions as entry (`legendary-${entry.name}`)}
						<details class="stat-block-view__collapsible" open>
							<summary>{entry.name}</summary>
							<p>{entry.description}</p>
						</details>
					{/each}
				{:else}
					{#each object.data.legendaryActions as entry (`legendary-${entry.name}`)}
						<p>{sectionRow(entry)}</p>
					{/each}
				{/if}
			</section>
		{/if}
		<div class="stat-block-view__toprule" aria-hidden="true"></div>
	</Card>
</div>

<style>
	.stat-block-view :global(.card) {
		background: color-mix(in srgb, var(--color-parchment-surface) 93%, var(--color-bg));
		border-color: color-mix(in srgb, #c7792c 28%, var(--color-border));
	}

	.stat-block-view__toprule {
		height: 4px;
		border-radius: 999px;
		background: linear-gradient(90deg, #b85d1f, #d28b36);
	}

	.stat-block-view__header {
		margin-top: 0.6rem;
	}

	.stat-block-view__name {
		margin: 0;
		font-family: var(--font-serif);
		font-size: var(--text-xl);
		font-weight: 700;
		line-height: 1.15;
		color: color-mix(in srgb, #7a2f00 82%, var(--color-ink));
	}

	.stat-block-view__meta {
		margin: 0.35rem 0 0;
		font-size: var(--text-sm);
		color: var(--color-ink-muted);
		font-style: italic;
	}

	.stat-block-view__divider {
		height: 2px;
		margin: 0.72rem 0;
		background: linear-gradient(90deg, transparent, #d28b36, transparent);
	}

	.stat-block-view__fields p,
	.stat-block-view__section p {
		margin: 0.24rem 0;
		font-size: var(--text-sm);
		line-height: 1.45;
	}

	.stat-block-view__collapsible {
		margin: 0.28rem 0;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		padding: 0.3rem 0.45rem;
		background: color-mix(in srgb, var(--color-surface-alt) 40%, transparent);
	}

	.stat-block-view__collapsible summary {
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.stat-block-view__abilities {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.stat-block-view__abilities--compact {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.stat-block-view__ability {
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		padding: 0.32rem 0.42rem;
		background: color-mix(in srgb, var(--color-surface-alt) 65%, transparent);
		text-align: center;
	}

	.stat-block-view__ability-label {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-ink-faint);
	}

	.stat-block-view__ability-score {
		margin: 0.12rem 0 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.stat-block-view__section h3 {
		margin: 0.75rem 0 0.35rem;
		font-family: var(--font-serif);
		font-size: var(--text-md);
	}

	@media (max-width: 760px) {
		.stat-block-view__abilities {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
