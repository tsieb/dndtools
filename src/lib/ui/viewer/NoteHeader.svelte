<script lang="ts">
	import type { Note } from '$lib/types/note.js';
	import { formatRelativeDate, formatDate } from '$lib/utils/date.js';
	import { formatWorldDate, parseWorldDateInput } from '$lib/domain/world-calendar.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { exportNote } from '$lib/domain/export.js';
	import Button from '$lib/ui/common/Button.svelte';

	interface Props {
		note: Note;
		onedit: () => void;
		ondelete: () => void;
		readonly?: boolean;
	}

	let { note, onedit, ondelete, readonly = false }: Props = $props();
	let filePath = $derived(
		note.filePath ??
			(note.folder === '/'
				? `${note.title}.md`
				: `${note.folder.replace(/^\//, '')}/${note.title}.md`),
	);
	let inWorldDate = $derived.by(() => {
		const objectMeta =
			typeof note.frontmatter.dndtools === 'object' && note.frontmatter.dndtools !== null
				? (note.frontmatter.dndtools as Record<string, unknown>)
				: null;
		const objectEnvelope =
			objectMeta && typeof objectMeta.object === 'object' && objectMeta.object !== null
				? (objectMeta.object as Record<string, unknown>)
				: null;
		const objectData =
			objectEnvelope && typeof objectEnvelope.data === 'object' && objectEnvelope.data !== null
				? (objectEnvelope.data as Record<string, unknown>)
				: null;
		const fromNumber = [
			objectData?.worldDateOffset,
			note.frontmatter.worldDate,
			note.frontmatter.world_date,
			note.frontmatter.sessionDateOffset,
			note.frontmatter.session_date_offset,
		]
			.map((value) => {
				if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
				if (typeof value === 'string' && value.trim().length > 0) {
					const parsed = Number.parseInt(value, 10);
					return Number.isFinite(parsed) ? parsed : null;
				}
				return null;
			})
			.find((value) => value !== null);
		const parsedOffset =
			fromNumber ??
			parseWorldDateInput(
				worldCalendarState.calendar,
				objectData?.date ??
					note.frontmatter.worldDate ??
					note.frontmatter.world_date ??
					note.frontmatter.date,
			)?.dayOffset ??
			null;
		if (parsedOffset === null) return null;
		return {
			short: formatWorldDate(worldCalendarState.calendar, parsedOffset, 'short'),
			long: formatWorldDate(worldCalendarState.calendar, parsedOffset, 'long'),
		};
	});

	async function handlePin(): Promise<void> {
		const pinned = await notesState.togglePin(note.id);
		if (pinned === null) return;
		toastState.success(pinned ? 'Note pinned' : 'Note unpinned');
	}

	function handleExport(): void {
		exportNote(note);
		toastState.success('Note exported');
	}
</script>

<div class="max-w-content mx-auto mb-6">
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<h1
				class="text-2xl font-bold text-ink dark:text-tavern-text break-words"
				style="font-family: var(--font-serif)"
			>
				{note.title}
			</h1>
			<div class="flex items-center gap-2 mt-2 text-sm text-ink-muted dark:text-tavern-muted">
				<span
					class="px-2 py-0.5 rounded-md bg-surface-alt dark:bg-tavern-surface-alt text-xs font-mono truncate max-w-[420px]"
				>
					{filePath}
				</span>
				<span aria-hidden="true">&middot;</span>
				<span title={formatDate(note.updatedAt)}>Edited {formatRelativeDate(note.updatedAt)}</span>
				<span aria-hidden="true">&middot;</span>
				<span title={formatDate(note.createdAt)}>Created {formatRelativeDate(note.createdAt)}</span>
				{#if inWorldDate}
					<span aria-hidden="true">&middot;</span>
					<span title={inWorldDate.long}>In-world {inWorldDate.short}</span>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-1 shrink-0">
			{#if !readonly}
				<button
					class="p-1.5 rounded-md transition-colors {note.pinned
						? 'text-accent dark:text-tavern-accent bg-accent-subtle dark:bg-tavern-accent-subtle'
						: 'text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt'}"
					onclick={handlePin}
					title={note.pinned ? 'Unpin note' : 'Pin note'}
					aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
				>
					<svg
						class="w-4 h-4"
						fill={note.pinned ? 'currentColor' : 'none'}
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
						/>
					</svg>
				</button>
			{/if}
			<button
				class="p-1.5 rounded-md text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				onclick={handleExport}
				title="Export as .md"
				aria-label="Export note"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
					/>
				</svg>
			</button>
			{#if !readonly}
				<Button variant="primary" size="sm" onclick={onedit}>Edit</Button>
				<Button variant="ghost" size="sm" onclick={ondelete} title="Delete note">
					<svg
						class="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						/>
					</svg>
				</Button>
			{/if}
		</div>
	</div>

	{#if note.tags.length > 0}
		<div class="flex flex-wrap gap-1.5 mt-3">
			{#each note.tags as tag (tag)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a
					href={`/notes?tag=${encodeURIComponent(tag)}`}
					class="px-2 py-0.5 text-xs rounded-full bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 dark:hover:bg-tavern-accent/20 transition-colors"
				>
					#{tag}
				</a>
			{/each}
		</div>
	{/if}
</div>
