<script lang="ts">
	import { onMount } from 'svelte';
	import { createFolderId } from '$lib/types/note.js';
	import { nowISO } from '$lib/utils/date.js';
	import { generateVaultObjectId } from '$lib/utils/id.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { diceState } from '$lib/state/dice.svelte.js';
	import { sessionBoardsState } from '$lib/state/session-boards.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { normalizeCharacterData, summarizeVaultObject } from '$lib/domain/objects.js';
	import {
		buildRandomTableIndex,
		findSystemRandomTableNote,
		rollRandomTable,
	} from '$lib/domain/random-tables.js';
	import {
		buildContextualGeneratorState,
		generateLocationName,
		generateNpcQuick,
		type ContextualGeneratorInput,
		type GeneratedNpcQuick,
	} from '$lib/domain/contextual-generator.js';
	import DiceTrayPanel from '$lib/ui/dice/DiceTrayPanel.svelte';

	interface Props {
		compact?: boolean;
		showHeader?: boolean;
	}

	let { compact = false, showHeader = true }: Props = $props();
	let tab = $state<'dice' | 'tables' | 'npc'>('dice');
	let tableQuery = $state('');
	let tableError = $state('');
	let tableHistoryByName = $state<Record<string, string[]>>({});
	let npcDraft = $state<GeneratedNpcQuick | null>(null);
	let npcLocationHint = $state('');
	let npcError = $state('');
	let creatingNpcDraft = $state(false);
	let objects = $state<ContextualGeneratorInput['objects']>([]);
	let objectsLoading = $state(false);

	const tableIndex = $derived.by(() =>
		buildRandomTableIndex({
			vaultNotes: notesState.activeNotes.map((note) => ({
				id: String(note.id),
				title: note.title,
				content: note.content,
				tags: note.tags,
				folder: String(note.folder),
				updatedAt: note.updatedAt,
			})),
		}),
	);

	const filteredTables = $derived.by(() => {
		const normalized = tableQuery.trim().toLowerCase();
		const entries = tableIndex.tables;
		if (!normalized) return entries;
		return entries.filter((entry) => {
			const haystack = `${entry.name} ${entry.tags.join(' ')} ${entry.source}`.toLowerCase();
			return haystack.includes(normalized);
		});
	});

	onMount(() => {
		void diceState.ensureMacrosLoaded();
		void loadObjects();
		if (!npcDraft) {
			generateNpcDraft();
		}
	});

	async function loadObjects(): Promise<void> {
		objectsLoading = true;
		try {
			const loaded = await getStorage().getAllObjects();
			objects = loaded;
		} finally {
			objectsLoading = false;
		}
	}

	function tableHistory(tableName: string): string[] {
		return tableHistoryByName[tableName] ?? [];
	}

	function recordTableRoll(tableName: string, result: string): void {
		const existing = tableHistory(tableName);
		tableHistoryByName = {
			...tableHistoryByName,
			[tableName]: [result, ...existing].slice(0, 10),
		};
	}

	function rollTableByName(tableName: string): void {
		tableError = '';
		try {
			const rolled = rollRandomTable(tableIndex, tableName);
			recordTableRoll(tableName, rolled.result);
		} catch (error) {
			tableError = String(error);
		}
	}

	async function copySystemTable(tableName: string): Promise<void> {
		const table = findSystemRandomTableNote(tableName);
		if (!table) {
			toastState.error(`System table not found: ${tableName}`);
			return;
		}
		const existing = new Set(notesState.activeNotes.map((note) => note.title.toLowerCase()));
		let title = table.title;
		let suffix = 2;
		while (existing.has(title.toLowerCase())) {
			title = `${table.title} (${suffix})`;
			suffix += 1;
		}

		await notesState.createNote({
			title,
			content: table.content,
			tags: [...table.tags],
			folder: createFolderId('/tables/random'),
		});
		toastState.success(`Copied system table to vault: ${title}`);
	}

	async function createCustomTableNote(): Promise<void> {
		const baseTitle = 'New Random Table';
		const existing = new Set(notesState.activeNotes.map((note) => note.title.toLowerCase()));
		let title = baseTitle;
		let suffix = 2;
		while (existing.has(title.toLowerCase())) {
			title = `${baseTitle} (${suffix})`;
			suffix += 1;
		}
		const template = [
			'---',
			`title: ${title}`,
			'tags: [random-table]',
			'---',
			'',
			'# Random Table',
			'',
			'```random-table',
			'3 | Common result',
			'1 | Rare result',
			'```',
			'',
		].join('\n');
		const note = await notesState.createNote({
			title,
			content: template,
			tags: ['random-table'],
			folder: createFolderId('/tables/random'),
		});
		toastState.success(`Created random table note: ${note.title}`);
	}

	function buildContextualState() {
		const edges = notesState.activeNotes.flatMap((note) =>
			linksState.getForwardLinkIds(note.id).map((targetId) => ({
				sourceId: String(note.id),
				targetId: String(targetId),
			})),
		);
		const activeLocation = sessionBoardsState.activeBoard?.sessionContext?.items.find(
			(item) => item.category === 'location',
		);
		const locationNote = activeLocation
			? notesState.getActiveNoteById(activeLocation.noteId)
			: null;
		const activeCulture =
			(locationNote?.frontmatter['culture'] as string | undefined) ||
			(locationNote?.frontmatter['regionCulture'] as string | undefined) ||
			(locationNote?.frontmatter['culturalSetting'] as string | undefined) ||
			(locationNote?.frontmatter['region'] as string | undefined) ||
			(locationNote?.frontmatter['climate'] as string | undefined) ||
			null;
		return buildContextualGeneratorState({
			notes: notesState.activeNotes,
			objects,
			links: edges,
			activeRegionCulture: activeCulture,
		});
	}

	function generateNpcDraft(): void {
		npcError = '';
		try {
			const state = buildContextualState();
			npcDraft = generateNpcQuick(state);
			npcLocationHint = generateLocationName(state);
		} catch (error) {
			npcError = String(error);
		}
	}

	async function createDraftCharacterObject(): Promise<void> {
		if (!npcDraft) return;
		creatingNpcDraft = true;
		npcError = '';
		try {
			const now = nowISO();
			const object = {
				id: generateVaultObjectId(),
				type: 'character' as const,
				name: npcDraft.name,
				summary: '',
				tags: ['npc', 'generated'],
				visibility: 'dm_only' as const,
				relationships: [],
				data: normalizeCharacterData({
					goals: [npcDraft.motivation],
					bonds: [npcDraft.bond],
					flaws: [npcDraft.flaw],
					notes: [
						`Trait: ${npcDraft.trait}`,
						`Ideal: ${npcDraft.ideal}`,
						`Motivation: ${npcDraft.motivation}`,
						`Faction: ${npcDraft.factionAffiliation}`,
						`Suggested location context: ${npcLocationHint || 'n/a'}`,
					].join('\n'),
				}),
				createdAt: now,
				updatedAt: now,
			};
			object.summary = summarizeVaultObject(object);
			await getStorage().saveObject(object);
			await Promise.all([notesState.loadAll(), loadObjects()]);
			toastState.success(`Created draft character object: ${object.name}`);
		} catch (error) {
			npcError = String(error);
		} finally {
			creatingNpcDraft = false;
		}
	}
