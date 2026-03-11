<script lang="ts">
	import type { IconName } from '$lib/ui/common/Icon.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';

	interface NavBarItem {
		id: string;
		label: string;
		href: string;
		icon: IconName;
	}

	interface Props {
		items: NavBarItem[];
		activeId?: string;
		onclick?: (id: string, event: MouseEvent) => void;
	}

	let { items, activeId, onclick }: Props = $props();
</script>

<nav
	class="grid w-full gap-1 px-2"
	style="grid-template-columns: repeat({items.length}, 1fr);"
	role="navigation"
	aria-label="Primary"
>
	{#each items as item (item.id)}
		{@const active = activeId === item.id}
		<a
			href={item.href}
			aria-label={item.label}
			aria-current={active ? 'page' : undefined}
			class="flex min-h-12 flex-col items-center justify-center rounded-md text-2xs font-medium transition-colors
				{active ? 'text-accent' : 'text-ink-muted hover:text-ink'}"
			onclick={(event) => onclick?.(item.id, event)}
		>
			<span
				class="flex h-7 w-7 items-center justify-center rounded-md
				{active ? 'bg-accent-subtle' : ''}"
				aria-hidden="true"
			>
				<Icon name={item.icon} size="sm" />
			</span>
			<span class="mt-0.5 truncate">{item.label}</span>
		</a>
	{/each}
</nav>
