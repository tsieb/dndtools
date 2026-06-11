<script lang="ts">
	import { page } from '$app/state';
	import {
		actorCanAuthorContent,
		activeWikilinkQuery,
		canRetry,
		evaluateVisibilityChangeConflict,
		getDeletedContentItemsForActor,
		getNoteRelationshipsForActor,
		recoveryAction,
		renderMarkdownPreview,
		resolveContentVisibilityBadge,
		resolveContentVisibilityToggle,
		saveStateAnnouncement,
		searchContentForActor,
		suggestWikilinkTargetsForActor,
		validateMarkdownDraft,
		CONTENT_ITEM_ENTITY_TYPE,
		type VisibilityLevel,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import VisibilityBadge from './ux-perm/VisibilityBadge.svelte';
	import VisibilityToggle from './ux-perm/VisibilityToggle.svelte';

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

	// GRAPH-002 — BACKLINKS, CROSS-SECTION links, and RELATED-NOTE jumps for the open note, ACTOR-FILTERED.
	// Computed in the Processing Core over the actor's VISIBLE link graph: a hidden/deleted backlink source is
	// absent (never redacted), snippets are suppressed for partially-hidden sources, and the relationships of a
	// note the actor cannot see come back empty (fail closed). The GUI renders the computed model and navigates
	// by re-selecting the related note through the SAME actor-filtered read (Architecture Contract 1).
	const relationships = $derived(
		selectedId
			? getNoteRelationshipsForActor(
					runtime.state.content,
					runtime.state.permissions,
					runtime.activeActorId,
					selectedId,
				)
			: null,
	);

	// Open a backlink source / related note: re-resolve it through the actor-filtered content read so a note the
	// running actor may no longer see is simply never opened (fail closed; a stale jump degrades gracefully).
	function openRelated(id: string): void {
		const item = searchContentForActor(
			runtime.state.content,
			runtime.state.permissions,
			runtime.activeActorId,
			'',
		).find((hit) => hit.item.id === id && hit.item.kind === 'note')?.item;
		if (item) openNote(item.id, item.title, item.body);
	}

	// SRCH-007 AC2 — open a note SELECTED BY a deep link / search-result open: `/knowledge/?note=<id>#<anchor>`.
	// The note id is the in-section selection; the core already re-checked visibility before producing the
	// link, but we re-resolve through the SAME actor-filtered read here too, so a note the running actor may
	// not see is simply never selected (fail closed). The heading hash is left to the browser to scroll to.
	let lastOpenedFromUrl = $state<string | null>(null);
	$effect(() => {
		const requested = page.url.searchParams.get('note');
		if (!requested || requested === lastOpenedFromUrl) return;
		const item = searchContentForActor(
			runtime.state.content,
			runtime.state.permissions,
			runtime.activeActorId,
			'',
		).find((hit) => hit.item.id === requested && hit.item.kind === 'note')?.item;
		lastOpenedFromUrl = requested;
		if (item) openNote(item.id, item.title, item.body);
	});

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
	// Early-return shape rather than `x && (x.a === y || x.a === z)`: the production minifier
	// mis-associates that compound condition into a null `commandType` read, which threw on every
	// /knowledge mount with no prior command and poisoned the surrounding effect flush.
	const saveStatus = $derived.by(() => {
		if (!lifecycle) return 'idle';
		if (lifecycle.commandType === 'content.update-item') return lifecycle.status;
		if (lifecycle.commandType === 'content.create-item') return lifecycle.status;
		return 'idle';
	});
	const canRetrySave = $derived(lifecycle ? canRetry(lifecycle) && lifecycle.status === 'failure' : false);
	const recovery = $derived(lifecycle ? recoveryAction(lifecycle) : 'none');

	// A11Y-006 AC1 — emit a CONCISE live announcement when the save lifecycle transitions.
	// Dedup: only re-announce when the status key changes, so a re-render that produces the same
	// saveStatus does not re-fire the live region.
	let saveAnnouncement = $state('');
	let _prevSaveStatus = $state<string | null>(null);
	$effect(() => {
		const text = saveStateAnnouncement(saveStatus as Parameters<typeof saveStateAnnouncement>[0]);
		if (saveStatus === _prevSaveStatus) return;
		_prevSaveStatus = saveStatus;
		saveAnnouncement = text;
	});

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
		const ok = await dispatch({
			type: 'content.update-item',
			actorId: runtime.activeActorId,
			payload: { itemId: selectedId, title: draftTitle, body: draftBody },
		});
		// UX-CONTENT-004 — baseline the saved values so the autosave chip reads "Saved" (clean). Done
		// here rather than off the lifecycle status, which can stay 'success' across saves and not re-fire.
		if (ok) {
			savedBody = draftBody;
			savedTitle = draftTitle;
		}
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

	// --- UX-CONTENT-001/002/003/004/005/007: editor shell + writing controls -------------------------
	let bodyEl = $state<HTMLTextAreaElement | null>(null);
	let focusMode = $state(false);
	let previewOpen = $state(false);

	// UX-CONTENT-004 — autosave: the last successfully-saved values, so the chip reads "dirty" vs
	// "saved", and a debounced autosave only fires when the draft actually changed and validates.
	let savedBody = $state('');
	let savedTitle = $state('');
	const dirty = $derived(selectedId !== null && (draftBody !== savedBody || draftTitle !== savedTitle));
	let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		// Track the dependencies that should (re)arm the debounce.
		const _b = draftBody;
		const _t = draftTitle;
		void _b;
		void _t;
		if (!selectedId || !dirty || !validation.valid) return;
		if (autosaveTimer) clearTimeout(autosaveTimer);
		if (typeof setTimeout === 'undefined') return;
		autosaveTimer = setTimeout(() => {
			if (dirty && validation.valid) void saveNote();
		}, 2000);
		return () => clearTimeout(autosaveTimer);
	});

	// The save chip's presentation state (UX-CONTENT-004 §four states).
	type ChipState = 'saved' | 'saving' | 'failed' | 'unsaved';
	const chipState = $derived.by<ChipState>(() => {
		if (saveStatus === 'pending') return 'saving';
		if (saveStatus === 'failure') return 'failed';
		if (dirty) return 'unsaved';
		return 'saved';
	});
	const CHIP_TEXT: Record<ChipState, string> = {
		saved: '✓ Saved',
		saving: '⟳ Saving…',
		failed: '✕ Save failed — retry',
		unsaved: '• Unsaved changes',
	};

	// Keep the saved baseline in step when a note opens or a save lands.
	let _trackedNote = '';
	$effect(() => {
		if (selectedId && selectedId !== _trackedNote) {
			_trackedNote = selectedId;
			savedBody = draftBody;
			savedTitle = draftTitle;
		}
	});

	const wordCount = $derived(draftBody.trim() === '' ? 0 : draftBody.trim().split(/\s+/).length);

	// UX-CONTENT-002 — wrap the current selection (or insert at caret) with markdown delimiters.
	function surround(before: string, after: string): void {
		const el = bodyEl;
		if (!el) return;
		const s = el.selectionStart ?? draftBody.length;
		const e = el.selectionEnd ?? s;
		draftBody = draftBody.slice(0, s) + before + draftBody.slice(s, e) + after + draftBody.slice(e);
		queueMicrotask(() => {
			el.focus();
			el.setSelectionRange(s + before.length, e + before.length);
		});
	}
	// UX-CONTENT-002 — prefix the caret's line (headings, lists).
	function linePrefix(prefix: string): void {
		const el = bodyEl;
		if (!el) return;
		const s = el.selectionStart ?? draftBody.length;
		const lineStart = draftBody.lastIndexOf('\n', s - 1) + 1;
		draftBody = draftBody.slice(0, lineStart) + prefix + draftBody.slice(lineStart);
		queueMicrotask(() => {
			el.focus();
			el.setSelectionRange(s + prefix.length, s + prefix.length);
		});
	}
	const FORMATS = {
		bold: () => surround('**', '**'),
		italic: () => surround('_', '_'),
		link: () => surround('[', '](https://)'),
		code: () => surround('`', '`'),
		heading: () => linePrefix('## '),
		list: () => linePrefix('- '),
	} as const;

	function onBodyKeydown(event: KeyboardEvent): void {
		const mod = event.metaKey || event.ctrlKey;
		if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); FORMATS.bold(); }
		else if (mod && event.key.toLowerCase() === 'i') { event.preventDefault(); FORMATS.italic(); }
		else if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); FORMATS.link(); }
		else if (event.key === 'Escape' && slashOpen) { event.preventDefault(); slashOpen = false; }
	}

	// UX-CONTENT-003 — slash insert menu: typing `/` at the start of a line opens a block-insert menu.
	let slashOpen = $state(false);
	const SLASH_ITEMS: { id: string; label: string; desc: string; apply: () => void }[] = [
		{ id: 'h2', label: 'Heading', desc: 'Section heading', apply: () => insertBlock('## ') },
		{ id: 'quote', label: 'Quote', desc: 'Block quote', apply: () => insertBlock('> ') },
		{ id: 'list', label: 'Bulleted list', desc: 'List item', apply: () => insertBlock('- ') },
		{ id: 'code', label: 'Code block', desc: 'Fenced code', apply: () => insertBlock('```\n\n```') },
		{ id: 'divider', label: 'Divider', desc: 'Horizontal rule', apply: () => insertBlock('---\n') },
	];
	function onBodyInput(): void {
		const el = bodyEl;
		if (!el) return;
		caret = el.selectionStart ?? draftBody.length;
		const before = draftBody.slice(0, caret);
		// `/` as the only char on the current line opens the menu.
		slashOpen = /(^|\n)\/$/.test(before);
	}
	function insertBlock(markdown: string): void {
		// Replace the trailing `/` (which opened the menu) with the chosen block.
		const el = bodyEl;
		const at = caret;
		draftBody = draftBody.slice(0, at - 1) + markdown + draftBody.slice(at);
		slashOpen = false;
		queueMicrotask(() => {
			el?.focus();
			const pos = at - 1 + markdown.length;
			el?.setSelectionRange(pos, pos);
		});
	}

	function exitFocusMode(): void {
		focusMode = false;
	}
