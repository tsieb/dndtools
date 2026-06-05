<script lang="ts">
	import {
		actorCanAuthorContent,
		activeWikilinkQuery,
		canRetry,
		getDeletedContentItemsForActor,
		recoveryAction,
		renderMarkdownPreview,
		searchContentForActor,
		suggestWikilinkTargetsForActor,
		validateMarkdownDraft,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CONTENT-001 / CONTENT-002 — the NOTES workbench: markdown notes as the primary vault content unit.
	// An authorized editor can CREATE / READ / UPDATE / DELETE (recoverable soft-delete) / RESTORE /
	// SEARCH notes, and edit markdown with VISIBLE SAVE STATUS (the PLAT-018 lifecycle), VALIDATION
	// feedback (fail closed), a PREVIEW, and actor-filtered WIKILINK assistance. Every visible read goes
	// through the actor-filtered content query, so a player only sees/searches/links notes they may see;
	// every write dispatches a durable command — the GUI never touches storage (Architecture Contract 1).
	const runtime = useRuntime();

	const canAuthor = $derived(actorCanAuthorContent(runtime.state.permissions, runtime.activeActorId));

	// --- Search + list (actor-filtered) ---------------------------------------------------------------
	let searchQuery = $state('');
	const searchHits = $derived(
		searchContentForActor(
			runtime.state.content,
			runtime.state.permissions,
			runtime.activeActorId,
			searchQuery,
		).filter((hit) => hit.item.kind === 'note'),
	);

	// --- Selection + editor draft ---------------------------------------------------------------------
	let selectedId = $state<string | null>(null);
	let draftBody = $state('');
	let draftTitle = $state('');
	// The caret position the GUI last reported, for the wikilink-suggestion query.
	let caret = $state(0);
	let editorError = $state<string | null>(null);

	const selected = $derived(
		selectedId
			? (searchContentForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId, '').find(
					(hit) => hit.item.id === selectedId,
				)?.item ?? null)
			: null,
	);

	function openNote(id: string, title: string, body: string): void {
		selectedId = id;
		draftTitle = title;
		draftBody = body;
		editorError = null;
	}

	// --- Validation + preview (pure, deterministic) ---------------------------------------------------
	const validation = $derived(validateMarkdownDraft(draftBody));
	const preview = $derived(renderMarkdownPreview(draftBody));

	// --- Wikilink assistance (actor-filtered) ---------------------------------------------------------
	const wikilinkQuery = $derived(activeWikilinkQuery(draftBody, caret));
	const wikilinkSuggestions = $derived(
		wikilinkQuery !== null
			? suggestWikilinkTargetsForActor(
					runtime.state.content,
					runtime.state.permissions,
					runtime.activeActorId,
					wikilinkQuery,
				)
			: [],
	);

	function applyWikilink(title: string): void {
		if (wikilinkQuery === null) return;
		// Replace the in-progress `[[query` with `[[title]]` at the caret.
		const open = draftBody.slice(0, caret).lastIndexOf('[[');
		if (open === -1) return;
		draftBody = `${draftBody.slice(0, open)}[[${title}]]${draftBody.slice(caret)}`;
	}

	// --- Save status (PLAT-018 lifecycle) -------------------------------------------------------------
	const lifecycle = $derived(runtime.lastLifecycle);
	const saveStatus = $derived(
		lifecycle && (lifecycle.commandType === 'content.update-item' || lifecycle.commandType === 'content.create-item')
			? lifecycle.status
			: 'idle',
	);
	const canRetrySave = $derived(lifecycle ? canRetry(lifecycle) && lifecycle.status === 'failure' : false);
	const recovery = $derived(lifecycle ? recoveryAction(lifecycle) : 'none');

	// --- New-note form --------------------------------------------------------------------------------
	let newTitle = $state('');
	let newVisibility = $state<'dm-only' | 'player-visible' | 'shared'>('dm-only');

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		editorError = null;
		try {
			const result = await runtime.dispatch(command);
			if (result.status === 'rejected') {
				editorError = result.rejection.message;
				return false;
			}
			return true;
		} catch (error) {
			// A durable-write failure: the lifecycle is in `failure`; keep the draft for retry (AC2).
			editorError = error instanceof Error ? error.message : String(error);
			return false;
		}
	}

	async function createNote(): Promise<void> {
		const title = newTitle.trim();
		if (title === '') {
			editorError = 'Enter a note title.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'content.create-item',
			actorId: runtime.activeActorId,
			payload: { kind: 'note', title, body: '', visibility: newVisibility },
		});
		if (result.status === 'rejected') {
			editorError = result.rejection.message;
			return;
		}
		const event = result.events[0] as { itemId: string } | undefined;
		newTitle = '';
		if (event) openNote(event.itemId, title, '');
	}

	async function saveNote(): Promise<void> {
		if (!selectedId) return;
		if (!validation.valid) {
			editorError = 'Fix the validation errors before saving.';
			return;
		}
		await dispatch({
			type: 'content.update-item',
			actorId: runtime.activeActorId,
			payload: { itemId: selectedId, title: draftTitle, body: draftBody },
		});
	}

	async function deleteNote(id: string): Promise<void> {
		const ok = await dispatch({
			type: 'content.remove-item',
			actorId: runtime.activeActorId,
			payload: { itemId: id },
		});
		if (ok && selectedId === id) selectedId = null;
	}

	async function restoreNote(id: string): Promise<void> {
		await dispatch({
			type: 'content.restore-item',
			actorId: runtime.activeActorId,
			payload: { itemId: id },
		});
	}

	const deletedNotes = $derived(
		getDeletedContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId).filter(
			(item) => item.kind === 'note',
		),
	);
