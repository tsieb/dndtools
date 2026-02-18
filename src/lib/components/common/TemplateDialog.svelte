<script lang="ts">
	import Modal from './Modal.svelte';
	import { DND_TEMPLATES, type NoteTemplate } from '$lib/services/templates.js';

	interface Props {
		open: boolean;
		onclose: () => void;
		oncreate: (template: NoteTemplate) => void;
	}

	let { open, onclose, oncreate }: Props = $props();
</script>

<Modal {open} title="New from Template" onclose={onclose}>
	<p class="text-sm text-ink-muted dark:text-tavern-muted mb-4">
		Choose a template to start with. You can customize it after creation.
	</p>
	<div class="grid grid-cols-2 gap-3">
		{#each DND_TEMPLATES as template (template.name)}
			<button
				class="text-left p-3 rounded-lg border border-border dark:border-tavern-border bg-surface-alt/50 dark:bg-tavern-surface-alt/50 hover:bg-accent-subtle dark:hover:bg-tavern-accent-subtle hover:border-accent/30 dark:hover:border-tavern-accent/30 transition-all group"
				onclick={() => oncreate(template)}
			>
				<div class="flex items-center gap-2 mb-1">
					<span class="text-lg">{template.icon}</span>
					<span class="font-medium text-ink dark:text-tavern-text group-hover:text-accent dark:group-hover:text-tavern-accent">
						{template.name}
					</span>
				</div>
				<p class="text-xs text-ink-muted dark:text-tavern-muted leading-relaxed">
					{template.description}
				</p>
			</button>
		{/each}
	</div>
</Modal>
