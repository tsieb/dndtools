<script lang="ts">
	import { nanoid } from 'nanoid';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CollapsibleLocalNavSection from '$lib/ui/layout/local-nav/CollapsibleLocalNavSection.svelte';
	import Dialog from '$lib/ui/common/Dialog.svelte';
	import SessionEndWorkflowDialog from '$lib/ui/session/SessionEndWorkflowDialog.svelte';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { ui } from '$lib/state/ui.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { listRollableTables, rollRollableTable } from '$lib/domain/rollable-tables.js';
	import SessionDiceBar from '$lib/ui/dice/SessionDiceBar.svelte';
	import { toastState } from '$lib/state/toast.svelte.js';
	import EmptyState from '$lib/ui/common/EmptyState.svelte';
	import { featureSettingsState } from '$lib/state/feature-settings.svelte.js';
	import type { RollableTableEntry } from '$lib/domain/rollable-tables.js';

	interface Props {
		ondice: () => void;
	}

	let { ondice }: Props = $props();

	const activeBoard = $derived(sessionBoardsState.activeBoard);
	const mostRecentBoard = $derived(sessionBoardsState.boards[0] ?? null);
	const isSessionActive = $derived(sessionModeState.isActive);
	const activeSession = $derived(sessionModeState.activeSession);
	const activeSceneTitle = $derived.by(() => {
		if (!activeBoard || !activeSession?.sceneId) return null;
		const scene = activeBoard.scenes?.find((entry) => entry.id === activeSession.sceneId);
		return scene?.title ?? null;
	});
	let showStartDialog = $state(false);
	let showEndSessionFlow = $state(false);
	let startMode = $state<'continue' | 'new'>('continue');
	let sessionTab = $state<'controls' | 'tables'>('controls');
	let newSessionName = $state('Session Board');
	let latestTableResultById = $state<Record<string, string>>({});
	let now = $state(Date.now());
	const initiativeSummary = $derived.by(() => {
		if (!activeSession?.combatActive || activeSession.combatants.length === 0) return null;
		const activeCombatant = activeSession.combatants[activeSession.activeCombatantIndex] ?? null;
		return {
			round: activeSession.currentRound,
			activeCombatantName: activeCombatant?.name ?? null,
			combatantCount: activeSession.combatants.length,
		};
	});
	$effect(() => {
		if (!isSessionActive) return;
		const id = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(id);
	});

	const elapsedSessionText = $derived.by(() => {
		if (!activeSession) return '00:00';
		const startedMs = Date.parse(activeSession.startedAt);
		if (!Number.isFinite(startedMs)) return '00:00';
		const ms = Math.max(0, now - startedMs);
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) {
			return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
		}
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	});
	const pinnedTableIds = $derived(sessionModeState.pinnedRollableTableIds);
	const randomTablesEnabled = $derived(featureSettingsState.isAdvancedEnabled('random_tables'));
	const rollableTables = $derived.by(() => listRollableTables(notesState.activeNotes));
	const pinnedRollableTables = $derived.by(() =>
		rollableTables.filter((table) => pinnedTableIds.includes(table.id)),
	);
	const unpinnedRollableTables = $derived.by(() =>
		rollableTables.filter((table) => !pinnedTableIds.includes(table.id)),
	);

	$effect(() => {
		if (!sessionBoardsState.loading && sessionBoardsState.boards.length === 0) {
			void sessionBoardsState.loadAll();
		}
	});

	$effect(() => {
		if (!sessionModeState.loaded) {
			void sessionModeState.load();
		}
	});

	$effect(() => {
		if (randomTablesEnabled) return;
		if (sessionTab !== 'controls') {
			sessionTab = 'controls';
		}
	});

	function closeOnMobile(): void {
		if (layoutState.isCompact) {
			ui.sidebarOpen = false;
		}
	}

	function openSessionBoard(): void {
		goto(resolve('/session/boards'));
		closeOnMobile();
	}

	function learnAboutSessionBoards(): void {
		toastState.info(
			'Session boards combine scenes, references, initiative, and handouts in one view.',
		);
		openSessionBoard();
	}

	function promptStartSession(): void {
		startMode = mostRecentBoard ? 'continue' : 'new';
		newSessionName = mostRecentBoard?.name ?? 'Session Board';
		showStartDialog = true;
	}

	async function confirmStartSession(): Promise<void> {
		if (startMode === 'continue' && mostRecentBoard) {
			sessionBoardsState.setActiveBoard(mostRecentBoard.id);
			await sessionModeState.startSession({
				sessionBoardId: mostRecentBoard.id,
				sceneId: mostRecentBoard.activeSceneId ?? null,
			});
			showStartDialog = false;
			openSessionBoard();
			return;
		}
		const board = await sessionBoardsState.createBoard(newSessionName);
		await sessionModeState.startSession({
			sessionBoardId: board.id,
			sceneId: board.activeSceneId ?? null,
		});
		showStartDialog = false;
		openSessionBoard();
	}

	function openDiceTray(): void {
		ondice();
		closeOnMobile();
	}

	function openSourceNote(table: RollableTableEntry): void {
		void goto(resolve(`/knowledge/notes/${table.sourceNoteId}`));
		closeOnMobile();
	}

	async function rollFromTable(table: RollableTableEntry): Promise<void> {
		const rolled = rollRollableTable(table);
		latestTableResultById = {
			...latestTableResultById,
			[table.id]: rolled.result,
		};
		try {
			await sessionModeState.recordTableRoll({
				id: nanoid(12),
				source: 'table',
				tableName: table.tableName,
				result: rolled.result,
			});
		} catch {
			toastState.error('Failed to record table roll to session history.');
		}
	}

	async function togglePinnedTable(tableId: string): Promise<void> {
		await sessionModeState.togglePinnedRollableTable(tableId);
	}

	async function openRollableTableExample(): Promise<void> {
		if (rollableTables.length > 0) {
			openSourceNote(rollableTables[0]!);
			return;
		}
		const note = await notesState.createNote({
			title: 'Rollable Table Example',
			tags: ['session', 'table'],
			content: `---
rollable: true
tags: [session, table]
---

# Tavern Rumors

| d6 | Rumor |
| --- | --- |
| 1 | A caravan vanished on the old road. |
| 2 | The miller pays in silver for fresh wolf pelts. |
| 3 | A ghostly lantern appears near the bridge at dusk. |
| 4 | The mayor is hiring discreet troubleshooters. |
| 5 | Someone mapped secret tunnels under the chapel. |
| 6 | A noble family heirloom is hidden in the watchtower. |
`,
		});
		await goto(resolve(`/knowledge/notes/${note.id}`));
		closeOnMobile();
	}
