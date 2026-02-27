<script lang="ts">
	import type { EditorView } from '@codemirror/view';
	import { DND_TEMPLATES } from '$lib/domain/templates.js';
	import { REUSABLE_SNIPPETS } from '$lib/domain/snippets.js';
	import {
		buildTemplateContext,
		renderTemplateVariables,
	} from '$lib/domain/template-automation.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import {
		executeEditorAction,
		insertCallout,
		insertObjectEmbedTemplate,
		insertTable,
	} from '$lib/utils/editor-commands.js';

	interface Props {
		editorView: EditorView | null;
	}

	let { editorView }: Props = $props();

	function run(action: string): void {
		if (!editorView) return;
		executeEditorAction(editorView, action);
		editorView.focus();
	}

	function runCallout(type: string): void {
		if (!editorView) return;
		insertCallout(editorView, type);
		editorView.focus();
	}

	function insertTemplate(templateId: string): void {
		if (!editorView || !templateId) return;
		const template = DND_TEMPLATES.find((entry) => entry.id === templateId);
		if (!template) return;
		const selection = editorView.state.selection.main;
		editorView.dispatch({
			changes: { from: selection.from, to: selection.to, insert: template.content.trim() + '\n' },
			selection: { anchor: selection.from + template.content.length },
			scrollIntoView: true,
		});
		editorView.focus();
	}

	async function insertSnippet(snippetId: string): Promise<void> {
		if (!editorView || !snippetId) return;
		const snippet = REUSABLE_SNIPPETS.find((entry) => entry.id === snippetId);
		if (!snippet) return;
		const templateContext = await getStorage().getSetting('templateContext');
		const rendered = renderTemplateVariables(
			snippet.content,
			buildTemplateContext(templateContext),
		);
		const selection = editorView.state.selection.main;
		editorView.dispatch({
			changes: { from: selection.from, to: selection.to, insert: rendered.trimEnd() + '\n' },
			selection: { anchor: selection.from + rendered.length },
			scrollIntoView: true,
		});
		editorView.focus();
	}

	function insertDiceBlock(): void {
		if (!editorView) return;
		const selection = editorView.state.selection.main;
		const block = '```dice\n2d20kh1 + 5\n```';
		editorView.dispatch({
			changes: { from: selection.from, to: selection.to, insert: block },
			selection: { anchor: selection.from + block.length },
			scrollIntoView: true,
		});
		editorView.focus();
	}

	function insertTableBlock(): void {
		if (!editorView) return;
		insertTable(editorView);
		editorView.focus();
	}

	function insertEmbedTemplate(): void {
		if (!editorView) return;
		insertObjectEmbedTemplate(editorView);
		editorView.focus();
	}
</script>

<div
	class="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1.5"
>
	<div class="flex items-center gap-1">
		<span class="text-xs font-medium text-ink-faint dark:text-tavern-faint">Insert</span>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={() => run('wikilink')}
		>
			Wikilink
		</button>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={() => run('horizontal-rule')}
		>
			Divider
		</button>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={insertDiceBlock}
		>
			Dice
		</button>
	</div>

	<div class="h-4 w-px bg-border dark:bg-tavern-border"></div>

	<div class="flex items-center gap-1">
		<span class="text-xs font-medium text-ink-faint dark:text-tavern-faint">Callout</span>
		{#each ['info', 'note', 'tip', 'warning', 'quest', 'dm'] as calloutType (calloutType)}
			<button
				type="button"
				class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
				onclick={() => runCallout(calloutType)}
			>
				{calloutType}
			</button>
		{/each}
	</div>

	<div class="h-4 w-px bg-border dark:bg-tavern-border"></div>

	<div class="flex items-center gap-1">
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={insertTableBlock}
			disabled={!editorView}
		>
			Table
		</button>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={insertEmbedTemplate}
			disabled={!editorView}
		>
			Embed
		</button>
	</div>

	<div class="h-4 w-px bg-border dark:bg-tavern-border"></div>

	<label class="text-xs text-ink-faint dark:text-tavern-faint">
		Template
		<select
			class="ml-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1 py-0.5 text-xs text-ink dark:text-tavern-text"
			onchange={(event) => insertTemplate((event.currentTarget as HTMLSelectElement).value)}
			disabled={!editorView}
		>
			<option value="">Select</option>
			{#each DND_TEMPLATES as template (template.id)}
				<option value={template.id}>{template.name}</option>
			{/each}
		</select>
	</label>

	<div class="h-4 w-px bg-border dark:bg-tavern-border"></div>

	<label class="text-xs text-ink-faint dark:text-tavern-faint">
		Snippet
		<select
			class="ml-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1 py-0.5 text-xs text-ink dark:text-tavern-text"
			onchange={(event) => void insertSnippet((event.currentTarget as HTMLSelectElement).value)}
			disabled={!editorView}
		>
			<option value="">Select</option>
			{#each REUSABLE_SNIPPETS as snippet (snippet.id)}
				<option value={snippet.id}>{snippet.name}</option>
			{/each}
		</select>
	</label>
</div>
