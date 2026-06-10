<script lang="ts">
	import {
		CONTENT_EXPORT_MODES,
		IMPORT_CONFLICT_POLICIES,
		actorCanAuthorContent,
		previewContentImport,
		type ContentExport,
		type ContentExportMode,
		type ImportConflictPolicy,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CONTENT-007 / CONTENT-008: the IMPORT / EXPORT surface for the Knowledge section. Per ADR-014 the
	// prototype operates on PROVIDED TEXT (no real filesystem picker): the DM pastes one or more markdown
	// "files" (a `===== path =====` separated archive). Import shows a PURE, read-only PREVIEW (collisions
	// + preserved/unsupported metadata + the conflict-policy action) before any write, then commits a
	// transactional, resumable import. Export produces portable markdown + a validation report; the
	// portable mode omits dm-only/hidden content and scrubs secrets/paths (fail-closed). All authoring is
	// DM-only ergonomically; the Processing Core re-checks fail-closed. The GUI never touches storage.
	const runtime = useRuntime();

	const canAuthor = $derived(
		actorCanAuthorContent(runtime.state.permissions, runtime.activeActorId),
	);

	// Import form state.
	let archiveText = $state('');
	let sourceKind = $state<'markdown-archive' | 'obsidian-vault'>('obsidian-vault');
	let policy = $state<ImportConflictPolicy>('skip');
	let importError = $state<string | null>(null);
	let importSummary = $state<string | null>(null);

	// Export form state.
	let exportMode = $state<ContentExportMode>('portable');
	let exportResult = $state<ContentExport | null>(null);
	let exportError = $state<string | null>(null);

	const ARCHIVE_PLACEHOLDER =
		'===== lore/Highmoor.md =====\n---\ntitle: Highmoor\ntags: [location]\n---\nAn ancient keep [[Bane]].';

	const players = $derived(runtime.actors.filter((actor) => actor.role === 'player'));
	let portableViewerActorId = $state('');
	$effect(() => {
		if (portableViewerActorId === '' && players.length > 0) {
			portableViewerActorId = players[0]!.id;
		}
	});

	/**
	 * Parse the pasted archive into files. A `===== relative/path.md =====` header line starts a new
	 * file; everything until the next header is that file's text. With no header the whole text is one
	 * `untitled.md`. Pure string handling in the GUI — the core does the durable parse.
	 */
	function parseArchive(text: string): Array<{ path: string; text: string }> {
		const lines = text.split(/\r?\n/);
		const files: Array<{ path: string; text: string }> = [];
		let currentPath: string | null = null;
		let buffer: string[] = [];
		const flush = () => {
			if (currentPath !== null) {
				files.push({ path: currentPath, text: buffer.join('\n').trim() });
			}
		};
		for (const line of lines) {
			const header = /^=====\s*(.+?)\s*=====\s*$/.exec(line);
			if (header) {
				flush();
				currentPath = header[1]!;
				buffer = [];
			} else {
				buffer.push(line);
			}
		}
		flush();
		if (files.length === 0 && text.trim() !== '') {
			files.push({ path: 'untitled.md', text: text.trim() });
		}
		return files;
	}

	const previewFiles = $derived(parseArchive(archiveText));
	const preview = $derived(
		previewFiles.length > 0
			? previewContentImport(runtime.state.content, previewFiles, sourceKind, policy)
			: null,
	);

	async function commitImport(): Promise<void> {
		importError = null;
		importSummary = null;
		const files = parseArchive(archiveText);
		if (files.length === 0) {
			importError = 'Paste at least one markdown file to import.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'content.commit-import',
			actorId: runtime.activeActorId,
			payload: { sourceKind, policy, files, appliedEntryIds: [] },
		});
		if (result.status === 'rejected') {
			importError = result.rejection.message;
			return;
		}
		const event = result.events[0] as
			| { createdItemIds: string[]; overwrittenItemIds: string[] }
			| undefined;
		const created = event?.createdItemIds.length ?? 0;
		const overwritten = event?.overwrittenItemIds.length ?? 0;
		importSummary = `Imported ${created} new and ${overwritten} overwritten item(s).`;
		archiveText = '';
	}

	async function runExport(): Promise<void> {
		exportError = null;
		exportResult = null;
		const result = await runtime.dispatch({
			type: 'content.export',
			actorId: runtime.activeActorId,
			payload: { mode: exportMode, portableViewerActorId },
		});
		if (result.status === 'rejected') {
			exportError = result.rejection.message;
			return;
		}
		const event = result.events[0] as { export: ContentExport } | undefined;
		exportResult = event?.export ?? null;
	}
</script>

