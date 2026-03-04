<script lang="ts">
	import { nanoid } from 'nanoid';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { nowISO } from '$lib/utils/date.js';
	import { createFolderId, createNoteId } from '$lib/types/note.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import {
		advanceCombatTurn,
		buildEncounterLogDraft,
		buildEncounterRewardSummary,
		conditionCatalogForSystem,
		createDefaultCombatState,
		getLinkedCombatantDefaults,
		normalizeCombatState,
		recordCombatNotableRoll,
		reorderTieCombatants,
		sortCombatantsForInitiative,
		spendLegendaryAction,
		startCombatantTurn,
		triggerLairActions,
	} from '$lib/domain/combat-tracker.js';
	import {
		buildLairActionsFromStatBlock,
		buildLegendaryActionsFromStatBlock,
	} from '$lib/domain/encounter-builder.js';
	import { buildRandomTableIndex, rollRandomTable } from '$lib/domain/random-tables.js';
	import { getSessionTimelineEventId, isSessionNote } from '$lib/domain/session-timeline.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import type {
		EncounterNotableRollKind,
		SessionBoardCombatState,
		SessionBoardCombatTile,
		SessionBoardCombatant,
	} from '$lib/types/session-board.js';
	import type { StatBlockObject, VaultObject } from '$lib/types/object.js';

	interface Props {
		tile: SessionBoardCombatTile;
		selected?: boolean;
		editable?: boolean;
		standalone?: boolean;
		onselect: () => void;
		onupdate: (combat: SessionBoardCombatState) => void;
		ondragstart?: (event: PointerEvent) => void;
	}

	let {
		tile,
		selected = false,
		editable = false,
		standalone = false,
		onselect,
		onupdate,
		ondragstart = () => undefined,
	}: Props = $props();

	let addNameInput = $state<HTMLInputElement | null>(null);
	let addObjectQuery = $state('');
	let addName = $state('');
	let addInitiative = $state('');
	let addMaxHp = $state('');
	let addInitiativeModifier = $state('');
	let addLinkedObjectId = $state('');
	let addIsPlayerCharacter = $state(false);
	let addPanelOpen = $state(false);
	let objectsLoading = $state(false);
	let objectLoadError = $state<string | null>(null);
	let linkedObjects = $state<VaultObject[]>([]);
	let draggingCombatantId = $state<string | null>(null);

	let combat = $derived.by(() => normalizeCombatState(tile.combat ?? createDefaultCombatState()));
	let combatants = $derived.by(() => sortCombatantsForInitiative(combat.combatants));
	let conditionCatalog = $derived.by(() => conditionCatalogForSystem(combat.systemId));
	let legendaryTrackers = $derived.by(() => combat.legendaryTrackers);
	let lairTracker = $derived.by(() => combat.lairTracker);
	let activeCombatant = $derived.by(
		() => combatants.find((combatant) => combatant.id === combat.activeCombatantId) ?? null,
	);
	let linkedObjectById = $derived.by(
		() => new Map(linkedObjects.map((entry) => [entry.id, entry])),
	);
	let filteredObjects = $derived.by(() => {
		const q = addObjectQuery.trim().toLowerCase();
		const all = linkedObjects
			.filter((object) => object.type === 'stat_block' || object.type === 'character')
			.sort((a, b) => a.name.localeCompare(b.name));
		if (!q) return all.slice(0, 80);
		return all
			.filter((object) => {
				if (object.name.toLowerCase().includes(q)) return true;
				if (object.summary.toLowerCase().includes(q)) return true;
				return object.tags.some((tag) => tag.toLowerCase().includes(q));
			})
			.slice(0, 80);
	});

	$effect(() => {
		let cancelled = false;
		async function loadObjects(): Promise<void> {
			objectsLoading = true;
			objectLoadError = null;
			try {
				const objects = await getStorage().getAllObjects();
				if (cancelled) return;
				linkedObjects = objects.filter(
					(object) => object.type === 'stat_block' || object.type === 'character',
				);
			} catch (error) {
				if (cancelled) return;
				objectLoadError = String(error);
			} finally {
				if (!cancelled) objectsLoading = false;
			}
		}
		void loadObjects();
		return () => {
			cancelled = true;
		};
	});

	function persist(next: SessionBoardCombatState): void {
		onupdate(normalizeCombatState(next));
	}

	function asStatBlockObject(value: VaultObject | undefined): StatBlockObject | null {
		return value && value.type === 'stat_block' ? value : null;
	}

	function syncLegendaryTrackerBindings(
		nextCombatants: readonly SessionBoardCombatant[],
		nextTrackers: SessionBoardCombatState['legendaryTrackers'],
	): SessionBoardCombatState['legendaryTrackers'] {
		const namesById = new Map(nextCombatants.map((combatant) => [combatant.id, combatant.name]));
		return nextTrackers
			.filter((tracker) => namesById.has(tracker.combatantId))
			.map((tracker) => ({
				...tracker,
				combatantName: namesById.get(tracker.combatantId) ?? tracker.combatantName,
			}));
	}

	function updateCombatant(
		combatantId: string,
		updater: (combatant: SessionBoardCombatant) => SessionBoardCombatant,
	): void {
		const nextCombatants = sortCombatantsForInitiative(
			combatants.map((combatant) =>
				combatant.id === combatantId ? updater({ ...combatant }) : combatant,
			),
		);
		persist({
			...combat,
			combatants: nextCombatants,
			legendaryTrackers: syncLegendaryTrackerBindings(nextCombatants, combat.legendaryTrackers),
		});
	}

	function toggleReady(combatantId: string): void {
		updateCombatant(combatantId, (combatant) => ({
			...combatant,
			ready: !combatant.ready,
			delayed: combatant.delayed ? combatant.delayed : !combatant.ready ? true : combatant.delayed,
		}));
	}

	function toggleDelayed(combatantId: string): void {
		updateCombatant(combatantId, (combatant) => ({
			...combatant,
			delayed: !combatant.delayed,
			ready: !combatant.delayed ? false : combatant.ready,
		}));
	}

	function adjustHp(combatantId: string, delta: number): void {
		updateCombatant(combatantId, (combatant) => {
			if (combatant.currentHp === null || combatant.maxHp === null) return combatant;
			const next = Math.min(combatant.maxHp, Math.max(0, combatant.currentHp + delta));
			return {
				...combatant,
				currentHp: next,
				outcome: next <= 0 ? 'fell' : combatant.outcome === 'fell' ? 'active' : combatant.outcome,
			};
		});
	}

	function updateDeathSave(
		combatantId: string,
		field: 'successes' | 'failures',
		delta: number,
	): void {
		updateCombatant(combatantId, (combatant) => ({
			...combatant,
			deathSaves: {
				...combatant.deathSaves,
				[field]: Math.min(3, Math.max(0, combatant.deathSaves[field] + delta)),
			},
		}));
	}

	function toggleCondition(combatantId: string, condition: string): void {
		updateCombatant(combatantId, (combatant) => {
			const hasCondition = combatant.conditions.some(
				(existing) => existing.toLowerCase() === condition.toLowerCase(),
			);
			return {
				...combatant,
				conditions: hasCondition
					? combatant.conditions.filter(
							(existing) => existing.toLowerCase() !== condition.toLowerCase(),
						)
					: [...combatant.conditions, condition],
			};
		});
	}

	function parseIntNullable(value: string): number | null {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number.parseInt(trimmed, 10);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function clearAddForm(): void {
		addName = '';
		addInitiative = '';
		addMaxHp = '';
		addInitiativeModifier = '';
		addLinkedObjectId = '';
		addIsPlayerCharacter = false;
	}

	function addCombatant(): void {
		const linkedObject = addLinkedObjectId
			? linkedObjectById.get(addLinkedObjectId as VaultObject['id'])
			: undefined;
		const statBlock = asStatBlockObject(linkedObject);
		const linkedDefaults = linkedObject ? getLinkedCombatantDefaults(linkedObject) : null;
		const name = addName.trim() || linkedObject?.name?.trim() || '';
		if (!name) {
			toastState.error('Combatant name is required.');
			return;
		}

		const initiative = parseIntNullable(addInitiative);
		const maxHpInput = parseIntNullable(addMaxHp);
		const maxHp = maxHpInput ?? linkedDefaults?.maxHp ?? null;
		const initiativeModifierInput = parseIntNullable(addInitiativeModifier);
		const initiativeModifier = initiativeModifierInput ?? linkedDefaults?.initiativeModifier ?? 0;
		const armorClass = linkedDefaults?.armorClass ?? null;
		const nextCombatant: SessionBoardCombatant = {
			id: nanoid(10),
			name,
			initiative,
			initiativeModifier,
			tieRank: 0,
			ready: false,
			delayed: false,
			isPlayerCharacter: addIsPlayerCharacter || linkedObject?.type === 'character',
			currentHp: maxHp,
			maxHp,
			armorClass,
			conditions: [],
			concentration: false,
			deathSaves: { successes: 0, failures: 0 },
			outcome: 'active',
			damageDealt: 0,
			startingHp: maxHp,
			linkedObjectId: linkedObject?.id,
			linkedObjectType:
				linkedObject?.type === 'stat_block' || linkedObject?.type === 'character'
					? linkedObject.type
					: undefined,
			linkedObjectName: linkedObject?.name,
			statsPreview: linkedDefaults?.statsPreview,
			statsExpanded: false,
		};
		const nextCombatants = sortCombatantsForInitiative([...combatants, nextCombatant]);
		let nextLegendaryTrackers = syncLegendaryTrackerBindings(
			nextCombatants,
			combat.legendaryTrackers,
		);
		let nextLairTracker = combat.lairTracker;
		if (statBlock) {
			const legendaryActions = buildLegendaryActionsFromStatBlock(statBlock);
			if (legendaryActions.length > 0) {
				nextLegendaryTrackers = [
					...nextLegendaryTrackers,
					{
						combatantId: nextCombatant.id,
						combatantName: nextCombatant.name,
						chargesMax: 3,
						chargesRemaining: 3,
						actions: legendaryActions.map((entry) => ({
							id: entry.id,
							name: entry.name,
							cost: entry.cost,
							usedCount: entry.usedCount,
						})),
					},
				];
			}
			const lairActions = buildLairActionsFromStatBlock(statBlock);
			if (lairActions.length > 0) {
				const existingNames = nextLairTracker.actions.map((entry) =>
					entry.name.trim().toLowerCase(),
				);
				const merged = [...nextLairTracker.actions];
				for (const action of lairActions) {
					const key = action.name.trim().toLowerCase();
					if (!key || existingNames.includes(key)) continue;
					existingNames.push(key);
					merged.push({ ...action });
				}
				nextLairTracker = {
					...nextLairTracker,
					enabled: true,
					actions: merged,
				};
			}
		}
		persist({
			...combat,
			combatants: nextCombatants,
			legendaryTrackers: nextLegendaryTrackers,
			lairTracker: nextLairTracker,
			activeCombatantId: combat.activeCombatantId ?? nextCombatants[0]?.id ?? null,
		});
		addPanelOpen = false;
		clearAddForm();
	}

	function removeCombatant(combatantId: string): void {
		const nextCombatants = combatants.filter((combatant) => combatant.id !== combatantId);
		persist({
			...combat,
			combatants: nextCombatants,
			legendaryTrackers: combat.legendaryTrackers.filter(
				(tracker) => tracker.combatantId !== combatantId,
			),
			activeCombatantId:
				combat.activeCombatantId === combatantId
					? (nextCombatants[0]?.id ?? null)
					: combat.activeCombatantId,
		});
	}

	function moveToNextTurn(): void {
		persist(advanceCombatTurn(combat));
	}

	function handleDragStart(event: DragEvent, combatantId: string): void {
		draggingCombatantId = combatantId;
		event.dataTransfer?.setData('text/plain', combatantId);
		event.dataTransfer?.setDragImage(event.currentTarget as HTMLElement, 10, 10);
	}

	function canTieDrop(targetCombatantId: string): boolean {
		const draggedId = draggingCombatantId;
		if (!draggedId || draggedId === targetCombatantId) return false;
		const dragged = combatants.find((combatant) => combatant.id === draggedId);
		const target = combatants.find((combatant) => combatant.id === targetCombatantId);
		if (!dragged || !target) return false;
		return dragged.initiative === target.initiative;
	}

	function handleTieDrop(event: DragEvent, targetCombatantId: string): void {
		event.preventDefault();
		const draggedId = draggingCombatantId ?? event.dataTransfer?.getData('text/plain') ?? null;
		draggingCombatantId = null;
		if (!draggedId) return;
		const reordered = reorderTieCombatants(combatants, draggedId, targetCombatantId);
		if (!reordered) {
			toastState.info('Tie reorder only works for combatants with matching initiative.');
			return;
		}
		persist({
			...combat,
			combatants: reordered,
		});
	}

	function setEncounterName(value: string): void {
		persist({ ...combat, encounterName: value.slice(0, 120) });
	}

	function setEncounterNotes(value: string): void {
		persist({ ...combat, notes: value.slice(0, 4000) });
	}

	function setEncounterLoot(value: string): void {
		persist({ ...combat, loot: value.slice(0, 2000) });
	}

	function setEncounterOutcome(value: string): void {
		persist({ ...combat, outcome: value.slice(0, 600) });
	}

	function addNotableRoll(combatant: SessionBoardCombatant, kind: EncounterNotableRollKind): void {
		persist(
			recordCombatNotableRoll(combat, {
				kind,
				combatantName: combatant.name,
				combatantId: combatant.id,
				round: combat.round,
			}),
		);
	}

	function adjustLegendaryCharges(combatantId: string, delta: number): void {
		const nextTrackers = combat.legendaryTrackers.map((tracker) => {
			if (tracker.combatantId !== combatantId) return tracker;
			const next = Math.min(tracker.chargesMax, Math.max(0, tracker.chargesRemaining + delta));
			return { ...tracker, chargesRemaining: next };
		});
		persist({ ...combat, legendaryTrackers: nextTrackers });
	}

	function setLegendaryChargesMax(combatantId: string, value: string): void {
		const parsed = parseIntNullable(value);
		if (parsed === null) return;
		const chargesMax = Math.max(1, Math.min(9, parsed));
		const nextTrackers = combat.legendaryTrackers.map((tracker) => {
			if (tracker.combatantId !== combatantId) return tracker;
			return {
				...tracker,
				chargesMax,
				chargesRemaining: Math.min(chargesMax, tracker.chargesRemaining),
			};
		});
		persist({ ...combat, legendaryTrackers: nextTrackers });
	}

	function updateLegendaryAction(
		combatantId: string,
		actionId: string,
		field: 'name' | 'cost',
		value: string,
	): void {
		const nextTrackers = combat.legendaryTrackers.map((tracker) => {
			if (tracker.combatantId !== combatantId) return tracker;
			return {
				...tracker,
				actions: tracker.actions.map((action) => {
					if (action.id !== actionId) return action;
					if (field === 'name') {
						const nextName = value.trim();
						return nextName ? { ...action, name: nextName.slice(0, 120) } : action;
					}
					const parsed = parseIntNullable(value);
					return parsed === null ? action : { ...action, cost: Math.max(1, Math.min(5, parsed)) };
				}),
			};
		});
		persist({ ...combat, legendaryTrackers: nextTrackers });
	}

	function addLegendaryAction(combatantId: string): void {
		const nextTrackers = combat.legendaryTrackers.map((tracker) => {
			if (tracker.combatantId !== combatantId) return tracker;
			return {
				...tracker,
				actions: [
					...tracker.actions,
					{
						id: `${combatantId}-legendary-${Date.now()}-${tracker.actions.length + 1}`,
						name: 'Legendary Action',
						cost: 1,
						usedCount: 0,
					},
				],
			};
		});
		persist({ ...combat, legendaryTrackers: nextTrackers });
	}

	function removeLegendaryAction(combatantId: string, actionId: string): void {
		const nextTrackers = combat.legendaryTrackers.map((tracker) => {
			if (tracker.combatantId !== combatantId) return tracker;
			return {
				...tracker,
				actions: tracker.actions.filter((action) => action.id !== actionId),
			};
		});
		persist({ ...combat, legendaryTrackers: nextTrackers });
	}

	function toggleLairEnabled(): void {
		persist({
			...combat,
			lairTracker: {
				...combat.lairTracker,
				enabled: !combat.lairTracker.enabled,
			},
		});
	}

	function setLairInitiativeCount(value: string): void {
		const parsed = parseIntNullable(value);
		if (parsed === null) return;
		persist({
			...combat,
			lairTracker: {
				...combat.lairTracker,
				initiativeCount: Math.max(1, Math.min(30, parsed)),
			},
		});
	}

	function triggerLairNow(): void {
		persist(triggerLairActions(combat, { autoOnly: false }));
	}

	function addLairAction(): void {
		persist({
			...combat,
			lairTracker: {
				...combat.lairTracker,
				actions: [
					...combat.lairTracker.actions,
					{
						id: `lair-${Date.now()}-${combat.lairTracker.actions.length + 1}`,
						name: 'Lair Action',
						autoTrigger: combat.lairTracker.actions.length === 0,
						usedCount: 0,
					},
				],
			},
		});
	}

	function updateLairAction(
		actionId: string,
		field: 'name' | 'autoTrigger',
		value: string | boolean,
	): void {
		persist({
			...combat,
			lairTracker: {
				...combat.lairTracker,
				actions: combat.lairTracker.actions.map((action) => {
					if (action.id !== actionId) return action;
					if (field === 'autoTrigger') {
						return { ...action, autoTrigger: value === true };
					}
					const nextName = String(value).trim();
					return nextName ? { ...action, name: nextName.slice(0, 120) } : action;
				}),
			},
		});
	}

	function removeLairAction(actionId: string): void {
		persist({
			...combat,
			lairTracker: {
				...combat.lairTracker,
				actions: combat.lairTracker.actions.filter((action) => action.id !== actionId),
			},
		});
	}

	function resolveActiveSessionTimelineLink(): {
		eventId: string;
		eventTitle: string | null;
	} | null {
		const sessionNotes = [...notesState.activeNotes]
			.filter((note) => isSessionNote(note))
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		for (const note of sessionNotes) {
			const eventId = getSessionTimelineEventId(note.frontmatter);
			if (!eventId) continue;
			const eventNote = notesState.getActiveNoteById(createNoteId(eventId));
			return {
				eventId,
				eventTitle: eventNote?.title ?? null,
			};
		}
		return null;
	}

	async function saveEncounterLog(): Promise<void> {
		try {
			const rewards = buildEncounterRewardSummary(combat);
			const timelineLink = resolveActiveSessionTimelineLink();
			let treasureRoll: { tableName: string; result: string; tier: 1 | 2 | 3 } | null = null;
			try {
				const tableIndex = buildRandomTableIndex({
					vaultNotes: notesState.activeNotes.map((note) => ({
						id: String(note.id),
						title: note.title,
						content: note.content,
						tags: note.tags,
						folder: String(note.folder),
						updatedAt: note.updatedAt,
					})),
				});
				const rolled = rollRandomTable(tableIndex, rewards.treasureTableName);
				treasureRoll = {
					tableName: rolled.tableName,
					result: rolled.result,
					tier: rewards.treasureTier,
				};
			} catch (error) {
				toastState.info(`Treasure table roll unavailable: ${String(error)}`);
			}

			const draft = buildEncounterLogDraft(combat, {
				treasureRoll,
				xpAwards: rewards.xpAwards,
				timelineEventId: timelineLink?.eventId ?? null,
				timelineEventTitle: timelineLink?.eventTitle ?? null,
			});
			const note = await notesState.createNote({
				title: draft.title,
				content: draft.content,
				folder: createFolderId(draft.folder),
				tags: draft.tags,
				frontmatter: {
					...(timelineLink?.eventId ? { timelineEventId: timelineLink.eventId } : {}),
					encounter: {
						participantObjectIds: draft.participantObjectIds,
						roundCount: Math.max(1, combat.round),
						outcome: combat.outcome,
						notableRolls: combat.notableRolls,
						xpAwards: rewards.xpAwards,
						treasureRoll,
						timelineEventId: timelineLink?.eventId ?? null,
						savedAt: nowISO(),
					},
				},
			});
			persist({
				...combat,
				endedAt: nowISO(),
				lastLogNoteId: note.id,
			});
			toastState.success(`Encounter log saved as "${note.title}".`);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				error,
				code: 'ENCOUNTER_LOG_SAVE_FAILED',
				context: {
					combatantCount: combat.combatants.length,
				},
			});
			toastState.error(`Failed to save encounter log: ${String(error)}`);
		}
	}

	function openEncounterLog(): void {
		if (!combat.lastLogNoteId) return;
		void goto(resolve(`/notes/${combat.lastLogNoteId}`));
	}

	function handleTileKeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
		const key = event.key.toLowerCase();
		if (key === 'n') {
			event.preventDefault();
			moveToNextTurn();
			return;
		}
		if (key === 'a') {
			event.preventDefault();
			addPanelOpen = true;
			requestAnimationFrame(() => addNameInput?.focus());
		}
	}

	function handlePointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('a,button,input,textarea,select,label')) return;
		onselect();
		if (!standalone && editable) ondragstart(event);
	}

	function handleInitInput(combatantId: string, value: string): void {
		const parsed = parseIntNullable(value);
		updateCombatant(combatantId, (combatant) => ({
			...combatant,
			initiative: parsed,
		}));
	}

	function handleHpInput(
		combatantId: string,
		field: 'currentHp' | 'maxHp' | 'damageDealt',
		value: string,
	): void {
		const parsed = parseIntNullable(value);
		updateCombatant(combatantId, (combatant) => {
			if (field === 'damageDealt') {
				return {
					...combatant,
					damageDealt: parsed === null ? 0 : Math.max(0, parsed),
				};
			}
			if (field === 'maxHp') {
				const maxHp = parsed === null ? null : Math.max(0, parsed);
				const currentHp =
					combatant.currentHp === null || maxHp === null
						? maxHp
						: Math.min(maxHp, Math.max(0, combatant.currentHp));
				return {
					...combatant,
					maxHp,
					currentHp,
				};
			}
			return {
				...combatant,
				currentHp: parsed === null ? null : Math.max(0, parsed),
			};
		});
	}
