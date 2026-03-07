<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { IconName } from './Icon.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		title: string;
		subtitle?: string;
		href?: string;
		leadingIcon?: IconName;
		/** Trailing element slot (actions, badges, etc.) */
		trailing?: Snippet;
		/** Extra action slot rendered at the end */
		action?: Snippet;
		active?: boolean;
		disabled?: boolean;
		class?: string;
		onclick?: () => void;
	}

	let {
		title,
		subtitle,
		href,
		leadingIcon,
		trailing,
		action,
		active = false,
		disabled = false,
		class: extraClass,
		onclick,
	}: Props = $props();

	const baseClass =
		'group flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';
	const interactiveClass = $derived(
		!disabled ? 'cursor-pointer hover:bg-surface-alt' : 'opacity-50 cursor-not-allowed',
	);
	const activeClass = $derived(active ? 'bg-accent-subtle' : '');
</script>

{#if href}
	<a
		{href}
		aria-current={active ? 'page' : undefined}
		class="{baseClass} {interactiveClass} {activeClass} {extraClass ?? ''}"
	>
		{#if leadingIcon}
			<span class="shrink-0 text-ink-muted group-hover:text-ink" aria-hidden="true">
				<Icon name={leadingIcon} size="sm" />
			</span>
		{/if}
		<span class="min-w-0 flex-1">
			<span class="block truncate font-medium text-ink">{title}</span>
			{#if subtitle}
				<span class="block truncate text-xs text-ink-muted">{subtitle}</span>
			{/if}
		</span>
		{#if trailing}
			<span class="shrink-0 text-ink-muted">{@render trailing()}</span>
		{/if}
		{#if action}
			<span class="shrink-0">{@render action()}</span>
		{/if}
	</a>
{:else if onclick}
	<button
		type="button"
		{disabled}
		class="{baseClass} {interactiveClass} {activeClass} {extraClass ?? ''} text-left"
		{onclick}
	>
		{#if leadingIcon}
			<span class="shrink-0 text-ink-muted" aria-hidden="true">
				<Icon name={leadingIcon} size="sm" />
			</span>
		{/if}
		<span class="min-w-0 flex-1">
			<span class="block truncate font-medium text-ink">{title}</span>
			{#if subtitle}
				<span class="block truncate text-xs text-ink-muted">{subtitle}</span>
			{/if}
		</span>
		{#if trailing}
			<span class="shrink-0 text-ink-muted">{@render trailing()}</span>
		{/if}
		{#if action}
			<span class="shrink-0">{@render action()}</span>
		{/if}
	</button>
{:else}
	<div class="{baseClass} {activeClass} {extraClass ?? ''}">
		{#if leadingIcon}
			<span class="shrink-0 text-ink-muted" aria-hidden="true">
				<Icon name={leadingIcon} size="sm" />
			</span>
		{/if}
		<span class="min-w-0 flex-1">
			<span class="block truncate font-medium text-ink">{title}</span>
			{#if subtitle}
				<span class="block truncate text-xs text-ink-muted">{subtitle}</span>
			{/if}
		</span>
		{#if trailing}
			<span class="shrink-0 text-ink-muted">{@render trailing()}</span>
		{/if}
		{#if action}
			<span class="shrink-0">{@render action()}</span>
		{/if}
	</div>
{/if}
