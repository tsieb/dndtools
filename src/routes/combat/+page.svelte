<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { nanoid } from 'nanoid';
	import {
		advanceSessionCombatTurn,
		applyHpChange,
		indexOfCombatant,
		sortCombatantsByInitiative,
	} from '$lib/domain/session-combat.js';
	import { getLinkedCombatantDefaults } from '$lib/domain/combat-tracker.js';
	import { createSessionBoardId } from '$lib/types/session-board.js';
	import { desktopShellState } from '$lib/state/desktop-shell.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import { objectsState } from '$lib/state/objects.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { sessionModeState } from '$lib/state/session-mode.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import type { StatBlockObject, VaultObject } from '$lib/types/object.js';
	import type {
		SessionCombatantKind,
		SessionCombatantState,
		SessionConditionName,
	} from '$lib/types/session-state.js';
	import EmptyState from '$lib/ui/common/EmptyState.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';
	import StatBlockView from '$lib/ui/viewer/StatBlockView.svelte';
	import { SvelteMap } from 'svelte/reactivity';

	const CONDITIONS: readonly SessionConditionName[] = [
		'Blinded',
		'Charmed',
		'Frightened',
		'Grappled',
		'Incapacitated',
		'Invisible',
		'Paralyzed',
		'Petrified',
		'Poisoned',
		'Prone',
		'Restrained',
		'Stunned',
		'Unconscious',
	];
	const TYPE_ICON: Record<SessionCombatantKind, 'flag' | 'book' | 'hexagon'> = {
		pc: 'flag',
		npc: 'book',
		creature: 'hexagon',
	};

	let showAdd = $state(false);
	let addName = $state('');
	let addInitiative = $state('');
	let addMaxHp = $state('');
	let addType = $state<SessionCombatantKind>('creature');
	let addLinkedObjectId = $state('');
	let selectedCombatantId = $state<string | null>(null);
	let conditionToAdd = $state<SessionConditionName>('Blinded');
	let conditionDuration = $state('');
	let showLegend = $state(false);
	let quickOpen = $state(false);
	let quickCombatantId = $state<string | null>(null);
	let quickMode = $state<'damage' | 'heal' | 'temp'>('damage');
	let quickAmount = $state('');
	let sheetObjectId = $state<string | null>(null);
	let lastUndo = $state<{
		combatantId: string;
		previousCurrentHp: number;
		previousTempHp: number;
		label: string;
	} | null>(null);
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let undoTimer: ReturnType<typeof setTimeout> | null = null;
	let initiativeFocusId = $state<string | null>(null);
	const initiativeOptionRefs = new SvelteMap<string, HTMLButtonElement>();

	const activeSession = $derived(sessionModeState.activeSession);
	const combatants = $derived(activeSession?.combatants ?? []);
	const currentRound = $derived(activeSession?.currentRound ?? 1);
	const activeCombatantIndex = $derived(activeSession?.activeCombatantIndex ?? 0);
	const activeCombatant = $derived(combatants[activeCombatantIndex] ?? null);
	const linkedObjects = $derived(objectsState.objectById);
	const activeBoard = $derived.by(() => {
		const id = activeSession?.sessionBoardId;
		return id ? (sessionBoardsState.boards.find((board) => board.id === id) ?? null) : null;
	});
	const sortedCombatants = $derived(sortCombatantsByInitiative(combatants));
	const selectedCombatant = $derived.by(() => {
		if (selectedCombatantId) {
			const selected = combatants.find((entry) => entry.id === selectedCombatantId);
			if (selected) return selected;
		}
		if (sessionModeState.selectedCombatantId) {
			const selected = combatants.find(
				(entry) => entry.id === sessionModeState.selectedCombatantId,
			);
			if (selected) return selected;
		}
		return activeCombatant ?? combatants[0] ?? null;
	});
	const quickCombatant = $derived.by(() =>
		quickCombatantId ? (combatants.find((entry) => entry.id === quickCombatantId) ?? null) : null,
	);
	const statSheetObject = $derived.by(() => {
		const referenceId = layoutState.isExpanded
			? sessionModeState.combatReferenceObjectId
			: sheetObjectId;
		if (!referenceId) return null;
		return asStatBlockObject(linkedObjects[referenceId]);
	});

	$effect(() => {
		if (!sessionModeState.loaded) void sessionModeState.load();
		if (!objectsState.loading && objectsState.objects.length === 0) void objectsState.loadAll();
		if (!sessionBoardsState.loading && sessionBoardsState.boards.length === 0) {
			void sessionBoardsState.loadAll();
		}
	});
	$effect(() => {
		if (!activeSession) return;
		const id = createSessionBoardId(activeSession.sessionBoardId);
		if (sessionBoardsState.activeBoard?.id !== id) sessionBoardsState.setActiveBoard(id);
	});
	$effect(() => {
		const persisted = sessionModeState.selectedCombatantId;
		if (
			persisted &&
			selectedCombatantId !== persisted &&
			combatants.some((entry) => entry.id === persisted)
		) {
			selectedCombatantId = persisted;
		}
	});
	$effect(() => {
		if (!selectedCombatantId || !combatants.some((entry) => entry.id === selectedCombatantId)) {
			selectedCombatantId = selectedCombatant?.id ?? null;
		}
	});
	$effect(() => {
		if (!initiativeFocusId || !sortedCombatants.some((entry) => entry.id === initiativeFocusId)) {
			initiativeFocusId = selectedCombatant?.id ?? sortedCombatants[0]?.id ?? null;
		}
	});
	$effect(() => {
		if (typeof window === 'undefined') return;
		const onShortcut = (event: Event): void => {
			const detail = (event as CustomEvent<{ action?: string }>).detail;
			if (!detail?.action || !sessionModeState.isActive) return;
			handleCombatShortcutAction(detail.action);
		};
		window.addEventListener('dndtools:combat-shortcut', onShortcut);
		return () => {
			window.removeEventListener('dndtools:combat-shortcut', onShortcut);
		};
	});
	$effect(() => () => {
		if (holdTimer) clearTimeout(holdTimer);
		if (undoTimer) clearTimeout(undoTimer);
	});

	function asStatBlockObject(value: VaultObject | undefined): StatBlockObject | null {
		return value && value.type === 'stat_block' ? value : null;
	}
	function parseIntOrNull(value: string): number | null {
		const text = value.trim();
		if (!text) return null;
		const parsed = Number.parseInt(text, 10);
		return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
	}
	function parsePositiveInt(value: string): number | null {
		const parsed = parseIntOrNull(value);
		return parsed && parsed > 0 ? parsed : null;
	}
	function hpPercent(combatant: SessionCombatantState): number {
		return combatant.maxHp <= 0 ? 0 : Math.round((combatant.currentHp / combatant.maxHp) * 100);
	}
	function conditionTag(name: SessionConditionName): string {
		return name.slice(0, 3).toUpperCase();
	}
	function clearAddForm(): void {
		addName = '';
		addInitiative = '';
		addMaxHp = '';
		addType = 'creature';
		addLinkedObjectId = '';
	}
	function hasStatBlockReference(combatant: SessionCombatantState): boolean {
		const id = combatant.linkedObjectId ? String(combatant.linkedObjectId) : '';
		return id ? asStatBlockObject(linkedObjects[id]) !== null : false;
	}
	function setUndoState(input: {
		combatantId: string;
		previousCurrentHp: number;
		previousTempHp: number;
		label: string;
	}): void {
		lastUndo = input;
		if (undoTimer) clearTimeout(undoTimer);
		undoTimer = setTimeout(() => {
			lastUndo = null;
		}, 5000);
	}

	async function persistCombatState(input: {
		combatants: SessionCombatantState[];
		currentRound: number;
		activeCombatantId?: string | null;
		selectedCombatantId?: string | null;
		referenceObjectId?: string | null;
	}): Promise<void> {
		const nextCombatants = sortCombatantsByInitiative(input.combatants);
		const activeId =
			input.activeCombatantId ?? activeCombatant?.id ?? nextCombatants[0]?.id ?? null;
		const nextActiveIndex = Math.max(0, indexOfCombatant(nextCombatants, activeId));
		const requestedSelectedId = input.selectedCombatantId ?? selectedCombatantId;
		const nextSelectedId =
			requestedSelectedId && nextCombatants.some((entry) => entry.id === requestedSelectedId)
				? requestedSelectedId
				: (nextCombatants[nextActiveIndex]?.id ?? null);
		await sessionModeState.setCombatState({
			combatants: nextCombatants,
			currentRound: Math.max(1, Math.trunc(input.currentRound)),
			activeCombatantIndex: nextCombatants.length === 0 ? 0 : nextActiveIndex,
			combatActive: nextCombatants.length > 0,
			selectedCombatantId: nextSelectedId,
			referenceObjectId:
				input.referenceObjectId !== undefined
					? input.referenceObjectId
					: sessionModeState.combatReferenceObjectId,
		});
		selectedCombatantId = nextSelectedId;
	}

	async function updateCombatant(
		combatantId: string,
		updater: (combatant: SessionCombatantState) => SessionCombatantState,
	): Promise<void> {
		const next = combatants.map((entry) => (entry.id === combatantId ? updater(entry) : entry));
		await persistCombatState({
			combatants: next,
			currentRound,
			activeCombatantId: activeCombatant?.id,
		});
	}

	async function addCombatant(): Promise<void> {
		if (!activeSession) return;
		const name = addName.trim();
		if (!name) {
			toastState.error('Combatant name is required.');
			return;
		}
		const linkedObject = addLinkedObjectId ? linkedObjects[addLinkedObjectId] : undefined;
		const defaults = linkedObject ? getLinkedCombatantDefaults(linkedObject) : null;
		const maxHp = parsePositiveInt(addMaxHp) ?? defaults?.maxHp ?? 1;
		const next: SessionCombatantState = {
			id: nanoid(10),
			name,
			kind: addType,
			initiative: parseIntOrNull(addInitiative),
			currentHp: maxHp,
			maxHp,
			tempHp: 0,
			conditions: [],
			linkedObjectId: linkedObject?.id,
			linkedObjectType:
				linkedObject?.type === 'stat_block' || linkedObject?.type === 'character'
					? linkedObject.type
					: undefined,
			linkedObjectName: linkedObject?.name,
		};
		await persistCombatState({
			combatants: [...combatants, next],
			currentRound,
			activeCombatantId: activeCombatant?.id ?? next.id,
			selectedCombatantId: next.id,
		});
		showAdd = false;
		clearAddForm();
	}

	async function removeCombatant(combatantId: string): Promise<void> {
		const removed = combatants.find((entry) => entry.id === combatantId) ?? null;
		const filtered = combatants.filter((entry) => entry.id !== combatantId);
		const clearReference =
			removed?.linkedObjectId &&
			sessionModeState.combatReferenceObjectId === String(removed.linkedObjectId);
		await persistCombatState({
			combatants: filtered,
			currentRound,
			activeCombatantId:
				activeCombatant?.id === combatantId ? (filtered[0]?.id ?? null) : activeCombatant?.id,
			selectedCombatantId:
				selectedCombatantId === combatantId ? (filtered[0]?.id ?? null) : selectedCombatantId,
			referenceObjectId: clearReference ? null : undefined,
		});
	}

	async function setActiveCombatant(combatantId: string): Promise<void> {
		await persistCombatState({
			combatants,
			currentRound,
			activeCombatantId: combatantId,
			selectedCombatantId: combatantId,
		});
	}

	async function advanceTurn(): Promise<void> {
		const result = advanceSessionCombatTurn({ combatants, currentRound, activeCombatantIndex });
		const nextActiveId = result.combatants[result.activeCombatantIndex]?.id ?? null;
		await persistCombatState({
			combatants: result.combatants,
			currentRound: result.currentRound,
			activeCombatantId: nextActiveId,
			selectedCombatantId: nextActiveId,
		});
		if (result.expiredConditions.length > 0) {
			const summary = result.expiredConditions
				.map((entry) => `${entry.combatantName}: ${entry.conditionName}`)
				.join(', ');
			toastState.info(`Conditions expired: ${summary}`);
		}
	}

	async function setSelectedCombatant(combatantId: string): Promise<void> {
		selectedCombatantId = combatantId;
		await sessionModeState.setCombatSelection(combatantId);
	}

	async function applyHpAdjustment(
		combatantId: string,
		mode: 'damage' | 'heal' | 'temp',
		amount: number,
	): Promise<void> {
		const combatant = combatants.find((entry) => entry.id === combatantId);
		if (!combatant) return;
		const result = applyHpChange(combatant, { mode, amount });
		await updateCombatant(combatantId, () => result.combatant);
		setUndoState({
			combatantId,
			previousCurrentHp: result.undo.previousCurrentHp,
			previousTempHp: result.undo.previousTempHp,
			label: `${combatant.name} ${mode}`,
		});
	}

	function openQuickAdjust(combatantId: string, mode: 'damage' | 'heal' | 'temp'): void {
		quickCombatantId = combatantId;
		quickMode = mode;
		quickAmount = '';
		quickOpen = true;
	}
	function closeQuickAdjust(): void {
		quickOpen = false;
		quickCombatantId = null;
		quickAmount = '';
	}
	function appendQuickDigit(digit: string): void {
		const next = `${quickAmount}${digit}`.slice(0, 4);
		quickAmount = next.replace(/^0+(?=\d)/, '');
	}
	function backspaceQuick(): void {
		quickAmount = quickAmount.slice(0, -1);
	}
	async function applyQuickAdjust(): Promise<void> {
		if (!quickCombatantId) return;
		const amount = parsePositiveInt(quickAmount);
		if (!amount) return;
		await applyHpAdjustment(quickCombatantId, quickMode, amount);
		closeQuickAdjust();
	}
	async function undoLastHpChange(): Promise<void> {
		if (!lastUndo) return;
		const snapshot = lastUndo;
		lastUndo = null;
		await updateCombatant(snapshot.combatantId, (combatant) => ({
			...combatant,
			currentHp: snapshot.previousCurrentHp,
			tempHp: snapshot.previousTempHp,
		}));
	}
	function startHpHold(event: PointerEvent, combatantId: string): void {
		if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = setTimeout(() => {
			holdTimer = null;
			openQuickAdjust(combatantId, 'damage');
		}, 320);
	}
	function cancelHpHold(): void {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
	}

	async function addConditionToSelected(): Promise<void> {
		if (!selectedCombatant) return;
		const rounds = parsePositiveInt(conditionDuration);
		await updateCombatant(selectedCombatant.id, (combatant) => ({
			...combatant,
			conditions: [
				...combatant.conditions.filter((entry) => entry.name !== conditionToAdd),
				{ name: conditionToAdd, roundsRemaining: rounds },
			],
		}));
		conditionDuration = '';
	}
	async function updateConditionDuration(
		combatantId: string,
		conditionName: SessionConditionName,
		value: string,
	): Promise<void> {
		const rounds = parsePositiveInt(value);
		await updateCombatant(combatantId, (combatant) => ({
			...combatant,
			conditions: combatant.conditions.map((entry) =>
				entry.name === conditionName ? { ...entry, roundsRemaining: rounds } : entry,
			),
		}));
	}
	async function removeCondition(
		combatantId: string,
		conditionName: SessionConditionName,
	): Promise<void> {
		await updateCombatant(combatantId, (combatant) => ({
			...combatant,
			conditions: combatant.conditions.filter((entry) => entry.name !== conditionName),
		}));
	}

	async function openStatBlockReference(combatant: SessionCombatantState): Promise<void> {
		const id = combatant.linkedObjectId ? String(combatant.linkedObjectId) : '';
		if (!id) return;
		if (!asStatBlockObject(linkedObjects[id])) {
			toastState.info('Only linked stat blocks can open in quick reference.');
			return;
		}
		await sessionModeState.setCombatReferenceObjectId(id);
		if (layoutState.isExpanded) {
			desktopShellState.setDetailPanelOpen(true);
			return;
		}
		sheetObjectId = id;
	}
	async function closeStatBlockSheet(): Promise<void> {
		sheetObjectId = null;
		if (!layoutState.isExpanded) await sessionModeState.setCombatReferenceObjectId(null);
	}
	function openSessionBoards(): void {
		void goto(resolve('/session/boards'));
	}

	function openAddCombatants(): void {
		showAdd = true;
	}
	function initiativeOption(node: HTMLButtonElement, combatantId: string) {
		initiativeOptionRefs.set(combatantId, node);
		return {
			update(nextId: string): void {
				if (nextId === combatantId) return;
				initiativeOptionRefs.delete(combatantId);
				combatantId = nextId;
				initiativeOptionRefs.set(combatantId, node);
			},
			destroy(): void {
				initiativeOptionRefs.delete(combatantId);
			},
		};
	}
	function moveInitiativeFocus(mode: 'next' | 'previous' | 'first' | 'last'): void {
		if (sortedCombatants.length === 0) return;
		if (mode === 'first') {
			const firstId = sortedCombatants[0]?.id;
			if (!firstId) return;
			initiativeFocusId = firstId;
			initiativeOptionRefs.get(firstId)?.focus();
			return;
		}
		if (mode === 'last') {
			const lastId = sortedCombatants.at(-1)?.id;
			if (!lastId) return;
			initiativeFocusId = lastId;
			initiativeOptionRefs.get(lastId)?.focus();
			return;
		}
		const currentIndex = Math.max(
			0,
			sortedCombatants.findIndex((entry) => entry.id === initiativeFocusId),
		);
		const nextIndex =
			mode === 'next'
				? (currentIndex + 1) % sortedCombatants.length
				: (currentIndex - 1 + sortedCombatants.length) % sortedCombatants.length;
		const nextId = sortedCombatants[nextIndex]?.id;
		if (!nextId) return;
		initiativeFocusId = nextId;
		initiativeOptionRefs.get(nextId)?.focus();
	}
	function handleInitiativeListKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moveInitiativeFocus('next');
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			moveInitiativeFocus('previous');
			return;
		}
		if (event.key === 'Home') {
			event.preventDefault();
			moveInitiativeFocus('first');
			return;
		}
		if (event.key === 'End') {
			event.preventDefault();
			moveInitiativeFocus('last');
			return;
		}
		if (event.key === 'Enter' && initiativeFocusId) {
			event.preventDefault();
			void setSelectedCombatant(initiativeFocusId);
		}
	}
	function handleCombatShortcutAction(action: string): void {
		if (action === 'next-turn') {
			void advanceTurn();
			return;
		}
		if (!selectedCombatant) return;
		if (action === 'quick-damage') {
			openQuickAdjust(selectedCombatant.id, 'damage');
			return;
		}
		if (action === 'quick-heal') {
			openQuickAdjust(selectedCombatant.id, 'heal');
		}
	}
