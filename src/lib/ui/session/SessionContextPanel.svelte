<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { sessionState } from '$lib/state/session-state.svelte.js';
	import { extractMapFrontmatterPlacement } from '$lib/domain/map-pois.js';
	import { nowISO } from '$lib/utils/date.js';
	import {
		DEFAULT_SESSION_CONTEXT,
		normalizeSessionContextState,
	} from '$lib/domain/session-board.js';
	import type { SessionContextCategory } from '$lib/types/session-board.js';
	import type { NoteId } from '$lib/types/note.js';

	interface Props {
		compact?: boolean;
		showAddControls?: boolean;
	}

	let { compact = false, showAddControls = true }: Props = $props();
	let query = $state('');
	let addCategory = $state<SessionContextCategory>('npc');
	let saving = $state(false);

	const CATEGORY_ORDER: SessionContextCategory[] = ['npc', 'location', 'quest', 'party'];
	const CATEGORY_LABELS: Record<SessionContextCategory, string> = {
		npc: 'NPCs',
		location: 'Current Location',
		quest: 'Active Quest',
		party: 'Party Roster',
	};

	let activeBoard = $derived(sessionBoardsState.activeBoard);
	let context = $derived.by(() =>
		normalizeSessionContextState(activeBoard?.sessionContext ?? DEFAULT_SESSION_CONTEXT),
	);
	let notesById = $derived(notesState.activeNoteById);
	let mapById = $derived(mapsState.mapById);
	let partyLocation = $derived(sessionState.partyLocation);
	let filteredCandidates = $derived.by(() => {
		const normalized = query.trim().toLowerCase();
		const pinned = new Set(context.items.map((item) => item.noteId));
		return notesState.activeNotes
			.filter((note) => !pinned.has(note.id))
			.filter((note) => {
				if (!normalized) return true;
				return (
					note.title.toLowerCase().includes(normalized) ||
					note.tags.some((tag) => tag.toLowerCase().includes(normalized))
				);
			})
			.slice(0, compact ? 6 : 10);
	});

	const pinnedLocationItem = $derived.by(
		() => context.items.find((item) => item.category === 'location') ?? null,
	);
	const pinnedLocationNote = $derived.by(() =>
		pinnedLocationItem ? (notesById.get(pinnedLocationItem.noteId) ?? null) : null,
	);
	const pinnedLocationMapPlacement = $derived.by(() => {
		if (!pinnedLocationNote) return null;
		return extractMapFrontmatterPlacement(pinnedLocationNote.frontmatter ?? {});
	});

	function groupedItems(category: SessionContextCategory): typeof context.items {
		return context.items.filter((item) => item.category === category);
	}

	function openNote(noteId: NoteId): void {
		void goto(resolve(`/knowledge/notes/${noteId}`));
	}

	async function toggleCollapsed(): Promise<void> {
		if (!activeBoard) return;
		saving = true;
		try {
			await sessionBoardsState.setSessionContextCollapsed(activeBoard.id, !context.collapsed);
		} finally {
			saving = false;
		}
	}

	async function pinCandidate(noteId: NoteId): Promise<void> {
		if (!activeBoard) return;
		saving = true;
		try {
			await sessionBoardsState.pinSessionContextItem(activeBoard.id, noteId, addCategory);
			query = '';
		} finally {
			saving = false;
		}
	}

	async function unpin(noteId: NoteId): Promise<void> {
		if (!activeBoard) return;
		saving = true;
		try {
			await sessionBoardsState.unpinSessionContextItem(activeBoard.id, noteId);
		} finally {
			saving = false;
		}
	}

	async function recategorize(noteId: NoteId, category: SessionContextCategory): Promise<void> {
		if (!activeBoard) return;
		saving = true;
		try {
			await sessionBoardsState.recategorizeSessionContextItem(activeBoard.id, noteId, category);
		} finally {
			saving = false;
		}
	}

	async function setPartyLocationFromPinnedContext(): Promise<void> {
		if (!pinnedLocationMapPlacement) return;
		await sessionState.setPartyLocation({
			mapId: pinnedLocationMapPlacement.mapId,
			x: pinnedLocationMapPlacement.coordinates.x,
			y: pinnedLocationMapPlacement.coordinates.y,
			poiId: pinnedLocationMapPlacement.poiId ?? undefined,
			source: pinnedLocationMapPlacement.poiId ? 'poi' : 'point',
			updatedAt: nowISO(),
		});
	}

	$effect(() => {
		if (!mapsState.loaded && !mapsState.loading) {
			void mapsState.loadAll();
		}
		if (!sessionState.loaded && !sessionState.loading) {
			void sessionState.load();
		}
	});
