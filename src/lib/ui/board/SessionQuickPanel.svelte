<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { nanoid } from 'nanoid';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { listRollableTables, rollRollableTable } from '$lib/domain/rollable-tables.js';
	import { normalizeSessionBoardTimerState } from '$lib/domain/session-board.js';
	import type { RollableTableEntry } from '$lib/domain/rollable-tables.js';
	import type { SessionBoardTile } from '$lib/types/session-board.js';
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();
	let nowMs = $state(Date.now());
	let latestPinnedTableRollById = $state<Record<string, string>>({});

	let activeBoard = $derived(sessionBoardsState.activeBoard);
	let activeNotesById = $derived(notesState.activeNoteById);
	let tiles = $derived.by(() => activeBoard?.tiles ?? []);
	let pinnedRollableTables = $derived.by(() => {
		const tables = listRollableTables(notesState.activeNotes);
		const pinned = new Set(sessionModeState.pinnedRollableTableIds);
		return tables.filter((table) => pinned.has(table.id));
	});

	function tileType(
		tile: SessionBoardTile,
	): 'note' | 'calendar' | 'timer' | 'combat' | 'encounter' | 'dice' | 'generator' | 'handouts' {
		switch (tile.type) {
			case 'calendar':
			case 'combat':
			case 'encounter':
			case 'dice':
			case 'generator':
			case 'handouts':
			case 'timer':
			case 'note':
				return tile.type;
			default:
				return 'note';
		}
	}

	function notePreview(noteId: string): string {
		const note = activeNotesById.get(noteId as never);
		if (!note) return 'Missing note';
		const firstLine = note.content
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0);
		return firstLine ?? 'No content yet';
	}

	function timerDisplay(tile: SessionBoardTile): string {
		if (tileType(tile) !== 'timer') return '';
		const timer = normalizeSessionBoardTimerState(tile.timer);
		const elapsed =
			timer.running && timer.startedAtMs !== null
				? timer.accumulatedMs + Math.max(0, nowMs - timer.startedAtMs)
				: timer.accumulatedMs;
		const value = timer.mode === 'countdown' ? Math.max(0, timer.countdownMs - elapsed) : elapsed;
		const totalSeconds = Math.max(0, Math.floor(value / 1000));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return hours > 0
			? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
			: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	function openTile(tile: SessionBoardTile): void {
		const type = tileType(tile);
		if (type === 'note' && tile.noteId) {
			void goto(resolve(`/knowledge/notes/${tile.noteId}`));
			onclose();
			return;
		}
		if (type === 'combat') {
			void goto(resolve('/session/combat'));
			onclose();
			return;
		}
		if (type === 'encounter') {
			void goto(resolve('/session/encounter/new'));
			onclose();
			return;
		}
		if (type === 'dice') {
			void goto(resolve('/session/boards'));
			onclose();
			return;
		}
		if (type === 'generator') {
			void goto(resolve('/session/boards'));
			onclose();
			return;
		}
		if (type === 'handouts') {
			void goto(`${resolve('/settings')}?tab=handouts`);
			onclose();
			return;
		}
		void goto(resolve('/session/boards'));
		onclose();
	}

	async function rollPinnedTable(table: RollableTableEntry): Promise<void> {
		const rolled = rollRollableTable(table);
		latestPinnedTableRollById = {
			...latestPinnedTableRollById,
			[table.id]: rolled.result,
		};
		await sessionModeState.recordTableRoll({
			id: nanoid(12),
			source: 'table',
			tableName: table.tableName,
			result: rolled.result,
		});
	}

	function handleBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) onclose();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}

	$effect(() => {
		if (!open) return;
		const interval = window.setInterval(() => {
			nowMs = Date.now();
		}, 500);
		return () => window.clearInterval(interval);
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 bg-black/45 flex items-start justify-end p-4 sm:p-6"
		role="dialog"
		aria-modal="true"
		aria-label="Session quick panel"
		use:focusTrap
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<section
			class="w-full max-w-xl max-h-[82vh] rounded-xl border border-border bg-surface/98 shadow-2xl flex flex-col overflow-hidden"
		>
			<header class="px-4 py-3 border-b border-border flex items-center gap-2">
				<div class="flex-1 min-w-0">
					<h2 class="text-sm font-semibold text-ink truncate">
						{activeBoard ? `${activeBoard.name} quick panel` : 'Session quick panel'}
					</h2>
					<p class="text-xs text-ink-muted">Ctrl+Shift+B toggles this overlay from any route.</p>
				</div>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border text-xs hover:bg-surface-alt transition-colors"
					onclick={onclose}
				>
					Close
				</button>
			</header>

			<div class="flex-1 min-h-0 overflow-y-auto p-3">
				{#if pinnedRollableTables.length > 0}
					<section class="mb-3 rounded-lg border border-border p-2.5">
						<p class="text-2xs font-semibold uppercase tracking-wide text-ink-faint">
							Pinned Rollable Tables
						</p>
						<div class="mt-2 space-y-1.5">
							{#each pinnedRollableTables as table (table.id)}
								<div class="rounded-md border border-border/70 bg-surface-alt/35 p-2">
									<div class="flex items-center justify-between gap-2">
										<p class="truncate text-xs font-medium text-ink">{table.tableName}</p>
										<button
											type="button"
											class="rounded border border-border px-2 py-0.5 text-2xs text-ink-muted hover:bg-surface"
											onclick={() => void rollPinnedTable(table)}
										>
											Roll
										</button>
									</div>
									{#if latestPinnedTableRollById[table.id]}
										<p
											class="mt-1 rounded border border-accent/35 bg-accent-subtle/45 px-1.5 py-1 text-2xs text-ink animate-fade-in"
										>
											{latestPinnedTableRollById[table.id]}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/if}

				{#if !activeBoard}
					<div class="rounded-lg border border-border p-3 text-xs text-ink-muted">
						No active board. Open Session Board and select one first.
					</div>
				{:else if tiles.length === 0}
					<div class="rounded-lg border border-border p-3 text-xs text-ink-muted">
						This board has no tiles yet.
					</div>
				{:else}
					<div class="grid gap-2 sm:grid-cols-2">
						{#each tiles as tile (tile.id)}
							<button
								type="button"
								class="rounded-lg border border-border p-2.5 text-left hover:bg-surface-alt/70 transition-colors"
								onclick={() => openTile(tile)}
							>
								<div class="text-xs uppercase tracking-wider text-ink-faint">
									{tileType(tile) === 'note'
										? tile.noteId
											? 'Note'
											: 'Note slot'
										: tileType(tile) === 'timer'
											? 'Timer'
											: tileType(tile) === 'combat'
												? 'Combat'
												: tileType(tile) === 'encounter'
													? 'Encounter'
													: tileType(tile) === 'dice'
														? 'Dice'
														: tileType(tile) === 'generator'
															? 'Generator'
															: tileType(tile) === 'handouts'
																? 'Handouts'
																: 'Calendar'}
								</div>
								{#if tileType(tile) === 'note'}
									<div class="text-sm font-medium text-ink mt-0.5 truncate">
										{tile.noteId
											? (activeNotesById.get(tile.noteId)?.title ?? 'Missing note')
											: 'Unassigned'}
									</div>
									<div class="text-xs text-ink-muted truncate mt-0.5">
										{tile.noteId
											? notePreview(tile.noteId)
											: 'Assign a note from Session Board edit mode.'}
									</div>
								{:else if tileType(tile) === 'timer'}
									<div class="font-mono text-2xl tabular-nums text-ink mt-0.5">
										{timerDisplay(tile)}
									</div>
									<div class="text-xs text-ink-muted">Open Session Board to control timer.</div>
								{:else if tileType(tile) === 'combat'}
									<div class="text-sm font-medium text-ink mt-0.5">Combat Tracker</div>
									<div class="text-xs text-ink-muted">
										Open Combat route for full initiative controls.
									</div>
								{:else if tileType(tile) === 'encounter'}
									<div class="text-sm font-medium text-ink mt-0.5">Encounter Builder</div>
									<div class="text-xs text-ink-muted">
										Build and balance encounters with CR budgeting.
									</div>
								{:else if tileType(tile) === 'dice'}
									<div class="text-sm font-medium text-ink mt-0.5">Dice Tray</div>
									<div class="text-xs text-ink-muted">Open Session Board to use roll controls.</div>
								{:else if tileType(tile) === 'generator'}
									<div class="text-sm font-medium text-ink mt-0.5">Generator</div>
									<div class="text-xs text-ink-muted">
										Open Session Board to use random generation tools.
									</div>
								{:else if tileType(tile) === 'handouts'}
									<div class="text-sm font-medium text-ink mt-0.5">Handout Library</div>
									<div class="text-xs text-ink-muted">
										Open Settings to deliver and manage handouts.
									</div>
								{:else}
									<div class="text-sm font-medium text-ink mt-0.5">Calendar Reference</div>
									<div class="text-xs text-ink-muted">Open Session Board to view details.</div>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>
{/if}