</script>

<div class="h-full min-h-0 overflow-hidden p-4">
	<section
		class="h-full min-h-0 overflow-hidden rounded-xl border border-border-strong/60 bg-surface/95 shadow-sm"
	>
		<header class="border-b border-border px-4 py-3">
			<div class="flex flex-wrap items-center gap-3">
				<h1 class="text-xl font-bold text-ink" style="font-family: var(--font-serif)">
					Combat Tracker
				</h1>
				{#if sessionModeState.isActive}
					<span class="rounded-full border border-border px-2 py-0.5 text-xs text-ink-muted"
						>Round {currentRound}</span
					>
					{#if activeCombatant}
						<span class="rounded-full border border-border px-2 py-0.5 text-xs text-ink-muted"
							>Active: {activeCombatant.name}</span
						>
					{/if}
				{/if}
				<button
					type="button"
					class="ml-auto flex min-h-11 items-center gap-1 rounded-md border border-border px-3 text-xs text-ink-muted hover:bg-surface-alt"
					onclick={() => (showLegend = !showLegend)}
				>
					<Icon name="list" size="xs" /> Condition Legend
				</button>
			</div>
			{#if activeBoard}
				<p class="mt-1 text-xs text-ink-muted">Session board: {activeBoard.name}</p>
			{/if}
			<p class="mt-1 text-xs text-ink-faint">
				Shortcuts: <span class="font-mono">n</span> next turn, <span class="font-mono">d</span>
				damage, <span class="font-mono">h</span> heal
			</p>
			{#if showLegend}
				<div
					class="mt-2 grid grid-cols-2 gap-1 rounded-md border border-border bg-surface p-2 text-xs text-ink-muted sm:grid-cols-4"
				>
					{#each CONDITIONS as condition (condition)}
						<div class="rounded border border-border px-1.5 py-1 text-center">
							{conditionTag(condition)}
							{condition}
						</div>
					{/each}
				</div>
			{/if}
		</header>

		{#if !sessionModeState.isActive}
			<div class="flex h-full items-center justify-center p-6">
				<div class="max-w-md rounded-lg border border-border bg-surface p-4 text-center">
					<p class="text-sm font-semibold text-ink">Session mode is idle.</p>
					<p class="mt-1 text-xs text-ink-muted">
						Start a session to persist combat state across routes and app restarts.
					</p>
					<button
						type="button"
						class="mt-3 min-h-11 rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover"
						onclick={openSessionBoards}>Open Session Boards</button
					>
				</div>
			</div>
		{:else}
			<div
				class="grid h-[calc(100%-5.5rem)] min-h-0 gap-3 p-3 lg:grid-cols-[minmax(0,0.47fr)_minmax(0,0.53fr)]"
			>
				<section
					class="flex min-h-0 flex-col rounded-lg border border-border bg-surface-alt/35 p-3"
				>
					<div class="mb-3 flex flex-wrap gap-2">
						<button
							type="button"
							class="min-h-11 min-w-[8.75rem] rounded-md bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-hover"
							onclick={() => void advanceTurn()}
							disabled={combatants.length === 0}>Next Turn</button
						>
						<button
							type="button"
							class="min-h-11 rounded-md border border-border px-3 text-xs text-ink-muted hover:bg-surface"
							onclick={() => (showAdd = !showAdd)}>{showAdd ? 'Close Add' : 'Add Combatant'}</button
						>
					</div>
					{#if showAdd}
						<div
							class="mb-3 grid gap-2 rounded-md border border-border bg-surface p-2.5 sm:grid-cols-2"
						>
							<input
								class="h-11 rounded border border-border bg-surface px-2 text-sm"
								bind:value={addName}
								placeholder="Name"
							/>
							<select
								class="h-11 rounded border border-border bg-surface px-2 text-sm"
								bind:value={addType}
								><option value="creature">Creature</option><option value="npc">NPC</option><option
									value="pc">PC</option
								></select
							>
							<input
								class="h-11 rounded border border-border bg-surface px-2 text-sm"
								type="number"
								bind:value={addInitiative}
								placeholder="Initiative"
							/>
							<input
								class="h-11 rounded border border-border bg-surface px-2 text-sm"
								type="number"
								bind:value={addMaxHp}
								placeholder="Max HP"
							/>
							<select
								class="h-11 rounded border border-border bg-surface px-2 text-sm sm:col-span-2"
								bind:value={addLinkedObjectId}
							>
								<option value="">No linked object</option>
								{#each objectsState.objects as object (object.id)}
									{#if object.type === 'stat_block' || object.type === 'character'}<option
											value={object.id}>{object.name} ({object.type})</option
										>{/if}
								{/each}
							</select>
							<button
								type="button"
								class="min-h-11 rounded-md border border-border px-3 text-xs text-ink-muted hover:bg-surface"
								onclick={() => {
									showAdd = false;
									clearAddForm();
								}}>Cancel</button
							>
							<button
								type="button"
								class="min-h-11 rounded-md bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-hover"
								onclick={() => void addCombatant()}>Add Combatant</button
							>
						</div>
					{/if}
					<div
						class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
						role="listbox"
						aria-label="Initiative order"
						aria-activedescendant={initiativeFocusId
							? `combatant-option-${initiativeFocusId}`
							: undefined}
						onkeydown={handleInitiativeListKeydown}
					>
						{#if sortedCombatants.length === 0}
							<EmptyState
								class="min-h-0 px-0 py-2"
								illustration="session-combat"
								headline="No combat active"
								body="Add combatants to start tracking initiative."
								primaryAction={{ label: 'Add combatants', onclick: openAddCombatants }}
							/>
						{:else}
							{#each sortedCombatants as combatant (combatant.id)}
								<article
									class="rounded-lg border p-2 {activeCombatant?.id === combatant.id
										? 'border-accent bg-accent-subtle/25'
										: 'border-border bg-surface'}"
								>
									<div class="flex items-start gap-2">
										<button
											id={`combatant-option-${combatant.id}`}
											use:initiativeOption={combatant.id}
											role="option"
											tabindex={initiativeFocusId === combatant.id ? 0 : -1}
											aria-selected={initiativeFocusId === combatant.id}
											type="button"
											class="min-h-11 min-w-0 flex-1 rounded-md px-2 text-left hover:bg-surface-alt/45"
											onclick={() => void setSelectedCombatant(combatant.id)}
											onfocus={() => (initiativeFocusId = combatant.id)}
											onpointerdown={(event) => startHpHold(event, combatant.id)}
											onpointerup={cancelHpHold}
											onpointercancel={cancelHpHold}
											onpointerleave={cancelHpHold}
										>
											<div class="flex items-center gap-2">
												<span
													class="h-2.5 w-2.5 rounded-full {activeCombatant?.id === combatant.id
														? 'bg-accent'
														: 'bg-border'}"
												></span>
												<span
													class="inline-flex min-h-8 min-w-8 items-center justify-center rounded border border-border px-1 text-xs"
													>{combatant.initiative ?? '-'}</span
												>
												<span class="inline-flex items-center gap-1 text-sm font-semibold text-ink"
													><Icon name={TYPE_ICON[combatant.kind]} size="xs" />
													{combatant.name}</span
												>
											</div>
											<div class="mt-1 text-xs text-ink-muted">
												HP {combatant.currentHp}/{combatant.maxHp}{#if combatant.tempHp > 0}
													(+{combatant.tempHp} temp){/if}
											</div>
											<div class="mt-1 h-2 rounded-full bg-surface-alt/70">
												<div
													class="h-full rounded-full bg-accent"
													style={`width:${Math.max(0, Math.min(100, hpPercent(combatant)))}%`}
												></div>
											</div>
											<div class="mt-2 flex flex-wrap gap-1">
												{#each combatant.conditions as condition (condition.name)}
													<span
														class="rounded border border-border px-1.5 py-0.5 text-2xs text-ink-muted"
														title={condition.roundsRemaining
															? `${condition.name} (${condition.roundsRemaining} rounds)`
															: `${condition.name} (until removed)`}
														>{conditionTag(condition.name)}</span
													>
												{/each}
											</div>
										</button>
										<div class="flex flex-col gap-1">
											<button
												type="button"
												class="min-h-11 min-w-11 rounded-md border border-border px-2 text-2xs text-ink-muted hover:bg-surface-alt"
												onclick={() => void setActiveCombatant(combatant.id)}
												disabled={activeCombatant?.id === combatant.id}>Turn</button
											>
											{#if hasStatBlockReference(combatant)}
												<button
													type="button"
													class="min-h-11 min-w-11 rounded-md border border-border px-2 text-2xs text-ink-muted hover:bg-surface-alt"
													onclick={() => void openStatBlockReference(combatant)}
													><Icon name="file-text" size="xs" /></button
												>
											{/if}
											<button
												type="button"
												class="min-h-11 min-w-11 rounded-md border border-border px-2 text-2xs text-ink-muted hover:bg-surface-alt"
												onclick={() => void removeCombatant(combatant.id)}
												><Icon name="trash" size="xs" /></button
											>
										</div>
									</div>
								</article>
							{/each}
						{/if}
					</div>
				</section>
				<section class="min-h-0 rounded-lg border border-border bg-surface p-3">
					{#if selectedCombatant}
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div>
									<p class="text-xs uppercase tracking-wide text-ink-faint">Combatant Detail</p>
									<h2 class="text-lg font-semibold text-ink">{selectedCombatant.name}</h2>
								</div>
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										class="min-h-11 rounded-md border border-border px-3 text-xs text-ink-muted hover:bg-surface-alt"
										onclick={() => void setActiveCombatant(selectedCombatant.id)}
										disabled={activeCombatant?.id === selectedCombatant.id}>Set Active Turn</button
									>
									{#if hasStatBlockReference(selectedCombatant)}
										<button
											type="button"
											class="min-h-11 rounded-md border border-border px-3 text-xs text-ink-muted hover:bg-surface-alt"
											onclick={() => void openStatBlockReference(selectedCombatant)}
											>Open Stat Block</button
										>
									{/if}
								</div>
							</div>
							<section class="mt-3 rounded-md border border-border bg-surface-alt/30 p-2.5">
								<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
									Hit Points
								</p>
								<p class="text-sm font-semibold text-ink">
									{selectedCombatant.currentHp}/{selectedCombatant.maxHp}{#if selectedCombatant.tempHp > 0}
										<span class="text-xs text-ink-muted">(+{selectedCombatant.tempHp} temp)</span
										>{/if}
								</p>
								<div class="mt-1 h-2 rounded-full bg-surface-alt/70">
									<div
										class="h-full rounded-full bg-accent"
										style={`width:${Math.max(0, Math.min(100, hpPercent(selectedCombatant)))}%`}
									></div>
								</div>
								<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
									<button
										type="button"
										class="min-h-11 rounded-md border border-border px-2 text-xs text-ink-muted hover:bg-surface"
										onclick={() => void applyHpAdjustment(selectedCombatant.id, 'damage', 1)}
										>-1 HP</button
									>
									<button
										type="button"
										class="min-h-11 rounded-md border border-border px-2 text-xs text-ink-muted hover:bg-surface"
										onclick={() => void applyHpAdjustment(selectedCombatant.id, 'damage', 5)}
										>-5 HP</button
									>
									<button
										type="button"
										class="min-h-11 rounded-md border border-border px-2 text-xs text-ink-muted hover:bg-surface"
										onclick={() => void applyHpAdjustment(selectedCombatant.id, 'heal', 1)}
										>+1 HP</button
									>
									<button
										type="button"
										class="min-h-11 rounded-md border border-border px-2 text-xs text-ink-muted hover:bg-surface"
										onclick={() => void applyHpAdjustment(selectedCombatant.id, 'heal', 5)}
										>+5 HP</button
									>
								</div>
								<div class="mt-2 flex flex-wrap gap-2">
									<button
										type="button"
										class="min-h-11 rounded-md border border-border px-3 text-xs text-ink-muted hover:bg-surface"
										onclick={() => openQuickAdjust(selectedCombatant.id, 'damage')}
										>Quick Damage</button
									>
									<button
										type="button"
										class="min-h-11 rounded-md border border-border px-3 text-xs text-ink-muted hover:bg-surface"
										onclick={() => openQuickAdjust(selectedCombatant.id, 'heal')}>Quick Heal</button
									>
									<button
										type="button"
										class="min-h-11 rounded-md border border-border px-3 text-xs text-ink-muted hover:bg-surface"
										onclick={() => openQuickAdjust(selectedCombatant.id, 'temp')}
										>Set Temp HP</button
									>
								</div>
							</section>
							<section
								class="mt-3 min-h-0 flex-1 rounded-md border border-border bg-surface-alt/20 p-2.5"
							>
								<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
									Conditions
								</p>
								<div class="mt-2 space-y-1.5">
									{#each selectedCombatant.conditions as condition (condition.name)}
										<div
											class="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5"
										>
											<span class="min-w-0 flex-1 text-xs text-ink">{condition.name}</span>
											<input
												type="number"
												min="1"
												class="h-11 w-20 rounded border border-border bg-surface px-2 text-xs"
												value={condition.roundsRemaining ?? ''}
												placeholder="Inf"
												onchange={(event) =>
													void updateConditionDuration(
														selectedCombatant.id,
														condition.name,
														(event.currentTarget as HTMLInputElement).value,
													)}
											/>
											<button
												type="button"
												class="min-h-11 min-w-11 rounded-md border border-border px-2 text-xs text-ink-muted hover:bg-surface-alt"
												onclick={() => void removeCondition(selectedCombatant.id, condition.name)}
												><Icon name="x" size="xs" /></button
											>
										</div>
									{/each}
								</div>
								<div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_7.5rem]">
									<select
										class="h-11 rounded border border-border bg-surface px-2 text-sm"
										bind:value={conditionToAdd}
										>{#each CONDITIONS as condition (condition)}<option value={condition}
												>{condition}</option
											>{/each}</select
									>
									<input
										type="number"
										min="1"
										class="h-11 rounded border border-border bg-surface px-2 text-sm"
										bind:value={conditionDuration}
										placeholder="Rounds"
									/>
									<button
										type="button"
										class="min-h-11 rounded-md bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-hover"
										onclick={() => void addConditionToSelected()}>Add Condition</button
									>
								</div>
							</section>
						</div>
					{:else}
						<div
							class="flex h-full items-center justify-center rounded-md border border-dashed border-border p-4"
						>
							<p class="text-xs text-ink-muted">Select a combatant to view details.</p>
						</div>
					{/if}
				</section>
			</div>
		{/if}
	</section>
</div>

{#if quickOpen}
	<div
		class="fixed inset-0 z-[80] bg-black/40 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="HP quick adjust"
	>
		<div
			class="mx-auto mt-12 w-full max-w-sm rounded-xl border border-border bg-surface p-3 shadow-2xl"
		>
			<div class="flex items-start justify-between gap-2">
				<div>
					<p class="text-xs uppercase tracking-wide text-ink-faint">Quick Adjust</p>
					<h2 class="text-sm font-semibold text-ink">{quickCombatant?.name ?? 'Combatant'}</h2>
				</div>
				<button
					type="button"
					class="min-h-11 min-w-11 rounded-md border border-border px-2 text-xs text-ink-muted hover:bg-surface-alt"
					onclick={closeQuickAdjust}><Icon name="x" size="xs" /></button
				>
			</div>
			<div class="mt-2 grid grid-cols-3 gap-2">
				<button
					type="button"
					class="min-h-11 rounded-md border px-2 text-xs {quickMode === 'damage'
						? 'border-accent bg-accent-subtle/35 text-accent'
						: 'border-border text-ink-muted hover:bg-surface-alt'}"
					onclick={() => (quickMode = 'damage')}>Damage</button
				>
				<button
					type="button"
					class="min-h-11 rounded-md border px-2 text-xs {quickMode === 'heal'
						? 'border-accent bg-accent-subtle/35 text-accent'
						: 'border-border text-ink-muted hover:bg-surface-alt'}"
					onclick={() => (quickMode = 'heal')}>Heal</button
				>
				<button
					type="button"
					class="min-h-11 rounded-md border px-2 text-xs {quickMode === 'temp'
						? 'border-accent bg-accent-subtle/35 text-accent'
						: 'border-border text-ink-muted hover:bg-surface-alt'}"
					onclick={() => (quickMode = 'temp')}>Temp HP</button
				>
			</div>
			<input
				type="number"
				min="1"
				class="mt-2 h-11 w-full rounded border border-border bg-surface px-2 text-lg font-semibold"
				bind:value={quickAmount}
			/>
			<div class="mt-2 grid grid-cols-3 gap-2">
				{#each ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'] as digit (digit)}
					<button
						type="button"
						class="min-h-11 rounded-md border border-border text-sm text-ink-muted hover:bg-surface-alt"
						onclick={() => appendQuickDigit(digit)}>{digit}</button
					>
				{/each}
				<button
					type="button"
					class="min-h-11 rounded-md border border-border text-xs text-ink-muted hover:bg-surface-alt"
					onclick={backspaceQuick}>Back</button
				>
				<button
					type="button"
					class="min-h-11 rounded-md bg-accent text-xs font-semibold text-white hover:bg-accent-hover"
					onclick={() => void applyQuickAdjust()}>Apply</button
				>
			</div>
		</div>
	</div>
{/if}

{#if statSheetObject && !layoutState.isExpanded}
	<div class="fixed inset-0 z-[90] bg-black/50 p-2 sm:p-4">
		<div
			class="mx-auto mt-8 h-[calc(100%-4rem)] max-w-2xl rounded-xl border border-border bg-surface p-3 shadow-2xl"
		>
			<div class="mb-2 flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-ink">{statSheetObject.name}</h2>
				<button
					type="button"
					class="min-h-11 min-w-11 rounded-md border border-border px-2 text-xs text-ink-muted hover:bg-surface-alt"
					onclick={() => void closeStatBlockSheet()}><Icon name="x" size="xs" /></button
				>
			</div>
			<div class="h-[calc(100%-3rem)] overflow-y-auto">
				<StatBlockView
					object={statSheetObject}
					compact={layoutState.isCompact}
					collapsibleSections
				/>
			</div>
		</div>
	</div>
{/if}

{#if lastUndo}
	<div class="fixed bottom-4 left-4 z-[95]">
		<button
			type="button"
			class="min-h-11 rounded-full border border-border bg-surface px-4 text-xs font-semibold text-ink shadow-lg hover:bg-surface-alt"
			onclick={() => void undoLastHpChange()}>Undo {lastUndo.label}</button
		>
	</div>
{/if}
