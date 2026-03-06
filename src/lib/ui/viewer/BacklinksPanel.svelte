<script lang="ts">
	import { resolve } from '$app/paths';
	import { getStorage } from '$lib/platform/storage/index.js';
	import type { NoteId } from '$lib/types/note.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';

	interface Props {
		noteId: NoteId;
	}

	interface BacklinkOccurrence {
		key: string;
		sourceId: NoteId;
		sourceTitle: string;
		sourceFolder: string;
		sourceFolderSegments: string[];
		contextSnippet: string;
		position: number;
	}

	let { noteId }: Props = $props();
	let expanded = $state(true);
	let isNarrowViewport = $state(false);
	let backlinks = $state<BacklinkOccurrence[]>([]);
	let loading = $state(false);

	function compactSnippet(snippet: string): string {
		const flattened = snippet.replace(/\s+/g, ' ').trim();
		if (!flattened) return 'Linked reference in this note.';
		if (flattened.length <= 180) return flattened;
		return `${flattened.slice(0, 177).trimEnd()}...`;
	}

	function folderSegments(folder: string): string[] {
		const normalized = folder.trim();
		if (!normalized || normalized === '/') return [];
		return normalized
			.split('/')
			.map((segment) => segment.trim())
			.filter(Boolean);
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mediaQuery = window.matchMedia('(max-width: 1023px)');
		let initialized = false;
		const applyViewport = (): void => {
			isNarrowViewport = mediaQuery.matches;
			if (!initialized) {
				expanded = !mediaQuery.matches;
				initialized = true;
				return;
			}
			if (!mediaQuery.matches) {
				expanded = true;
			}
		};
		applyViewport();
		mediaQuery.addEventListener('change', applyViewport);
		return () => mediaQuery.removeEventListener('change', applyViewport);
	});

	$effect(() => {
		let cancelled = false;
		const currentNoteId = noteId;

		const loadBacklinks = async (): Promise<void> => {
			loading = true;
			try {
				const storage = getStorage();
				const links = await storage.getLinksTo(currentNoteId);
				const occurrences = links
					.map((link) => {
						const source = notesState.getNoteById(link.sourceId);
						if (!source) return null;
						if (playerModeState.enabled && !isNoteVisibleInPlayerMode(source)) return null;
						return {
							key: `${source.id}:${link.position}:${link.displayText}`,
							sourceId: source.id,
							sourceTitle: source.title,
							sourceFolder: String(source.folder),
							sourceFolderSegments: folderSegments(String(source.folder)),
							contextSnippet: compactSnippet(link.contextSnippet ?? ''),
							position: link.position,
						} satisfies BacklinkOccurrence;
					})
					.filter((entry): entry is BacklinkOccurrence => !!entry)
					.sort((a, b) => {
						const title = a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
							sensitivity: 'base',
						});
						if (title !== 0) return title;
						return a.position - b.position;
					});
				if (!cancelled) {
					backlinks = occurrences;
				}
			} finally {
				if (!cancelled) {
					loading = false;
				}
			}
		};

		void loadBacklinks();
		return () => {
			cancelled = true;
		};
	});
</script>

{#if loading || backlinks.length > 0}
	<section class="rounded-lg border border-border bg-surface p-3">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-sm font-semibold text-ink">
				Referenced by ({backlinks.length})
			</h2>
			{#if isNarrowViewport}
				<button
					type="button"
					class="rounded px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
					onclick={() => (expanded = !expanded)}
					aria-expanded={expanded}
					aria-label={expanded ? 'Collapse backlinks panel' : 'Expand backlinks panel'}
				>
					{expanded ? 'Hide' : 'Show'}
				</button>
			{/if}
		</div>

		{#if expanded}
			{#if loading}
				<p class="mt-2 text-xs text-ink-muted">Loading backlinks...</p>
			{:else if backlinks.length === 0}
				<p class="mt-2 text-xs text-ink-muted">No backlinks found.</p>
			{:else}
				<ul class="mt-3 space-y-3">
					{#each backlinks as backlink (backlink.key)}
						<li class="rounded border border-border/70 bg-surface-alt/60 p-2">
							<a
								href={resolve(`/knowledge/notes/${backlink.sourceId}`)}
								class="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
							>
								{backlink.sourceTitle}
							</a>
							<nav class="mt-1" aria-label="Contextual navigation: Backlink source folder path">
								<ol class="flex flex-wrap items-center gap-1 text-[11px] text-ink-faint">
									<li>Knowledge</li>
									{#if backlink.sourceFolderSegments.length > 0}
										<li aria-hidden="true">/</li>
									{/if}
									{#each backlink.sourceFolderSegments as segment, index (`${segment}-${index}`)}
										<li>{segment}</li>
										{#if index < backlink.sourceFolderSegments.length - 1}
											<li aria-hidden="true">/</li>
										{/if}
									{/each}
								</ol>
							</nav>
							<p class="mt-1 text-xs text-ink-muted">
								{backlink.contextSnippet}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>
{/if}
