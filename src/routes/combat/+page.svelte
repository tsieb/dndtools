<script lang="ts">
	import { resolve } from '$app/paths';
	import CombatTrackerTile from '$lib/ui/board/CombatTrackerTile.svelte';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import type { SessionBoardCombatTile, SessionBoardId } from '$lib/types/session-board.js';

	let selectedBoardId = $state<SessionBoardId | null>(null);
	let selectedCombatTileId = $state<string | null>(null);
	let creatingBoard = $state(false);

	let boards = $derived(sessionBoardsState.boards);
	let selectedBoard = $derived.by(
		() =>
			boards.find((board) => board.id === selectedBoardId) ??
			sessionBoardsState.activeBoard ??
			null,
	);
	let combatTiles = $derived.by(
		() =>
			(selectedBoard?.tiles ?? []).filter(
				(tile) => tile.type === 'combat',
			) as SessionBoardCombatTile[],
	);
	let selectedCombatTile = $derived.by(
		() => combatTiles.find((tile) => tile.id === selectedCombatTileId) ?? combatTiles[0] ?? null,
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
		if (selectedCombatTileId && combatTiles.some((tile) => tile.id === selectedCombatTileId))
			return;
		selectedCombatTileId = combatTiles[0]?.id ?? null;
	});

	function handleBoardSelection(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		selectedBoardId = value ? (value as SessionBoardId) : null;
		selectedCombatTileId = null;
		if (selectedBoardId) sessionBoardsState.setActiveBoard(selectedBoardId);
	}

	async function createBoardWithCombat(): Promise<void> {
		creatingBoard = true;
		try {
			const board = await sessionBoardsState.createBoard(
				'Combat Tracker Board',
				'Standalone combat management board.',
				'built-in-combat-scene',
			);
			if (!board.tiles.some((tile) => tile.type === 'combat')) {
				await sessionBoardsState.addCombatTile(board.id);
			}
			await sessionBoardsState.loadAll();
			selectedBoardId = board.id;
		} finally {
			creatingBoard = false;
		}
	}

	async function addCombatTile(): Promise<void> {
		if (!selectedBoard) return;
		await sessionBoardsState.addCombatTile(selectedBoard.id);
		await sessionBoardsState.loadAll();
		selectedCombatTileId =
			sessionBoardsState.boards
				.find((board) => board.id === selectedBoard.id)
				?.tiles.filter((tile) => tile.type === 'combat')
				.at(-1)?.id ?? null;
	}
</script>

<div class="h-full min-h-0 overflow-hidden p-4">
	<section
		class="h-full min-h-0 rounded-xl border border-border-strong/60 bg-surface/95 shadow-sm overflow-hidden flex flex-col"
	>
		<header class="px-4 py-3 border-b border-border space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="text-xl font-bold text-ink" style="font-family: var(--font-serif)">
					Combat Tracker
				</h1>
				<span class="text-[11px] px-2 py-0.5 rounded border border-border/70 text-ink-muted">
					Shortcuts: <span class="font-mono">a</span> add, <span class="font-mono">n</span> next turn
				</span>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<label class="text-xs text-ink-muted">
					Board
					<select
						class="ml-2 h-8 rounded border border-border bg-surface px-2 text-sm"
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
				{#if combatTiles.length > 1}
					<label class="text-xs text-ink-muted">
						Combat Tile
						<select
							class="ml-2 h-8 rounded border border-border bg-surface px-2 text-sm"
							value={selectedCombatTile?.id ?? ''}
							onchange={(event) =>
								(selectedCombatTileId = (event.currentTarget as HTMLSelectElement).value)}
						>
							{#each combatTiles as tile (tile.id)}
								<option value={tile.id}>{tile.id}</option>
							{/each}
						</select>
					</label>
				{/if}
				<button
					type="button"
					class="h-8 px-3 rounded border border-border text-xs hover:bg-surface-alt transition-colors"
					onclick={() => void addCombatTile()}
					disabled={!selectedBoard}
				>
					Add Combat Tile
				</button>
				<a
					href={resolve('/session/boards')}
					class="h-8 px-3 inline-flex items-center rounded border border-border text-xs hover:bg-surface-alt transition-colors"
				>
					Open Session Board
				</a>
			</div>
		</header>

		<div class="flex-1 min-h-0 p-3">
			{#if boards.length === 0}
				<div
					class="h-full rounded border border-dashed border-border/70 flex items-center justify-center"
				>
					<div class="text-center px-4">
						<p class="text-sm text-ink">No session boards found.</p>
						<p class="text-xs text-ink-muted mt-1">
							Create a board with a combat tracker tile to begin.
						</p>
						<button
							type="button"
							class="mt-3 px-3 py-1.5 rounded bg-accent hover:bg-accent-hover text-white text-xs"
							onclick={() => void createBoardWithCombat()}
							disabled={creatingBoard}
						>
							{creatingBoard ? 'Creating...' : 'Create Combat Board'}
						</button>
					</div>
				</div>
			{:else if !selectedCombatTile}
				<div
					class="h-full rounded border border-dashed border-border/70 flex items-center justify-center"
				>
					<div class="text-center px-4">
						<p class="text-sm text-ink">Selected board has no combat tile.</p>
						<p class="text-xs text-ink-muted mt-1">
							Add a combat tracker tile from this route or from Session Board edit mode.
						</p>
						<button
							type="button"
							class="mt-3 px-3 py-1.5 rounded border border-border text-xs hover:bg-surface-alt transition-colors"
							onclick={() => void addCombatTile()}
						>
							Add Combat Tile
						</button>
					</div>
				</div>
			{:else}
				<div class="h-full min-h-0">
					<CombatTrackerTile
						tile={selectedCombatTile}
						standalone
						onselect={() => undefined}
						onupdate={(combat) => {
							if (!selectedBoard) return;
							void sessionBoardsState.updateTile(selectedBoard.id, selectedCombatTile.id, {
								combat,
							});
						}}
					/>
				</div>
			{/if}
		</div>
	</section>
</div>
