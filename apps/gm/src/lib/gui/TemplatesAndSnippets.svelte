<script lang="ts">
	import {
		actorCanAuthorContent,
		contentTemplatePreset,
		getContentItemsForActor,
		inheritedSnippetVisibility,
		insertSnippet,
		listContentSnippets,
		listContentTemplatePresets,
		previewInsertedSnippet,
		renderTemplate,
		contentSnippet,
		type SnippetInsertPosition,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CONTENT-003 / CONTENT-004 — TEMPLATES and SNIPPETS.
	//
	// CONTENT-003: an authorized editor creates content FROM A STARTER PRESET with VARIABLES. The preset is
	// rendered deterministically and the GENERATED content is validated through the EXISTING pipeline BEFORE
	// the write; a missing required variable or invalid generated content is blocked fail-closed (no write),
	// and visibility fails closed to dm-only (a template can never silently widen visibility).
	//
	// CONTENT-004: an authorized editor INSERTS a SNIPPET into a note. The inserted content funnels through
	// the SAME validation + sanitization (render) + visibility pipeline as hand-typed content — a snippet
	// cannot skip validation, smuggle unsanitized markdown (the preview is the safe block-model renderer, no
	// raw HTML), or widen the note's visibility.
	//
	// The GUI renders the computed render/validation/preview models and dispatches command intents; it never
	// touches storage (Architecture Contract 1). Which authoring affordances appear is an ergonomic role hint;
	// the AUTHORITATIVE enforcement lives in the Processing Core (fail-closed).
	const runtime = useRuntime();

	const canAuthor = $derived(
		actorCanAuthorContent(runtime.state.permissions, runtime.activeActorId),
	);

	// --- CONTENT-003 — create from a starter preset --------------------------------------------------
	const presets = listContentTemplatePresets();
	let presetId = $state(presets[0]?.id ?? '');
	let variableValues = $state<Record<string, string>>({});
	let templateError = $state<string | null>(null);
	let templateSummary = $state<string | null>(null);

	const activePreset = $derived(contentTemplatePreset(presetId));

	// The deterministic render PREVIEW (the core re-validates fail-closed on dispatch). Only the declared
	// variables are passed, so a stale value from a previously-selected preset is never sent.
	const declaredValues = $derived.by(() => {
		const next: Record<string, string> = {};
		for (const variable of activePreset?.variables ?? []) {
			next[variable.name] = variableValues[variable.name] ?? '';
		}
		return next;
	});
	const renderPreview = $derived(
		activePreset ? renderTemplate(activePreset, declaredValues) : null,
	);

	async function createFromTemplate(): Promise<void> {
		templateError = null;
		templateSummary = null;
		const result = await runtime.dispatch({
			type: 'content.create-from-template',
			actorId: runtime.activeActorId,
			payload: { presetId, variables: declaredValues },
		});
		if (result.status === 'rejected') {
			const detail = result.rejection.issues
				?.map((issue) => `${issue.path}: ${issue.message}`)
				.join('; ');
			templateError = detail ? `${result.rejection.message} (${detail})` : result.rejection.message;
			return;
		}
		templateSummary = `Created content from the ${activePreset?.name ?? presetId} template.`;
	}

	// --- CONTENT-004 — insert a snippet into a note --------------------------------------------------
	const snippets = listContentSnippets();
	const notes = $derived(
		getContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId),
	);

	let snippetNoteId = $state('');
	let snippetId = $state(snippets[0]?.id ?? '');
	let snippetPosition = $state<SnippetInsertPosition>('after');
	let snippetError = $state<string | null>(null);
	let snippetSummary = $state<string | null>(null);

	$effect(() => {
		if (snippetNoteId === '' && notes.length > 0) snippetNoteId = notes[0]!.id;
	});

	const snippetHost = $derived(notes.find((note) => note.id === snippetNoteId) ?? null);
	const activeSnippet = $derived(contentSnippet(snippetId));

	// The inherited visibility (a snippet inherits — never widens — the note's visibility).
	const inheritedVisibility = $derived(
		snippetHost ? inheritedSnippetVisibility(snippetHost.visibility) : null,
	);

	// The deterministic insert PREVIEW: validation of the resulting text + the SAFE block-model render.
	const insertResult = $derived(
		snippetHost && activeSnippet
			? insertSnippet(snippetHost.body, activeSnippet, snippetPosition)
			: null,
	);
	const insertPreview = $derived(
		snippetHost && activeSnippet
			? previewInsertedSnippet(snippetHost.body, activeSnippet, snippetPosition)
			: null,
	);

	async function insertSnippetIntoNote(): Promise<void> {
		snippetError = null;
		snippetSummary = null;
		const result = await runtime.dispatch({
			type: 'content.insert-snippet',
			actorId: runtime.activeActorId,
			payload: { itemId: snippetNoteId, snippetId, position: snippetPosition },
		});
		if (result.status === 'rejected') {
			snippetError = result.rejection.message;
			return;
		}
		snippetSummary = `Inserted "${activeSnippet?.name ?? snippetId}" — visibility unchanged (${
			inheritedVisibility ?? 'dm-only'
		}).`;
	}
</script>

