<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CollapsibleLocalNavSection from '$lib/ui/layout/local-nav/CollapsibleLocalNavSection.svelte';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { isVaultObjectNote } from '$lib/domain/object-notes.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import { buildOpenThreadsReport } from '$lib/domain/open-threads.js';

	const modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	const modeScopedPinnedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.pinnedNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.pinnedNotes,
	);
	const pinnedEntities = $derived.by(() =>
		modeScopedPinnedNotes.filter((note) => isVaultObjectNote(note)).slice(0, 10),
	);
	const entities = $derived.by(() =>
		modeScopedNotes
			.filter((note) => isVaultObjectNote(note))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 16),
	);
	const openThreads = $derived.by(() =>
		buildOpenThreadsReport(modeScopedNotes, worldCalendarState.calendar),
	);

	function navigateToNote(id: string): void {
		goto(resolve(`/knowledge/notes/${id}`));
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}
</script>

<nav class="space-y-2 pb-2" aria-label="Local navigation: Campaign panel">
	<CollapsibleLocalNavSection section="campaign" sectionId="entities" title="Entities">
		{#if pinnedEntities.length === 0 && entities.length === 0}
			<p class="px-2.5 py-1.5 text-xs text-ink-faint">No campaign entities yet</p>
		{:else}
			{#if pinnedEntities.length > 0}
				<p class="px-2.5 pb-1 text-xs uppercase tracking-wider text-ink-faint">Pinned</p>
				<div class="density-list pb-2">
					{#each pinnedEntities as note (note.id)}
						<button
							type="button"
							class="w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg"
							onclick={() => navigateToNote(note.id)}
							title={note.title}
						>
							<span class="truncate">{note.title}</span>
						</button>
					{/each}
				</div>
			{/if}
			{#if entities.length > 0}
				<p class="px-2.5 pb-1 text-xs uppercase tracking-wider text-ink-faint">Recently Updated</p>
				<div class="density-list">
					{#each entities as note (note.id)}
						<button
							type="button"
							class="w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-sm text-ink transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg"
							onclick={() => navigateToNote(note.id)}
							title={note.title}
						>
							<span class="truncate">{note.title}</span>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</CollapsibleLocalNavSection>

	<CollapsibleLocalNavSection section="campaign" sectionId="open-threads" title="Open Threads">
		<div class="rounded-md border border-border bg-surface p-2 text-xs">
			<p class="text-ink-muted">
				Quests {openThreads.totals.quests} | NPCs {openThreads.totals.npcs} | Timeline {openThreads
					.totals.timelineEvents}
			</p>
		</div>
		{#if openThreads.quests.length === 0 && openThreads.npcs.length === 0}
			<p class="px-2.5 py-1.5 text-xs text-ink-faint">No open threads</p>
		{:else}
			<div class="density-list pt-2">
				{#each [...openThreads.quests.slice(0, 4), ...openThreads.npcs.slice(0, 4)] as thread (`${thread.objectId}`)}
					<button
						type="button"
						class="sidebar-open-thread-item w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg hover:text-ink"
						onclick={() => navigateToNote(thread.noteId)}
						title={thread.title}
					>
						<span class="truncate">{thread.title}</span>
					</button>
				{/each}
			</div>
		{/if}
	</CollapsibleLocalNavSection>

	<CollapsibleLocalNavSection
		section="campaign"
		sectionId="timeline-events"
		title="Timeline Events"
	>
		{#if openThreads.timelineEvents.length === 0}
			<p class="px-2.5 py-1.5 text-xs text-ink-faint">No pending timeline events</p>
		{:else}
			<div class="density-list">
				{#each openThreads.timelineEvents.slice(0, 10) as event (event.objectId)}
					<button
						type="button"
						class="w-full rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg hover:text-ink"
						onclick={() => navigateToNote(event.noteId)}
						title={event.title}
					>
						<div class="truncate">{event.title}</div>
						{#if event.dateShort}
							<div class="text-2xs text-ink-faint">{event.dateShort}</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</CollapsibleLocalNavSection>
</nav>
