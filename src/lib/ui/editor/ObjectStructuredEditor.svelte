<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Note } from '$lib/types/note.js';
	import type {
		ObjectGraphEdge,
		ObjectLintIssue,
		ObjectRelationship,
		VaultObject,
	} from '$lib/types/object.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import { nowISO } from '$lib/utils/date.js';
	import { noteToVaultObject } from '$lib/domain/object-notes.js';
	import { worldCalendarState } from '$lib/state/world-calendar.svelte.js';
	import {
		normalizeCharacterData,
		normalizeEncounterData,
		normalizeFactionData,
		normalizeHandoutData,
		normalizeImageData,
		normalizeItemData,
		normalizeLocationData,
		normalizeMapData,
		normalizeNpcData,
		normalizeObjectRelationships,
		normalizeQuestData,
		normalizeStatBlockData,
		normalizeTimelineEventData,
		summarizeVaultObject,
	} from '$lib/domain/objects.js';
	import { formatWorldDate, parseWorldDateInput } from '$lib/domain/world-calendar.js';
	import type { VaultObjectHistoryEntry } from '$lib/types/object.js';

	interface Props {
		note: Note;
		onreloaded?: () => Promise<void>;
	}

	let { note, onreloaded }: Props = $props();

	type RelationshipRow = {
		id: string;
		direction: 'outbound' | 'inbound';
		label: string;
		targetId?: string;
		targetName?: string;
		sessionId?: string;
		unresolved: boolean;
	};

	let object = $derived(noteToVaultObject(note));
	let loading = $state(false);
	let error = $state<string | null>(null);
	let lintIssues = $state<ObjectLintIssue[]>([]);
	let history = $state<VaultObjectHistoryEntry[]>([]);
	let relationshipStats = $state({ outbound: 0, inbound: 0 });
	let relationshipRows = $state<RelationshipRow[]>([]);
	let fieldA = $state('');
	let fieldB = $state('');
	let fieldC = $state('');
	let fieldD = $state('');
	let listA = $state('');
	let listB = $state('');
	let relationships = $state('');
	let timelineDatePreview = $derived.by(() => {
		if (!object || object.type !== 'timeline_event') return null;
		const parsed = Number.parseInt(fieldA.trim(), 10);
		if (!Number.isFinite(parsed)) return null;
		return {
			short: formatWorldDate(worldCalendarState.calendar, parsed, 'short'),
			iso: formatWorldDate(worldCalendarState.calendar, parsed, 'iso'),
		};
	});

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

	function parseFloatOrUndefined(value: string): number | undefined {
		const parsed = Number.parseFloat(value.trim());
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	function parseMapGridConfig(raw: string): {
		type: 'square' | 'hex';
		visible: boolean;
		originX: number;
		originY: number;
		cellSize: number;
	} | null {
		const entries = parseCsv(raw);
		if (entries.length === 0) return null;
		const [typeRaw, cellSizeRaw, originXRaw, originYRaw, visibleRaw] = entries;
		const type = typeRaw?.toLowerCase() === 'hex' ? 'hex' : 'square';
		const cellSize = parseFloatOrUndefined(cellSizeRaw ?? '');
		const originX = parseFloatOrUndefined(originXRaw ?? '') ?? 0;
		const originY = parseFloatOrUndefined(originYRaw ?? '') ?? 0;
		const visible = (visibleRaw ?? 'true').toLowerCase() !== 'false';
		if (cellSize === undefined || cellSize <= 0) return null;
		return { type, visible, originX, originY, cellSize };
	}

	function parseMapViewportConfig(
		raw: string,
	): { zoom: number; panX: number; panY: number } | null {
		const entries = parseCsv(raw);
		if (entries.length === 0) return null;
		const [zoomRaw, panXRaw, panYRaw] = entries;
		const zoom = parseFloatOrUndefined(zoomRaw ?? '');
		const panX = parseFloatOrUndefined(panXRaw ?? '') ?? 0;
		const panY = parseFloatOrUndefined(panYRaw ?? '') ?? 0;
		if (zoom === undefined || zoom <= 0) return null;
		return { zoom, panX, panY };
	}

	function relationshipLines(source: ObjectRelationship[]): string {
		return source
			.map((relationship) => {
				const target = relationship.targetId
					? String(relationship.targetId)
					: (relationship.sessionId ?? '');
				const suffix = relationship.description ? `:${relationship.description}` : '';
				const kind =
					relationship.type === 'custom' ? (relationship.label ?? 'custom') : relationship.type;
				return `${kind}:${target}${suffix}`;
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
					if (!type) return null;
					if (!target) return null;
					if (type === 'appears_in_session') {
						return { type, sessionId: target, description };
					}
					if (type === 'parent' || type === 'child' || type === 'ally' || type === 'enemy') {
						return { type, targetId: target as never, description };
					}
					return { type: 'custom', label: type, targetId: target as never, description };
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
			case 'map':
				fieldA = object.data.filePath ?? '';
				fieldB = object.data.areaNoteId ?? '';
				fieldC =
					object.data.scale?.unitsPerGridSquare !== undefined
						? String(object.data.scale.unitsPerGridSquare)
						: '';
				fieldD = object.data.scale?.unitLabel ?? '';
				listA = object.data.grid
					? `${object.data.grid.type},${object.data.grid.cellSize},${object.data.grid.originX},${object.data.grid.originY},${object.data.grid.visible ? 'true' : 'false'}`
					: '';
				listB = object.data.initialViewport
					? `${object.data.initialViewport.zoom},${object.data.initialViewport.panX},${object.data.initialViewport.panY}`
					: '';
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
			case 'handout':
				fieldA = object.data.content ?? '';
				fieldB = object.data.handoutType ?? 'document';
				fieldC = object.data.campaignSession ?? '';
				fieldD = object.data.delivered ? 'yes' : 'no';
				listA = '';
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
				fieldA = (() => {
					if (object.data.worldDateOffset !== undefined) {
						return String(object.data.worldDateOffset);
					}
					const parsed = parseWorldDateInput(worldCalendarState.calendar, object.data.date ?? '');
					return parsed ? String(parsed.dayOffset) : '';
				})();
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
			case 'map':
				return {
					a: 'File path',
					b: 'Area note id',
					c: 'Scale units/square',
					d: 'Scale unit label',
					listA: 'Grid (type,cellSize,originX,originY,visible)',
					listB: 'Viewport (zoom,panX,panY)',
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
			case 'handout':
				return {
					a: 'Content',
					b: 'Handout type',
					c: 'Session',
					d: 'Delivered? (yes/no)',
					listA: 'Unused',
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

	function relationshipLabel(edge: ObjectGraphEdge): string {
		return edge.type === 'custom' ? (edge.label ?? 'custom') : edge.type;
	}

	function buildRelationshipRows(
		graph: { edges: ObjectGraphEdge[] },
		objects: VaultObject[],
		currentId: string,
	): RelationshipRow[] {
		const names = new Map(objects.map((entry) => [String(entry.id), entry.name]));
		const rows: RelationshipRow[] = [];
		for (const [index, edge] of graph.edges.entries()) {
			const fromId = String(edge.fromId);
			const toId = edge.toId ? String(edge.toId) : undefined;
			if (fromId !== currentId && toId !== currentId) continue;

			if (fromId === currentId) {
				rows.push({
					id: `${fromId}:${relationshipLabel(edge)}:${toId ?? edge.sessionId ?? index}:out`,
					direction: 'outbound',
					label: relationshipLabel(edge),
					targetId: toId,
					targetName: toId ? names.get(toId) : undefined,
					sessionId: edge.sessionId,
					unresolved: edge.unresolved,
				});
				continue;
			}

			rows.push({
				id: `${fromId}:${relationshipLabel(edge)}:${toId ?? edge.sessionId ?? index}:in`,
				direction: 'inbound',
				label: relationshipLabel(edge),
				targetId: fromId,
				targetName: names.get(fromId),
				sessionId: undefined,
				unresolved: edge.unresolved,
			});
		}
		rows.sort((a, b) => {
			if (a.unresolved !== b.unresolved) return a.unresolved ? -1 : 1;
			return `${a.direction}:${a.targetName ?? a.sessionId ?? a.targetId ?? ''}`.localeCompare(
				`${b.direction}:${b.targetName ?? b.sessionId ?? b.targetId ?? ''}`,
			);
		});
		return rows;
	}

	function computeHistoryDelta(index: number): string {
		const current = history[index];
		const previous = history[index + 1];
		if (!current) return '';
		if (!previous) return 'Initial snapshot.';

		const changed: string[] = [];
		if (current.object.name !== previous.object.name) changed.push('name');
		if (current.object.summary !== previous.object.summary) changed.push('summary');
		if (JSON.stringify(current.object.tags) !== JSON.stringify(previous.object.tags)) {
			changed.push('tags');
		}
		if (
			JSON.stringify(current.object.relationships) !== JSON.stringify(previous.object.relationships)
		) {
			changed.push('relationships');
		}
		if (JSON.stringify(current.object.data) !== JSON.stringify(previous.object.data)) {
			changed.push('structured fields');
		}
		return changed.length > 0 ? `Delta: ${changed.join(', ')}.` : 'No structured delta.';
	}

	async function refreshDiagnostics(): Promise<void> {
		if (!object) return;
		try {
			const storage = getStorage();
			const [issues, entries, graph, allObjects] = await Promise.all([
				storage.lintObjects(),
				storage.getObjectHistory(object.id, { limit: 20 }),
				storage.getObjectRelationshipGraph(),
				storage.getAllObjects(),
			]);
			lintIssues = issues.filter((entry) => String(entry.objectId) === String(object.id));
			history = entries;
			relationshipStats = {
				outbound: graph.edges.filter((edge) => String(edge.fromId) === String(object.id)).length,
				inbound: graph.edges.filter((edge) => String(edge.toId) === String(object.id)).length,
			};
			relationshipRows = buildRelationshipRows(graph, allObjects, String(object.id));
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
			case 'map': {
				const unitsPerGridSquare = parseFloatOrUndefined(fieldC);
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeMapData({
						...existing.data,
						filePath: fieldA,
						areaNoteId: fieldB || undefined,
						scale:
							unitsPerGridSquare && unitsPerGridSquare > 0
								? {
										unitsPerGridSquare,
										unitLabel: fieldD.trim() || 'ft',
									}
								: undefined,
						grid: parseMapGridConfig(listA) ?? undefined,
						initialViewport: parseMapViewportConfig(listB) ?? undefined,
					}),
				};
			}
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
			case 'handout':
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeHandoutData({
						...existing.data,
						title: existing.name,
						content: fieldA,
						handoutType:
							fieldB === 'letter' ||
							fieldB === 'map_fragment' ||
							fieldB === 'image' ||
							fieldB === 'cipher' ||
							fieldB === 'rumor' ||
							fieldB === 'document'
								? fieldB
								: existing.data.handoutType,
						campaignSession: fieldC,
						delivered: fieldD.toLowerCase() === 'yes',
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
			case 'timeline_event': {
				const parsedOffset = Number.parseInt(fieldA.trim(), 10);
				const worldDateOffset = Number.isFinite(parsedOffset) ? parsedOffset : undefined;
				return {
					...existing,
					updatedAt,
					relationships: parsedRelationships,
					data: normalizeTimelineEventData({
						...existing.data,
						date:
							worldDateOffset !== undefined
								? formatWorldDate(worldCalendarState.calendar, worldDateOffset, 'iso')
								: existing.data.date,
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

	async function openObjectNote(targetId: string): Promise<void> {
		await goto(resolve(`/notes/${targetId}`));
	}

	function relationshipIndexFromField(field: string | undefined): number | null {
		if (!field) return null;
		const match = /relationships\[(\d+)\]/.exec(field);
		if (!match?.[1]) return null;
		const parsed = Number.parseInt(match[1], 10);
		return Number.isFinite(parsed) ? parsed : null;
	}

	async function applyLintFix(issue: ObjectLintIssue): Promise<void> {
		if (!object || loading) return;

		if (
			issue.code === 'object.relationship_broken_reference' ||
			issue.code === 'object.relationship_target_required'
		) {
			const index = relationshipIndexFromField(issue.field);
			if (index === null) return;
			const next = parseRelationships(relationships).filter((_entry, idx) => idx !== index);
			relationships = relationshipLines(next);
			await applyStructuredChanges();
			return;
		}

		if (issue.code === 'object.parent_child_cycle') {
			const next = parseRelationships(relationships).filter(
				(entry) => entry.type !== 'parent' && entry.type !== 'child',
			);
			relationships = relationshipLines(next);
			await applyStructuredChanges();
			return;
		}

		if (issue.code === 'stat_block.creature_type_required') {
			fieldA = fieldA.trim() || 'humanoid';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'stat_block.hp_required') {
			fieldD = fieldD.trim() || '1d8';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'npc.role_required') {
			fieldA = fieldA.trim() || 'ally';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'location.type_required') {
			fieldA = fieldA.trim() || 'settlement';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'faction.type_required') {
			fieldA = fieldA.trim() || 'organization';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'quest.objective_required') {
			fieldB = fieldB.trim() || 'Define quest objective';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'item.type_required') {
			fieldA = fieldA.trim() || 'gear';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'handout.title_required') {
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'handout.content_required') {
			fieldA = fieldA.trim() || 'Add handout content';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'handout.cipher_decoded_required') {
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'handout.cipher_key_required') {
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'map.file_path_required') {
			fieldA = fieldA.trim() || '.vault/assets/maps/map.png';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'map.scale_unit_required') {
			fieldD = fieldD.trim() || 'ft';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'map.grid_cell_size_invalid') {
			const parsed = parseMapGridConfig(listA);
			const gridType = parsed?.type ?? 'square';
			const originX = parsed?.originX ?? 0;
			const originY = parsed?.originY ?? 0;
			const visible = parsed?.visible ?? true;
			listA = `${gridType},70,${originX},${originY},${visible ? 'true' : 'false'}`;
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'encounter.objective_required') {
			fieldD = fieldD.trim() || 'Defeat enemies';
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'timeline_event.date_required') {
			fieldA = fieldA.trim() || String(worldCalendarState.calendar.currentDayOffset);
			await applyStructuredChanges();
			return;
		}
		if (issue.code === 'timeline_event.summary_required') {
			fieldD = fieldD.trim() || 'Describe this event';
			await applyStructuredChanges();
			return;
		}

		if (issue.code === 'object.duplicate_canonical_name' || issue.code === 'object.name_required') {
			loading = true;
			error = null;
			try {
				const fallbackBase = object.name.trim() || `Untitled ${object.type}`;
				const suffix = String(object.id).slice(-6);
				const nextName =
					issue.code === 'object.duplicate_canonical_name'
						? `${fallbackBase} (${suffix})`
						: fallbackBase;
				await getStorage().saveObject({
					...object,
					name: nextName,
					updatedAt: nowISO(),
				});
				await onreloaded?.();
				await refreshDiagnostics();
			} catch (err) {
				error = String(err);
			} finally {
				loading = false;
			}
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
			{#if object.type === 'timeline_event' && timelineDatePreview}
				<div
					class="md:col-span-2 rounded border border-border bg-surface-alt px-2 py-1.5 text-xs text-ink-muted dark:border-tavern-border dark:bg-tavern-surface-alt dark:text-tavern-muted"
				>
					<p>
						Formatted date: <span class="font-medium text-ink dark:text-tavern-text"
							>{timelineDatePreview.short}</span
						>
					</p>
					<p class="mt-0.5">ISO-equivalent: <code>{timelineDatePreview.iso}</code></p>
				</div>
			{/if}
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
				Relationships (<code>type-or-label:targetOrSession:description</code>)
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
		<div
			class="mt-3 rounded border border-border bg-surface-alt p-2 dark:border-tavern-border dark:bg-tavern-surface-alt"
		>
			<p class="text-xs font-semibold text-ink-faint dark:text-tavern-faint">Relationship Graph</p>
			{#if relationshipRows.length === 0}
				<p class="mt-1 text-xs text-ink-muted dark:text-tavern-muted">
					No relationship edges for this object yet.
				</p>
			{:else}
				<ul class="mt-1 space-y-1 text-xs text-ink dark:text-tavern-text">
					{#each relationshipRows as row (row.id)}
						<li class="flex items-center gap-2">
							<span
								class="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide dark:bg-tavern-surface"
							>
								{row.direction}
							</span>
							<span class="font-semibold">{row.label}</span>
							{#if row.sessionId}
								<span class="text-ink-muted dark:text-tavern-muted">session:{row.sessionId}</span>
							{:else if row.targetId}
								<button
									type="button"
									class="rounded bg-surface px-2 py-0.5 text-left text-[11px] hover:bg-surface-alt dark:bg-tavern-surface dark:hover:bg-tavern-surface-alt"
									onclick={() => row.targetId && void openObjectNote(row.targetId)}
								>
									{row.targetName ?? row.targetId}
								</button>
							{/if}
							{#if row.unresolved}
								<span class="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
									missing
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		{#if lintIssues.length > 0}
			<div class="mt-3 rounded border border-warning/40 bg-warning/10 p-2">
				<p class="text-xs font-semibold text-warning">Validation</p>
				<ul class="mt-1 space-y-1 text-xs text-ink dark:text-tavern-text">
					{#each lintIssues as issue (issue.code + issue.field)}
						<li class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p>{issue.severity.toUpperCase()}: {issue.message}</p>
								{#if issue.suggestedFix}
									<p class="text-[11px] text-ink-muted dark:text-tavern-muted">
										{issue.suggestedFix}
									</p>
								{/if}
							</div>
							<button
								type="button"
								class="shrink-0 rounded bg-surface-alt px-2 py-0.5 text-[11px] text-ink hover:bg-surface dark:bg-tavern-surface dark:text-tavern-text dark:hover:bg-tavern-surface-alt"
								onclick={() => void applyLintFix(issue)}
								disabled={loading}
							>
								Fix
							</button>
						</li>
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
					{#each history as entry, index (entry.id)}
						<div
							class="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5 text-xs dark:border-tavern-border last:border-b-0"
						>
							<div class="min-w-0">
								<p class="truncate text-ink dark:text-tavern-text">
									{entry.reason} - {entry.recordedAt}
								</p>
								<p class="truncate text-ink-muted dark:text-tavern-muted">{entry.object.name}</p>
								<p class="truncate text-[11px] text-ink-faint dark:text-tavern-faint">
									{computeHistoryDelta(index)}
								</p>
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
