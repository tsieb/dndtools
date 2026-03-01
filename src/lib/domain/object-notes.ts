import type { Note } from '$lib/types/note.js';
import type {
	EncounterData,
	FactionData,
	CharacterData,
	ImageData,
	ItemData,
	LocationData,
	NpcData,
	ObjectRelationship,
	QuestData,
	StatBlockData,
	TimelineEventData,
	VaultObject,
	VaultObjectType,
} from '$lib/types/object.js';
import { createVaultObjectId } from '$lib/types/object.js';
import { createFolderId, createNoteId } from '$lib/types/note.js';
import {
	normalizeEncounterData,
	normalizeFactionData,
	normalizeCharacterData,
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

interface DndToolsObjectEnvelope {
	kind?: string;
	summary?: unknown;
	data?: unknown;
	relationships?: unknown;
	embed?: {
		defaultView?: unknown;
		defaultOpen?: unknown;
		maxDepth?: unknown;
	};
}

interface DndToolsMeta {
	object?: DndToolsObjectEnvelope;
}

function getDndToolsMeta(note: Note): DndToolsMeta | null {
	const raw = note.frontmatter['dndtools'];
	if (typeof raw !== 'object' || raw === null) return null;
	return raw as DndToolsMeta;
}

function normalizeObjectType(kind: unknown): VaultObjectType | null {
	if (
		kind === 'stat_block' ||
		kind === 'character' ||
		kind === 'image' ||
		kind === 'npc' ||
		kind === 'location' ||
		kind === 'faction' ||
		kind === 'quest' ||
		kind === 'item' ||
		kind === 'encounter' ||
		kind === 'timeline_event'
	) {
		return kind;
	}
	return null;
}

function normalizeObjectData(
	type: VaultObjectType,
	raw: unknown,
):
	| StatBlockData
	| CharacterData
	| ImageData
	| NpcData
	| LocationData
	| FactionData
	| QuestData
	| ItemData
	| EncounterData
	| TimelineEventData {
	const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	switch (type) {
		case 'stat_block':
			return normalizeStatBlockData(source as Partial<StatBlockData>);
		case 'character':
			return normalizeCharacterData(source as Partial<CharacterData>);
		case 'image':
			return normalizeImageData(source as Partial<ImageData>);
		case 'npc':
			return normalizeNpcData(source as Partial<NpcData>);
		case 'location':
			return normalizeLocationData(source as Partial<LocationData>);
		case 'faction':
			return normalizeFactionData(source as Partial<FactionData>);
		case 'quest':
			return normalizeQuestData(source as Partial<QuestData>);
		case 'item':
			return normalizeItemData(source as Partial<ItemData>);
		case 'encounter':
			return normalizeEncounterData(source as Partial<EncounterData>);
		case 'timeline_event':
			return normalizeTimelineEventData(source as Partial<TimelineEventData>);
	}
}

export function isVaultObjectNote(note: Note): boolean {
	const meta = getDndToolsMeta(note);
	return !!normalizeObjectType(meta?.object?.kind);
}

export function noteToVaultObject(note: Note): VaultObject | null {
	const meta = getDndToolsMeta(note);
	const type = normalizeObjectType(meta?.object?.kind);
	if (!type) return null;

	const rawSummary =
		typeof meta?.object?.summary === 'string'
			? meta.object.summary
			: typeof note.frontmatter['summary'] === 'string'
				? note.frontmatter['summary']
				: '';
	const data = normalizeObjectData(type, meta?.object?.data);
	const base = {
		id: createVaultObjectId(String(note.id)),
		type,
		name: note.title,
		summary: rawSummary.trim(),
		tags: [...note.tags],
		relationships: normalizeObjectRelationships(meta?.object?.relationships),
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
	};

	const object = { ...base, data } as VaultObject;
	if (!object.summary) {
		object.summary = summarizeVaultObject(object);
	}
	return object;
}

function defaultObjectFolder(type: VaultObjectType): string {
	return `/objects/${type}`;
}

function buildObjectMarkdown(
	type: VaultObjectType,
	data:
		| StatBlockData
		| CharacterData
		| ImageData
		| NpcData
		| LocationData
		| FactionData
		| QuestData
		| ItemData
		| EncounterData
		| TimelineEventData,
	relationships: ObjectRelationship[] = [],
): string {
	const relationshipLines =
		relationships.length > 0
			? [
					'',
					'## Relationships',
					...relationships.map((relationship) => {
						const target = relationship.targetId
							? `obj:${relationship.targetId}`
							: `session:${relationship.sessionId ?? 'unknown'}`;
						const suffix = relationship.description ? ` - ${relationship.description}` : '';
						const typeLabel =
							relationship.type === 'custom' ? (relationship.label ?? 'custom') : relationship.type;
						return `- ${typeLabel}: ${target}${suffix}`;
					}),
				]
			: [];

	if (type === 'stat_block') {
		const value = data as StatBlockData;
		return [
			'## Stat Block',
			'',
			`- Creature Type: ${value.creatureType ?? ''}`.trimEnd(),
			`- Size: ${value.size ?? ''}`.trimEnd(),
			`- Alignment: ${value.alignment ?? ''}`.trimEnd(),
			`- Armor Class: ${value.armorClass ?? ''}`.trimEnd(),
			`- Hit Points: ${value.hitPoints ?? ''}`.trimEnd(),
			`- Speed: ${value.speed ?? ''}`.trimEnd(),
			`- Challenge Rating: ${value.challengeRating ?? ''}`.trimEnd(),
			'',
			'## Traits',
			...(value.traits.length > 0
				? value.traits.map((entry) => `- **${entry.name}:** ${entry.description}`)
				: ['- _Add traits_']),
			'',
			'## Actions',
			...(value.actions.length > 0
				? value.actions.map((entry) => `- **${entry.name}:** ${entry.description}`)
				: ['- _Add actions_']),
			...relationshipLines,
		].join('\n');
	}

	if (type === 'character') {
		const value = data as CharacterData;
		const classLine =
			value.className && value.level
				? `${value.className} ${value.level}`
				: (value.className ?? '');
		return [
			'## Character Sheet',
			'',
			`- Ancestry: ${value.ancestry ?? ''}`.trimEnd(),
			`- Class: ${classLine}`.trimEnd(),
			`- Background: ${value.background ?? ''}`.trimEnd(),
			`- Alignment: ${value.alignment ?? ''}`.trimEnd(),
			`- Armor Class: ${value.armorClass ?? ''}`.trimEnd(),
			`- Hit Points: ${value.hitPoints ?? ''}`.trimEnd(),
			`- Speed: ${value.speed ?? ''}`.trimEnd(),
			'',
			'## Goals',
			...(value.goals.length > 0 ? value.goals.map((entry) => `- ${entry}`) : ['- _Add goals_']),
			'',
			'## Bonds',
			...(value.bonds.length > 0 ? value.bonds.map((entry) => `- ${entry}`) : ['- _Add bonds_']),
			'',
			'## Flaws',
			...(value.flaws.length > 0 ? value.flaws.map((entry) => `- ${entry}`) : ['- _Add flaws_']),
			...(value.notes ? ['', '## Notes', '', value.notes] : []),
			...relationshipLines,
		].join('\n');
	}

	if (type === 'npc') {
		const value = data as NpcData;
		return [
			'## NPC Profile',
			'',
			`- Role: ${value.role ?? ''}`.trimEnd(),
			`- Ancestry: ${value.ancestry ?? ''}`.trimEnd(),
			`- Alignment: ${value.alignment ?? ''}`.trimEnd(),
			`- Disposition: ${value.disposition ?? ''}`.trimEnd(),
			`- Armor Class: ${value.armorClass ?? ''}`.trimEnd(),
			`- Hit Points: ${value.hitPoints ?? ''}`.trimEnd(),
			'',
			'## Goals',
			...(value.goals.length > 0 ? value.goals.map((entry) => `- ${entry}`) : ['- _Add goals_']),
			'',
			'## Secrets',
			...(value.secrets.length > 0
				? value.secrets.map((entry) => `- ${entry}`)
				: ['- _Add secrets_']),
			...(value.notes ? ['', '## Notes', '', value.notes] : []),
			...relationshipLines,
		].join('\n');
	}

	if (type === 'location') {
		const value = data as LocationData;
		return [
			'## Location',
			'',
			`- Type: ${value.locationType ?? ''}`.trimEnd(),
			`- Region: ${value.region ?? ''}`.trimEnd(),
			`- Population: ${value.population ?? ''}`.trimEnd(),
			`- Climate: ${value.climate ?? ''}`.trimEnd(),
			`- Danger: ${value.dangerLevel ?? ''}`.trimEnd(),
			'',
			'## Features',
			...(value.features.length > 0
				? value.features.map((entry) => `- ${entry}`)
				: ['- _Add features_']),
			'',
			'## Notable NPC IDs',
			...(value.notableNpcIds.length > 0
				? value.notableNpcIds.map((entry) => `- ${entry}`)
				: ['- _Add NPC ids_']),
			...relationshipLines,
		].join('\n');
	}

	if (type === 'faction') {
		const value = data as FactionData;
		return [
			'## Faction',
			'',
			`- Type: ${value.factionType ?? ''}`.trimEnd(),
			`- Alignment: ${value.alignment ?? ''}`.trimEnd(),
			`- Influence: ${value.influence ?? ''}`.trimEnd(),
			`- Leader: ${value.leader ?? ''}`.trimEnd(),
			`- Headquarters ID: ${value.headquartersId ?? ''}`.trimEnd(),
			'',
			'## Goals',
			...(value.goals.length > 0 ? value.goals.map((entry) => `- ${entry}`) : ['- _Add goals_']),
			'',
			'## Resources',
			...(value.resources.length > 0
				? value.resources.map((entry) => `- ${entry}`)
				: ['- _Add resources_']),
			...relationshipLines,
		].join('\n');
	}

	if (type === 'quest') {
		const value = data as QuestData;
		return [
			'## Quest',
			'',
			`- Status: ${value.status ?? ''}`.trimEnd(),
			`- Giver ID: ${value.giverId ?? ''}`.trimEnd(),
			`- Objective: ${value.objective ?? ''}`.trimEnd(),
			`- Reward: ${value.reward ?? ''}`.trimEnd(),
			`- Due Session: ${value.dueSession ?? ''}`.trimEnd(),
			'',
			'## Steps',
			...(value.steps.length > 0 ? value.steps.map((entry) => `- ${entry}`) : ['- _Add steps_']),
			'',
			'## Related Locations',
			...(value.relatedLocationIds.length > 0
				? value.relatedLocationIds.map((entry) => `- ${entry}`)
				: ['- _Add location ids_']),
			...relationshipLines,
		].join('\n');
	}

	if (type === 'item') {
		const value = data as ItemData;
		return [
			'## Item',
			'',
			`- Type: ${value.itemType ?? ''}`.trimEnd(),
			`- Rarity: ${value.rarity ?? ''}`.trimEnd(),
			`- Attunement: ${value.attunement === undefined ? '' : value.attunement ? 'yes' : 'no'}`.trimEnd(),
			`- Owner ID: ${value.ownerId ?? ''}`.trimEnd(),
			`- Value: ${value.value ?? ''}`.trimEnd(),
			'',
			'## Properties',
			...(value.properties.length > 0
				? value.properties.map((entry) => `- ${entry}`)
				: ['- _Add properties_']),
			...relationshipLines,
		].join('\n');
	}

	if (type === 'encounter') {
		const value = data as EncounterData;
		return [
			'## Encounter',
			'',
			`- Type: ${value.encounterType ?? ''}`.trimEnd(),
			`- Challenge Rating: ${value.challengeRating ?? ''}`.trimEnd(),
			`- Environment: ${value.environment ?? ''}`.trimEnd(),
			`- Objective: ${value.objective ?? ''}`.trimEnd(),
			'',
			'## Participants',
			...(value.participants.length > 0
				? value.participants.map((entry) => `- ${entry}`)
				: ['- _Add participant ids_']),
			'',
			'## Rewards',
			...(value.rewards.length > 0
				? value.rewards.map((entry) => `- ${entry}`)
				: ['- _Add rewards_']),
			...relationshipLines,
		].join('\n');
	}

	if (type === 'timeline_event') {
		const value = data as TimelineEventData;
		return [
			'## Timeline Event',
			'',
			`- Date: ${value.date ?? ''}`.trimEnd(),
			`- Era: ${value.era ?? ''}`.trimEnd(),
			`- Significance: ${value.significance ?? ''}`.trimEnd(),
			`- Summary: ${value.summary ?? ''}`.trimEnd(),
			'',
			'## Involved Object IDs',
			...(value.involvedObjectIds.length > 0
				? value.involvedObjectIds.map((entry) => `- ${entry}`)
				: ['- _Add object ids_']),
			'',
			'## Consequences',
			...(value.consequences.length > 0
				? value.consequences.map((entry) => `- ${entry}`)
				: ['- _Add consequences_']),
			...relationshipLines,
		].join('\n');
	}

	const value = data as ImageData;
	const alt = value.alt?.trim() || 'Image';
	return [
		'## Image',
		'',
		value.url ? `![${alt}](${value.url})` : '_No image URL provided._',
		...(value.caption ? ['', `> ${value.caption}`] : []),
		...(value.credit ? ['', `Credit: ${value.credit}`] : []),
		...relationshipLines,
	].join('\n');
}

export function vaultObjectToNote(
	object: VaultObject,
	existing?: Note | null,
	options?: { syncMarkdown?: boolean },
): Note {
	const data = normalizeObjectData(object.type, object.data);
	const summary = object.summary.trim() || summarizeVaultObject({ ...object, data } as VaultObject);
	const relationships = normalizeObjectRelationships(object.relationships);
	const baseFrontmatter = { ...(existing?.frontmatter ?? {}) };
	const existingDndtools =
		typeof baseFrontmatter['dndtools'] === 'object' && baseFrontmatter['dndtools'] !== null
			? (baseFrontmatter['dndtools'] as Record<string, unknown>)
			: {};
	baseFrontmatter['dndtools'] = {
		...existingDndtools,
		object: {
			kind: object.type,
			summary,
			data,
			relationships,
			embed: {
				defaultView: 'card',
				defaultOpen: false,
				maxDepth: 4,
			},
		},
	};

	return {
		id: existing?.id ?? createNoteId(String(object.id)),
		title: object.name,
		content:
			existing?.content?.trim() && !options?.syncMarkdown
				? existing.content
				: buildObjectMarkdown(object.type, data, relationships),
		folder: existing?.folder ?? createFolderId(defaultObjectFolder(object.type)),
		filePath: existing?.filePath,
		tags: [...object.tags],
		frontmatter: baseFrontmatter,
		createdAt: existing?.createdAt ?? object.createdAt,
		updatedAt: object.updatedAt,
		deleted: existing?.deleted ?? false,
		deletedAt: existing?.deletedAt ?? null,
		pinned: existing?.pinned ?? false,
		pinnedAt: existing?.pinnedAt ?? null,
	};
}

export function getObjectNoteEmbedDefaults(note: Note): {
	defaultView?: 'card' | 'inline' | 'content';
	defaultOpen?: boolean;
	maxDepth?: number;
} {
	const meta = getDndToolsMeta(note);
	const embed = meta?.object?.embed;
	const view =
		embed?.defaultView === 'card' ||
		embed?.defaultView === 'inline' ||
		embed?.defaultView === 'content'
			? embed.defaultView
			: undefined;
	const defaultOpen = typeof embed?.defaultOpen === 'boolean' ? embed.defaultOpen : undefined;
	const maxDepth =
		typeof embed?.maxDepth === 'number' && Number.isFinite(embed.maxDepth)
			? Math.max(1, Math.trunc(embed.maxDepth))
			: undefined;
	return { defaultView: view, defaultOpen, maxDepth };
}
