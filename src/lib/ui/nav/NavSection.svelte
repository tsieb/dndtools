<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { IconName } from '$lib/ui/common/Icon.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';

	interface Props {
		label: string;
		defaultCollapsed?: boolean;
		collapsed?: boolean;
		actionIcon?: IconName;
		onaction?: () => void;
		ontoggle?: (collapsed: boolean) => void;
		children: Snippet;
		id?: string;
	}

	let {
		label,
		defaultCollapsed = false,
		collapsed = $bindable(defaultCollapsed),
		actionIcon,
		onaction,
		ontoggle,
		children,
		id,
	}: Props = $props();

	const contentId = $derived(id ?? `nav-section-${label.toLowerCase().replace(/\s+/g, '-')}`);

	function toggle(): void {
		collapsed = !collapsed;
		ontoggle?.(collapsed);
	}
</script>

<section class="px-3 pb-2">
	<div class="mb-1 flex items-center">
		<button
			type="button"
			class="flex flex-1 items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink-muted"
			onclick={toggle}
			aria-expanded={!collapsed}
			aria-controls={contentId}
		>
			<Icon
				name="chevron-right"
				size="xs"
				class="transition-transform duration-fast {collapsed ? '' : 'rotate-90'}"
			/>
			<span>{label}</span>
		</button>
		{#if actionIcon && onaction}
			<button
				type="button"
				class="flex h-6 w-6 items-center justify-center rounded text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink-muted"
				onclick={onaction}
				aria-label="Action for {label}"
			>
				<Icon name={actionIcon} size="xs" />
			</button>
		{/if}
	</div>
	{#if !collapsed}
		<div id={contentId}>
			{@render children()}
		</div>
	{/if}
</section>
