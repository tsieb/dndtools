<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { mapsState } from '$lib/state/maps.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { createNoteId } from '$lib/types/note.js';
	import { collectMapPlacementsForNote } from '$lib/domain/map-pois.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import type { DetailPanelContext } from '$lib/domain/detail-panel-context.js';
	import BacklinksPanel from '$lib/ui/viewer/BacklinksPanel.svelte';
	import CrossSectionLinksPanel from '$lib/ui/viewer/CrossSectionLinksPanel.svelte';
	import PlayerCharacterSheet from '$lib/ui/player/PlayerCharacterSheet.svelte';
	import StatBlockView from '$lib/ui/viewer/StatBlockView.svelte';
	import SessionDiceBar from '$lib/ui/dice/SessionDiceBar.svelte';
	import SessionRollHistoryPanel from '$lib/ui/session/SessionRollHistoryPanel.svelte';

	interface Props {
		context: DetailPanelContext;
	}

	let { context }: Props = $props();

	const noteId = $derived.by(() => {
		if (context !== 'note') return null;
		const match = page.url.pathname.match(/^\/knowledge\/notes\/([^/]+)$/);
		const rawId = match?.[1]?.trim();
		if (!rawId) return null;
		return createNoteId(decodeURIComponent(rawId));
	});

	const note = $derived.by(() => {
		if (!noteId) return null;
		return notesState.getNoteById(noteId) ?? null;
	});

	const mapPlacements = $derived.by(() => {
		if (!note) return [];
		return collectMapPlacementsForNote(mapsState.maps, String(note.id), note.frontmatter);
	});

	const noteObject = $derived.by(() => {
		if (!note) return null;
		return noteToVaultObject(note);
	});

	const mapId = $derived.by(() => {
		if (context !== 'map') return '';
		return page.url.searchParams.get('map')?.trim() ?? '';
	});

	const selectedMap = $derived.by(() => {
		if (!mapId) return null;
		return mapsState.mapById[mapId] ?? null;
	});

	const poiCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const poi of selectedMap?.data.pois ?? []) {
			counts[poi.category] = (counts[poi.category] ?? 0) + 1;
		}
		return Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
	});

	const sessionBoardSummary = $derived.by(() => {
		const board = sessionBoardsState.activeBoard;
		if (!board) return null;
		const typeCounts: Record<string, number> = {};
		for (const tile of board.tiles) {
			const type = tile.type ?? 'note';
			typeCounts[type] = (typeCounts[type] ?? 0) + 1;
		}
		return {
			board,
			typeCounts: Object.entries(typeCounts).sort(([left], [right]) => left.localeCompare(right)),
		};
	});

	let now = $state(Date.now());

	$effect(() => {
		if (!sessionModeState.isActive) return;
		const id = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(id);
	});

	const sessionElapsedText = $derived.by(() => {
		const startedAt = sessionModeState.activeSession?.startedAt;
		if (!sessionModeState.isActive || !startedAt) return '00:00';
		const startedMs = Date.parse(startedAt);
		if (!Number.isFinite(startedMs)) return '00:00';
		const totalSeconds = Math.floor(Math.max(0, now - startedMs) / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) {
			return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	});

	$effect(() => {
		if (context !== 'map') return;
		if (mapsState.loaded || mapsState.loading) return;
		void mapsState.loadAll();
	});

	$effect(() => {
		if (context !== 'session') return;
		if (sessionBoardsState.loading || sessionBoardsState.boards.length > 0) return;
		void sessionBoardsState.loadAll();
	});

	function openDiceTray(): void {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(new CustomEvent('dndtools:open-dice-tray'));
	}
</script>

<div class="h-full p-3">
	{#if context === 'note'}
		{#if note}
			<div class="mb-3 rounded-md border border-border bg-surface p-2.5">
				<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">Note Context</p>
				<p class="mt-1 text-sm font-semibold text-ink">{note.title}</p>
				{#if noteObject}
					<ul class="mt-2 space-y-1 text-xs text-ink-muted">
						<li>Type: {noteObject.type}</li>
						<li>Tags: {note.tags.length}</li>
						<li>Relationships: {noteObject.relationships.length}</li>
					</ul>
				{/if}
			</div>
			<div class="space-y-3">
				{#if noteObject?.type === 'stat_block'}
					<StatBlockView object={noteObject} compact />
				{:else if noteObject?.type === 'character'}
					<PlayerCharacterSheet object={noteObject} compact />
				{/if}
				<CrossSectionLinksPanel {note} {mapPlacements} />
				<BacklinksPanel noteId={note.id} />
			</div>
		{:else}
			<p class="text-sm text-ink-muted">Note context is unavailable.</p>
		{/if}
	{:else if context === 'map'}
		{#if selectedMap}
			<section class="rounded-md border border-border bg-surface p-3">
				<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">Map Legend</p>
				<h2 class="mt-1 text-sm font-semibold text-ink">
					{selectedMap.name}
				</h2>
				<p class="mt-1 text-xs text-ink-muted">
					{selectedMap.data.pois?.length ?? 0} points of interest
				</p>
				{#if poiCounts.length > 0}
					<ul class="mt-3 space-y-1 text-xs text-ink-muted">
						{#each poiCounts as [category, count] (`${category}-${count}`)}
							<li
								class="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1"
							>
								<span class="capitalize">{category}</span>
								<span class="font-semibold text-ink">{count}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{:else}
			<p class="text-sm text-ink-muted">Select a map to view its legend.</p>
		{/if}
	{:else if context === 'session'}
		<div class="space-y-3">
			<section class="rounded-md border border-border bg-surface p-3">
				<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
					Session Quick Reference
				</p>
				{#if sessionBoardSummary}
					<div class="mt-1 flex items-center justify-between gap-2">
						<h2 class="text-sm font-semibold text-ink">
							{sessionBoardSummary.board.name}
						</h2>
						{#if sessionModeState.isActive}
							<span
								class="rounded-full bg-accent-subtle px-2 py-0.5 text-2xs font-semibold text-accent"
								>{sessionElapsedText}</span
							>
						{/if}
					</div>
					<p class="mt-1 text-xs text-ink-muted">
						{sessionBoardSummary.board.tiles.length} board tiles
					</p>
					<ul class="mt-3 space-y-1 text-xs text-ink-muted">
						{#each sessionBoardSummary.typeCounts as [tileType, count] (`${tileType}-${count}`)}
							<li
								class="flex items-center justify-between gap-2 rounded border border-border/60 px-2 py-1"
							>
								<span class="capitalize">{tileType}</span>
								<span class="font-semibold text-ink">{count}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-2 text-xs text-ink-muted">
						No active session board. Open
						<a
							href={resolve('/session/boards')}
							class="text-accent underline underline-offset-2 hover:text-accent-hover"
						>
							Session Boards
						</a>
						to select one.
					</p>
				{/if}
			</section>

			{#if sessionModeState.isActive}
				<SessionDiceBar compact source="tray" oncustom={openDiceTray} />
				<SessionRollHistoryPanel />
			{:else}
				<section class="rounded-md border border-border bg-surface p-3">
					<p class="text-xs text-ink-muted">
						Session is idle. Open the Dice Tray to prep expressions before play.
					</p>
					<button
						type="button"
						class="mt-2 rounded-md border border-border px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-alt"
						onclick={openDiceTray}
					>
						Open Dice Tray
					</button>
				</section>
			{/if}
		</div>
	{/if}
</div>
