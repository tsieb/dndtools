<script lang="ts">
	import Modal from './Modal.svelte';
	import { getScopedTemplates, type ScopedNoteTemplate } from '$lib/domain/template-automation.js';
	import type { NoteTemplate } from '$lib/types/template-library.js';

	interface Props {
		open: boolean;
		activeFolder: string | null;
		folderOverride?: string | null;
		templates: readonly NoteTemplate[];
		onclose: () => void;
		oncreate: (template: NoteTemplate, folderOverride?: string) => void;
	}

	let { open, activeFolder, folderOverride = null, templates, onclose, oncreate }: Props = $props();
	let query = $state('');

	let scopedTemplates = $derived(getScopedTemplates(templates, activeFolder));
	let visibleTemplates = $derived.by<ScopedNoteTemplate[]>(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return scopedTemplates;
		return scopedTemplates.filter((entry) => {
			const haystack =
				`${entry.template.name} ${entry.template.description} ${entry.template.defaultFolder}`.toLowerCase();
			return haystack.includes(normalized);
		});
	});
</script>

<Modal {open} title="New from Template" {onclose}>
	<p class="text-sm text-ink-muted dark:text-tavern-muted mb-4">
		Choose a global or folder template to start with. You can customize it after creation.
	</p>
	<div class="mb-3">
		<input
			type="text"
			bind:value={query}
			placeholder="Filter templates..."
			class="w-full rounded-md border border-border dark:border-tavern-border bg-surface-alt/60 dark:bg-tavern-surface-alt/60 px-2.5 py-1.5 text-sm text-ink dark:text-tavern-text"
		/>
	</div>
	<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
		{#each visibleTemplates as entry (entry.template.id)}
			<button
				class="text-left p-3 rounded-lg border border-border dark:border-tavern-border bg-surface-alt/50 dark:bg-tavern-surface-alt/50 hover:bg-accent-subtle dark:hover:bg-tavern-accent-subtle hover:border-accent/30 dark:hover:border-tavern-accent/30 transition-all group"
				onclick={() => oncreate(entry.template, folderOverride ?? undefined)}
			>
				<div class="flex items-center gap-2 mb-1">
					<span class="text-lg">{entry.template.icon}</span>
					<span
						class="font-medium text-ink dark:text-tavern-text group-hover:text-accent dark:group-hover:text-tavern-accent"
					>
						{entry.template.name}
					</span>
					<span
						class="ml-auto rounded-full border border-border dark:border-tavern-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint dark:text-tavern-faint"
					>
						{entry.scope === 'global' ? 'Global' : entry.scopeFolder}
					</span>
				</div>
				<p class="text-xs text-ink-muted dark:text-tavern-muted leading-relaxed">
					{entry.template.description}
				</p>
			</button>
		{/each}
	</div>
</Modal>