</script>

<section class="rounded-lg border border-border bg-surface">
	<div class="flex items-center justify-between px-3 py-2 border-b border-border">
		<button
			type="button"
			class="text-left text-xs font-semibold uppercase tracking-wider text-ink-faint hover:text-ink-muted transition-colors"
			onclick={toggleCollapsed}
			disabled={saving || !activeBoard}
			aria-expanded={!context.collapsed}
		>
			Session Context
		</button>
		<span class="text-xs text-ink-faint">{context.items.length}</span>
	</div>

	{#if !activeBoard}
		<p class="px-3 py-2 text-xs text-ink-muted">Select a session board to pin active entities.</p>
	{:else if context.collapsed}
		<p class="px-3 py-2 text-xs text-ink-faint">Collapsed. Expand to view pinned context.</p>
	{:else}
		<div class="p-3 space-y-2.5">
			<div class="rounded border border-border/70 bg-surface-alt/70 px-2 py-1.5">
				<p class="text-xs uppercase tracking-wider text-ink-faint">Active Party Location</p>
				{#if partyLocation}
					<p class="mt-1 text-xs text-ink">
						{mapById[partyLocation.mapId]?.name ?? partyLocation.mapId} @
						{partyLocation.x.toFixed(3)}, {partyLocation.y.toFixed(3)}
					</p>
				{:else}
					<p class="mt-1 text-xs text-ink-faint">Not set</p>
				{/if}
				<button
					type="button"
					class="mt-1 rounded border border-border px-2 py-0.5 text-xs text-ink-muted hover:bg-surface"
					disabled={!pinnedLocationMapPlacement}
					onclick={() => void setPartyLocationFromPinnedContext()}
				>
					Use pinned location note
				</button>
			</div>
			{#each CATEGORY_ORDER as category (category)}
				<div>
					<p class="text-xs uppercase tracking-wider text-ink-faint mb-1">
						{CATEGORY_LABELS[category]}
					</p>
					{#if groupedItems(category).length === 0}
						<p class="text-xs text-ink-faint">None pinned</p>
					{:else}
						<div class="space-y-1.5">
							{#each groupedItems(category) as item (item.noteId)}
								{@const note = notesById.get(item.noteId)}
								<div class="rounded border border-border/70 px-2 py-1.5 bg-surface-alt/60">
									<div class="flex items-center gap-1.5">
										<button
											type="button"
											class="flex-1 truncate text-left text-xs text-ink hover:underline"
											onclick={() => note && openNote(note.id)}
											title={note?.title ?? String(item.noteId)}
										>
											{note?.title ?? `Missing note (${item.noteId})`}
										</button>
										<select
											class="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-ink-muted"
											value={item.category}
											onchange={(event) =>
												void recategorize(
													item.noteId,
													(event.currentTarget as HTMLSelectElement)
														.value as SessionContextCategory,
												)}
											aria-label="Change session context category"
										>
											<option value="npc">NPCs</option>
											<option value="location">Location</option>
											<option value="quest">Quest</option>
											<option value="party">Party</option>
										</select>
										<button
											type="button"
											class="text-xs px-1.5 py-0.5 rounded border border-border text-ink-muted hover:text-ink"
											onclick={() => void unpin(item.noteId)}
											aria-label="Unpin from session context"
										>
											Remove
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if showAddControls}
			<div class="px-3 pb-3 pt-1 border-t border-border/70 space-y-2">
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={query}
						placeholder="Pin note to session context..."
						class="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs text-ink"
					/>
					<select
						class="rounded border border-border bg-surface px-2 py-1 text-xs text-ink-muted"
						bind:value={addCategory}
						aria-label="Session context category"
					>
						<option value="npc">NPC</option>
						<option value="location">Location</option>
						<option value="quest">Quest</option>
						<option value="party">Party</option>
					</select>
				</div>

				{#if filteredCandidates.length === 0}
					<p class="text-xs text-ink-faint">No matching notes available</p>
				{:else}
					<div class="space-y-1 max-h-28 overflow-y-auto">
						{#each filteredCandidates as candidate (candidate.id)}
							<button
								type="button"
								class="w-full rounded border border-border/70 px-2 py-1 text-left text-xs text-ink hover:bg-surface-alt transition-colors truncate"
								onclick={() => void pinCandidate(candidate.id)}
								title={candidate.title}
							>
								{candidate.title}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</section>
