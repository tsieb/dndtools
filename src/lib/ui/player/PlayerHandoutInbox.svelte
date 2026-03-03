<script lang="ts">
	import { handoutsState } from '$lib/state/handouts.svelte.js';
	import { handoutTypeLabel, resolveHandoutRenderView } from '$lib/domain/handouts.js';
	import type { HandoutObject } from '$lib/types/object.js';

	let query = $state('');

	let deliveredHandouts = $derived(handoutsState.deliveredHandouts);
	let filtered = $derived.by(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return deliveredHandouts;
		return deliveredHandouts.filter((handout) => {
			const haystack = [
				handout.data.title,
				handout.summary,
				handout.data.content,
				handout.tags.join(' '),
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(normalized);
		});
	});

	$effect(() => {
		void handoutsState.ensureLoaded();
	});

	function revealAnimationClass(handout: HandoutObject): string {
		const recent = handoutsState.recentEvents[String(handout.id)];
		if (!recent) return '';
		return handout.data.revealAnimation === 'letter_unfold'
			? 'handout-reveal--letter'
			: 'handout-reveal--scroll';
	}
</script>

<section
	class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-3"
>
	<div class="flex items-center justify-between gap-2">
		<div>
			<h2 class="text-base font-semibold text-ink dark:text-tavern-text">Handout Inbox</h2>
			<p class="text-xs text-ink-muted dark:text-tavern-muted">
				Delivered handouts remain here permanently.
			</p>
		</div>
		<input
			type="text"
			bind:value={query}
			placeholder="Search handouts"
			class="w-56 max-w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1.5 text-xs text-ink dark:text-tavern-text"
		/>
	</div>

	{#if handoutsState.loading}
		<p class="text-xs text-ink-muted dark:text-tavern-muted">Loading handouts...</p>
	{:else if filtered.length === 0}
		<p class="text-xs text-ink-muted dark:text-tavern-muted">
			{deliveredHandouts.length === 0
				? 'No handouts have been delivered yet.'
				: 'No delivered handouts match your search.'}
		</p>
	{:else}
		<ul class="space-y-3">
			{#each filtered as handout (handout.id)}
				{@const view = resolveHandoutRenderView(handout)}
				<li class={`handout-preview ${revealAnimationClass(handout)}`}>
					<div class="flex flex-wrap items-center gap-2 mb-1">
						<h3 class="text-sm font-semibold text-ink dark:text-tavern-text">
							{handout.data.title || handout.name}
						</h3>
						<span
							class="text-[11px] px-1.5 py-0.5 rounded border border-border/70 dark:border-tavern-border/70 text-ink-faint dark:text-tavern-faint"
						>
							{handoutTypeLabel(handout.data.handoutType)}
						</span>
						{#if view.locked}
							<span
								class="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200"
							>
								Locked
							</span>
						{/if}
						{#if handout.data.deliveredAt}
							<span class="text-[11px] text-ink-faint dark:text-tavern-faint">
								Delivered {handout.data.deliveredAt}
							</span>
						{/if}
					</div>
					<pre>{view.content || '(No content)'}</pre>
				</li>
			{/each}
		</ul>
	{/if}
</section>
