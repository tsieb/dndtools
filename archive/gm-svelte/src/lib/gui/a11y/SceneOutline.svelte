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
		/**
		 * UX-CANVAS-005/006: when provided, the outline doubles as the layers/selection panel — activating
		 * an item selects the widget on canvas (Shift/Ctrl toggles), `selectedIds` drives `aria-selected`,
		 * and `onreorder` (Ctrl/Cmd+Arrow, or the per-row buttons) changes its z-order. Omitting these keeps
		 * the original read-only structural outline behaviour unchanged.
		 */
		selectedIds?: ReadonlySet<string>;
		onselect?: (id: string, mode: 'replace' | 'toggle') => void;
		onreorder?: (id: string, direction: 'up' | 'down') => void;
		testid?: string;
	}

	let { widgets, viewer, onactivate, selectedIds, onselect, onreorder, testid = 'scene-outline' }: Props =
		$props();

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
		const mod = event.ctrlKey || event.metaKey;
		const verticalArrow = event.key === 'ArrowUp' || event.key === 'ArrowDown';
		// UX-CANVAS-006: Ctrl/Cmd+Arrow reorders the focused widget's z-order from the outline (the
		// keyboard alternative to drag-to-reorder in a layers panel). Plain Arrow keys fall through to
		// the roving navigation below.
		if (onreorder && mod && verticalArrow) {
			const item = model.items[focusIndex];
			if (item) {
				event.preventDefault();
				onreorder(item.id, event.key === 'ArrowUp' ? 'up' : 'down');
			}
			return;
		}
		if (isActivationKey(event)) {
			event.preventDefault();
			activate(focusIndex, event.shiftKey || mod);
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

	function activate(index: number, toggle = false) {
		const item = model.items[index];
		if (!item) return;
		onselect?.(item.id, toggle ? 'toggle' : 'replace');
		onactivate?.(item.id);
		announcer?.announce(outlineActivationAnnouncement(item), 'polite');
	}

	function selectedFor(id: string, focused: boolean): boolean | undefined {
		if (model.role !== 'listbox') return undefined;
		return selectedIds ? selectedIds.has(id) : focused;
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
						aria-selected={selectedFor(item.id, i === focusIndex)}
						tabindex={i === focusIndex ? 0 : -1}
						class="outline-item"
						class:is-selected={selectedIds?.has(item.id)}
						data-testid={`${testid}-item-${item.id}`}
						data-visibility={item.visibility}
						data-selected={selectedIds ? selectedIds.has(item.id) : undefined}
						onkeydown={onKeydown}
						onfocus={() => (focusIndex = i)}
						onclick={(e) => activate(i, e.shiftKey || e.ctrlKey || e.metaKey)}
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
	.outline-row {
		display: flex;
		align-items: stretch;
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
	.outline-item.is-selected {
		border-color: var(--color-accent, #36c);
		outline: 2px solid var(--color-accent, #36c);
		outline-offset: -2px;
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
