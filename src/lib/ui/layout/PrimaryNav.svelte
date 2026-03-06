<script lang="ts">
	import { resolve } from '$app/paths';
	import { navigationState, PRIMARY_SECTION_NAV_ITEMS } from '$lib/state/navigation.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import PrimaryNavIcon from './PrimaryNavIcon.svelte';

	interface Props {
		mode: 'expanded' | 'collapsed' | 'medium' | 'compact';
	}

	let { mode }: Props = $props();

	const items = PRIMARY_SECTION_NAV_ITEMS.map((item) => ({
		...item,
		href: resolve(item.href),
	}));

	const compact = $derived(mode === 'compact');
	const iconOnly = $derived(mode === 'collapsed' || mode === 'medium');
	const isVertical = $derived(!compact);
</script>

<aside
	class="primary-nav-shell {compact ? 'mobile-bottom-nav' : ''} {isVertical
		? 'h-full border-r border-border dark:border-tavern-border'
		: 'fixed inset-x-0 bottom-0 z-30 border-t border-border dark:border-tavern-border'} {compact
		? 'bg-surface/95 pb-[calc(0.3rem+env(safe-area-inset-bottom))] pt-1 backdrop-blur-md dark:bg-tavern-surface/95'
		: 'bg-surface-alt dark:bg-tavern-surface'}"
	style="width: {isVertical ? (mode === 'expanded' ? '200px' : '60px') : '100%'}"
	data-mode={mode}
>
	{#if playerModeState.enabled && isVertical}
		<div
			class="h-1 w-full bg-emerald-500/80 dark:bg-emerald-400/80"
			aria-label="Player mode signal"
		></div>
	{/if}
	<nav
		class={compact
			? 'mx-auto grid w-full max-w-[560px] grid-cols-5 gap-1 px-2'
			: 'flex h-full flex-col gap-1 px-2 py-3'}
		aria-label="Global navigation: Primary sections"
	>
		{#each items as item (item.id)}
			{@const active = navigationState.activeSection === item.id}
			<a
				href={item.href}
				aria-current={active ? 'page' : undefined}
				class="primary-nav-item {compact
					? 'flex min-h-12 flex-col items-center justify-center rounded-md px-1 py-1 text-[11px] font-medium'
					: 'flex min-h-11 items-center rounded-lg px-2.5 py-2 text-sm font-medium'}"
				data-active={active ? 'true' : 'false'}
				style="--primary-nav-active: {active ? 1 : 0}"
			>
				<span
					class="primary-nav-icon flex items-center justify-center rounded-md {mode === 'expanded'
						? 'h-10 w-10'
						: 'h-8 w-8'}"
				>
					<PrimaryNavIcon
						section={item.id}
						sizeClass={mode === 'expanded' ? 'h-7 w-7' : 'h-5 w-5'}
					/>
				</span>
				{#if !iconOnly}
					<span class="{compact ? 'mt-0.5' : 'ml-2.5'} truncate">{item.label}</span>
				{/if}
				{#if compact}
					<span class="sr-only">{item.label}</span>
				{/if}
			</a>
		{/each}
	</nav>
</aside>
