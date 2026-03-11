<script lang="ts">
	import type { IconName } from '$lib/ui/common/Icon.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';

	interface NavRailItem {
		id: string;
		label: string;
		href: string;
		icon: IconName;
	}

	interface Props {
		items: NavRailItem[];
		activeId?: string;
		onclick?: (id: string, event: MouseEvent) => void;
	}

	let { items, activeId, onclick }: Props = $props();
</script>

<nav
	class="flex h-full flex-col gap-1 px-2 py-3"
	role="navigation"
	aria-label="Primary"
	style="width: var(--layout-rail-width);"
>
	{#each items as item (item.id)}
		{@const active = activeId === item.id}
		<a
			href={item.href}
			aria-label={item.label}
			aria-current={active ? 'page' : undefined}
			title={item.label}
			class="group flex min-h-11 flex-col items-center justify-center rounded-lg text-sm font-medium transition-colors
				{active ? 'bg-accent-subtle text-accent' : 'text-ink-muted hover:bg-surface-alt hover:text-ink'}"
			onclick={(event) => onclick?.(item.id, event)}
		>
			<span class="flex h-8 w-8 items-center justify-center rounded-md">
				<Icon name={item.icon} size="md" />
			</span>
		</a>
	{/each}
</nav>