{#if canAuthor}
	<section class="cwrap" data-testid="templates-and-snippets" aria-label="Templates and snippets">
		<h2>Templates and snippets</h2>

		<!-- CONTENT-003 — create content from a starter preset with variables (validate before write). -->
		<form
			data-testid="create-from-template-form"
			onsubmit={(event) => {
				event.preventDefault();
				createFromTemplate();
			}}
		>
			<h3>Create from a template</h3>
			<label>
				Starter preset
				<select data-testid="template-preset-select" bind:value={presetId}>
					{#each presets as preset (preset.id)}
						<option value={preset.id}>{preset.name}</option>
					{/each}
				</select>
			</label>
			{#if activePreset}
				<p class="meta" data-testid="template-default-visibility">
					Default visibility: {activePreset.defaultVisibility} • kind: {activePreset.kind}
				</p>
				{#each activePreset.variables as variable (variable.name)}
					<label>
						{variable.label}{variable.required ? ' (required)' : ''}
						<input
							data-testid={`template-var-${variable.name}`}
							bind:value={variableValues[variable.name]}
						/>
					</label>
				{/each}
			{/if}

			{#if renderPreview}
				{#if renderPreview.valid}
					<p class="meta" data-testid="template-render-valid">
						Generates: <strong>{renderPreview.title}</strong> ({renderPreview.visibility})
					</p>
				{:else}
					<p class="meta" data-testid="template-render-invalid">
						Cannot create yet: {renderPreview.issues.map((issue) => issue.message).join('; ')}
					</p>
				{/if}
			{/if}

			{#if templateError}
				<p class="meta" role="alert" data-testid="template-create-error">{templateError}</p>
			{/if}
			{#if templateSummary}
				<p class="meta" data-testid="template-create-summary">{templateSummary}</p>
			{/if}
			<button
				type="submit"
				data-testid="template-create-submit"
				disabled={!renderPreview?.valid}
			>
				Create from template
			</button>
		</form>

		<!-- CONTENT-004 — insert a snippet into a note (no bypass of validation/visibility/sanitization). -->
		<form
			data-testid="insert-snippet-form"
			onsubmit={(event) => {
				event.preventDefault();
				insertSnippetIntoNote();
			}}
		>
			<h3>Insert a snippet</h3>
			<label>
				Note
				<select data-testid="snippet-note-select" bind:value={snippetNoteId}>
					{#each notes as note (note.id)}
						<option value={note.id}>{note.title} ({note.visibility})</option>
					{/each}
				</select>
			</label>
			<label>
				Snippet
				<select data-testid="snippet-select" bind:value={snippetId}>
					{#each snippets as snippet (snippet.id)}
						<option value={snippet.id}>{snippet.name}</option>
					{/each}
				</select>
			</label>
			<label>
				Position
				<select data-testid="snippet-position" bind:value={snippetPosition}>
					<option value="after">After</option>
					<option value="before">Before</option>
					<option value="at-caret">At caret</option>
				</select>
			</label>

			{#if inheritedVisibility}
				<p class="meta" data-testid="snippet-inherited-visibility">
					Inserted content inherits the note visibility: {inheritedVisibility} (a snippet cannot widen it).
				</p>
			{/if}

			{#if insertResult}
				{#if insertResult.valid}
					<p class="meta" data-testid="snippet-insert-valid">The inserted result is valid.</p>
				{:else}
					<p class="meta" data-testid="snippet-insert-invalid">
						The inserted result would be invalid: {insertResult.validation.issues
							.map((issue) => issue.message)
							.join('; ')}
					</p>
				{/if}
			{/if}

			{#if insertPreview}
				<ul class="scene-list" data-testid="snippet-insert-preview">
					{#each insertPreview.blocks as block, index (`${block.kind}-${index}`)}
						<li data-testid={`snippet-preview-block-${index}`}>
							<span class="meta">{block.kind}:</span>
							{block.text}
						</li>
					{/each}
				</ul>
			{/if}

			{#if snippetError}
				<p class="meta" role="alert" data-testid="snippet-insert-error">{snippetError}</p>
			{/if}
			{#if snippetSummary}
				<p class="meta" data-testid="snippet-insert-summary">{snippetSummary}</p>
			{/if}
			<button type="submit" data-testid="snippet-insert-submit" disabled={!insertResult?.valid}>
				Insert snippet
			</button>
		</form>
	</section>
{/if}

<style>
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.cwrap :global(h2) {
		margin: 0;
	}
	.cwrap :global(h3) {
		margin: var(--space-2) 0 0;
		font-size: var(--text-md);
	}
	.cwrap :global(form) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.cwrap :global(label) {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.cwrap :global(input),
	.cwrap :global(select),
	.cwrap :global(textarea) {
		min-height: var(--touch-target-min);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
		font-weight: var(--font-weight-regular);
	}
	.cwrap :global(textarea) {
		resize: vertical;
	}
	.cwrap :global(.scene-list) {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	.cwrap :global(.scene-card),
	.cwrap :global(.scene-list li) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-regular);
	}
	.cwrap :global(button) {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.cwrap :global(button[type='submit']) {
		background: var(--color-accent);
		color: var(--color-accent-foreground);
		border-color: var(--color-accent);
		font-weight: var(--font-weight-semibold);
	}
	.cwrap :global([role='alert']) {
		color: var(--color-status-error-text);
	}
</style>
