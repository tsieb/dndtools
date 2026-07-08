<script lang="ts">
	import {
		CONTENT_SOURCE_IDS,
		actorCanAuthorContent,
		checkContentSourceConstraints,
		getContentItemsForActor,
		listContentSourceCapabilities,
		type ContentNoteFeature,
		type ContentSourceId,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CONTENT-012 — SOURCE-SPECIFIC CONSTRAINTS. Before a note is written back to a target SOURCE (local
	// markdown / Obsidian / Google Docs), the DM sees a PURE, read-only pre-write DIAGNOSTIC computed in
	// the Processing Core: exactly which formatting, properties, links, or unsupported embedded structures
	// would be LOST or DOWNGRADED. FAIL CLOSED — a lossy write is BLOCKED behind an explicit acknowledgment
	// and re-validated in the core on dispatch; the local draft is never lost. The transports themselves
	// are deferred per ADR-014; this surface delivers the typed constraints + pre-write visibility. The GUI
	// renders the computed model and dispatches the acknowledged write intent; it never touches storage.
	const runtime = useRuntime();

	const canAuthor = $derived(
		actorCanAuthorContent(runtime.state.permissions, runtime.activeActorId),
	);

	// The static source-capability reference table (what each source can / can't represent).
	const sourceCapabilities = listContentSourceCapabilities();

	const FEATURE_LABEL: Record<ContentNoteFeature, string> = {
		'frontmatter-properties': 'Front matter properties',
		aliases: 'Aliases',
		tags: 'Tags',
		'inline-tags': 'Inline #tags',
		wikilinks: '[[wikilinks]]',
		'dndtools-namespaced-metadata': 'DND Tools metadata',
	};

	// Actor-filtered note list (the DM, here, but the read path is always filtered — fail closed).
	const notes = $derived(
		getContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId),
	);

	let selectedItemId = $state('');
	let targetSource = $state<ContentSourceId>('google-docs');
	let acknowledged = $state(false);
	let writeError = $state<string | null>(null);
	let writeSummary = $state<string | null>(null);

	$effect(() => {
		if (selectedItemId === '' && notes.length > 0) {
			selectedItemId = notes[0]!.id;
		}
	});

	const selectedNote = $derived(notes.find((note) => note.id === selectedItemId) ?? null);

	// The PURE pre-write constraint check. Recomputed reactively from the selected note's content + target
	// source. Read-only — it never mutates the draft. Changing the note or source re-derives the token, so
	// a stale acknowledgment can never apply to a different loss profile.
	const check = $derived(
		selectedNote ? checkContentSourceConstraints(selectedNote.body, targetSource) : null,
	);

	// Reset the acknowledgment whenever the loss profile (token) changes, so an acknowledgment is always
	// for exactly the currently-shown loss (fail closed).
	$effect(() => {
		// Touch the token so the effect re-runs when it changes.
		void check?.acknowledgmentToken;
		acknowledged = false;
		writeSummary = null;
	});

	const canWrite = $derived(
		check !== null && (!check.requiresAcknowledgment || acknowledged),
	);

	async function writeToSource(): Promise<void> {
		writeError = null;
		writeSummary = null;
		if (!selectedNote || !check) {
			writeError = 'Select a note to write.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'content.write-to-source',
			actorId: runtime.activeActorId,
			payload: {
				itemId: selectedNote.id,
				source: targetSource,
				noteText: selectedNote.body,
				acknowledgmentToken: check.acknowledgmentToken,
			},
		});
		if (result.status === 'rejected') {
			writeError = result.rejection.message;
			return;
		}
		const event = result.events[0] as
			| { lossy: boolean; droppedFeatures: string[]; lossyFeatures: string[] }
			| undefined;
		writeSummary = event?.lossy
			? `Written with acknowledged loss (${event.droppedFeatures.length} dropped, ${event.lossyFeatures.length} downgraded).`
			: 'Written faithfully — no loss.';
	}
</script>

{#if canAuthor}
	<section class="cwrap" data-testid="content-source-constraints" aria-label="Source-specific note constraints">
		<h2>Source constraints</h2>

		<!-- The capability reference table (what each source can / can't represent). -->
		<details data-testid="source-capability-table">
			<summary>Note-source capabilities</summary>
			<ul class="scene-list">
				{#each sourceCapabilities as source (source.id)}
					<li data-testid={`source-capability-${source.id}`}>
						<strong>{source.displayName}</strong>
						<span class="meta">{source.summary}</span>
						<span class="meta">
							supported: {source.supported.length} • lossy: {source.lossy.length} • unsupported:
							{source.unsupported.length}
						</span>
					</li>
				{/each}
			</ul>
		</details>

		<!-- Pre-write constraint check for a selected note + target source. -->
		<form
			data-testid="write-to-source-form"
			onsubmit={(event) => {
				event.preventDefault();
				writeToSource();
			}}
		>
			<h3>Write a note to a source</h3>
			<p class="meta">
				A write that would lose or downgrade structures is shown <strong>before</strong> it commits and
				must be acknowledged — nothing is lost silently.
			</p>

			<label>
				Note
				<select data-testid="constraints-note-select" bind:value={selectedItemId}>
					{#each notes as note (note.id)}
						<option value={note.id}>{note.title}</option>
					{/each}
				</select>
			</label>
			<label>
				Target source
				<select data-testid="constraints-source-select" bind:value={targetSource}>
					{#each CONTENT_SOURCE_IDS as source (source)}
						<option value={source}>{source}</option>
					{/each}
				</select>
			</label>

			{#if check}
				<div data-testid="constraint-check" class="scene-card">
					<p class="meta" data-testid="constraint-check-status">
						{#if check.requiresAcknowledgment}
							<strong data-testid="constraint-lossy">Lossy write</strong> to {check.sourceDisplayName}:
							{check.droppedFeatures.length} dropped, {check.lossyFeatures.length} downgraded.
						{:else}
							<strong data-testid="constraint-faithful">Faithful write</strong> to
							{check.sourceDisplayName}: nothing is lost.
						{/if}
					</p>
					{#if check.diagnostics.length > 0}
						<ul class="scene-list" data-testid="constraint-diagnostics">
							{#each check.diagnostics as diagnostic (diagnostic.feature)}
								<li data-testid={`constraint-diagnostic-${diagnostic.feature}`}>
									<strong>{FEATURE_LABEL[diagnostic.feature]}</strong>
									<span class="meta" data-support={diagnostic.support}>
										• {diagnostic.support} — {diagnostic.message}
									</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="meta" data-testid="constraint-none">
							This note has no source-specific structures.
						</p>
					{/if}

					{#if check.requiresAcknowledgment}
						<label class="ack" data-testid="constraint-ack-label">
							<input
								type="checkbox"
								data-testid="constraint-ack"
								bind:checked={acknowledged}
							/>
							I understand this write will lose or downgrade the structures listed above.
						</label>
					{/if}
				</div>
			{/if}

			{#if writeError}
				<p class="meta" role="alert" data-testid="write-error">{writeError}</p>
			{/if}
			{#if writeSummary}
				<p class="meta" data-testid="write-summary">{writeSummary}</p>
			{/if}
			<button type="submit" data-testid="write-submit" disabled={!canWrite}>
				Write to source
			</button>
		</form>
	</section>
{/if}

<style>
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.cwrap :global(h2) {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
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
	.ack {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-weight: var(--font-weight-regular);
	}
	.cwrap :global([data-support='unsupported']) {
		color: var(--color-status-warning-text);
		font-weight: var(--font-weight-semibold);
	}
</style>
