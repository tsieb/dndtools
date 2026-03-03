<script lang="ts">
	import type { EditorView } from '@codemirror/view';
	import type { ReusableSnippet } from '$lib/types/template-library.js';
	import { templateLibraryState } from '$lib/state/template-library.svelte.js';
	import {
		buildTemplateContext,
		getTemplateVariableReference,
		renderTemplateVariables,
	} from '$lib/domain/template-automation.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import {
		executeEditorAction,
		insertDiceRollResult,
		insertCallout,
		insertObjectEmbedTemplate,
		insertRollTableBlock,
		insertTable,
	} from '$lib/utils/editor-commands.js';

	interface Props {
		editorView: EditorView | null;
	}

	let { editorView }: Props = $props();
	let selectedSnippetId = $state('');
	let snippetPreview = $state('');
	let snippetPreviewLoading = $state(false);
	let snippetLibraryOpen = $state(false);
	let snippetQuery = $state('/snippets');
	let rollExpression = $state('1d20+5');
	let rollTableName = $state('Loot Table');
	let rollError = $state('');

	const templateVariables = getTemplateVariableReference();

	let filteredSnippets = $derived.by(() => {
		const normalized = snippetQuery
			.replace(/^\/snippets\s*/i, '')
			.trim()
			.toLowerCase();
		if (!normalized) return templateLibraryState.snippets;
		return templateLibraryState.snippets.filter((snippet) => {
			const haystack = `${snippet.name} ${snippet.description} ${snippet.content}`.toLowerCase();
			return haystack.includes(normalized);
		});
	});

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
		const template = templateLibraryState.templates.find((entry) => entry.id === templateId);
		if (!template) return;
		const selection = editorView.state.selection.main;
		editorView.dispatch({
			changes: { from: selection.from, to: selection.to, insert: template.content.trim() + '\n' },
			selection: { anchor: selection.from + template.content.length },
			scrollIntoView: true,
		});
		editorView.focus();
	}

	async function renderSnippetContent(snippet: ReusableSnippet): Promise<string> {
		const templateContext = await getStorage().getSetting('templateContext');
		return renderTemplateVariables(snippet.content, buildTemplateContext(templateContext));
	}

	async function selectSnippet(snippetId: string): Promise<void> {
		selectedSnippetId = snippetId;
		if (!snippetId) {
			snippetPreview = '';
			return;
		}
		const snippet = templateLibraryState.snippets.find((entry) => entry.id === snippetId);
		if (!snippet) {
			snippetPreview = '';
			return;
		}
		snippetPreviewLoading = true;
		try {
			snippetPreview = await renderSnippetContent(snippet);
		} finally {
			snippetPreviewLoading = false;
		}
	}

	async function insertSnippet(snippetId: string): Promise<void> {
		if (!editorView || !snippetId) return;
		const snippet = templateLibraryState.snippets.find((entry) => entry.id === snippetId);
		if (!snippet) return;
		const rendered = await renderSnippetContent(snippet);
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

	function insertRollMarkdown(): void {
		if (!editorView) return;
		const result = insertDiceRollResult(editorView, rollExpression);
		if (!result.ok) {
			rollError = result.error;
			return;
		}
		rollError = '';
		editorView.focus();
	}

	function insertRollTableMarkdown(): void {
		if (!editorView) return;
		insertRollTableBlock(editorView, rollTableName);
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

	async function insertSelectedSnippet(): Promise<void> {
		await insertSnippet(selectedSnippetId);
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
			Dice Block
		</button>
		<input
			type="text"
			bind:value={rollExpression}
			class="h-7 w-28 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-xs text-ink dark:text-tavern-text"
			placeholder="1d20+5"
			aria-label="Roll expression"
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					insertRollMarkdown();
				}
			}}
		/>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={insertRollMarkdown}
		>
			Roll
		</button>
		<input
			type="text"
			bind:value={rollTableName}
			class="h-7 w-32 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-xs text-ink dark:text-tavern-text"
			placeholder="Table Name"
			aria-label="Roll table name"
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					insertRollTableMarkdown();
				}
			}}
		/>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={insertRollTableMarkdown}
		>
			Roll Block
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
			{#each templateLibraryState.templates as template (template.id)}
				<option value={template.id}>{template.name}</option>
			{/each}
		</select>
	</label>

	<div class="h-4 w-px bg-border dark:bg-tavern-border"></div>

	<div class="flex items-center gap-1">
		<label class="text-xs text-ink-faint dark:text-tavern-faint">
			Snippet
			<select
				class="ml-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1 py-0.5 text-xs text-ink dark:text-tavern-text"
				onchange={(event) => void selectSnippet((event.currentTarget as HTMLSelectElement).value)}
				disabled={!editorView}
			>
				<option value="">Select</option>
				{#each templateLibraryState.snippets as snippet (snippet.id)}
					<option value={snippet.id}>{snippet.name}</option>
				{/each}
			</select>
		</label>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={() => {
				snippetLibraryOpen = !snippetLibraryOpen;
				if (!snippetLibraryOpen) {
					snippetQuery = '/snippets';
				}
			}}
			disabled={!editorView}
			title="Open /snippets library"
		>
			/snippets
		</button>
		<button
			type="button"
			class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt disabled:opacity-50"
			onclick={() => void insertSelectedSnippet()}
			disabled={!editorView || !selectedSnippetId}
		>
			Insert
		</button>
	</div>

	<details class="ml-auto text-xs text-ink-faint dark:text-tavern-faint">
		<summary class="cursor-pointer select-none">Template variables</summary>
		<div class="mt-1 rounded border border-border dark:border-tavern-border overflow-x-auto">
			<table class="min-w-[440px] text-left text-[11px]">
				<thead class="bg-surface-alt/70 dark:bg-tavern-surface-alt/70">
					<tr>
						<th class="px-2 py-1 font-semibold text-ink dark:text-tavern-text">Variable</th>
						<th class="px-2 py-1 font-semibold text-ink dark:text-tavern-text">Description</th>
						<th class="px-2 py-1 font-semibold text-ink dark:text-tavern-text">Example</th>
					</tr>
				</thead>
				<tbody>
					{#each templateVariables as variable (variable.key)}
						<tr class="border-t border-border/70 dark:border-tavern-border/70">
							<td class="px-2 py-1 font-mono text-ink dark:text-tavern-text">{variable.key}</td>
							<td class="px-2 py-1 text-ink-muted dark:text-tavern-muted">{variable.description}</td
							>
							<td class="px-2 py-1 text-ink-muted dark:text-tavern-muted">{variable.example}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</div>

{#if rollError}
	<p class="mb-2 text-xs text-error">{rollError}</p>
{/if}

{#if snippetLibraryOpen}
	<div
		class="mb-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-2.5"
	>
		<div class="mb-2 flex items-center justify-between gap-2">
			<input
				type="text"
				class="w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-xs text-ink dark:text-tavern-text"
				bind:value={snippetQuery}
				placeholder="/snippets"
			/>
			<button
				type="button"
				class="rounded px-2 py-1 text-xs text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
				onclick={() => (snippetLibraryOpen = false)}
			>
				Close
			</button>
		</div>
		<div class="grid gap-2 md:grid-cols-2">
			<div class="max-h-44 overflow-y-auto rounded border border-border dark:border-tavern-border">
				{#if filteredSnippets.length === 0}
					<p class="px-2 py-2 text-xs text-ink-faint dark:text-tavern-faint">No snippets found</p>
				{:else}
					{#each filteredSnippets as snippet (snippet.id)}
						<button
							type="button"
							class="w-full border-b border-border/60 dark:border-tavern-border/60 px-2 py-1.5 text-left hover:bg-surface-alt dark:hover:bg-tavern-surface-alt {selectedSnippetId ===
							snippet.id
								? 'bg-accent-subtle dark:bg-tavern-accent-subtle'
								: ''}"
							onclick={() => void selectSnippet(snippet.id)}
						>
							<p class="text-xs font-medium text-ink dark:text-tavern-text">{snippet.name}</p>
							<p class="text-[11px] text-ink-faint dark:text-tavern-faint">{snippet.description}</p>
						</button>
					{/each}
				{/if}
			</div>
			<div
				class="rounded border border-border dark:border-tavern-border bg-surface-alt/60 dark:bg-tavern-surface-alt/60 p-2"
			>
				<p
					class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint dark:text-tavern-faint"
				>
					Live Preview
				</p>
				{#if snippetPreviewLoading}
					<p class="text-xs text-ink-muted dark:text-tavern-muted">Rendering preview...</p>
				{:else if snippetPreview}
					<pre
						class="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-ink dark:text-tavern-text">{snippetPreview}</pre>
				{:else}
					<p class="text-xs text-ink-faint dark:text-tavern-faint">Select a snippet to preview</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
