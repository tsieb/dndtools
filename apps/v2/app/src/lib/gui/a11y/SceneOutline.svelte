<script lang="ts" module>
	let outlineSeq = 0;
	function nextOutlineId(): string {
		outlineSeq += 1;
		return `scene-outline-${outlineSeq}`;
	}
</script>

<script lang="ts">
	import { nextRovingIndex } from './roving-tabindex';
	import { isActivationKey } from './keyboard';
	import { useLiveAnnouncer } from './live-announcer.svelte';
	import {
		buildSceneOutline,
		outlineActivationAnnouncement,
		type OutlineWidgetInput,
	} from './scene-outline';
	import type { Viewer } from './visibility-boundary';

	/**
	 * Scene Outline panel (UX-A11Y-004): the canonical structural, screen-reader path to canvas
	 * widgets. Renders the visibility-FILTERED {@link buildSceneOutline} model as an ARIA tree/listbox
	 * with roving tabindex, a visibility-safe accessible name per item, and a search filter. Activating
	 * an item (Enter/Space/click) calls `onactivate` so the host can scroll/focus the widget on the
	 * canvas, and announces the focus move through the shared announcer.
	 *
	 * NO-LEAK (UX-A11Y-008): the model is built from `widgets` + `viewer`; a DM-only widget is ABSENT
	 * from a player's model, so it is never in this DOM, never in Tab order, and never announced.
	 */
	interface Props {
		widgets: readonly OutlineWidgetInput[];
		viewer: Viewer;
		onactivate?: (id: string) => void;
		testid?: string;
	}

	let { widgets, viewer, onactivate, testid = 'scene-outline' }: Props = $props();

	const baseId = nextOutlineId();
	const announcer = useLiveAnnouncer();

	let search = $state('');
	let focusIndex = $state(0);
	let itemEls = $state<HTMLButtonElement[]>([]);

	const model = $derived(buildSceneOutline(widgets, viewer, { search }));

	// Keep the focus index in range as the (filtered) list changes.
	$effect(() => {
		if (focusIndex > model.items.length - 1) focusIndex = Math.max(0, model.items.length - 1);
	});

	// UX-A11Y-004: announce the widget count when it changes (filter/visibility), not on first mount.
	let lastCount = $state<string | null>(null);
	$effect(() => {
		const label = model.countLabel;
		if (lastCount !== null && lastCount !== label) announcer?.announce(label, 'polite');
		lastCount = label;
	});

	function onKeydown(event: KeyboardEvent) {
		if (isActivationKey(event)) {
			event.preventDefault();
			activate(focusIndex);
			return;
		}
		const next = nextRovingIndex({
			key: event.key,
			currentIndex: focusIndex,
			count: model.items.length,
			orientation: 'vertical',
			wrap: true,
		});
		if (next === null) return;
		event.preventDefault();
		focusIndex = next;
		itemEls[next]?.focus();
	}

	function activate(index: number) {
		const item = model.items[index];
		if (!item) return;
		onactivate?.(item.id);
		announcer?.announce(outlineActivationAnnouncement(item), 'polite');
	}
</script>

<section class="scene-outline" aria-label={model.panelLabel} data-testid={testid}>
	<div class="outline-head">
		<h2 id={`${baseId}-heading`} class="outline-title">{model.panelLabel}</h2>
		<p class="meta" role="status" data-testid={`${testid}-count`}>{model.countLabel}</p>
	</div>

	<label class="outline-search">
		<span class="visually-hidden">Filter widgets by name</span>
		<input
			type="search"
			bind:value={search}
			placeholder="Filter widgets"
			data-testid={`${testid}-search`}
			autocomplete="off"
		/>
	</label>

	{#if model.empty}
		<p class="meta" data-testid={`${testid}-empty`}>No widgets yet — add one from the toolbar.</p>
	{:else if model.filteredEmpty}
		<p class="meta" data-testid={`${testid}-filtered-empty`}>No widgets match filter.</p>
	{:else}
		<ul
			class="outline-list"
			role={model.role}
			aria-label={model.panelLabel}
			aria-describedby={`${baseId}-heading`}
		>
			{#each model.items as item, i (item.id)}
				<li role="presentation" class="outline-row">
					<button
						bind:this={itemEls[i]}
						type="button"
						role={model.role === 'tree' ? 'treeitem' : 'option'}
						aria-posinset={item.posinset}
						aria-setsize={item.setsize}
						aria-level={model.role === 'tree' ? 1 : undefined}
						aria-selected={model.role === 'listbox' ? i === focusIndex : undefined}
						tabindex={i === focusIndex ? 0 : -1}
						class="outline-item"
						data-testid={`${testid}-item-${item.id}`}
						data-visibility={item.visibility}
						onkeydown={onKeydown}
						onfocus={() => (focusIndex = i)}
						onclick={() => activate(i)}
					>
						<span class="outline-name">{item.accessibleName}</span>
						{#if viewer.role === 'dm'}
							<span class="outline-visibility meta" data-testid={`${testid}-vis-${item.id}`}>
								{item.visibilityLabel}
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.scene-outline {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}
	.outline-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2, 0.5rem);
	}
	.outline-title {
		font-size: var(--font-size-2, 1rem);
		margin: 0;
	}
	.outline-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
	}
	.outline-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2, 0.5rem);
		width: 100%;
		text-align: left;
		padding: var(--space-2, 0.5rem);
		min-height: var(--touch-target-min, 44px);
		border: 1px solid var(--color-border, #ccc);
		border-radius: var(--radius-1, 0.25rem);
		background: var(--color-surface, #fff);
		color: inherit;
		cursor: pointer;
	}
	.outline-search input {
		width: 100%;
		min-height: var(--touch-target-min, 44px);
		padding: var(--space-2, 0.5rem);
	}
	.meta {
		color: var(--color-text-muted, #666);
		margin: 0;
	}
</style>
