<script lang="ts">
	import { ui } from '$lib/stores/ui.svelte.js';

	const themes = [
		{ value: 'light' as const, label: 'Light' },
		{ value: 'system' as const, label: 'Auto' },
		{ value: 'dark' as const, label: 'Dark' },
	];
</script>

<div
	class="flex rounded-md border border-border dark:border-tavern-border overflow-hidden"
	role="radiogroup"
	aria-label="Theme"
>
	{#each themes as theme}
		<button
			class="px-3 py-1 text-sm transition-colors {ui.theme === theme.value
				? 'bg-accent text-white dark:bg-tavern-accent dark:text-tavern-bg'
				: 'bg-surface dark:bg-tavern-surface text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
			role="radio"
			aria-checked={ui.theme === theme.value}
			onclick={() => ui.setTheme(theme.value)}
		>
			{theme.label}
		</button>
	{/each}
</div>
