<script lang="ts">
	import type { CharacterObject } from '$lib/types/object.js';

	interface Props {
		object: CharacterObject;
	}

	let { object }: Props = $props();

	const abilityOrder: Array<keyof NonNullable<CharacterObject['data']['abilities']>> = [
		'str',
		'dex',
		'con',
		'int',
		'wis',
		'cha',
	];

	function abilityModifier(score: number | undefined): string {
		if (typeof score !== 'number' || !Number.isFinite(score)) return '+0';
		const mod = Math.floor((score - 10) / 2);
		return mod >= 0 ? `+${mod}` : String(mod);
	}

	function labelForAbility(key: string): string {
		return key.toUpperCase();
	}
</script>

<section
	class="player-character-sheet max-w-content mx-auto rounded-xl border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-5"
	aria-label="Player character sheet"
>
	<header class="border-b border-border dark:border-tavern-border pb-3 mb-4">
		<h2
			class="text-2xl font-bold text-ink dark:text-tavern-text"
			style="font-family: var(--font-serif)"
		>
			{object.name}
		</h2>
		<p class="mt-1 text-sm text-ink-muted dark:text-tavern-muted">
			{object.data.ancestry ?? 'Unknown ancestry'}
			{#if object.data.className}
				| {object.data.className}{#if object.data.level}
					{object.data.level}{/if}
			{/if}
			{#if object.data.background}
				| {object.data.background}
			{/if}
			{#if object.data.alignment}
				| {object.data.alignment}
			{/if}
		</p>
	</header>

	<div class="grid gap-3 sm:grid-cols-4 mb-4">
		<div class="rounded-lg bg-surface-alt dark:bg-tavern-surface-alt px-3 py-2">
			<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				Armor Class
			</p>
			<p class="text-lg font-semibold text-ink dark:text-tavern-text">
				{object.data.armorClass ?? '-'}
			</p>
		</div>
		<div class="rounded-lg bg-surface-alt dark:bg-tavern-surface-alt px-3 py-2">
			<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				Hit Points
			</p>
			<p class="text-lg font-semibold text-ink dark:text-tavern-text">
				{object.data.hitPoints ?? '-'}
			</p>
		</div>
		<div class="rounded-lg bg-surface-alt dark:bg-tavern-surface-alt px-3 py-2">
			<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				Speed
			</p>
			<p class="text-lg font-semibold text-ink dark:text-tavern-text">{object.data.speed ?? '-'}</p>
		</div>
		<div class="rounded-lg bg-surface-alt dark:bg-tavern-surface-alt px-3 py-2">
			<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
				Prof Bonus
			</p>
			<p class="text-lg font-semibold text-ink dark:text-tavern-text">
				{object.data.proficiencyBonus ?? '-'}
			</p>
		</div>
	</div>

	<div class="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-4">
		{#each abilityOrder as key (key)}
			<div
				class="rounded-lg border border-border dark:border-tavern-border bg-parchment dark:bg-tavern-bg px-2 py-2 text-center"
			>
				<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint">
					{labelForAbility(key)}
				</p>
				<p class="text-lg font-semibold text-ink dark:text-tavern-text">
					{object.data.abilities?.[key] ?? 10}
				</p>
				<p class="text-xs text-ink-muted dark:text-tavern-muted">
					{abilityModifier(object.data.abilities?.[key])}
				</p>
			</div>
		{/each}
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<div>
			<h3 class="text-sm font-semibold text-ink dark:text-tavern-text mb-1">Goals</h3>
			{#if object.data.goals.length === 0}
				<p class="text-xs text-ink-faint dark:text-tavern-faint">No goals listed.</p>
			{:else}
				<ul class="list-disc pl-4 text-sm text-ink dark:text-tavern-text space-y-1">
					{#each object.data.goals as goal (goal)}
						<li>{goal}</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div>
			<h3 class="text-sm font-semibold text-ink dark:text-tavern-text mb-1">Bonds</h3>
			{#if object.data.bonds.length === 0}
				<p class="text-xs text-ink-faint dark:text-tavern-faint">No bonds listed.</p>
			{:else}
				<ul class="list-disc pl-4 text-sm text-ink dark:text-tavern-text space-y-1">
					{#each object.data.bonds as bond (bond)}
						<li>{bond}</li>
					{/each}
				</ul>
			{/if}
		</div>
		<div>
			<h3 class="text-sm font-semibold text-ink dark:text-tavern-text mb-1">Flaws</h3>
			{#if object.data.flaws.length === 0}
				<p class="text-xs text-ink-faint dark:text-tavern-faint">No flaws listed.</p>
			{:else}
				<ul class="list-disc pl-4 text-sm text-ink dark:text-tavern-text space-y-1">
					{#each object.data.flaws as flaw (flaw)}
						<li>{flaw}</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>

	{#if object.data.notes}
		<section class="mt-4">
			<h3 class="text-sm font-semibold text-ink dark:text-tavern-text mb-1">Notes</h3>
			<p class="text-sm whitespace-pre-wrap text-ink dark:text-tavern-text">{object.data.notes}</p>
		</section>
	{/if}
</section>

<style>
	@media print {
		:global(body *) {
			visibility: hidden;
		}

		.player-character-sheet,
		.player-character-sheet * {
			visibility: visible;
		}

		.player-character-sheet {
			position: absolute;
			inset: 0;
			margin: 0;
			max-width: none;
			border: 0;
			box-shadow: none;
			background: white;
			color: black;
		}
	}
</style>
