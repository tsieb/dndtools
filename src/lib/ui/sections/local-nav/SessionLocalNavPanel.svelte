<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CollapsibleLocalNavSection from '$lib/ui/layout/local-nav/CollapsibleLocalNavSection.svelte';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { diceState } from '$lib/state/dice.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import type { SessionBoardCombatTile } from '$lib/types/session-board.js';

	interface Props {
		ondice: () => void;
	}

	let { ondice }: Props = $props();

	const activeBoard = $derived(sessionBoardsState.activeBoard);
	const mostRecentBoard = $derived(sessionBoardsState.boards[0] ?? null);
	const activeCombatTile = $derived.by<SessionBoardCombatTile | null>(() => {
		if (!activeBoard) return null;
		const tile = activeBoard.tiles.find((entry) => entry.type === 'combat');
		return tile && tile.type === 'combat' ? tile : null;
	});
	const initiativeSummary = $derived.by(() => {
		const combat = activeCombatTile?.combat;
		if (!combat) return null;
		const activeCombatant =
			combat.combatants.find((entry) => entry.id === combat.activeCombatantId) ?? null;
		return {
			round: combat.round,
			activeCombatantName: activeCombatant?.name ?? null,
			combatantCount: combat.combatants.length,
		};
	});

	$effect(() => {
		if (!sessionBoardsState.loading && sessionBoardsState.boards.length === 0) {
			void sessionBoardsState.loadAll();
		}
	});

	function closeOnMobile(): void {
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	function startSession(): void {
		goto(resolve('/session/boards'));
		closeOnMobile();
	}

	function resumeMostRecentBoard(): void {
		if (!mostRecentBoard) return;
		sessionBoardsState.setActiveBoard(mostRecentBoard.id);
		startSession();
	}

	function openDiceTray(): void {
		ondice();
		closeOnMobile();
	}

	function rollQuickDie(die: string): void {
		diceState.roll(`1${die}`, 'tray');
		openDiceTray();
	}
</script>

<nav class="space-y-2 pb-2" aria-label="Local navigation: Session panel">
	{#if playerModeState.enabled}
		<div class="px-3 pt-2">
			<p
				class="rounded-md border border-emerald-300/60 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-200"
			>
				Player Mode Active. DM session controls are hidden.
			</p>
		</div>
	{:else}
		<CollapsibleLocalNavSection section="session" sectionId="active-board" title="Active Board">
			{#if activeBoard}
				<div
					class="rounded-md border border-border bg-surface p-2 text-xs dark:border-tavern-border dark:bg-tavern-surface"
				>
					<p class="font-semibold text-ink dark:text-tavern-text">{activeBoard.name}</p>
					<p class="mt-1 text-ink-muted dark:text-tavern-muted">
						Scene: {activeBoard.name} | Tiles: {activeBoard.tiles.length}
					</p>
				</div>
			{:else}
				<div class="space-y-2">
					<button
						type="button"
						class="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-accent-hover dark:bg-tavern-accent dark:text-tavern-bg dark:hover:bg-tavern-accent-hover"
						onclick={startSession}
					>
						Start Session
					</button>
					{#if mostRecentBoard}
						<button
							type="button"
							class="w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-bg"
							onclick={resumeMostRecentBoard}
						>
							<div class="font-medium text-ink dark:text-tavern-text">
								Resume {mostRecentBoard.name}
							</div>
							<div class="mt-0.5 text-[10px] text-ink-faint dark:text-tavern-faint">
								Most recent board
							</div>
						</button>
					{/if}
				</div>
			{/if}
		</CollapsibleLocalNavSection>

		<CollapsibleLocalNavSection
			section="session"
			sectionId="initiative-status"
			title="Initiative Status"
		>
			{#if initiativeSummary}
				<div
					class="space-y-1 rounded-md border border-border bg-surface p-2 text-xs dark:border-tavern-border dark:bg-tavern-surface"
				>
					<p class="text-ink dark:text-tavern-text">Round {initiativeSummary.round}</p>
					<p class="text-ink-muted dark:text-tavern-muted">
						{initiativeSummary.activeCombatantName
							? `Active: ${initiativeSummary.activeCombatantName}`
							: 'No active combatant'}
					</p>
					<p class="text-ink-faint dark:text-tavern-faint">
						Combatants: {initiativeSummary.combatantCount}
					</p>
				</div>
			{:else}
				<p class="px-2.5 py-1.5 text-xs text-ink-faint dark:text-tavern-faint">
					No active combat encounter
				</p>
			{/if}
		</CollapsibleLocalNavSection>
	{/if}

	<CollapsibleLocalNavSection section="session" sectionId="quick-dice" title="Quick Dice">
		<div class="grid grid-cols-4 gap-1 px-2.5">
			{#each ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as die (die)}
				<button
					type="button"
					class="rounded-md border border-border px-1.5 py-1 text-[11px] font-semibold text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment hover:text-ink dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-bg dark:hover:text-tavern-text"
					onclick={() => rollQuickDie(die)}
					aria-label={`Roll ${die} and open dice tray`}
				>
					{die}
				</button>
			{/each}
		</div>
		<button
			type="button"
			class="mt-2 w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-parchment dark:border-tavern-border dark:text-tavern-muted dark:hover:bg-tavern-bg"
			onclick={openDiceTray}
		>
			Open full dice tray
		</button>
	</CollapsibleLocalNavSection>
</nav>