{#if canAuthor}
	<section data-testid="content-import-export" aria-label="Content import and export">
		<h2>Import &amp; export</h2>

		<!-- CONTENT-007: import -->
		<form
			data-testid="content-import-form"
			onsubmit={(event) => {
				event.preventDefault();
				commitImport();
			}}
		>
			<h3>Import markdown / Obsidian vault</h3>
			<p class="meta">
				Paste markdown files, each preceded by a <code>===== path.md =====</code> header. Front matter
				properties, <code>aliases</code>, <code>tags</code>, and <code>[[wikilinks]]</code> are
				preserved. New items default to <strong>dm-only</strong> unless the file sets
				<code>dndtools.visibility</code>.
			</p>

			<label>
				Source
				<select data-testid="import-source-kind" bind:value={sourceKind}>
					<option value="obsidian-vault">Obsidian vault</option>
					<option value="markdown-archive">Markdown archive</option>
				</select>
			</label>
			<label>
				Conflict policy
				<select data-testid="import-policy" bind:value={policy}>
					{#each IMPORT_CONFLICT_POLICIES as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
			<label>
				Archive
				<textarea
					data-testid="import-archive"
					bind:value={archiveText}
					rows="6"
					autocomplete="off"
					placeholder={ARCHIVE_PLACEHOLDER}
				></textarea>
			</label>

			{#if preview}
				<div data-testid="import-preview" class="scene-card">
					<p class="meta">
						Preview: {preview.summary.total} file(s) — {preview.summary.collisions} collision(s).
					</p>
					<ul class="scene-list">
						{#each preview.entries as entry (entry.entryId)}
							<li data-testid={`import-preview-${entry.entryId}`}>
								<strong>{entry.title}</strong>
								<span class="meta">
									• {entry.action}{entry.collides ? ' (collides)' : ''} • tags
									{entry.preserved.tags} • aliases {entry.preserved.aliases} • links
									{entry.preserved.wikilinks}
								</span>
								{#if entry.unsupportedProperties.length > 0}
									<span class="meta">
										• preserved props: {entry.unsupportedProperties.join(', ')}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if importError}
				<p class="meta" role="alert" data-testid="import-error">{importError}</p>
			{/if}
			{#if importSummary}
				<p class="meta" data-testid="import-summary">{importSummary}</p>
			{/if}
			<button type="submit" data-testid="import-submit">Import</button>
		</form>

		<!-- CONTENT-008: export -->
		<form
			data-testid="content-export-form"
			onsubmit={(event) => {
				event.preventDefault();
				runExport();
			}}
		>
			<h3>Export portable markdown</h3>
			<p class="meta">
				A <strong>portable</strong> export omits dm-only/hidden content and scrubs device-local
				secrets and absolute paths. A <strong>DM backup</strong> includes hidden content but still
				scrubs secrets and paths.
			</p>
			<label>
				Mode
				<select data-testid="export-mode" bind:value={exportMode}>
					{#each CONTENT_EXPORT_MODES as mode (mode)}
						<option value={mode}>{mode}</option>
					{/each}
				</select>
			</label>
			{#if exportMode === 'portable'}
				<label>
					Share as (player)
					<select data-testid="export-viewer" bind:value={portableViewerActorId}>
						{#each players as player (player.id)}
							<option value={player.id}>{player.displayName}</option>
						{/each}
					</select>
				</label>
			{/if}
			<button type="submit" data-testid="export-submit">Export</button>

			{#if exportError}
				<p class="meta" role="alert" data-testid="export-error">{exportError}</p>
			{/if}
			{#if exportResult}
				<div data-testid="export-report" class="scene-card">
					<p class="meta" data-testid="export-report-summary">
						Mode: {exportResult.report.mode} • exported {exportResult.report.exportedItems} • omitted
						(hidden) {exportResult.report.omittedForVisibility} • redacted
						{exportResult.report.redactedItems} •
						<strong data-testid="export-report-clean"
							>{exportResult.report.clean ? 'clean' : 'LEAK DETECTED'}</strong
						>
					</p>
					<ul class="scene-list" data-testid="export-files">
						{#each exportResult.files as file (file.path)}
							<li data-testid={`export-file-${file.path}`}>
								<code>{file.path}</code>
								<pre class="export-preview">{file.markdown}</pre>
							</li>
						{/each}
					</ul>
					{#if exportResult.report.notes.length > 0}
						<ul class="scene-list" data-testid="export-notes">
							{#each exportResult.report.notes as note, index (index)}
								<li class="meta">{note.severity}: {note.message}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</form>
	</section>
{/if}

<style>
	.export-preview {
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.85em;
		margin: 0;
	}
</style>
