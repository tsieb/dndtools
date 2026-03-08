<script lang="ts">
	import type { CharacterObject } from '$lib/types/object.js';

	interface Props {
		object: CharacterObject;
		compact?: boolean;
	}

	let { object, compact = false }: Props = $props();

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
	class="player-character-sheet max-w-content mx-auto rounded-xl border border-border bg-surface p-5"
	aria-label="Player character sheet"
>
	<header class="border-b border-border pb-3 mb-4">
		<h2 class="text-2xl font-bold text-ink" style="font-family: var(--font-serif)">
			{object.name}
		</h2>
		<p class="mt-1 text-sm text-ink-muted">
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

	<div class="grid gap-4 {compact ? 'grid-cols-1' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}">
		<section class="space-y-3">
			<div class="rounded-lg border border-border bg-surface-alt p-3">
				<p class="text-xs uppercase tracking-wider text-ink-faint">Portrait</p>
				<div
					class="mt-2 flex h-36 items-center justify-center rounded border border-border/70 bg-surface text-xs text-ink-faint"
				>
					No portrait set
				</div>
			</div>

			<div class="grid gap-2 sm:grid-cols-2">
				<div class="rounded-lg bg-surface-alt px-3 py-2">
					<p class="text-xs uppercase tracking-wider text-ink-faint">Armor Class</p>
					<p class="text-lg font-semibold text-ink">
						{object.data.armorClass ?? '-'}
					</p>
				</div>
				<div class="rounded-lg bg-surface-alt px-3 py-2">
					<p class="text-xs uppercase tracking-wider text-ink-faint">Hit Points</p>
					<p class="text-lg font-semibold text-ink">
						{object.data.hitPoints ?? '-'}
					</p>
				</div>
				<div class="rounded-lg bg-surface-alt px-3 py-2">
					<p class="text-xs uppercase tracking-wider text-ink-faint">Speed</p>
					<p class="text-lg font-semibold text-ink">{object.data.speed ?? '-'}</p>
				</div>
				<div class="rounded-lg bg-surface-alt px-3 py-2">
					<p class="text-xs uppercase tracking-wider text-ink-faint">Prof Bonus</p>
					<p class="text-lg font-semibold text-ink">
						{object.data.proficiencyBonus ?? '-'}
					</p>
				</div>
			</div>

			<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
				{#each abilityOrder as key (key)}
					<div class="rounded-lg border border-border bg-bg px-2 py-2 text-center">
						<p class="text-xs uppercase tracking-wider text-ink-faint">
							{labelForAbility(key)}
						</p>
						<p class="text-lg font-semibold text-ink">
							{object.data.abilities?.[key] ?? 10}
						</p>
						<p class="text-xs text-ink-muted">
							{abilityModifier(object.data.abilities?.[key])}
						</p>
					</div>
				{/each}
			</div>
		</section>

		<section class="space-y-3">
			<div>
				<h3 class="text-sm font-semibold text-ink mb-1">Features</h3>
				{#if object.data.goals.length === 0}
					<p class="text-xs text-ink-faint">No features listed.</p>
				{:else}
					<ul class="list-disc pl-4 text-sm text-ink space-y-1">
						{#each object.data.goals as goal (goal)}
							<li>{goal}</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div>
				<h3 class="text-sm font-semibold text-ink mb-1">Spells</h3>
				{#if object.data.bonds.length === 0}
					<p class="text-xs text-ink-faint">No spells listed.</p>
				{:else}
					<ul class="list-disc pl-4 text-sm text-ink space-y-1">
						{#each object.data.bonds as bond (bond)}
							<li>{bond}</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div>
				<h3 class="text-sm font-semibold text-ink mb-1">Inventory</h3>
				{#if object.data.flaws.length === 0}
					<p class="text-xs text-ink-faint">No inventory listed.</p>
				{:else}
					<ul class="list-disc pl-4 text-sm text-ink space-y-1">
						{#each object.data.flaws as flaw (flaw)}
							<li>{flaw}</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if object.data.notes}
				<section class="rounded-lg border border-border bg-surface-alt p-3">
					<h3 class="text-sm font-semibold text-ink mb-1">Notes</h3>
					<p class="text-sm whitespace-pre-wrap text-ink">{object.data.notes}</p>
				</section>
			{/if}
		</section>
	</div>

	{#if !compact}
		<p class="mt-3 text-xs text-ink-faint">Viewer mode: edit this object from note edit mode.</p>
	{/if}
	{#if object.data.dmNotes}
		<div class="mt-2 rounded border border-border bg-surface-alt px-3 py-2">
			<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">DM Notes</p>
			<p class="mt-1 text-xs text-ink-muted whitespace-pre-wrap">{object.data.dmNotes}</p>
		</div>
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
