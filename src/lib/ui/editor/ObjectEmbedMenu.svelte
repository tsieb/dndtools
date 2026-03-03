<script lang="ts">
	import type { EditorView } from '@codemirror/view';
	import type { Note } from '$lib/types/note.js';
	import type { ObjectRelationship, VaultObject, VaultObjectType } from '$lib/types/object.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { generateVaultObjectId } from '$lib/utils/id.js';
	import { nowISO } from '$lib/utils/date.js';
	import {
		normalizeCharacterData,
		normalizeEncounterData,
		normalizeFactionData,
		normalizeImageData,
		normalizeItemData,
		normalizeLocationData,
		normalizeNpcData,
		normalizeObjectRelationships,
		normalizeQuestData,
		normalizeStatBlockData,
		normalizeTimelineEventData,
		summarizeVaultObject,
	} from '$lib/domain/objects.js';
	import { formatWorldDate } from '$lib/domain/world-calendar.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import {
		getObjectTemplateSeed,
		type ObjectTemplateVariant,
	} from '$lib/domain/object-templates.js';
	import { formatNoteEmbed, formatObjectEmbed } from '$lib/domain/object-embeds.js';

	interface Props {
		editorView: EditorView | null;
	}

	let { editorView }: Props = $props();

	let expanded = $state(false);
	let mode = $state<'create' | 'embed-objects' | 'embed-notes'>('create');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let objects = $state<VaultObject[]>([]);
	let notes = $state<Note[]>([]);
	let query = $state('');
	let filterType = $state<'all' | VaultObjectType>('all');
	let noteQuery = $state('');

	let createType = $state<VaultObjectType>('npc');
	let templateVariant = $state<ObjectTemplateVariant>('dnd5e');
	let name = $state('');
	let summary = $state('');
	let tags = $state('');
	let relationships = $state('');
	let fieldA = $state('');
	let fieldB = $state('');
	let fieldC = $state('');
	let fieldD = $state('');
	let listA = $state('');
	let listB = $state('');

	const filteredObjects = $derived.by(() => {
		const lower = query.trim().toLowerCase();
		return objects
			.filter((object) => filterType === 'all' || object.type === filterType)
			.filter((object) => {
				if (!lower) return true;
				const haystack = `${object.name} ${object.summary} ${object.tags.join(' ')}`.toLowerCase();
				return haystack.includes(lower);
			})
			.slice(0, 24);
	});

	const filteredNotes = $derived.by(() => {
		const lower = noteQuery.trim().toLowerCase();
		return notes
			.filter((note) => !note.deleted)
			.filter((note) => {
				if (!lower) return true;
				const haystack = `${note.title} ${note.tags.join(' ')}`.toLowerCase();
				return haystack.includes(lower);
			})
			.slice(0, 30);
	});

	$effect(() => {
		if (!expanded) return;
		void loadObjects();
	});

	function parseTags(raw: string): string[] {
		return raw
			.split(',')
			.map((tag) => tag.trim().replace(/^#/, ''))
			.filter(Boolean);
	}

	function parseCsv(raw: string): string[] {
		return raw
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);
	}

	function parseIntOrUndefined(value: string): number | undefined {
		const parsed = Number.parseInt(value.trim(), 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	function parseRelationships(raw: string): ObjectRelationship[] {
		const parsed = raw
			.split('\n')
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) => {
				const [typeRaw, targetRaw, ...descParts] = entry.split(':');
				const type = typeRaw?.trim();
				const target = targetRaw?.trim();
				const description = descParts.join(':').trim() || undefined;
				if (!type) return null;
				if (!target) return null;
				if (type === 'appears_in_session') {
					return { type, sessionId: target, description };
				}
				if (type === 'parent' || type === 'child' || type === 'ally' || type === 'enemy') {
					return { type, targetId: target as never, description };
				}
				return { type: 'custom', label: type, targetId: target as never, description };
			});

		return normalizeObjectRelationships(parsed);
	}

	async function loadObjects(): Promise<void> {
		loading = true;
		error = null;
		try {
			const storage = getStorage();
			const [objectEntries, noteEntries] = await Promise.all([
				storage.getAllObjects(),
				storage.getAllNotes(),
			]);
			objects = objectEntries;
			notes = noteEntries;
		} catch (err) {
			error = String(err);
		} finally {
			loading = false;
		}
	}

	function insertEmbed(object: VaultObject): void {
		if (!editorView) return;
		const embed = formatObjectEmbed(String(object.id), object.name, { view: 'card' });
		const selection = editorView.state.selection.main;
		const before = editorView.state.sliceDoc(Math.max(0, selection.from - 1), selection.from);
		const prefix = before && before !== '\n' ? '\n' : '';
		editorView.dispatch({
			changes: {
				from: selection.from,
				to: selection.to,
				insert: `${prefix}${embed}`,
			},
			selection: {
				anchor: selection.from + prefix.length + embed.length,
			},
			scrollIntoView: true,
		});
		editorView.focus();
	}

	function insertNoteEmbed(note: Note): void {
		if (!editorView) return;
		const embed = formatNoteEmbed({ id: note.id }, note.title, { view: 'card' });
		const selection = editorView.state.selection.main;
		const before = editorView.state.sliceDoc(Math.max(0, selection.from - 1), selection.from);
		const prefix = before && before !== '\n' ? '\n' : '';
		editorView.dispatch({
			changes: {
				from: selection.from,
				to: selection.to,
				insert: `${prefix}${embed}`,
			},
			selection: {
				anchor: selection.from + prefix.length + embed.length,
			},
			scrollIntoView: true,
		});
		editorView.focus();
	}

	function resetCreateForm(): void {
		name = '';
		summary = '';
		tags = '';
		relationships = '';
		fieldA = '';
		fieldB = '';
		fieldC = '';
		fieldD = '';
		listA = '';
		listB = '';
	}

	function buildObject(): VaultObject {
		const now = nowISO();
		const seed = getObjectTemplateSeed(createType, templateVariant);
		const parsedTags = parseTags(tags);
		const parsedRelationships = parseRelationships(relationships);
		const base = {
			id: generateVaultObjectId(),
			type: createType,
			name: name.trim() || seed.name,
			summary: summary.trim() || seed.summary,
			tags: parsedTags.length > 0 ? parsedTags : seed.tags,
			visibility: 'dm_only' as const,
			relationships:
				parsedRelationships.length > 0
					? parsedRelationships
					: normalizeObjectRelationships(seed.relationships),
			createdAt: now,
			updatedAt: now,
		} as const;

		switch (createType) {
			case 'stat_block':
				return {
					...base,
					type: 'stat_block',
					data: normalizeStatBlockData({
						creatureType: fieldA || (seed.data as Record<string, string>).creatureType,
						alignment: fieldB || (seed.data as Record<string, string>).alignment,
						armorClass: parseIntOrUndefined(fieldC),
						hitPoints: fieldD,
						traits: parseCsv(listA).map((entry) => ({ name: entry, description: entry })),
						actions: parseCsv(listB).map((entry) => ({ name: entry, description: entry })),
					}),
				};
			case 'character':
				return {
					...base,
					type: 'character',
					data: normalizeCharacterData({
						ancestry: fieldA,
						className: fieldB,
						level: parseIntOrUndefined(fieldC),
						alignment: fieldD,
						goals: parseCsv(listA),
						bonds: parseCsv(listB),
					}),
				};
			case 'image':
				return {
					...base,
					type: 'image',
					data: normalizeImageData({
						url: fieldA,
						alt: fieldB,
						caption: fieldC,
						credit: fieldD,
					}),
				};
			case 'npc':
				return {
					...base,
					type: 'npc',
					data: normalizeNpcData({
						role: fieldA,
						ancestry: fieldB,
						alignment: fieldC,
						disposition: fieldD,
						goals: parseCsv(listA),
						secrets: parseCsv(listB),
					}),
				};
			case 'location':
				return {
					...base,
					type: 'location',
					data: normalizeLocationData({
						locationType: fieldA,
						region: fieldB,
						population: fieldC,
						dangerLevel: fieldD,
						features: parseCsv(listA),
						notableNpcIds: parseCsv(listB),
					}),
				};
			case 'faction':
				return {
					...base,
					type: 'faction',
					data: normalizeFactionData({
						factionType: fieldA,
						influence: fieldB,
						leader: fieldC,
						alignment: fieldD,
						goals: parseCsv(listA),
						resources: parseCsv(listB),
					}),
				};
			case 'quest':
				return {
					...base,
					type: 'quest',
					data: normalizeQuestData({
						status: fieldA || 'active',
						objective: fieldB,
						reward: fieldC,
						giverId: fieldD,
						steps: parseCsv(listA),
						relatedLocationIds: parseCsv(listB),
					}),
				};
			case 'item':
				return {
					...base,
					type: 'item',
					data: normalizeItemData({
						itemType: fieldA,
						rarity: fieldB,
						ownerId: fieldC,
						value: fieldD,
						properties: parseCsv(listA),
					}),
				};
			case 'encounter':
				return {
					...base,
					type: 'encounter',
					data: normalizeEncounterData({
						encounterType: fieldA,
						challengeRating: fieldB,
						environment: fieldC,
						objective: fieldD,
						participants: parseCsv(listA),
						rewards: parseCsv(listB),
					}),
				};
			case 'timeline_event': {
				const parsedOffset = Number.parseInt(fieldA.trim(), 10);
				const worldDateOffset = Number.isFinite(parsedOffset) ? parsedOffset : undefined;
				return {
					...base,
					type: 'timeline_event',
					data: normalizeTimelineEventData({
						date:
							worldDateOffset !== undefined
								? formatWorldDate(worldCalendarState.calendar, worldDateOffset, 'iso')
								: fieldA,
						worldDateOffset,
						era: fieldB,
						significance: fieldC,
						summary: fieldD,
						involvedObjectIds: parseCsv(listA),
						consequences: parseCsv(listB),
					}),
				};
			}
		}
	}

	function labelSetForType(type: VaultObjectType): {
		a: string;
		b: string;
		c: string;
		d: string;
		listA: string;
		listB: string;
	} {
		switch (type) {
			case 'stat_block':
				return {
					a: 'Creature type',
					b: 'Alignment',
					c: 'AC',
					d: 'HP',
					listA: 'Traits',
					listB: 'Actions',
				};
			case 'character':
				return {
					a: 'Ancestry',
					b: 'Class',
					c: 'Level',
					d: 'Alignment',
					listA: 'Goals',
					listB: 'Bonds',
				};
			case 'image':
				return {
					a: 'URL',
					b: 'Alt text',
					c: 'Caption',
					d: 'Credit',
					listA: 'Unused',
					listB: 'Unused',
				};
			case 'npc':
				return {
					a: 'Role',
					b: 'Ancestry',
					c: 'Alignment',
					d: 'Disposition',
					listA: 'Goals',
					listB: 'Secrets',
				};
			case 'location':
				return {
					a: 'Type',
					b: 'Region',
					c: 'Population',
					d: 'Danger',
					listA: 'Features',
					listB: 'NPC ids',
				};
			case 'faction':
				return {
					a: 'Type',
					b: 'Influence',
					c: 'Leader',
					d: 'Alignment',
					listA: 'Goals',
					listB: 'Resources',
				};
			case 'quest':
				return {
					a: 'Status',
					b: 'Objective',
					c: 'Reward',
					d: 'Giver id',
					listA: 'Steps',
					listB: 'Location ids',
				};
			case 'item':
				return {
					a: 'Type',
					b: 'Rarity',
					c: 'Owner id',
					d: 'Value',
					listA: 'Properties',
					listB: 'Unused',
				};
			case 'encounter':
				return {
					a: 'Type',
					b: 'Challenge',
					c: 'Environment',
					d: 'Objective',
					listA: 'Participants',
					listB: 'Rewards',
				};
			case 'timeline_event':
				return {
					a: 'Day Offset',
					b: 'Era',
					c: 'Significance',
					d: 'Summary',
					listA: 'Object ids',
					listB: 'Consequences',
				};
		}
	}

	async function createObject(): Promise<void> {
		error = null;
		loading = true;
		try {
			let object = buildObject();
			if (!object.summary.trim()) {
				object = { ...object, summary: summarizeVaultObject(object) };
			}

			if (object.type === 'image' && !object.data.url.trim()) {
				throw new Error('Image URL is required for image objects.');
			}

			const storage = getStorage();
			await storage.saveObject(object);
			insertEmbed(object);
			await loadObjects();
			resetCreateForm();
			mode = 'embed-objects';
		} catch (err) {
			error = String(err);
		} finally {
			loading = false;
		}
	}
</script>

<div
	class="mb-2 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
>
	<button
		class="w-full px-3 py-2 text-left text-sm font-medium text-ink dark:text-tavern-text hover:bg-surface-alt dark:hover:bg-tavern-surface-alt rounded-lg"
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? 'Hide Embeds' : 'Embeds'}
	</button>

	{#if expanded}
		<div class="px-3 pb-3">
			<div class="flex gap-2 mb-2">
				<button
					class="px-2 py-1 text-xs rounded-md {mode === 'create'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted'}"
					onclick={() => (mode = 'create')}
				>
					Create
				</button>
				<button
					class="px-2 py-1 text-xs rounded-md {mode === 'embed-objects'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted'}"
					onclick={() => (mode = 'embed-objects')}
				>
					Embed Objects
				</button>
				<button
					class="px-2 py-1 text-xs rounded-md {mode === 'embed-notes'
						? 'bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent'
						: 'bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted'}"
					onclick={() => (mode = 'embed-notes')}
				>
					Embed Notes
				</button>
			</div>

			{#if mode === 'create'}
				{@const labels = labelSetForType(createType)}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						Type
						<select
							bind:value={createType}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						>
							<option value="stat_block">Stat Block</option>
							<option value="character">Character</option>
							<option value="image">Image</option>
							<option value="npc">NPC</option>
							<option value="location">Location</option>
							<option value="faction">Faction</option>
							<option value="quest">Quest</option>
							<option value="item">Item</option>
							<option value="encounter">Encounter</option>
							<option value="timeline_event">Timeline Event</option>
						</select>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						Template
						<select
							bind:value={templateVariant}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						>
							<option value="dnd5e">D&D 5e Baseline</option>
						</select>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
						Name
						<input
							type="text"
							bind:value={name}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
							placeholder="Object name"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
						Summary
						<input
							type="text"
							bind:value={summary}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
							placeholder="Optional short summary"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
						Tags
						<input
							type="text"
							bind:value={tags}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
							placeholder="comma,separated,tags"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						{labels.a}
						<input
							type="text"
							bind:value={fieldA}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						{labels.b}
						<input
							type="text"
							bind:value={fieldB}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						{labels.c}
						<input
							type="text"
							bind:value={fieldC}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted">
						{labels.d}
						<input
							type="text"
							bind:value={fieldD}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
						{labels.listA} (comma-separated)
						<input
							type="text"
							bind:value={listA}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
						{labels.listB} (comma-separated)
						<input
							type="text"
							bind:value={listB}
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						/>
					</label>
					<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
						Relationships (one per line: <code
							>type-or-label:targetOrSession:optional description</code
						>)
						<textarea
							bind:value={relationships}
							rows="3"
							class="w-full mt-1 px-2 py-1.5 rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-sm"
						></textarea>
					</label>
				</div>
				<div class="flex items-center gap-2">
					<button
						class="px-2.5 py-1.5 text-xs rounded-md bg-accent text-white disabled:opacity-60"
						onclick={createObject}
						disabled={loading || !editorView}
					>
						Create + Embed
					</button>
				</div>
			{:else if mode === 'embed-objects'}
				<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
					<input
						type="text"
						bind:value={query}
						class="px-2 py-1.5 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
						placeholder="Search objects..."
					/>
					<select
						bind:value={filterType}
						class="px-2 py-1.5 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
					>
						<option value="all">All types</option>
						<option value="stat_block">Stat blocks</option>
						<option value="character">Characters</option>
						<option value="image">Images</option>
						<option value="npc">NPCs</option>
						<option value="location">Locations</option>
						<option value="faction">Factions</option>
						<option value="quest">Quests</option>
						<option value="item">Items</option>
						<option value="encounter">Encounters</option>
						<option value="timeline_event">Timeline Events</option>
					</select>
				</div>

				<div
					class="max-h-52 overflow-y-auto border border-border dark:border-tavern-border rounded-md"
				>
					{#if loading}
						<div class="px-2 py-2 text-xs text-ink-muted dark:text-tavern-muted">
							Loading objects...
						</div>
					{:else if filteredObjects.length === 0}
						<div class="px-2 py-2 text-xs text-ink-muted dark:text-tavern-muted">
							No objects found.
						</div>
					{:else}
						{#each filteredObjects as object (object.id)}
							<div
								class="flex items-center gap-2 px-2 py-1.5 border-b border-border dark:border-tavern-border last:border-b-0"
							>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-medium text-ink dark:text-tavern-text truncate">
										{object.name}
									</p>
									<p class="text-[11px] text-ink-muted dark:text-tavern-muted truncate">
										{object.type}
										{object.summary ? `- ${object.summary}` : ''}
									</p>
								</div>
								<button
									class="px-2 py-1 text-[11px] rounded-md bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
									onclick={() => insertEmbed(object)}
									disabled={!editorView}
								>
									Embed
								</button>
							</div>
						{/each}
					{/if}
				</div>
			{:else}
				<div class="mb-2">
					<input
						type="text"
						bind:value={noteQuery}
						class="w-full px-2 py-1.5 text-xs rounded-md border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
						placeholder="Search notes..."
					/>
				</div>

				<div
					class="max-h-52 overflow-y-auto border border-border dark:border-tavern-border rounded-md"
				>
					{#if loading}
						<div class="px-2 py-2 text-xs text-ink-muted dark:text-tavern-muted">
							Loading notes...
						</div>
					{:else if filteredNotes.length === 0}
						<div class="px-2 py-2 text-xs text-ink-muted dark:text-tavern-muted">
							No notes found.
						</div>
					{:else}
						{#each filteredNotes as note (note.id)}
							<div
								class="flex items-center gap-2 px-2 py-1.5 border-b border-border dark:border-tavern-border last:border-b-0"
							>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-medium text-ink dark:text-tavern-text truncate">
										{note.title}
									</p>
									<p class="text-[11px] text-ink-muted dark:text-tavern-muted truncate">
										{note.folder}
									</p>
								</div>
								<button
									class="px-2 py-1 text-[11px] rounded-md bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
									onclick={() => insertNoteEmbed(note)}
									disabled={!editorView}
								>
									Embed
								</button>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			{#if error}
				<p class="mt-2 text-xs text-error dark:text-tavern-error">{error}</p>
			{/if}
		</div>
	{/if}
</div>