</script>

<div class="h-full min-h-0 flex flex-col gap-2 p-2.5">
	{#if showHeader}
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-sm font-semibold text-ink">Generator</h3>
			<span class="rounded border border-border px-2 py-1 text-xs text-ink-faint"> Ctrl+G </span>
		</div>
	{/if}

	<div class="flex items-center gap-1 rounded border border-border/70 p-1">
		<button
			type="button"
			class="flex-1 rounded px-2 py-1 text-xs transition-colors {tab === 'dice'
				? 'bg-accent-subtle text-accent'
				: 'text-ink-muted hover:bg-surface-alt'}"
			onclick={() => (tab = 'dice')}
		>
			Dice Macros
		</button>
		<button
			type="button"
			class="flex-1 rounded px-2 py-1 text-xs transition-colors {tab === 'tables'
				? 'bg-accent-subtle text-accent'
				: 'text-ink-muted hover:bg-surface-alt'}"
			onclick={() => (tab = 'tables')}
		>
			Tables
		</button>
		<button
			type="button"
			class="flex-1 rounded px-2 py-1 text-xs transition-colors {tab === 'npc'
				? 'bg-accent-subtle text-accent'
				: 'text-ink-muted hover:bg-surface-alt'}"
			onclick={() => (tab = 'npc')}
		>
			NPC Quick
		</button>
	</div>

	{#if tab === 'dice'}
		<div class="min-h-0 flex-1 overflow-hidden rounded border border-border/70">
			<DiceTrayPanel {compact} showHeader={false} source="tray" />
		</div>
	{:else if tab === 'tables'}
		<div class="min-h-0 flex-1 rounded border border-border/70 p-2">
			<div class="mb-2 flex items-center gap-2">
				<input
					type="text"
					bind:value={tableQuery}
					class="h-8 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-sm text-ink"
					placeholder="Search random tables..."
				/>
				<button
					type="button"
					class="rounded border border-border px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-alt"
					onclick={() => void createCustomTableNote()}
				>
					New Table
				</button>
			</div>
			<div class="max-h-[58vh] overflow-y-auto space-y-1 pr-1">
				{#if filteredTables.length === 0}
					<p class="text-xs text-ink-faint">No random tables found.</p>
				{:else}
					{#each filteredTables as table (table.source + ':' + table.sourceId)}
						<div class="rounded border border-border/60 px-2 py-1.5 bg-surface-alt/45">
							<div class="flex items-center gap-2">
								<div class="min-w-0 flex-1">
									<p class="truncate text-xs font-medium text-ink">
										{table.name}
									</p>
									<p class="text-xs text-ink-faint">
										{table.source === 'system' ? 'System' : 'Vault'} | {table.rows.length} rows
									</p>
								</div>
								<button
									type="button"
									class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface"
									onclick={() => rollTableByName(table.name)}
								>
									Roll
								</button>
								{#if table.source === 'system'}
									<button
										type="button"
										class="rounded border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface"
										onclick={() => void copySystemTable(table.name)}
									>
										Copy
									</button>
								{/if}
							</div>
							{#if tableHistory(table.name).length > 0}
								<ul class="mt-1 space-y-1">
									{#each tableHistory(table.name) as rollResult, index (`${table.name}:${index}`)}
										<li class="rounded border border-border/60 px-2 py-1 text-xs text-ink">
											{rollResult}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
			{#if tableError}
				<p class="mt-2 text-xs text-error">{tableError}</p>
			{/if}
		</div>
	{:else}
		<div class="min-h-0 flex-1 rounded border border-border/70 p-2">
			<div class="mb-2 flex items-center gap-2">
				<button
					type="button"
					class="rounded bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
					onclick={generateNpcDraft}
				>
					Generate NPC
				</button>
				<button
					type="button"
					class="rounded border border-border px-2.5 py-1.5 text-xs text-ink-muted hover:bg-surface-alt disabled:opacity-60"
					onclick={() => void createDraftCharacterObject()}
					disabled={!npcDraft || creatingNpcDraft || objectsLoading}
				>
					{creatingNpcDraft ? 'Creating...' : 'Create Draft Character'}
				</button>
			</div>

			{#if npcDraft}
				<div class="space-y-1.5 text-xs">
					<div class="rounded border border-border/60 p-2">
						<p class="text-xs uppercase tracking-wider text-ink-faint">Name</p>
						<p class="text-sm font-semibold text-ink">{npcDraft.name}</p>
					</div>
					<div class="rounded border border-border/60 p-2">
						<p><strong>Trait:</strong> {npcDraft.trait}</p>
						<p><strong>Ideal:</strong> {npcDraft.ideal}</p>
						<p><strong>Bond:</strong> {npcDraft.bond}</p>
						<p><strong>Flaw:</strong> {npcDraft.flaw}</p>
						<p><strong>Motivation:</strong> {npcDraft.motivation}</p>
						<p><strong>Faction:</strong> {npcDraft.factionAffiliation}</p>
						<p><strong>Culture:</strong> {npcDraft.culture}</p>
						{#if npcLocationHint}
							<p><strong>Location cue:</strong> {npcLocationHint}</p>
						{/if}
					</div>
				</div>
			{:else}
				<p class="text-xs text-ink-faint">Generate an NPC to produce a contextual draft.</p>
			{/if}

			{#if npcError}
				<p class="mt-2 text-xs text-error">{npcError}</p>
			{/if}
		</div>
	{/if}
</div>
