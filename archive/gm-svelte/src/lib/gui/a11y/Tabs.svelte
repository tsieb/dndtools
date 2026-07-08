<script lang="ts" module>
	let tabsSeq = 0;
	function nextTabsId(): string {
		tabsSeq += 1;
		return `tabs-${tabsSeq}`;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { nextRovingIndex } from './roving-tabindex';

	/**
	 * Tabs primitive (UX-A11Y-012 tabs pattern). WAI-ARIA APG: `role=tablist`/`tab`/`tabpanel`,
	 * `aria-selected`, `aria-controls`, roving tabindex (only the selected tab is in the Tab order),
	 * Arrow Left/Right to move with wrap, Home/End to jump. Automatic activation — arrowing selects the
	 * tab — per the APG recommendation for this product's density (§3.7 / UX-A11Y-012 AC2).
	 */
	interface Tab {
		id: string;
		label: string;
	}
	interface Props {
		tabs: ReadonlyArray<Tab>;
		selected: string;
		label: string;
		panel: Snippet<[string]>;
		testid?: string;
	}

	let { tabs, selected = $bindable(), label, panel, testid = 'tabs' }: Props = $props();

	const baseId = nextTabsId();
	const tabId = (id: string) => `${baseId}-tab-${id}`;
	const panelId = (id: string) => `${baseId}-panel-${id}`;
	let tabEls = $state<HTMLButtonElement[]>([]);

	const selectedIndex = $derived(Math.max(0, tabs.findIndex((t) => t.id === selected)));

	function onKeydown(event: KeyboardEvent) {
		const next = nextRovingIndex({
			key: event.key,
			currentIndex: selectedIndex,
			count: tabs.length,
			orientation: 'horizontal',
			wrap: true,
		});
		if (next === null) return;
		event.preventDefault();
		selected = tabs[next]!.id;
		tabEls[next]?.focus();
	}
</script>

<div class="tabs" data-testid={testid}>
	<div class="tablist" role="tablist" aria-label={label}>
		{#each tabs as tab, i (tab.id)}
			<button
				bind:this={tabEls[i]}
				type="button"
				role="tab"
				id={tabId(tab.id)}
				aria-selected={tab.id === selected}
				aria-controls={panelId(tab.id)}
				tabindex={tab.id === selected ? 0 : -1}
				class="tab"
				class:selected={tab.id === selected}
				data-testid={`${testid}-tab-${tab.id}`}
				onkeydown={onKeydown}
				onclick={() => (selected = tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>
	{#each tabs as tab (tab.id)}
		{#if tab.id === selected}
			<div
				role="tabpanel"
				id={panelId(tab.id)}
				aria-labelledby={tabId(tab.id)}
				tabindex="0"
				class="tabpanel"
				data-testid={`${testid}-panel-${tab.id}`}
			>
				{@render panel(tab.id)}
			</div>
		{/if}
	{/each}
</div>