</script>

<nav class="space-y-2 pb-2" aria-label="Session navigation">
	{#if playerModeState.enabled}
		<div class="px-3 pt-2">
			<p
				class="rounded-md border border-emerald-300/60 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/25 dark:text-emerald-200"
			>
				Player Mode Active. DM session controls are hidden.
			</p>
		</div>
	{:else}
		<div class="px-3 pt-2">
			<div
				class="grid gap-1 rounded-md border border-border bg-surface p-1 {randomTablesEnabled
					? 'grid-cols-2'
					: 'grid-cols-1'}"
				role="tablist"
				aria-label="Session panel views"
			>
				<button
					type="button"
					class="rounded px-2 py-1 text-xs font-medium transition-colors {sessionTab === 'controls'
						? 'bg-accent-subtle text-accent'
						: 'text-ink-muted hover:bg-surface-alt'}"
					role="tab"
					aria-selected={sessionTab === 'controls'}
					onclick={() => (sessionTab = 'controls')}
				>
					Controls
				</button>
				{#if randomTablesEnabled}
					<button
						type="button"
						class="rounded px-2 py-1 text-xs font-medium transition-colors {sessionTab === 'tables'
							? 'bg-accent-subtle text-accent'
							: 'text-ink-muted hover:bg-surface-alt'}"
						role="tab"
						aria-selected={sessionTab === 'tables'}
						onclick={() => (sessionTab = 'tables')}
					>
						Tables
					</button>
				{/if}
			</div>
		</div>

		{#if sessionTab === 'controls'}
			<CollapsibleLocalNavSection section="session" sectionId="active-board" title="Active Board">
				{#if isSessionActive && activeBoard}
					<div class="rounded-md border border-accent/35 bg-accent-subtle/40 p-2 text-xs">
						<p class="font-semibold text-ink">{activeBoard.name}</p>
						<p class="mt-1 text-ink-muted">Session active for {elapsedSessionText}</p>
						<p class="text-ink-faint">
							Scene: {activeSceneTitle ?? activeBoard.name}
						</p>
					</div>
					<button
						type="button"
						class="mt-2 w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg"
						onclick={openSessionBoard}
					>
						Open session board
					</button>
					<button
						type="button"
						class="mt-2 w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg"
						onclick={() => (showEndSessionFlow = true)}
					>
						End Session
					</button>
				{:else if activeBoard}
					<div class="rounded-md border border-border bg-surface p-2 text-xs">
						<p class="font-semibold text-ink">{activeBoard.name}</p>
						<p class="mt-1 text-ink-muted">
							Scene: {activeBoard.name} | Tiles: {activeBoard.tiles.length}
						</p>
					</div>
				{:else if sessionBoardsState.boards.length === 0 && !isSessionActive}
					<EmptyState
						class="min-h-0 px-0 py-1"
						illustration="session"
						headline="Your sessions start here"
						body="Session boards are your live-play command center - scenes, NPCs, initiative, and handouts in one view."
						primaryAction={{ label: 'Start a session', onclick: promptStartSession }}
						secondaryAction={{
							label: 'Learn about session boards',
							onclick: learnAboutSessionBoards,
						}}
					/>
				{:else if sessionBoardsState.boards.length === 0}
					<EmptyState
						class="min-h-0 px-0 py-1"
						illustration="session"
						headline="Your sessions start here"
						body="Create a session board to begin organizing live-play controls."
						primaryAction={{ label: 'Start a session', onclick: promptStartSession }}
						secondaryAction={{
							label: 'Learn about session boards',
							onclick: learnAboutSessionBoards,
						}}
					/>
				{:else}
					<div class="space-y-2">
						<button
							type="button"
							class="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-accent-hover"
							onclick={promptStartSession}
						>
							Start Session
						</button>
					</div>
				{/if}
			</CollapsibleLocalNavSection>

			<CollapsibleLocalNavSection
				section="session"
				sectionId="initiative-status"
				title="Initiative Status"
			>
				{#if initiativeSummary}
					<div class="space-y-1 rounded-md border border-border bg-surface p-2 text-xs">
						<p class="text-ink">Round {initiativeSummary.round}</p>
						<p class="text-ink-muted">
							{initiativeSummary.activeCombatantName
								? `Active: ${initiativeSummary.activeCombatantName}`
								: 'No active combatant'}
						</p>
						<p class="text-ink-faint">
							Combatants: {initiativeSummary.combatantCount}
						</p>
					</div>
				{:else}
					<p class="px-2.5 py-1.5 text-xs text-ink-faint">No active combat encounter</p>
				{/if}
			</CollapsibleLocalNavSection>
		{:else if randomTablesEnabled}
			<section class="mx-2 rounded-md border border-border bg-surface p-2.5">
				<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
					Rollable Tables
				</p>

				{#if pinnedRollableTables.length > 0}
					<div class="mb-3 space-y-1.5">
						<p class="text-2xs font-semibold uppercase tracking-wide text-ink-faint">Pinned</p>
						{#each pinnedRollableTables as table (table.id)}
							<div class="rounded-md border border-border/70 bg-surface-alt/45 p-2">
								<div class="flex items-start justify-between gap-2">
									<button
										type="button"
										class="min-w-0 flex-1 truncate text-left text-xs font-medium text-ink hover:underline"
										onclick={() => openSourceNote(table)}
										aria-label={`Open ${table.sourceNoteTitle}`}
									>
										{table.tableName}
									</button>
									<button
										type="button"
										class="rounded border border-border px-1.5 py-0.5 text-2xs text-ink-muted hover:bg-surface"
										onclick={() => void togglePinnedTable(table.id)}
									>
										Unpin
									</button>
								</div>
								<div class="mt-1 flex items-center justify-between gap-2">
									<p class="text-2xs text-ink-faint">{table.rowCount} rows</p>
									<button
										type="button"
										class="rounded border border-border px-2 py-0.5 text-2xs text-ink-muted hover:bg-surface"
										onclick={() => void rollFromTable(table)}
									>
										Roll
									</button>
								</div>
								{#if latestTableResultById[table.id]}
									<p
										class="mt-1 rounded border border-accent/35 bg-accent-subtle/45 px-1.5 py-1 text-2xs text-ink animate-fade-in"
									>
										{latestTableResultById[table.id]}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				{#if rollableTables.length === 0}
					<EmptyState
						class="min-h-0 px-0 py-1"
						illustration="session-tables"
						headline="No rollable tables yet"
						body="Tag any markdown table with `rollable: true` in its frontmatter to add it here."
						primaryAction={{ label: 'Open example note', onclick: openRollableTableExample }}
					/>
				{:else if unpinnedRollableTables.length === 0}
					<p class="text-xs text-ink-faint">All discovered tables are pinned above.</p>
				{:else}
					<div class="space-y-1.5">
						{#each unpinnedRollableTables as table (table.id)}
							<div class="rounded-md border border-border/70 bg-surface-alt/35 p-2">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<button
											type="button"
											class="max-w-full truncate text-left text-xs font-medium text-ink hover:underline"
											onclick={() => openSourceNote(table)}
											aria-label={`Open ${table.sourceNoteTitle}`}
										>
											{table.tableName}
										</button>
										<p class="truncate text-2xs text-ink-faint">{table.sourceNoteTitle}</p>
									</div>
									<button
										type="button"
										class="rounded border border-border px-1.5 py-0.5 text-2xs text-ink-muted hover:bg-surface"
										onclick={() => void togglePinnedTable(table.id)}
									>
										Pin
									</button>
								</div>
								<div class="mt-1 flex items-center justify-between gap-2">
									<p class="text-2xs text-ink-faint">{table.rowCount} rows</p>
									<button
										type="button"
										class="rounded border border-border px-2 py-0.5 text-2xs text-ink-muted hover:bg-surface"
										onclick={() => void rollFromTable(table)}
									>
										Roll
									</button>
								</div>
								{#if latestTableResultById[table.id]}
									<p
										class="mt-1 rounded border border-accent/35 bg-accent-subtle/45 px-1.5 py-1 text-2xs text-ink animate-fade-in"
									>
										{latestTableResultById[table.id]}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{:else}
			<section class="mx-2 rounded-md border border-border bg-surface p-2.5 text-xs text-ink-muted">
				Enable Random Tables in Settings -> Features to unlock table rolls here.
			</section>
		{/if}
	{/if}

	<section
		class="rounded-md border border-border bg-surface p-2.5"
		aria-label="Session dice controls"
	>
		<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Dice</p>
		{#if isSessionActive}
			<SessionDiceBar source="tray" oncustom={openDiceTray} />
		{:else}
			<button
				type="button"
				class="flex w-full items-center justify-center gap-2 rounded-md border border-border px-2.5 py-2 text-sm font-medium text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-bg hover:text-ink"
				onclick={openDiceTray}
				aria-label="Open Dice Tray"
			>
				<img src="/icons/dice/d20.svg" alt="" class="h-4 w-4" />
				<span>Dice Tray (Ctrl+D)</span>
			</button>
		{/if}
	</section>
</nav>

<Dialog
	open={showStartDialog}
	title="Start Session"
	maxWidth="sm"
	onclose={() => (showStartDialog = false)}
>
	<div class="space-y-3 text-sm text-ink">
		{#if mostRecentBoard}
			<label class="flex items-start gap-2">
				<input type="radio" bind:group={startMode} value="continue" />
				<span>Continue {mostRecentBoard.name}</span>
			</label>
		{/if}
		<label class="flex items-start gap-2">
			<input type="radio" bind:group={startMode} value="new" />
			<span>Start new session</span>
		</label>
		{#if startMode === 'new'}
			<input
				type="text"
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
				bind:value={newSessionName}
				placeholder="Session name"
			/>
		{/if}
		<div class="flex justify-end gap-2">
			<button
				class="rounded border border-border px-3 py-1.5 text-xs"
				onclick={() => (showStartDialog = false)}
			>
				Cancel
			</button>
			<button
				class="rounded bg-accent px-3 py-1.5 text-xs text-white"
				onclick={() => void confirmStartSession()}
			>
				Start Session
			</button>
		</div>
	</div>
</Dialog>

<SessionEndWorkflowDialog
	open={showEndSessionFlow}
	sessionboardid={activeSession?.sessionBoardId ?? activeBoard?.id ?? null}
	onclose={() => (showEndSessionFlow = false)}
/>
