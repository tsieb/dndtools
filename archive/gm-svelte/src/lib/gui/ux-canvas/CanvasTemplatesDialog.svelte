<script lang="ts">
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import {
		buildTemplateLibrary,
		templateNameSuggestion,
		templateThumbAlt,
		type TemplateEntry,
		type UserTemplateInput,
	} from './canvas-templates';

	/**
	 * Canvas templates dialog (UX-CANVAS-010). Save the current canvas as a named template, and recall any
	 * template from a unified library: read-only built-in starters (marked "Built-in", no delete) and the
	 * DM's own saved templates (already DM-only-filtered by the Processing Core). Instantiating creates a
	 * NEW canvas with new widget instances, never overwriting the current one; the host navigates to it.
	 */
	interface Props {
		open: boolean;
		sourceName: string;
		userTemplates: readonly UserTemplateInput[];
		onsave: (templateName: string) => void;
		oninstantiate: (entry: TemplateEntry) => void;
		onclose?: () => void;
	}

	let { open = $bindable(), sourceName, userTemplates, onsave, oninstantiate, onclose }: Props = $props();

	let templateName = $state('');
	const library = $derived(buildTemplateLibrary(userTemplates));

	$effect(() => {
		if (open && !templateName) templateName = templateNameSuggestion(sourceName);
	});

	function save() {
		const name = templateName.trim();
		if (!name) return;
		onsave(name);
		templateName = '';
	}
</script>

<Dialog bind:open title="Canvas templates" testid="canvas-templates" {onclose}>
	<div class="templates">
		<section class="templates-save" aria-label="Save as template">
			<h3>Save as template</h3>
			<label class="templates-field">
				<span>Template name</span>
				<input bind:value={templateName} data-testid="template-name" autocomplete="off" />
			</label>
			<button
				type="button"
				class="button"
				data-testid="template-save"
				disabled={!templateName.trim()}
				onclick={save}
			>
				Save template
			</button>
		</section>

		<section class="templates-library" aria-label="Template library">
			<h3>New canvas from template</h3>
			<ul class="templates-list" role="listbox" aria-label="Templates">
				{#each library as entry (entry.id)}
					<li class="templates-row" data-testid={`template-row-${entry.id}`}>
						<span class="templates-thumb" role="img" aria-label={templateThumbAlt(entry)} aria-hidden="false">
							{entry.name.charAt(0)}
						</span>
						<span class="templates-info">
							<strong>{entry.name}</strong>
							{#if entry.kind === 'built-in'}
								<span class="templates-builtin" data-testid={`template-builtin-${entry.id}`}>Built-in</span>
							{/if}
							{#if entry.description}
								<span class="meta">{entry.description}</span>
							{/if}
							{#if entry.widgetCount !== null}
								<span class="meta">{entry.widgetCount} widget{entry.widgetCount === 1 ? '' : 's'}</span>
							{/if}
						</span>
						<button
							type="button"
							class="button secondary"
							data-testid={`template-instantiate-${entry.id}`}
							onclick={() => oninstantiate(entry)}
						>
							Use template
						</button>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</Dialog>

<style>
	.templates {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: min(420px, 86vw);
	}
	.templates h3 {
		margin: 0 0 var(--space-1);
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-tertiary);
	}
	.templates-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		margin-bottom: var(--space-1);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.templates-field input {
		width: 100%;
		min-height: var(--touch-target-min);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
	}
	.templates-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 40vh;
		overflow-y: auto;
	}
	.templates-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
	}
	.templates-thumb {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-sm);
		background: var(--color-surface-sunken);
		font-weight: var(--font-weight-bold);
	}
	.templates-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		flex: 1;
	}
	.templates-builtin {
		align-self: flex-start;
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-bold);
		padding: 0 var(--space-1);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-status-info);
		color: var(--color-status-info-text);
	}
	.meta {
		color: var(--color-text-tertiary);
		font-size: var(--text-xs);
	}
</style>
