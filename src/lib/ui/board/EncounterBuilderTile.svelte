<script lang="ts">
	import { nanoid } from 'nanoid';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import {
		buildEnvironmentChecklist,
		buildLairActionsFromStatBlock,
		buildLegendaryActionsFromStatBlock,
		createDefaultEncounterState,
		getEncounterDifficultyMeterPercent,
		inferEnvironmentTypeFromNote,
		normalizeEncounterState,
		parseChallengeRating,
		xpForChallengeRating,
	} from '$lib/domain/encounter-builder.js';
	import type {
		SessionBoardEncounterPartyMember,
		SessionBoardEncounterState,
		SessionBoardEncounterTile,
		SessionBoardId,
	} from '$lib/types/session-board.js';
	import type { Note } from '$lib/types/note.js';
	import type { CharacterObject, StatBlockObject, VaultObject } from '$lib/types/object.js';

	interface Props {
		tile: SessionBoardEncounterTile;
		boardId?: SessionBoardId;
		selected?: boolean;
		editable?: boolean;
		standalone?: boolean;
		onselect: () => void;
		onupdate: (encounter: SessionBoardEncounterState) => void;
		ondragstart?: (event: PointerEvent) => void;
	}

	let {
		tile,
		boardId,
		selected = false,
		editable = false,
		standalone = false,
		onselect,
		onupdate,
		ondragstart = () => undefined,
	}: Props = $props();

	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let statBlockQuery = $state('');
	let partySynced = $state(false);

	let linkedObjects = $state<VaultObject[]>([]);
	let encounter = $derived.by(() =>
		normalizeEncounterState(tile.encounter ?? createDefaultEncounterState()),
	);
	let statBlocks = $derived.by(() =>
		linkedObjects
			.filter((entry): entry is StatBlockObject => entry.type === 'stat_block')
			.sort((a, b) => a.name.localeCompare(b.name)),
	);
	let characterObjects = $derived.by(() =>
		linkedObjects
			.filter((entry): entry is CharacterObject => entry.type === 'character')
			.sort((a, b) => a.name.localeCompare(b.name)),
	);
	let objectById = $derived.by(
		() => new Map(linkedObjects.map((entry) => [String(entry.id), entry])),
	);
	let notesById = $derived(notesState.activeNoteById);
	let board = $derived.by(() => {
		if (boardId) return sessionBoardsState.boards.find((entry) => entry.id === boardId) ?? null;
		return sessionBoardsState.activeBoard ?? null;
	});
	let filteredStatBlocks = $derived.by(() => {
		const query = statBlockQuery.trim().toLowerCase();
		if (!query) return statBlocks.slice(0, 40);
		return statBlocks
			.filter((entry) => {
				if (entry.name.toLowerCase().includes(query)) return true;
				if (entry.summary.toLowerCase().includes(query)) return true;
				return entry.tags.some((tag) => tag.toLowerCase().includes(query));
			})
			.slice(0, 40);
	});
	let environmentCandidates = $derived.by(() => {
		return notesState.activeNotes
			.filter((note) => {
				const tags = note.tags.map((tag) => tag.toLowerCase());
				if (
					tags.some((tag) =>
						['map', 'location', 'terrain', 'forest', 'dungeon', 'urban', 'water', 'aerial'].some(
							(token) => tag.includes(token),
						),
					)
				) {
					return true;
				}
				const objectKind = String(
					(note.frontmatter['dndtools'] as Record<string, unknown> | undefined)?.['object'] &&
						(
							(note.frontmatter['dndtools'] as Record<string, unknown>)['object'] as Record<
								string,
								unknown
							>
						)['kind'],
				).toLowerCase();
				return objectKind === 'location';
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 60);
	});

	$effect(() => {
		let cancelled = false;
		async function loadObjects(): Promise<void> {
			loading = true;
			loadError = null;
			try {
				const objects = await getStorage().getAllObjects();
				if (cancelled) return;
				linkedObjects = objects.filter(
					(entry) => entry.type === 'stat_block' || entry.type === 'character',
				);
			} catch (error) {
				if (cancelled) return;
				loadError = String(error);
			} finally {
				if (!cancelled) loading = false;
			}
		}
		void loadObjects();
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (partySynced) return;
		if (characterObjects.length === 0) return;
		if (encounter.partyMembers.length > 0) return;
		const linked = derivePartyMembersFromContext();
		if (linked.length === 0) return;
		partySynced = true;
		persist({
			...encounter,
			partyMembers: linked,
		});
	});

	function persist(next: SessionBoardEncounterState): void {
		onupdate(normalizeEncounterState(next));
	}

	function derivePartyMembersFromContext(): SessionBoardEncounterPartyMember[] {
		const contextPartyIds =
			board?.sessionContext?.items
				.filter((item) => item.category === 'party')
				.map((item) => String(item.noteId)) ?? [];
		const fromContext = contextPartyIds
			.map((noteId, index) => {
				const object = objectById.get(noteId);
				if (object && object.type === 'character') {
					return {
						id: `party-${index + 1}-${String(object.id)}`,
						name: object.name,
						level: object.data.level ?? 1,
						linkedObjectId: object.id,
					};
				}
				const note = notesById.get(noteId as never);
				if (!note) return null;
				const level = inferCharacterLevelFromNote(note);
				return {
					id: `party-${index + 1}-${noteId}`,
					name: note.title,
					level,
				};
			})
			.filter((entry): entry is SessionBoardEncounterPartyMember => !!entry);
		if (fromContext.length > 0) return fromContext;

		return characterObjects.slice(0, 8).map((entry, index) => ({
			id: `party-fallback-${index + 1}-${String(entry.id)}`,
			name: entry.name,
			level: entry.data.level ?? 1,
			linkedObjectId: entry.id,
		}));
	}

	function inferCharacterLevelFromNote(note: Note): number {
		const dndtools = note.frontmatter['dndtools'];
		if (typeof dndtools === 'object' && dndtools !== null) {
			const object = (dndtools as Record<string, unknown>)['object'];
			if (typeof object === 'object' && object !== null) {
				const data = (object as Record<string, unknown>)['data'];
				if (typeof data === 'object' && data !== null) {
					const level = Number((data as Record<string, unknown>)['level']);
					if (Number.isFinite(level)) return Math.max(1, Math.min(20, Math.round(level)));
				}
			}
		}
		return 1;
	}

	function syncParty(): void {
		const nextParty = derivePartyMembersFromContext();
		if (nextParty.length === 0) {
			toastState.info('No linked character objects found in session context.');
			return;
		}
		partySynced = true;
		persist({
			...encounter,
			partyMembers: nextParty,
		});
	}

	function addStatBlock(object: StatBlockObject): void {
		const parsed = parseChallengeRating(object.data.challengeRating ?? '');
		const existingIndex = encounter.combatants.findIndex(
			(entry) => entry.statBlockObjectId === object.id,
		);
		if (existingIndex >= 0) {
			const nextCombatants = [...encounter.combatants];
			const existing = nextCombatants[existingIndex];
			if (!existing) return;
			nextCombatants[existingIndex] = {
				...existing,
				count: Math.min(99, existing.count + 1),
			};
			persist({
				...encounter,
				combatants: nextCombatants,
			});
			return;
		}

		const legendaryActions = buildLegendaryActionsFromStatBlock(object);
		const lairActions = buildLairActionsFromStatBlock(object);
		const nextCombatants = [
			...encounter.combatants,
			{
				id: nanoid(10),
				name: object.name,
				count: 1,
				challengeRating: parsed?.normalized ?? object.data.challengeRating ?? '',
				xpPerCreature: parsed?.xp ?? xpForChallengeRating(object.data.challengeRating ?? ''),
				statBlockObjectId: object.id,
				legendaryActions,
				lairActions,
			},
		];
		const hasLegendary = nextCombatants.some((entry) => entry.legendaryActions.length > 0);
		const environmentChecklist = buildEnvironmentChecklist(encounter.environmentType, {
			includeLairHint: hasLegendary,
		});
		persist({
			...encounter,
			combatants: nextCombatants,
			tacticalChecklist:
				environmentChecklist.length > 0 ? environmentChecklist : encounter.tacticalChecklist,
		});
	}

	function removeCombatant(entryId: string): void {
		const nextCombatants = encounter.combatants.filter((entry) => entry.id !== entryId);
		persist({
			...encounter,
			combatants: nextCombatants,
			activeCombatantEntryId:
				encounter.activeCombatantEntryId === entryId ? null : encounter.activeCombatantEntryId,
		});
	}

	function updateCombatantCount(entryId: string, value: number): void {
		const nextCombatants = encounter.combatants.map((entry) =>
			entry.id === entryId
				? { ...entry, count: Math.max(1, Math.min(99, Math.round(value || 1))) }
				: entry,
		);
		persist({
			...encounter,
			combatants: nextCombatants,
		});
	}

	function updateEnvironmentType(value: string): void {
		const nextType =
			value === 'forest' ||
			value === 'dungeon' ||
			value === 'urban' ||
			value === 'water' ||
			value === 'aerial'
				? value
				: null;
		const hasLegendary = encounter.combatants.some((entry) => entry.legendaryActions.length > 0);
		persist({
			...encounter,
			environmentType: nextType,
			tacticalChecklist: buildEnvironmentChecklist(nextType, { includeLairHint: hasLegendary }),
		});
	}

	function setEnvironmentNote(noteId: string): void {
		if (!noteId) {
			persist({
				...encounter,
				environmentNoteId: null,
				environmentName: '',
			});
			return;
		}
		const note = notesById.get(noteId as never) ?? null;
		if (!note) return;
		const inferred = inferEnvironmentTypeFromNote(note);
		const hasLegendary = encounter.combatants.some((entry) => entry.legendaryActions.length > 0);
		persist({
			...encounter,
			environmentNoteId: note.id,
			environmentName: note.title,
			environmentType: inferred ?? encounter.environmentType,
			tacticalChecklist: buildEnvironmentChecklist(inferred ?? encounter.environmentType, {
				includeLairHint: hasLegendary,
			}),
		});
	}

	function toggleChecklistItem(itemId: string): void {
		persist({
			...encounter,
			tacticalChecklist: encounter.tacticalChecklist.map((item) =>
				item.id === itemId ? { ...item, checked: !item.checked } : item,
			),
		});
	}

	function resetChecklist(): void {
		persist({
			...encounter,
			tacticalChecklist: encounter.tacticalChecklist.map((item) => ({ ...item, checked: false })),
		});
	}

	function openStandaloneRoute(): void {
		void goto(resolve('/encounter/new'));
	}

	function difficultyToneClass(
		difficulty: SessionBoardEncounterState['budget']['difficulty'],
	): string {
		if (difficulty === 'trivial') return 'text-ink-muted dark:text-tavern-muted';
		if (difficulty === 'easy') return 'text-emerald-700 dark:text-emerald-300';
		if (difficulty === 'medium') return 'text-sky-700 dark:text-sky-300';
		if (difficulty === 'hard') return 'text-amber-700 dark:text-amber-300';
		if (difficulty === 'deadly') return 'text-orange-700 dark:text-orange-300';
		return 'text-red-700 dark:text-red-300';
	}

	function meterClass(percent: number): string {
		if (percent < 45) return 'bg-emerald-500';
		if (percent < 80) return 'bg-sky-500';
		if (percent < 100) return 'bg-amber-500';
		if (percent < 140) return 'bg-orange-500';
		return 'bg-red-600';
	}

	function handlePointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('a,button,input,textarea,select,label')) return;
		onselect();
		if (!standalone && editable) ondragstart(event);
	}

	function handleTileKeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect();
		}
	}