</script>

<!-- A11Y-006 AC1 — concise save-state announcements. Always present so AT registers the region;
     text is set only on meaningful lifecycle transitions (pending → success, etc.). Failure is
     announced as role="alert" by the inline error element; we use polite here for non-critical
     status transitions. -->
<div class="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="note-save-announcement">{saveAnnouncement}</div>

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
				<!-- UX-PERM-007: the ambient visibility badge, resolved through the DM-only core
				     choke point — null for a player/observer, so their rows carry NO badge and no
				     visibility text at all (AC3). dm-only rows are marked without hovering (AC1);
				     section/field overrides surface as "Mixed" (AC2). -->
				{@const badge = resolveContentVisibilityBadge(
					runtime.state.content,
					runtime.state.permissions,
					runtime.activeActorId,
					hit.item.id,
				)}
				<li class="scene-card" data-testid={`note-row-${hit.item.id}`}>
					<button
						type="button"
						data-testid={`note-open-${hit.item.id}`}
						onclick={() => openNote(hit.item.id, hit.item.title, hit.item.body)}
					>
						{hit.item.title}
					</button>
					{#if badge}
						<VisibilityBadge {badge} testid={`note-visibility-badge-${hit.item.id}`} />
					{/if}
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
		<!-- UX-PERM-001: the entity-level 3-state visibility toggle in the note's header. The
		     core resolver is the DM-only choke point: null for a player/observer, so the toggle
		     is NOT RENDERED for them (AC3). The entity is in edit mode here, so the full
		     3-segment group is persistently visible (§inline placement). Changing to dm-only
		     with active grants surfaces the inline conflict warning BEFORE dispatch (AC2). -->
		{@const selectedItemId = selected.id}
		{@const visibilityView = resolveContentVisibilityToggle(
			runtime.state.content,
			runtime.state.permissions,
			runtime.activeActorId,
			selectedItemId,
		)}
		<section class="editor" data-testid="note-editor" data-focus={focusMode} aria-label="Note editor">
			<h3 class="editor__heading">Editing: {selected.title}</h3>
			{#if visibilityView}
				<VisibilityToggle
					view={visibilityView}
					label="Content visibility"
					testid="note-visibility"
					conflict={(level: VisibilityLevel) =>
						evaluateVisibilityChangeConflict(
							runtime.state.permissions,
							CONTENT_ITEM_ENTITY_TYPE,
							selectedItemId,
							level,
						)}
					onchange={async (level: VisibilityLevel) => {
						await dispatch({
							type: 'content.set-item-visibility',
							actorId: runtime.activeActorId,
							payload: { itemId: selectedItemId, visibility: level },
						});
					}}
				/>
			{/if}

			<!-- UX-CONTENT-004 — persistent autosave status chip. The visible label carries the state;
			     the raw lifecycle status is kept (sr-only) for assertions. Clicking the chip while failed
			     retries immediately. The chip stays visible in focus mode (save state must never hide). -->
			<div class="editor__statusbar">
				<button
					type="button"
					class="save-chip"
					data-testid="note-save-status"
					data-state={chipState}
					aria-label={chipState === 'failed' ? 'Save failed — activate to retry' : `Autosave: ${chipState}`}
					disabled={chipState !== 'failed'}
					onclick={saveNote}
				>
					{CHIP_TEXT[chipState]}
					<span class="visually-hidden" data-testid="note-save-status-value">{saveStatus}</span>
				</button>
			</div>

			<!-- UX-CONTENT-002 — the markdown formatting toolbar (primary six + overflow). Shortcuts
			     Ctrl/Cmd+B / +I / +K work from the body too. -->
			<div class="toolbar" role="toolbar" aria-label="Formatting">
				<button type="button" class="fmt" data-testid="note-fmt-bold" aria-label="Bold (Ctrl+B)" title="Bold (Ctrl+B)" onclick={FORMATS.bold}><b>B</b></button>
				<button type="button" class="fmt" data-testid="note-fmt-italic" aria-label="Italic (Ctrl+I)" title="Italic (Ctrl+I)" onclick={FORMATS.italic}><i>I</i></button>
				<button type="button" class="fmt" data-testid="note-fmt-link" aria-label="Link (Ctrl+K)" title="Link (Ctrl+K)" onclick={FORMATS.link}>🔗</button>
				<button type="button" class="fmt" data-testid="note-fmt-code" aria-label="Inline code" title="Inline code" onclick={FORMATS.code}>&lt;&gt;</button>
				<button type="button" class="fmt" data-testid="note-fmt-heading" aria-label="Heading" title="Heading" onclick={FORMATS.heading}>H</button>
				<button type="button" class="fmt" data-testid="note-fmt-list" aria-label="Bulleted list" title="Bulleted list" onclick={FORMATS.list}>≡</button>
				<span class="toolbar__sep" aria-hidden="true"></span>
				<button type="button" class="fmt" data-testid="note-preview-toggle" aria-pressed={previewOpen} aria-label="Split preview" title="Split preview" onclick={() => (previewOpen = !previewOpen)}>⊟</button>
				<button type="button" class="fmt" data-testid="note-focus-toggle" aria-pressed={focusMode} aria-label="Focus mode" title="Focus mode" onclick={() => (focusMode = !focusMode)}>⤢</button>
			</div>

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

			<!-- UX-CONTENT-001/005 — the writing area + the rendered preview as adjacent panes (split when
			     toggled). UX-CONTENT-003 slash insert opens from `/` at line start. -->
			<div class="editor__panes" data-split={previewOpen}>
				<div class="writing">
					<label class="writing__label">
						<span class="visually-hidden">Note body (markdown)</span>
						<textarea
							class="prose"
							data-testid="note-body"
							bind:this={bodyEl}
							bind:value={draftBody}
							rows="14"
							autocomplete="off"
							aria-label="Note body"
							aria-multiline="true"
							onkeydown={onBodyKeydown}
							oninput={onBodyInput}
							onkeyup={(event) => (caret = event.currentTarget.selectionStart ?? draftBody.length)}
							onclick={(event) => (caret = event.currentTarget.selectionStart ?? draftBody.length)}
						></textarea>
					</label>

					<!-- UX-CONTENT-003: slash insert menu (block types). -->
					{#if slashOpen}
						<ul class="slash-menu" role="listbox" aria-label="Insert block type" data-testid="note-slash-menu">
							{#each SLASH_ITEMS as item (item.id)}
								<li role="option" aria-selected="false">
									<button type="button" class="slash-item" data-testid={`note-slash-${item.id}`} onclick={item.apply}>
										<span class="slash-item__label">{item.label}</span>
										<span class="slash-item__desc">{item.desc}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}

					<!-- CONTENT-002: wikilink assistance (actor-filtered suggestions) -->
					{#if wikilinkQuery !== null && wikilinkSuggestions.length > 0}
						<div class="wikilinks" data-testid="note-wikilink-suggestions" aria-label="Wikilink suggestions">
							<p class="meta">Link to:</p>
							<ul class="wikilinks__list">
								{#each wikilinkSuggestions as suggestion (suggestion.itemId)}
									<li>
										<button type="button" class="wikilink-suggest" data-testid={`wikilink-suggest-${suggestion.itemId}`} onclick={() => applyWikilink(suggestion.title)}>
											[[{suggestion.title}]]
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

				<!-- CONTENT-002/005: rendered preview pane (always available; lays out beside the editor when split). -->
				<div class="preview-pane" data-testid="note-preview" aria-label="Rendered preview" aria-readonly="true">
					<h4 class="preview-pane__title">Preview</h4>
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
			</div>

			<!-- CONTENT-002: validation feedback (fail closed) -->
			{#if !validation.valid}
				<ul class="validation" data-testid="note-validation" aria-label="Validation issues">
					{#each validation.issues as issue, index (index)}
						<li class="meta" role="alert" data-testid={`note-validation-${issue.code}`}>
							{issue.severity}: {issue.message}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="meta" data-testid="note-validation-ok">Markdown is valid.</p>
			{/if}

			<div class="editor__foot">
				<button type="button" class="button" data-testid="note-save" onclick={saveNote} disabled={!validation.valid}>
					Save
				</button>
				{#if focusMode}
					<span class="word-count" data-testid="note-word-count" aria-hidden="true">{wordCount} words</span>
					<button type="button" class="button secondary" data-testid="note-focus-exit" onclick={exitFocusMode}>Exit focus</button>
				{/if}
			</div>
		</section>
	{/if}

	<!-- GRAPH-002: backlinks, cross-section links, and related-note jumps for the open note. Rendered for ANY
	     actor who can open a visible note (the panel itself is read-only navigation), so a player inspecting a
	     visible note can jump through its visible relationships. Every entry is actor-filtered in the core. -->
	{#if selected && relationships}
		<section class="scene-card" data-testid="note-relationships" aria-label="Note relationships">
			<h3>Relationships</h3>

			<h4>Backlinks</h4>
			{#if relationships.backlinks.length === 0}
				<p class="meta" data-testid="note-backlinks-empty">No notes link to this one.</p>
			{:else}
				<ul class="scene-list" data-testid="note-backlinks">
					{#each relationships.backlinks as backlink (backlink.sourceId)}
						<li class="scene-card" data-testid={`note-backlink-${backlink.sourceId}`}>
							<button
								type="button"
								data-testid={`note-backlink-open-${backlink.sourceId}`}
								onclick={() => openRelated(backlink.sourceId)}
							>
								{backlink.sourceTitle}
							</button>
							{#if backlink.crossSection.status === 'resolved'}
								<span class="meta" data-testid={`note-backlink-section-${backlink.sourceId}`}>
									→ #{backlink.crossSection.label}
								</span>
							{:else if backlink.crossSection.status === 'section-missing'}
								<span class="meta" data-testid={`note-backlink-section-missing-${backlink.sourceId}`}>
									→ #{backlink.crossSection.label} (section not found)
								</span>
							{/if}
							{#if backlink.snippet}
								<div class="meta" data-testid={`note-backlink-snippet-${backlink.sourceId}`}>
									{backlink.snippet}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			<h4>Related notes</h4>
			{#if relationships.related.length === 0}
				<p class="meta" data-testid="note-related-empty">This note links to no other visible notes.</p>
			{:else}
				<ul class="scene-list" data-testid="note-related">
					{#each relationships.related as jump (jump.relatedId)}
						<li data-testid={`note-related-${jump.relatedId}`}>
							<button
								type="button"
								data-testid={`note-related-open-${jump.relatedId}`}
								onclick={() => openRelated(jump.relatedId)}
							>
								{jump.relatedTitle}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
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
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.editor__heading {
		margin: 0;
	}
	/* UX-CONTENT-004 — autosave chip. */
	.editor__statusbar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.save-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
		border-radius: var(--radius-full);
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-text-secondary);
	}
	.save-chip[data-state='saving'] {
		color: var(--color-text-secondary);
	}
	.save-chip[data-state='unsaved'] {
		color: var(--color-text-secondary);
	}
	.save-chip[data-state='failed'] {
		color: var(--color-status-error-text);
		background: var(--color-status-error-subtle);
		border-color: var(--color-status-error);
		cursor: pointer;
	}
	.save-chip[data-state='saved'] {
		color: var(--color-status-success-text);
	}
	/* UX-CONTENT-002 — toolbar. */
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		position: sticky;
		top: 0;
		padding: var(--space-1);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.fmt {
		min-width: var(--touch-target-min);
		min-height: var(--touch-target-min);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: var(--color-text-primary);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: var(--text-sm);
	}
	.fmt:hover {
		background: var(--color-interactive-hover);
	}
	.fmt[aria-pressed='true'] {
		background: var(--color-interactive-selected);
		border-color: var(--color-accent-border);
	}
	.toolbar__sep {
		width: 1px;
		align-self: stretch;
		background: var(--color-border);
		margin: 0 var(--space-1);
	}
	/* UX-CONTENT-001/005 — writing area + panes. */
	.editor__panes {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
		align-items: start;
	}
	.editor__panes[data-split='true'] {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}
	.writing {
		position: relative;
		min-width: 0;
	}
	.writing__label {
		display: block;
	}
	.prose {
		width: 100%;
		max-width: 720px;
		margin: 0 auto;
		display: block;
		min-height: 18rem;
		padding: var(--space-8) var(--space-6);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-sans);
		font-size: var(--text-md);
		line-height: var(--leading-relaxed);
		resize: vertical;
	}
	.slash-menu {
		position: absolute;
		z-index: var(--z-popover, 50);
		top: var(--space-10);
		left: var(--space-6);
		width: 20rem;
		max-width: calc(100% - var(--space-8));
		max-height: 20rem;
		overflow-y: auto;
		list-style: none;
		margin: 0;
		padding: var(--space-1);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}
	.slash-item {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: var(--touch-target-min);
		text-align: left;
		padding: var(--space-1) var(--space-2);
		background: transparent;
		color: var(--color-text-primary);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.slash-item:hover {
		background: var(--color-interactive-hover);
	}
	.slash-item__desc {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.wikilinks {
		margin-top: var(--space-2);
	}
	.wikilinks__list {
		list-style: none;
		margin: var(--space-1) 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.wikilink-suggest {
		min-height: var(--touch-target-floor);
		padding: var(--space-0-5) var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		background: var(--color-surface-sunken);
		color: var(--color-text-link);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.preview-pane {
		padding: var(--space-4) var(--space-6);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		max-width: 720px;
		margin: 0 auto;
		width: 100%;
	}
	.preview-pane__title {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}
	.preview-heading {
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-lg);
		margin: var(--space-2) 0;
	}
	.preview-list-item {
		margin: var(--space-0-5) 0 var(--space-0-5) var(--space-3);
	}
	.validation {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		color: var(--color-status-error-text);
	}
	.editor__foot {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.word-count {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	/* UX-CONTENT-007 — focus mode: hide chrome except the writing area + save chip + word count. */
	.editor[data-focus='true'] .editor__heading,
	.editor[data-focus='true'] .toolbar,
	.editor[data-focus='true'] :global(.visibility-toggle),
	.editor[data-focus='true'] .preview-pane {
		display: none;
	}
	.editor[data-focus='true'] .editor__panes[data-split='true'] {
		grid-template-columns: minmax(0, 1fr);
	}
</style>
