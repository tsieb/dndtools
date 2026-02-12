<script lang="ts">
	interface Props {
		onaction: (action: string) => void;
	}

	let { onaction }: Props = $props();

	const actions = [
		{ action: 'bold', label: 'B', title: 'Bold (Ctrl+B)', class: 'font-bold' },
		{ action: 'italic', label: 'I', title: 'Italic (Ctrl+I)', class: 'italic' },
		{ action: 'heading', label: 'H', title: 'Heading', class: 'font-bold' },
		{ action: 'link', label: 'Link', title: 'Link (Ctrl+K)', class: '' },
		{ action: 'list', label: 'List', title: 'Bullet list', class: '' },
		{ action: 'code', label: '<>', title: 'Code', class: 'font-mono text-xs' },
	];
</script>

<div
	class="flex items-center gap-0.5 px-2 py-1.5 border border-border dark:border-tavern-border rounded-lg bg-surface dark:bg-tavern-surface mb-2"
	role="toolbar"
	aria-label="Editor formatting"
>
	{#each actions as act}
		<button
			class="px-2 py-1 text-sm rounded text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt hover:text-ink dark:hover:text-tavern-text transition-colors {act.class}"
			title={act.title}
			onclick={() => onaction(act.action)}
		>
			{act.label}
		</button>
	{/each}
</div>
