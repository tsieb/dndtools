<script lang="ts">
	import type { IconName } from '$lib/ui/common/Icon.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';

	interface Props {
		label: string;
		href?: string;
		icon?: IconName;
		active?: boolean;
		/** Indentation depth for tree-style items (0 = root level) */
		depth?: number;
		/** Badge: number shows a count chip; true shows a dot indicator */
		badge?: number | boolean;
		onclick?: (event: MouseEvent) => void;
		ariaLabel?: string;
	}

	let { label, href, icon, active = false, depth = 0, badge, onclick, ariaLabel }: Props = $props();

	const indent = $derived(depth > 0 ? `padding-left: calc(${depth} * 1rem + 0.625rem)` : '');

	const baseClass =
		'group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-[transform,colors] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';
	const activeClass = 'bg-accent-subtle text-accent';
	const inactiveClass = 'text-ink-muted hover:bg-surface-alt hover:text-ink';
</script>

{#if href}
	<a
		{href}
		aria-label={ariaLabel}
		aria-current={active ? 'page' : undefined}
		class="{baseClass} {active ? activeClass : inactiveClass}"
		style={indent}
		{onclick}
	>
		{#if icon}
			<span class="shrink-0" aria-hidden="true">
				<Icon name={icon} size="sm" />
			</span>
		{/if}
		<span class="flex-1 truncate">{label}</span>
		{#if badge !== undefined && badge !== false}
			{#if badge === true}
				<span class="h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-hidden="true"></span>
			{:else if typeof badge === 'number' && badge > 0}
				<span
					class="shrink-0 rounded-full bg-accent-subtle px-1.5 py-0.5 text-2xs font-semibold text-accent"
					aria-label="{badge} items"
				>
					{badge > 99 ? '99+' : badge}
				</span>
			{/if}
		{/if}
	</a>
{:else}
	<button
		type="button"
		aria-label={ariaLabel ?? label}
		aria-pressed={active}
		class="{baseClass} {active ? activeClass : inactiveClass}"
		style={indent}
		{onclick}
	>
		{#if icon}
			<span class="shrink-0" aria-hidden="true">
				<Icon name={icon} size="sm" />
			</span>
		{/if}
		<span class="flex-1 truncate text-left">{label}</span>
		{#if badge !== undefined && badge !== false}
			{#if badge === true}
				<span class="h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-hidden="true"></span>
			{:else if typeof badge === 'number' && badge > 0}
				<span
					class="shrink-0 rounded-full bg-accent-subtle px-1.5 py-0.5 text-2xs font-semibold text-accent"
					aria-label="{badge} items"
				>
					{badge > 99 ? '99+' : badge}
				</span>
			{/if}
		{/if}
	</button>
{/if}