</script>

<section data-testid="notes-workbench" aria-label="Notes">
	<h2>Notes</h2>
	<p class="meta">
		Markdown notes are the primary content unit of the vault. Search, read, and (for an authorized
		editor) create, edit, delete, and restore notes. Players only ever see notes their visibility
		permits.
	</p>

	{#if editorError}
		<p class="meta" role="alert" data-testid="notes-error">{editorError}</p>
	{/if}

	<!-- CONTENT-001: actor-filtered search -->
	<label>
		Search notes
		<input
			data-testid="notes-search"
			type="search"
			bind:value={searchQuery}
			autocomplete="off"
			placeholder="Search titles and body…"
		/>
	</label>

	{#if searchHits.length === 0}
		<p class="meta" data-testid="notes-empty">No notes match your search.</p>
	{:else}
		<ul class="scene-list" data-testid="notes-list">
			{#each searchHits as hit (hit.item.id)}
				<li class="scene-card" data-testid={`note-row-${hit.item.id}`}>
					<button
						type="button"
						data-testid={`note-open-${hit.item.id}`}
						onclick={() => openNote(hit.item.id, hit.item.title, hit.item.body)}
					>
						{hit.item.title}
					</button>
					<span class="meta"> • {hit.item.visibility}</span>
					{#if hit.snippet}
						<div class="meta" data-testid={`note-snippet-${hit.item.id}`}>{hit.snippet.text}</div>
					{/if}
					{#if canAuthor}
						<button
							type="button"
							data-testid={`note-delete-${hit.item.id}`}
							onclick={() => deleteNote(hit.item.id)}
						>
							Delete
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if canAuthor}
		<!-- CONTENT-001: create a note -->
		<form
			data-testid="note-create-form"
			onsubmit={(event) => {
				event.preventDefault();
				createNote();
			}}
		>
			<h3>New note</h3>
			<label>
				Title
				<input data-testid="note-new-title" bind:value={newTitle} autocomplete="off" />
			</label>
			<label>
				Visibility
				<select data-testid="note-new-visibility" bind:value={newVisibility}>
					<option value="dm-only">DM only</option>
					<option value="player-visible">Player visible</option>
					<option value="shared">Shared</option>
				</select>
			</label>
			<button type="submit" data-testid="note-create">Create note</button>
		</form>
	{/if}

	<!-- CONTENT-002: the editor (authorized editor only) -->
	{#if selected && canAuthor}
		<section class="scene-card" data-testid="note-editor" aria-label="Note editor">
			<h3>Editing: {selected.title}</h3>

			<!-- Visible save status (PLAT-018 lifecycle) -->
			<p class="meta" data-testid="note-save-status">
				Save status:
				<strong data-testid="note-save-status-value">{saveStatus}</strong>
			</p>
			{#if canRetrySave}
				<button type="button" data-testid="note-save-retry" onclick={saveNote}>Retry save</button>
				<p class="meta" role="alert" data-testid="note-save-error">{lifecycle?.error}</p>
			{/if}
			{#if recovery === 'undo'}
				<p class="meta" data-testid="note-undo-available">This save can be undone.</p>
			{/if}

			<label>
				Title
				<input data-testid="note-title" bind:value={draftTitle} autocomplete="off" />
			</label>

			<label>
				Body (markdown)
				<textarea
					data-testid="note-body"
					bind:value={draftBody}
					rows="8"
					autocomplete="off"
					onkeyup={(event) => (caret = event.currentTarget.selectionStart ?? draftBody.length)}
					onclick={(event) => (caret = event.currentTarget.selectionStart ?? draftBody.length)}
				></textarea>
			</label>

			<!-- CONTENT-002: wikilink assistance (actor-filtered suggestions) -->
			{#if wikilinkQuery !== null && wikilinkSuggestions.length > 0}
				<div data-testid="note-wikilink-suggestions" aria-label="Wikilink suggestions">
					<p class="meta">Link to:</p>
					<ul class="scene-list">
						{#each wikilinkSuggestions as suggestion (suggestion.itemId)}
							<li>
								<button
									type="button"
									data-testid={`wikilink-suggest-${suggestion.itemId}`}
									onclick={() => applyWikilink(suggestion.title)}
								>
									[[{suggestion.title}]]
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- CONTENT-002: validation feedback (fail closed) -->
			{#if !validation.valid}
				<ul class="scene-list" data-testid="note-validation" aria-label="Validation issues">
					{#each validation.issues as issue, index (index)}
						<li class="meta" role="alert" data-testid={`note-validation-${issue.code}`}>
							{issue.severity}: {issue.message}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="meta" data-testid="note-validation-ok">Markdown is valid.</p>
			{/if}

			<button type="button" data-testid="note-save" onclick={saveNote} disabled={!validation.valid}>
				Save
			</button>

			<!-- CONTENT-002: preview -->
			<div class="scene-card" data-testid="note-preview" aria-label="Preview">
				<h4>Preview</h4>
				{#each preview.blocks as block, index (index)}
					{#if block.kind === 'heading'}
						<p class="preview-heading" data-testid="preview-heading">{block.text}</p>
					{:else if block.kind === 'list-item'}
						<p class="preview-list-item" data-testid="preview-list-item">• {block.text}</p>
					{:else}
						<p data-testid="preview-paragraph">{block.text}</p>
					{/if}
				{/each}
				{#if preview.tags.length > 0}
					<p class="meta" data-testid="preview-tags">Tags: {preview.tags.join(', ')}</p>
				{/if}
			</div>
		</section>
	{/if}

	<!-- CONTENT-001: recycle bin (DM-only restore) -->
	{#if canAuthor && deletedNotes.length > 0}
		<section data-testid="notes-recycle-bin" aria-label="Deleted notes">
			<h3>Recently deleted</h3>
			<ul class="scene-list">
				{#each deletedNotes as item (item.id)}
					<li class="scene-card" data-testid={`note-deleted-${item.id}`}>
						<span>{item.title}</span>
						<button type="button" data-testid={`note-restore-${item.id}`} onclick={() => restoreNote(item.id)}>
							Restore
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</section>

<style>
	.preview-heading {
		font-weight: 600;
		margin: 0.25rem 0;
	}
	.preview-list-item {
		margin: 0.1rem 0 0.1rem 0.5rem;
	}
</style>