</script>

<div
	class="relative rounded-lg border bg-surface/95 dark:bg-tavern-surface/95 shadow-sm backdrop-blur-sm flex flex-col h-full transition-[box-shadow,transform] duration-150 cursor-pointer hover:shadow-md {selected
		? 'border-border dark:border-tavern-border ring-2 ring-accent/45 dark:ring-tavern-accent/45 shadow-[0_0_0_1px_rgba(255,255,255,0.65)_inset,0_12px_24px_-16px_rgba(0,0,0,0.65)]'
		: 'border-border dark:border-tavern-border'}"
	role="button"
	tabindex="0"
	aria-label={standalone ? 'Encounter builder' : 'Encounter builder tile'}
	aria-pressed={selected}
	data-board-tile="true"
	onkeydown={handleTileKeydown}
	onclick={(event) => {
		const target = event.target as HTMLElement;
		if (target.closest('a,button,input,textarea,select,label')) return;
		onselect();
	}}
	onpointerdown={handlePointerDown}
>
	<header class="px-3 py-2 border-b border-border dark:border-tavern-border space-y-1">
		<div class="flex items-center gap-2">
			<input
				type="text"
				value={encounter.encounterName}
				onchange={(event) =>
					persist({
						...encounter,
						encounterName: (event.currentTarget as HTMLInputElement).value.slice(0, 120),
					})}
				class="min-w-0 flex-1 px-2 py-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
				placeholder="Encounter name"
				aria-label="Encounter name"
			/>
			<button
				type="button"
				class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				onclick={syncParty}
			>
				Sync Party
			</button>
			{#if !standalone}
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={openStandaloneRoute}
				>
					Open Route
				</button>
			{/if}
		</div>
		<div
			class="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted dark:text-tavern-muted"
		>
			<span>{encounter.partyMembers.length} party members</span>
			<span>{encounter.combatants.length} combatant entries</span>
			<span>Base XP {encounter.budget.baseXp.toLocaleString()}</span>
			<span>Adjusted XP {encounter.budget.adjustedXp.toLocaleString()}</span>
		</div>
	</header>

	<div class="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5">
		<section class="rounded border border-border/70 dark:border-tavern-border/70 p-2">
			<div class="flex items-center justify-between gap-2">
				<p class="text-xs font-semibold text-ink dark:text-tavern-text">Difficulty Budget</p>
				<span class="text-xs font-semibold {difficultyToneClass(encounter.budget.difficulty)}">
					{encounter.budget.difficulty}
				</span>
			</div>
			<div class="mt-2 h-2 rounded bg-surface-alt dark:bg-tavern-surface-alt overflow-hidden">
				<div
					class="h-full transition-all {meterClass(
						getEncounterDifficultyMeterPercent(encounter.budget),
					)}"
					style="width: {Math.min(100, getEncounterDifficultyMeterPercent(encounter.budget))}%"
				></div>
			</div>
			<div class="mt-2 grid grid-cols-2 gap-1 text-[11px] text-ink-muted dark:text-tavern-muted">
				<span>Easy {encounter.budget.easy.toLocaleString()}</span>
				<span>Medium {encounter.budget.medium.toLocaleString()}</span>
				<span>Hard {encounter.budget.hard.toLocaleString()}</span>
				<span>Deadly {encounter.budget.deadly.toLocaleString()}</span>
			</div>
		</section>

		<section class="rounded border border-border/70 dark:border-tavern-border/70 p-2 space-y-2">
			<div class="flex items-center justify-between gap-2">
				<p class="text-xs font-semibold text-ink dark:text-tavern-text">Environment</p>
				<select
					class="h-7 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-xs"
					value={encounter.environmentType ?? ''}
					onchange={(event) =>
						updateEnvironmentType((event.currentTarget as HTMLSelectElement).value)}
				>
					<option value="">None</option>
					<option value="forest">Forest</option>
					<option value="dungeon">Dungeon</option>
					<option value="urban">Urban</option>
					<option value="water">Water</option>
					<option value="aerial">Aerial</option>
				</select>
			</div>
			<label class="block text-[11px] text-ink-muted dark:text-tavern-muted">
				Link map or location note
				<select
					class="mt-1 h-7 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-xs"
					value={encounter.environmentNoteId ?? ''}
					onchange={(event) => setEnvironmentNote((event.currentTarget as HTMLSelectElement).value)}
				>
					<option value="">No linked note</option>
					{#each environmentCandidates as note (note.id)}
						<option value={note.id}>{note.title}</option>
					{/each}
				</select>
			</label>
			{#if encounter.tacticalChecklist.length > 0}
				<div class="space-y-1">
					<div class="flex items-center justify-between">
						<p class="text-[11px] font-semibold text-ink-muted dark:text-tavern-muted">
							Tactical Checklist
						</p>
						<button
							type="button"
							class="text-[11px] px-1.5 py-0.5 rounded border border-border dark:border-tavern-border hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
							onclick={resetChecklist}
						>
							Reset
						</button>
					</div>
					{#each encounter.tacticalChecklist as item (item.id)}
						<label class="flex items-center gap-1.5 text-[11px] text-ink dark:text-tavern-text">
							<input
								type="checkbox"
								checked={item.checked}
								onchange={() => toggleChecklistItem(item.id)}
								class="h-3.5 w-3.5 rounded border-border dark:border-tavern-border"
							/>
							<span>{item.label}</span>
						</label>
					{/each}
				</div>
			{/if}
		</section>

		<section class="rounded border border-border/70 dark:border-tavern-border/70 p-2 space-y-2">
			<p class="text-xs font-semibold text-ink dark:text-tavern-text">Combatants (Stat Blocks)</p>
			<input
				type="text"
				bind:value={statBlockQuery}
				class="h-7 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-xs"
				placeholder="Search stat blocks..."
			/>
			<div class="max-h-28 overflow-y-auto space-y-1">
				{#if loading}
					<p class="text-[11px] text-ink-muted dark:text-tavern-muted">Loading stat blocks...</p>
				{:else if loadError}
					<p class="text-[11px] text-error">{loadError}</p>
				{:else if filteredStatBlocks.length === 0}
					<p class="text-[11px] text-ink-muted dark:text-tavern-muted">No matching stat blocks.</p>
				{:else}
					{#each filteredStatBlocks as object (object.id)}
						<button
							type="button"
							class="w-full text-left rounded border border-border/70 dark:border-tavern-border/70 px-2 py-1 text-[11px] hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
							onclick={() => addStatBlock(object)}
						>
							<span class="font-semibold text-ink dark:text-tavern-text">{object.name}</span>
							<span class="text-ink-muted dark:text-tavern-muted ml-1">
								CR {parseChallengeRating(object.data.challengeRating ?? '')?.normalized ?? 'n/a'}
							</span>
						</button>
					{/each}
				{/if}
			</div>

			{#if encounter.combatants.length === 0}
				<p class="text-[11px] text-ink-muted dark:text-tavern-muted">
					Add at least one stat block to calculate encounter difficulty.
				</p>
			{:else}
				<ul class="space-y-1.5">
					{#each encounter.combatants as entry (entry.id)}
						<li
							class="rounded border border-border/70 dark:border-tavern-border/70 px-2 py-1.5 bg-surface-alt/50 dark:bg-tavern-surface-alt/45"
						>
							<div class="flex items-center gap-2">
								<div class="min-w-0 flex-1">
									<div class="text-xs font-semibold text-ink dark:text-tavern-text truncate">
										{entry.name}
									</div>
									<div class="text-[11px] text-ink-muted dark:text-tavern-muted">
										CR {entry.challengeRating || 'n/a'} · XP {entry.xpPerCreature.toLocaleString()} each
									</div>
								</div>
								<label class="text-[11px] text-ink-muted dark:text-tavern-muted">
									Count
									<input
										type="number"
										min="1"
										max="99"
										value={entry.count}
										class="ml-1 h-7 w-14 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1.5 text-xs"
										onchange={(event) =>
											updateCombatantCount(
												entry.id,
												Number((event.currentTarget as HTMLInputElement).value),
											)}
									/>
								</label>
								<button
									type="button"
									class="h-7 w-7 rounded border border-error/40 text-error hover:bg-error/5"
									onclick={() => removeCombatant(entry.id)}
									aria-label={`Remove ${entry.name}`}
								>
									x
								</button>
							</div>
							<div class="mt-1 text-[11px] text-ink-muted dark:text-tavern-muted">
								Subtotal XP {(entry.count * entry.xpPerCreature).toLocaleString()}
								{#if entry.legendaryActions.length > 0}
									· Legendary actions {entry.legendaryActions.length}
								{/if}
								{#if entry.lairActions.length > 0}
									· Lair actions {entry.lairActions.length}
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>
