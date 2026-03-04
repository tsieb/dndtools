<script lang="ts">
	import { resolve } from '$app/paths';
	import EncounterBuilderTile from '$lib/ui/board/EncounterBuilderTile.svelte';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import type { SessionBoardEncounterTile, SessionBoardId } from '$lib/types/session-board.js';

	let selectedBoardId = $state<SessionBoardId | null>(null);
	let selectedEncounterTileId = $state<string | null>(null);
	let creatingBoard = $state(false);

	let boards = $derived(sessionBoardsState.boards);
	let selectedBoard = $derived.by(
		() =>
			boards.find((board) => board.id === selectedBoardId) ??
			sessionBoardsState.activeBoard ??
			null,
	);
	let encounterTiles = $derived.by(
		() =>
			(selectedBoard?.tiles ?? []).filter(
				(tile) => tile.type === 'encounter',
			) as SessionBoardEncounterTile[],
	);
	let selectedEncounterTile = $derived.by(
		() =>
			encounterTiles.find((tile) => tile.id === selectedEncounterTileId) ??
			encounterTiles[0] ??
			null,
	);

	$effect(() => {
		if (sessionBoardsState.boards.length === 0 && !sessionBoardsState.loading) {
			void sessionBoardsState.loadAll();
		}
	});

	$effect(() => {
		if (selectedBoardId && boards.some((board) => board.id === selectedBoardId)) return;
		selectedBoardId = sessionBoardsState.activeBoard?.id ?? boards[0]?.id ?? null;
	});

	$effect(() => {
		if (
			selectedEncounterTileId &&
			encounterTiles.some((tile) => tile.id === selectedEncounterTileId)
		)
			return;
		selectedEncounterTileId = encounterTiles[0]?.id ?? null;
	});

	function handleBoardSelection(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		selectedBoardId = value ? (value as SessionBoardId) : null;
		selectedEncounterTileId = null;
		if (selectedBoardId) sessionBoardsState.setActiveBoard(selectedBoardId);
	}

	async function createBoardWithEncounterBuilder(): Promise<void> {
		creatingBoard = true;
		try {
			const board = await sessionBoardsState.createBoard(
				'Encounter Builder Board',
				'Encounter planning and balancing board.',
				'built-in-combat-scene',
			);
			if (!board.tiles.some((tile) => tile.type === 'encounter')) {
				await sessionBoardsState.addEncounterTile(board.id);
			}
			await sessionBoardsState.loadAll();
			selectedBoardId = board.id;
		} finally {
			creatingBoard = false;
		}
	}

	async function addEncounterTile(): Promise<void> {
		if (!selectedBoard) return;
		await sessionBoardsState.addEncounterTile(selectedBoard.id);
		await sessionBoardsState.loadAll();
		selectedEncounterTileId =
			sessionBoardsState.boards
				.find((board) => board.id === selectedBoard.id)
				?.tiles.filter((tile) => tile.type === 'encounter')
				.at(-1)?.id ?? null;
	}
</script>

<div class="h-full min-h-0 overflow-hidden p-4">
	<section
		class="h-full min-h-0 rounded-xl border border-border-strong/60 dark:border-tavern-border-strong/60 bg-surface/95 dark:bg-tavern-surface/95 shadow-sm overflow-hidden flex flex-col"
	>
		<header class="px-4 py-3 border-b border-border dark:border-tavern-border space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<h1
					class="text-xl font-bold text-ink dark:text-tavern-text"
					style="font-family: var(--font-serif)"
				>
					Encounter Builder
				</h1>
				<span
					class="text-[11px] px-2 py-0.5 rounded border border-border/70 dark:border-tavern-border/70 text-ink-muted dark:text-tavern-muted"
				>
					Route: <span class="font-mono">/encounter/new</span>
				</span>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Board
					<select
						class="ml-2 h-8 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
						value={selectedBoard?.id ?? ''}
						onchange={handleBoardSelection}
					>
						{#if boards.length === 0}
							<option value="">No boards</option>
						{:else}
							{#each boards as board (board.id)}
								<option value={board.id}>{board.name}</option>
							{/each}
						{/if}
					</select>
				</label>
				{#if encounterTiles.length > 1}
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						Encounter Tile
						<select
							class="ml-2 h-8 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
							value={selectedEncounterTile?.id ?? ''}
							onchange={(event) =>
								(selectedEncounterTileId = (event.currentTarget as HTMLSelectElement).value)}
						>
							{#each encounterTiles as tile (tile.id)}
								<option value={tile.id}>{tile.id}</option>
							{/each}
						</select>
					</label>
				{/if}
				<button
					type="button"
					class="h-8 px-3 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={() => void addEncounterTile()}
					disabled={!selectedBoard}
				>
					Add Encounter Tile
				</button>
				<a
					href={resolve('/session-board')}
					class="h-8 px-3 inline-flex items-center rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				>
					Open Session Board
				</a>
			</div>
		</header>

		<div class="flex-1 min-h-0 p-3">
			{#if boards.length === 0}
				<div
					class="h-full rounded border border-dashed border-border/70 dark:border-tavern-border/70 flex items-center justify-center"
				>
					<div class="text-center px-4">
						<p class="text-sm text-ink dark:text-tavern-text">No session boards found.</p>
						<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
							Create a board with an encounter builder tile to begin.
						</p>
						<button
							type="button"
							class="mt-3 px-3 py-1.5 rounded bg-accent hover:bg-accent-hover dark:bg-tavern-accent dark:hover:bg-tavern-accent-hover dark:text-tavern-bg text-white text-xs"
							onclick={() => void createBoardWithEncounterBuilder()}
							disabled={creatingBoard}
						>
							{creatingBoard ? 'Creating...' : 'Create Encounter Board'}
						</button>
					</div>
				</div>
			{:else if !selectedEncounterTile}
				<div
					class="h-full rounded border border-dashed border-border/70 dark:border-tavern-border/70 flex items-center justify-center"
				>
					<div class="text-center px-4">
						<p class="text-sm text-ink dark:text-tavern-text">
							Selected board has no encounter builder tile.
						</p>
						<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
							Add one from this route or from Session Board edit mode.
						</p>
						<button
							type="button"
							class="mt-3 px-3 py-1.5 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
							onclick={() => void addEncounterTile()}
						>
							Add Encounter Tile
						</button>
					</div>
				</div>
			{:else}
				<div class="h-full min-h-0">
					<EncounterBuilderTile
						tile={selectedEncounterTile}
						boardId={selectedBoard?.id}
						standalone
						onselect={() => undefined}
						onupdate={(encounter) => {
							if (!selectedBoard) return;
							void sessionBoardsState.updateTile(selectedBoard.id, selectedEncounterTile.id, {
								encounter,
							});
						}}
					/>
				</div>
			{/if}
		</div>
	</section>
</div>