</script>

<div
	class="relative rounded-lg border bg-surface/95 dark:bg-tavern-surface/95 shadow-sm backdrop-blur-sm flex flex-col h-full transition-[box-shadow,transform] duration-150 cursor-pointer hover:shadow-md {selected
		? 'border-border dark:border-tavern-border ring-2 ring-accent/45 dark:ring-tavern-accent/45 shadow-[0_0_0_1px_rgba(255,255,255,0.65)_inset,0_12px_24px_-16px_rgba(0,0,0,0.65)]'
		: 'border-border dark:border-tavern-border'}"
	role="button"
	tabindex="0"
	aria-label={standalone ? 'Combat tracker' : 'Combat tracker tile'}
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
	<header class="px-3 py-2 border-b border-border dark:border-tavern-border">
		<div class="flex items-center gap-2">
			<input
				type="text"
				value={combat.encounterName}
				onchange={(event) => setEncounterName((event.currentTarget as HTMLInputElement).value)}
				class="min-w-0 flex-1 px-2 py-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
				placeholder="Encounter name"
				aria-label="Encounter name"
			/>
			<button
				type="button"
				class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				onclick={moveToNextTurn}
				title="Advance turn (n)"
			>
				Next Turn
			</button>
			<button
				type="button"
				class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				onclick={() => {
					addPanelOpen = !addPanelOpen;
					if (addPanelOpen) requestAnimationFrame(() => addNameInput?.focus());
				}}
				title="Add combatant (a)"
			>
				Add
			</button>
		</div>
		<div class="mt-1 flex items-center gap-3 text-[11px] text-ink-muted dark:text-tavern-muted">
			<span>Round {combat.round}</span>
			<span>Active: {activeCombatant?.name ?? 'None'}</span>
			<span>{combatants.length} combatants</span>
		</div>
	</header>

	{#if addPanelOpen}
		<div
			class="px-3 py-2 border-b border-border/70 dark:border-tavern-border/70 bg-surface-alt/60 dark:bg-tavern-surface-alt/55"
		>
			<div class="grid gap-2 sm:grid-cols-2">
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Name
					<input
						type="text"
						bind:value={addName}
						class="mt-1 h-8 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
						placeholder="Goblin Boss"
						bind:this={addNameInput}
					/>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Linked stat block or character
					<select
						bind:value={addLinkedObjectId}
						class="mt-1 h-8 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
						disabled={objectsLoading}
					>
						<option value="">No linked object</option>
						{#each filteredObjects as object (object.id)}
							<option value={object.id}>{object.name} ({object.type})</option>
						{/each}
					</select>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Filter objects
					<input
						type="text"
						bind:value={addObjectQuery}
						class="mt-1 h-8 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
						placeholder="Search linked objects"
					/>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Initiative
					<input
						type="number"
						bind:value={addInitiative}
						class="mt-1 h-8 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
						placeholder="14"
					/>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Initiative Modifier
					<input
						type="number"
						bind:value={addInitiativeModifier}
						class="mt-1 h-8 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
						placeholder="+2"
					/>
				</label>
				<label class="text-xs text-ink-muted dark:text-tavern-muted">
					Max HP
					<input
						type="number"
						bind:value={addMaxHp}
						class="mt-1 h-8 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
						placeholder="11"
					/>
				</label>
			</div>
			<label
				class="mt-2 inline-flex items-center gap-2 text-xs text-ink-muted dark:text-tavern-muted"
			>
				<input
					type="checkbox"
					bind:checked={addIsPlayerCharacter}
					class="h-4 w-4 rounded border-border dark:border-tavern-border"
				/>
				Player character (enable death saves)
			</label>
			{#if objectLoadError}
				<p class="mt-1 text-xs text-error">{objectLoadError}</p>
			{/if}
			<div class="mt-2 flex items-center gap-2">
				<button
					type="button"
					class="px-2.5 py-1 rounded bg-accent hover:bg-accent-hover dark:bg-tavern-accent dark:hover:bg-tavern-accent-hover dark:text-tavern-bg text-white text-xs"
					onclick={addCombatant}
				>
					Add Combatant
				</button>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface dark:hover:bg-tavern-surface transition-colors"
					onclick={() => {
						addPanelOpen = false;
						clearAddForm();
					}}
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	<div class="flex-1 min-h-0 overflow-y-auto p-2.5">
		{#if combatants.length === 0}
			<div
				class="h-full rounded border border-dashed border-border/70 dark:border-tavern-border/70 p-3 text-xs text-ink-muted dark:text-tavern-muted flex flex-col gap-2"
			>
				<p>No combatants yet. Press <span class="font-mono">a</span> to add one.</p>
				<p>Use <span class="font-mono">n</span> to advance turns once initiative is set.</p>
			</div>
		{:else}
			<ul class="space-y-2">
				{#each combatants as combatant (combatant.id)}
					<li
						class="rounded border border-border/70 dark:border-tavern-border/70 p-2 {combat.activeCombatantId ===
						combatant.id
							? 'bg-accent-subtle/70 dark:bg-tavern-accent-subtle/70'
							: 'bg-surface-alt/40 dark:bg-tavern-surface-alt/30'}"
						draggable={combatant.initiative !== null}
						ondragstart={(event) => handleDragStart(event, combatant.id)}
						ondragover={(event) => {
							if (canTieDrop(combatant.id)) event.preventDefault();
						}}
						ondrop={(event) => handleTieDrop(event, combatant.id)}
						ondragend={() => (draggingCombatantId = null)}
					>
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="h-7 w-7 rounded border border-border dark:border-tavern-border text-[11px] hover:bg-surface dark:hover:bg-tavern-surface"
								title="Set active"
								onclick={() => persist(startCombatantTurn(combat, combatant.id))}
							>
								{combat.activeCombatantId === combatant.id ? '>' : ''}
							</button>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<input
										type="text"
										value={combatant.name}
										class="min-w-0 flex-1 h-7 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
										onchange={(event) =>
											updateCombatant(combatant.id, (entry) => ({
												...entry,
												name: (event.currentTarget as HTMLInputElement).value.trim() || entry.name,
											}))}
									/>
									<span
										class="text-[10px] px-1.5 py-0.5 rounded border border-border/70 dark:border-tavern-border/70"
									>
										{combatant.linkedObjectType ?? (combatant.isPlayerCharacter ? 'pc' : 'npc')}
									</span>
								</div>
								{#if combatant.linkedObjectName}
									<div class="text-[11px] text-ink-muted dark:text-tavern-muted truncate">
										Linked: {combatant.linkedObjectName}
									</div>
								{/if}
							</div>
							<label class="text-[11px] flex items-center gap-1">
								Init
								<input
									type="number"
									value={combatant.initiative ?? ''}
									class="h-7 w-16 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
									onchange={(event) =>
										handleInitInput(combatant.id, (event.currentTarget as HTMLInputElement).value)}
								/>
							</label>
							<label class="text-[11px] flex items-center gap-1">
								Mod
								<input
									type="number"
									value={combatant.initiativeModifier}
									class="h-7 w-16 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
									onchange={(event) =>
										updateCombatant(combatant.id, (entry) => ({
											...entry,
											initiativeModifier: Number.parseInt(
												(event.currentTarget as HTMLInputElement).value,
												10,
											),
										}))}
								/>
							</label>
							<button
								type="button"
								class="h-7 w-7 rounded border border-error/40 text-error hover:bg-error/5"
								onclick={() => removeCombatant(combatant.id)}
								aria-label={`Remove ${combatant.name}`}
							>
								x
							</button>
						</div>

						<div class="mt-2 grid gap-2 md:grid-cols-[auto_auto_auto_auto_auto_1fr] items-center">
							<div class="flex items-center gap-1">
								<button
									type="button"
									class="h-7 w-7 rounded border border-border dark:border-tavern-border text-xs"
									onclick={() => adjustHp(combatant.id, -1)}
								>
									-1
								</button>
								<button
									type="button"
									class="h-7 w-7 rounded border border-border dark:border-tavern-border text-xs"
									onclick={() => adjustHp(combatant.id, 1)}
								>
									+1
								</button>
								<button
									type="button"
									class="h-7 w-8 rounded border border-border dark:border-tavern-border text-xs"
									onclick={() => adjustHp(combatant.id, -5)}
								>
									-5
								</button>
								<button
									type="button"
									class="h-7 w-8 rounded border border-border dark:border-tavern-border text-xs"
									onclick={() => adjustHp(combatant.id, 5)}
								>
									+5
								</button>
							</div>
							<label class="text-[11px] flex items-center gap-1">
								HP
								<input
									type="number"
									value={combatant.currentHp ?? ''}
									class="h-7 w-16 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
									onchange={(event) =>
										handleHpInput(
											combatant.id,
											'currentHp',
											(event.currentTarget as HTMLInputElement).value,
										)}
								/>
								/
								<input
									type="number"
									value={combatant.maxHp ?? ''}
									class="h-7 w-16 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
									onchange={(event) =>
										handleHpInput(
											combatant.id,
											'maxHp',
											(event.currentTarget as HTMLInputElement).value,
										)}
								/>
							</label>
							<label class="text-[11px] flex items-center gap-1">
								AC
								<input
									type="number"
									value={combatant.armorClass ?? ''}
									class="h-7 w-14 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
									onchange={(event) =>
										updateCombatant(combatant.id, (entry) => ({
											...entry,
											armorClass: parseIntNullable((event.currentTarget as HTMLInputElement).value),
										}))}
								/>
							</label>
							<label class="text-[11px] flex items-center gap-1">
								Dmg
								<input
									type="number"
									value={combatant.damageDealt}
									class="h-7 w-16 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-sm"
									onchange={(event) =>
										handleHpInput(
											combatant.id,
											'damageDealt',
											(event.currentTarget as HTMLInputElement).value,
										)}
								/>
							</label>
							<select
								class="h-7 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 text-xs"
								value={combatant.outcome}
								onchange={(event) =>
									updateCombatant(combatant.id, (entry) => ({
										...entry,
										outcome: (event.currentTarget as HTMLSelectElement).value as
											| 'active'
											| 'fell'
											| 'fled',
									}))}
							>
								<option value="active">Active</option>
								<option value="fell">Fell</option>
								<option value="fled">Fled</option>
							</select>
							<div class="flex flex-wrap items-center gap-1">
								<label class="inline-flex items-center gap-1 text-[11px]">
									<input
										type="checkbox"
										checked={combatant.delayed}
										onchange={() => toggleDelayed(combatant.id)}
									/>
									Delay
								</label>
								<label class="inline-flex items-center gap-1 text-[11px]">
									<input
										type="checkbox"
										checked={combatant.ready}
										onchange={() => toggleReady(combatant.id)}
									/>
									Ready
								</label>
								<label class="inline-flex items-center gap-1 text-[11px]">
									<input
										type="checkbox"
										checked={combatant.concentration}
										onchange={() =>
											updateCombatant(combatant.id, (entry) => ({
												...entry,
												concentration: !entry.concentration,
											}))}
									/>
									Concentration
								</label>
								<label class="inline-flex items-center gap-1 text-[11px]">
									<input
										type="checkbox"
										checked={combatant.isPlayerCharacter}
										onchange={() =>
											updateCombatant(combatant.id, (entry) => ({
												...entry,
												isPlayerCharacter: !entry.isPlayerCharacter,
											}))}
									/>
									PC
								</label>
							</div>
						</div>

						<div class="mt-2 flex flex-wrap gap-1">
							{#each conditionCatalog as condition (condition)}
								<button
									type="button"
									class="px-2 py-0.5 rounded-full border text-[10px] transition-colors {combatant.conditions.some(
										(entry) => entry.toLowerCase() === condition.toLowerCase(),
									)
										? 'border-accent/50 bg-accent-subtle text-accent dark:border-tavern-accent/50 dark:bg-tavern-accent-subtle dark:text-tavern-accent'
										: 'border-border/70 dark:border-tavern-border/70 text-ink-muted dark:text-tavern-muted hover:bg-surface dark:hover:bg-tavern-surface'}"
									onclick={() => toggleCondition(combatant.id, condition)}
								>
									{condition}
								</button>
							{/each}
						</div>

						<div class="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
							<span class="text-ink-muted dark:text-tavern-muted">Notable rolls</span>
							<button
								type="button"
								class="px-1.5 py-0.5 rounded border border-border dark:border-tavern-border hover:bg-surface dark:hover:bg-tavern-surface"
								onclick={() => addNotableRoll(combatant, 'critical_hit')}
							>
								Crit +
							</button>
							<button
								type="button"
								class="px-1.5 py-0.5 rounded border border-border dark:border-tavern-border hover:bg-surface dark:hover:bg-tavern-surface"
								onclick={() => addNotableRoll(combatant, 'critical_failure')}
							>
								Crit -
							</button>
							{#if combatant.isPlayerCharacter}
								<button
									type="button"
									class="px-1.5 py-0.5 rounded border border-border dark:border-tavern-border hover:bg-surface dark:hover:bg-tavern-surface"
									onclick={() => addNotableRoll(combatant, 'death_save_success')}
								>
									DS +
								</button>
								<button
									type="button"
									class="px-1.5 py-0.5 rounded border border-border dark:border-tavern-border hover:bg-surface dark:hover:bg-tavern-surface"
									onclick={() => addNotableRoll(combatant, 'death_save_failure')}
								>
									DS -
								</button>
							{/if}
						</div>

						{#if combatant.isPlayerCharacter}
							<div class="mt-2 flex items-center gap-2 text-[11px]">
								<span class="text-ink-muted dark:text-tavern-muted">Death Saves</span>
								<button
									type="button"
									class="h-6 w-6 rounded border border-border dark:border-tavern-border"
									onclick={() => updateDeathSave(combatant.id, 'successes', -1)}
								>
									-
								</button>
								<span>S {combatant.deathSaves.successes}</span>
								<button
									type="button"
									class="h-6 w-6 rounded border border-border dark:border-tavern-border"
									onclick={() => updateDeathSave(combatant.id, 'successes', 1)}
								>
									+
								</button>
								<button
									type="button"
									class="h-6 w-6 rounded border border-border dark:border-tavern-border"
									onclick={() => updateDeathSave(combatant.id, 'failures', -1)}
								>
									-
								</button>
								<span>F {combatant.deathSaves.failures}</span>
								<button
									type="button"
									class="h-6 w-6 rounded border border-border dark:border-tavern-border"
									onclick={() => updateDeathSave(combatant.id, 'failures', 1)}
								>
									+
								</button>
							</div>
						{/if}

						{#if combatant.statsPreview}
							<div class="mt-2">
								<button
									type="button"
									class="text-[11px] px-2 py-1 rounded border border-border dark:border-tavern-border hover:bg-surface dark:hover:bg-tavern-surface"
									onclick={() =>
										updateCombatant(combatant.id, (entry) => ({
											...entry,
											statsExpanded: !entry.statsExpanded,
										}))}
								>
									{combatant.statsExpanded ? 'Hide stat preview' : 'Show stat preview'}
								</button>
								{#if combatant.statsExpanded}
									<div
										class="mt-1 rounded border border-border/60 dark:border-tavern-border/60 bg-surface/70 dark:bg-tavern-surface/70 p-2 text-[11px] space-y-1"
									>
										<div class="flex flex-wrap gap-2">
											{#if combatant.statsPreview.size}
												<span>Size: {combatant.statsPreview.size}</span>
											{/if}
											{#if combatant.statsPreview.creatureType}
												<span>Type: {combatant.statsPreview.creatureType}</span>
											{/if}
											{#if combatant.statsPreview.className}
												<span>Class: {combatant.statsPreview.className}</span>
											{/if}
											{#if combatant.statsPreview.level !== undefined}
												<span>Level: {combatant.statsPreview.level}</span>
											{/if}
											{#if combatant.statsPreview.challengeRating}
												<span>CR: {combatant.statsPreview.challengeRating}</span>
											{/if}
											{#if combatant.statsPreview.speed}
												<span>Speed: {combatant.statsPreview.speed}</span>
											{/if}
										</div>
										{#if combatant.statsPreview.actions.length > 0}
											<div>
												<span class="font-semibold">Actions:</span>
												{combatant.statsPreview.actions.join(', ')}
											</div>
										{/if}
										{#if combatant.statsPreview.traits.length > 0}
											<div>
												<span class="font-semibold">Traits:</span>
												{combatant.statsPreview.traits.join(', ')}
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if legendaryTrackers.length > 0}
			<section
				class="mt-3 rounded border border-border/70 dark:border-tavern-border/70 p-2 space-y-2"
			>
				<p class="text-xs font-semibold text-ink dark:text-tavern-text">
					Legendary Actions (turn resets)
				</p>
				{#each legendaryTrackers as tracker (tracker.combatantId)}
					<div
						class="rounded border border-border/60 dark:border-tavern-border/60 p-2 bg-surface-alt/45 dark:bg-tavern-surface-alt/45"
					>
						<div class="flex flex-wrap items-center gap-2 text-[11px]">
							<span class="font-semibold text-ink dark:text-tavern-text"
								>{tracker.combatantName}</span
							>
							<span class="text-ink-muted dark:text-tavern-muted">
								Charges {tracker.chargesRemaining}/{tracker.chargesMax}
							</span>
							<button
								type="button"
								class="px-1.5 py-0.5 rounded border border-border dark:border-tavern-border"
								onclick={() => adjustLegendaryCharges(tracker.combatantId, -1)}
							>
								-1
							</button>
							<button
								type="button"
								class="px-1.5 py-0.5 rounded border border-border dark:border-tavern-border"
								onclick={() => adjustLegendaryCharges(tracker.combatantId, 1)}
							>
								+1
							</button>
							<label class="inline-flex items-center gap-1">
								Max
								<input
									type="number"
									min="1"
									max="9"
									value={tracker.chargesMax}
									class="h-6 w-12 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1 text-[11px]"
									onchange={(event) =>
										setLegendaryChargesMax(
											tracker.combatantId,
											(event.currentTarget as HTMLInputElement).value,
										)}
								/>
							</label>
						</div>
						<div class="mt-2 flex flex-wrap gap-1">
							{#each tracker.actions as action (action.id)}
								<div
									class="rounded border border-border/60 dark:border-tavern-border/60 p-1.5 space-y-1"
								>
									<div class="flex items-center gap-1">
										<button
											type="button"
											class="px-1.5 py-0.5 rounded border border-border dark:border-tavern-border text-[11px] hover:bg-surface dark:hover:bg-tavern-surface"
											onclick={() =>
												persist(spendLegendaryAction(combat, tracker.combatantId, action.id))}
										>
											Use ({action.cost})
										</button>
										<span class="text-[11px] text-ink-muted dark:text-tavern-muted"
											>used {action.usedCount}</span
										>
										<button
											type="button"
											class="h-5 w-5 rounded border border-error/40 text-error hover:bg-error/5 text-[11px]"
											onclick={() => removeLegendaryAction(tracker.combatantId, action.id)}
											aria-label={`Remove ${action.name}`}
										>
											x
										</button>
									</div>
									<div class="flex items-center gap-1">
										<input
											type="text"
											value={action.name}
											class="h-6 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1.5 text-[11px]"
											onchange={(event) =>
												updateLegendaryAction(
													tracker.combatantId,
													action.id,
													'name',
													(event.currentTarget as HTMLInputElement).value,
												)}
										/>
										<label class="inline-flex items-center gap-1 text-[11px]">
											Cost
											<input
												type="number"
												min="1"
												max="5"
												value={action.cost}
												class="h-6 w-11 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1 text-[11px]"
												onchange={(event) =>
													updateLegendaryAction(
														tracker.combatantId,
														action.id,
														'cost',
														(event.currentTarget as HTMLInputElement).value,
													)}
											/>
										</label>
									</div>
								</div>
							{/each}
							<button
								type="button"
								class="px-1.5 py-0.5 h-fit rounded border border-border dark:border-tavern-border text-[11px] hover:bg-surface dark:hover:bg-tavern-surface"
								onclick={() => addLegendaryAction(tracker.combatantId)}
							>
								Add Action
							</button>
						</div>
					</div>
				{/each}
			</section>
		{/if}

		<section
			class="mt-3 rounded border border-border/70 dark:border-tavern-border/70 p-2 space-y-2"
		>
			<div class="flex flex-wrap items-center gap-2 text-xs">
				<label class="inline-flex items-center gap-1 text-ink dark:text-tavern-text">
					<input type="checkbox" checked={lairTracker.enabled} onchange={toggleLairEnabled} />
					Lair actions
				</label>
				<label class="inline-flex items-center gap-1 text-ink-muted dark:text-tavern-muted">
					Initiative
					<input
						type="number"
						min="1"
						max="30"
						value={lairTracker.initiativeCount}
						class="h-7 w-14 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1.5 text-xs"
						onchange={(event) =>
							setLairInitiativeCount((event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<button
					type="button"
					class="px-2 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface dark:hover:bg-tavern-surface"
					onclick={triggerLairNow}
					disabled={!lairTracker.enabled || lairTracker.actions.length === 0}
				>
					Trigger Now
				</button>
				{#if lairTracker.lastTriggeredRound !== null}
					<span class="text-[11px] text-ink-muted dark:text-tavern-muted">
						Last triggered round {lairTracker.lastTriggeredRound}
					</span>
				{/if}
			</div>
			{#if lairTracker.actions.length === 0}
				<p class="text-[11px] text-ink-muted dark:text-tavern-muted">No lair actions configured.</p>
			{:else}
				<ul class="space-y-1">
					{#each lairTracker.actions as action (action.id)}
						<li class="flex flex-wrap items-center gap-1 text-[11px]">
							<input
								type="text"
								value={action.name}
								class="h-6 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-1.5 text-[11px]"
								onchange={(event) =>
									updateLairAction(
										action.id,
										'name',
										(event.currentTarget as HTMLInputElement).value,
									)}
							/>
							<label class="inline-flex items-center gap-1">
								<input
									type="checkbox"
									checked={action.autoTrigger}
									onchange={(event) =>
										updateLairAction(
											action.id,
											'autoTrigger',
											(event.currentTarget as HTMLInputElement).checked,
										)}
								/>
								Auto
							</label>
							<span class="text-ink-muted dark:text-tavern-muted">used {action.usedCount}</span>
							<button
								type="button"
								class="h-5 w-5 rounded border border-error/40 text-error hover:bg-error/5"
								onclick={() => removeLairAction(action.id)}
								aria-label={`Remove ${action.name}`}
							>
								x
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<button
				type="button"
				class="px-2 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface dark:hover:bg-tavern-surface"
				onclick={addLairAction}
			>
				Add Lair Action
			</button>
		</section>
	</div>

	<footer
		class="px-3 py-2 border-t border-border/70 dark:border-tavern-border/70 bg-surface-alt/45 dark:bg-tavern-surface-alt/45"
	>
		<div class="grid gap-2 md:grid-cols-3">
			<label class="text-xs text-ink-muted dark:text-tavern-muted">
				Encounter notes
				<textarea
					rows="2"
					class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1 text-xs"
					value={combat.notes}
					onchange={(event) =>
						setEncounterNotes((event.currentTarget as HTMLTextAreaElement).value)}
				></textarea>
			</label>
			<label class="text-xs text-ink-muted dark:text-tavern-muted">
				Loot rolled
				<textarea
					rows="2"
					class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1 text-xs"
					value={combat.loot}
					onchange={(event) => setEncounterLoot((event.currentTarget as HTMLTextAreaElement).value)}
				></textarea>
			</label>
			<label class="text-xs text-ink-muted dark:text-tavern-muted">
				Encounter outcome
				<textarea
					rows="2"
					class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface px-2 py-1 text-xs"
					value={combat.outcome}
					onchange={(event) =>
						setEncounterOutcome((event.currentTarget as HTMLTextAreaElement).value)}
				></textarea>
			</label>
		</div>
		{#if combat.notableRolls.length > 0}
			<p class="mt-1 text-[11px] text-ink-muted dark:text-tavern-muted">
				{combat.notableRolls.length} notable rolls recorded for encounter log.
			</p>
		{/if}
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover dark:bg-tavern-accent dark:hover:bg-tavern-accent-hover dark:text-tavern-bg text-white text-xs"
				onclick={() => void saveEncounterLog()}
			>
				Save Encounter Log
			</button>
			{#if combat.lastLogNoteId}
				<button
					type="button"
					class="px-3 py-1.5 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface dark:hover:bg-tavern-surface"
					onclick={openEncounterLog}
				>
					Open Last Log
				</button>
			{/if}
		</div>
	</footer>
</div>
