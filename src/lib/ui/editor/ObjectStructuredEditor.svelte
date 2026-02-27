<script lang="ts">
	import type { Note } from '$lib/types/note.js';
	import type { ObjectLintIssue, ObjectRelationship, VaultObject } from '$lib/types/object.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { nowISO } from '$lib/utils/date.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
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
	import type { VaultObjectHistoryEntry } from '$lib/types/object.js';

	interface Props {
		note: Note;
		onreloaded?: () => Promise<void>;
	}

	let { note, onreloaded }: Props = $props();

	let object = $derived(noteToVaultObject(note));
	let loading = $state(false);
	let error = $state<string | null>(null);
	let lintIssues = $state<ObjectLintIssue[]>([]);
	let history = $state<VaultObjectHistoryEntry[]>([]);
	let relationshipStats = $state({ outbound: 0, inbound: 0 });
	let fieldA = $state('');
	let fieldB = $state('');
	let fieldC = $state('');
	let fieldD = $state('');
	let listA = $state('');
	let listB = $state('');
	let relationships = $state('');

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

	function relationshipLines(source: ObjectRelationship[]): string {
		return source
			.map((relationship) => {
				const target = relationship.targetId
					? String(relationship.targetId)
					: (relationship.sessionId ?? '');
				const suffix = relationship.description ? `:${relationship.description}` : '';
				return `${relationship.type}:${target}${suffix}`;
			})
			.join('\n');
	}

	function parseRelationships(raw: string): ObjectRelationship[] {
		return normalizeObjectRelationships(
			raw
				.split('\n')
				.map((entry) => entry.trim())
				.filter(Boolean)
				.map((entry) => {
					const [typeRaw, targetRaw, ...descParts] = entry.split(':');
					const type = typeRaw?.trim();
					const target = targetRaw?.trim();
					const description = descParts.join(':').trim() || undefined;
					if (
						type !== 'parent' &&
						type !== 'child' &&
						type !== 'ally' &&
						type !== 'enemy' &&
						type !== 'appears_in_session'
					) {
						return null;
					}
					if (!target) return null;
					if (type === 'appears_in_session') {
						return { type, sessionId: target, description };
					}
					return { type, targetId: target as never, description };
				}),
		);
	}

	function syncForm(): void {
		if (!object) return;
		relationships = relationshipLines(object.relationships);

		switch (object.type) {
			case 'stat_block':
				fieldA = object.data.creatureType ?? '';
				fieldB = object.data.alignment ?? '';
				fieldC = object.data.armorClass !== undefined ? String(object.data.armorClass) : '';
				fieldD = object.data.hitPoints ?? '';
				listA = object.data.traits.map((entry) => entry.name).join(', ');
				listB = object.data.actions.map((entry) => entry.name).join(', ');
				return;
			case 'character':
				fieldA = object.data.ancestry ?? '';
				fieldB = object.data.className ?? '';
				fieldC = object.data.level !== undefined ? String(object.data.level) : '';
				fieldD = object.data.alignment ?? '';
				listA = object.data.goals.join(', ');
				listB = object.data.bonds.join(', ');
				return;
			case 'image':
				fieldA = object.data.url;
				fieldB = object.data.alt ?? '';
				fieldC = object.data.caption ?? '';
				fieldD = object.data.credit ?? '';
				listA = '';
				listB = '';
				return;
			case 'npc':
				fieldA = object.data.role ?? '';
				fieldB = object.data.ancestry ?? '';
				fieldC = object.data.alignment ?? '';
				fieldD = object.data.disposition ?? '';
				listA = object.data.goals.join(', ');
				listB = object.data.secrets.join(', ');
				return;
			case 'location':
				fieldA = object.data.locationType ?? '';
				fieldB = object.data.region ?? '';
				fieldC = object.data.population ?? '';
				fieldD = object.data.dangerLevel ?? '';
				listA = object.data.features.join(', ');
				listB = object.data.notableNpcIds.join(', ');
				return;
			case 'faction':
				fieldA = object.data.factionType ?? '';
				fieldB = object.data.influence ?? '';
				fieldC = object.data.leader ?? '';
				fieldD = object.data.alignment ?? '';
				listA = object.data.goals.join(', ');
				listB = object.data.resources.join(', ');
				return;
			case 'quest':
				fieldA = object.data.status ?? '';
				fieldB = object.data.objective ?? '';
				fieldC = object.data.reward ?? '';
				fieldD = object.data.giverId ?? '';
				listA = object.data.steps.join(', ');
				listB = object.data.relatedLocationIds.join(', ');
				return;
			case 'item':
				fieldA = object.data.itemType ?? '';
				fieldB = object.data.rarity ?? '';
				fieldC = object.data.ownerId ?? '';
				fieldD = object.data.value ?? '';
				listA = object.data.properties.join(', ');
				listB = '';
				return;
			case 'encounter':
				fieldA = object.data.encounterType ?? '';
				fieldB = object.data.challengeRating ?? '';
				fieldC = object.data.environment ?? '';
				fieldD = object.data.objective ?? '';
				listA = object.data.participants.join(', ');
				listB = object.data.rewards.join(', ');
				return;
			case 'timeline_event':
				fieldA = object.data.date ?? '';
				fieldB = object.data.era ?? '';
				fieldC = object.data.significance ?? '';
				fieldD = object.data.summary ?? '';
				listA = object.data.involvedObjectIds.join(', ');
				listB = object.data.consequences.join(', ');
				return;
		}
	}

	function labelsForObject(target: VaultObject): {
		a: string;
		b: string;
		c: string;
		d: string;
		listA: string;
		listB: string;
	} {
		switch (target.type) {
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
					a: 'Date',
					b: 'Era',
					c: 'Significance',
					d: 'Summary',
					listA: 'Object ids',
					listB: 'Consequences',
				};
		}
	}

	async function refreshDiagnostics(): Promise<void> {
		if (!object) return;
		try {
			const storage = getStorage();
			const [issues, entries, graph] = await Promise.all([
				storage.lintObjects(),
				storage.getObjectHistory(object.id, { limit: 20 }),
				storage.getObjectRelationshipGraph(),
			]);
			lintIssues = issues.filter((entry) => String(entry.objectId) === String(object.id));
			history = entries;
			relationshipStats = {
				outbound: graph.edges.filter((edge) => String(edge.fromId) === String(object.id)).length,
				inbound: graph.edges.filter((edge) => String(edge.toId) === String(object.id)).length,
			};
		} catch (err) {
			error = String(err);
		}
	}

	$effect(() => {
		if (!object) return;
		syncForm();
		void refreshDiagnostics();
	});

	function buildUpdatedObject(existing: VaultObject): VaultObject {
		const updatedAt = nowISO();
		const parsedRelationships = parseRelationships(relationships);
		switch (existing.type) {
			case 'stat_block':
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeStatBlockData({
						...existing.data,
						creatureType: fieldA,
						alignment: fieldB,
						armorClass: parseIntOrUndefined(fieldC),
						hitPoints: fieldD,
						traits: parseCsv(listA).map((entry) => ({ name: entry, description: entry })),
						actions: parseCsv(listB).map((entry) => ({ name: entry, description: entry })),
					}),
				};
			case 'character':
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeCharacterData({
						...existing.data,
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
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeImageData({
						...existing.data,
						url: fieldA,
						alt: fieldB,
						caption: fieldC,
						credit: fieldD,
					}),
				};
			case 'npc':
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeNpcData({
						...existing.data,
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
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeLocationData({
						...existing.data,
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
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeFactionData({
						...existing.data,
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
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeQuestData({
						...existing.data,
						status: fieldA,
						objective: fieldB,
						reward: fieldC,
						giverId: fieldD,
						steps: parseCsv(listA),
						relatedLocationIds: parseCsv(listB),
					}),
				};
			case 'item':
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeItemData({
						...existing.data,
						itemType: fieldA,
						rarity: fieldB,
						ownerId: fieldC,
						value: fieldD,
						properties: parseCsv(listA),
					}),
				};
			case 'encounter':
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeEncounterData({
						...existing.data,
						encounterType: fieldA,
						challengeRating: fieldB,
						environment: fieldC,
						objective: fieldD,
						participants: parseCsv(listA),
						rewards: parseCsv(listB),
					}),
				};
			case 'timeline_event':
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeTimelineEventData({
						...existing.data,
						date: fieldA,
						era: fieldB,
						significance: fieldC,
						summary: fieldD,
						involvedObjectIds: parseCsv(listA),
						consequences: parseCsv(listB),
					}),
				};
		}
	}

	async function applyStructuredChanges(): Promise<void> {
		if (!object) return;
		loading = true;
		error = null;
		try {
			let updated = buildUpdatedObject(object);
			if (!updated.summary.trim()) {
				updated = { ...updated, summary: summarizeVaultObject(updated) };
			}
			await getStorage().saveObject(updated);
			await onreloaded?.();
			await refreshDiagnostics();
		} catch (err) {
			error = String(err);
		} finally {
			loading = false;
		}
	}

	async function revertTo(entryId: string): Promise<void> {
		if (!object) return;
		loading = true;
		error = null;
		try {
			await getStorage().revertObjectToHistory(object.id, entryId);
			await onreloaded?.();
			await refreshDiagnostics();
		} catch (err) {
			error = String(err);
		} finally {
			loading = false;
		}
	}
</script>

{#if object}
	{@const labels = labelsForObject(object)}
	<section
		class="mb-3 rounded-lg border border-border bg-surface p-3 dark:border-tavern-border dark:bg-tavern-surface"
	>
		<h2
			class="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
		>
			Object Form ({object.type})
		</h2>
		<div class="grid gap-2 md:grid-cols-2">
			<label class="text-xs text-ink-muted dark:text-tavern-muted">
				{labels.a}
				<input
					bind:value={fieldA}
					class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
				/>
			</label>
			<label class="text-xs text-ink-muted dark:text-tavern-muted">
				{labels.b}
				<input
					bind:value={fieldB}
					class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
				/>
			</label>
			<label class="text-xs text-ink-muted dark:text-tavern-muted">
				{labels.c}
				<input
					bind:value={fieldC}
					class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
				/>
			</label>
			<label class="text-xs text-ink-muted dark:text-tavern-muted">
				{labels.d}
				<input
					bind:value={fieldD}
					class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
				/>
			</label>
			<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
				{labels.listA} (comma-separated)
				<input
					bind:value={listA}
					class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
				/>
			</label>
			<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
				{labels.listB} (comma-separated)
				<input
					bind:value={listB}
					class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
				/>
			</label>
			<label class="text-xs text-ink-muted dark:text-tavern-muted md:col-span-2">
				Relationships (<code>type:targetOrSession:description</code>)
				<textarea
					bind:value={relationships}
					rows="3"
					class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-text"
				></textarea>
			</label>
		</div>
		<div class="mt-2 flex items-center gap-2">
			<button
				class="rounded-md bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-60"
				onclick={applyStructuredChanges}
				disabled={loading}
			>
				Apply + Sync Markdown
			</button>
			<p class="text-xs text-ink-faint dark:text-tavern-faint">
				Graph: {relationshipStats.outbound} outbound / {relationshipStats.inbound} inbound
			</p>
		</div>
		{#if lintIssues.length > 0}
			<div class="mt-3 rounded border border-warning/40 bg-warning/10 p-2">
				<p class="text-xs font-semibold text-warning">Validation</p>
				<ul class="mt-1 space-y-1 text-xs text-ink dark:text-tavern-text">
					{#each lintIssues as issue (issue.code + issue.field)}
						<li>{issue.severity.toUpperCase()}: {issue.message}</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if history.length > 0}
			<div class="mt-3">
				<p class="text-xs font-semibold text-ink-faint dark:text-tavern-faint">Change History</p>
				<div
					class="mt-1 max-h-40 overflow-y-auto rounded border border-border dark:border-tavern-border"
				>
					{#each history as entry (entry.id)}
						<div
							class="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-xs dark:border-tavern-border last:border-b-0"
						>
							<div class="min-w-0">
								<p class="truncate text-ink dark:text-tavern-text">
									{entry.reason} - {entry.recordedAt}
								</p>
								<p class="truncate text-ink-muted dark:text-tavern-muted">{entry.object.name}</p>
							</div>
							<button
								class="rounded bg-surface-alt px-2 py-1 text-[11px] text-ink dark:bg-tavern-surface-alt dark:text-tavern-text"
								onclick={() => void revertTo(entry.id)}
								disabled={loading}
							>
								Revert
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
		{#if error}
			<p class="mt-2 text-xs text-error dark:text-tavern-error">{error}</p>
		{/if}
	</section>
{/if}
