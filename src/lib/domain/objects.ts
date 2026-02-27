import type {
	AbilityScores,
	EncounterData,
	FactionData,
	CharacterData,
	ImageData,
	ItemData,
	LocationData,
	NpcData,
	ObjectRelationship,
	ObjectRelationshipType,
	QuestData,
	StatBlockData,
	TimelineEventData,
	VaultObject,
	VaultObjectType,
} from '$lib/types/object.js';
import { createVaultObjectId } from '$lib/types/object.js';

const DEFAULT_ABILITY_SCORES: AbilityScores = {
	str: 10,
	dex: 10,
	con: 10,
	int: 10,
	wis: 10,
	cha: 10,
};

function toInt(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

export function normalizeAbilityScores(value: Partial<AbilityScores> | undefined): AbilityScores {
	return {
		str: toInt(value?.str, DEFAULT_ABILITY_SCORES.str),
		dex: toInt(value?.dex, DEFAULT_ABILITY_SCORES.dex),
		con: toInt(value?.con, DEFAULT_ABILITY_SCORES.con),
		int: toInt(value?.int, DEFAULT_ABILITY_SCORES.int),
		wis: toInt(value?.wis, DEFAULT_ABILITY_SCORES.wis),
		cha: toInt(value?.cha, DEFAULT_ABILITY_SCORES.cha),
	};
}

export function normalizeStatBlockData(value: Partial<StatBlockData> | undefined): StatBlockData {
	return {
		size: value?.size?.trim() || undefined,
		creatureType: value?.creatureType?.trim() || undefined,
		alignment: value?.alignment?.trim() || undefined,
		armorClass:
			typeof value?.armorClass === 'number' && Number.isFinite(value.armorClass)
				? Math.trunc(value.armorClass)
				: undefined,
		hitPoints: value?.hitPoints?.trim() || undefined,
		speed: value?.speed?.trim() || undefined,
		challengeRating: value?.challengeRating?.trim() || undefined,
		abilities: normalizeAbilityScores(value?.abilities),
		traits: value?.traits?.filter((entry) => entry.name.trim() && entry.description.trim()) ?? [],
		actions: value?.actions?.filter((entry) => entry.name.trim() && entry.description.trim()) ?? [],
		reactions:
			value?.reactions?.filter((entry) => entry.name.trim() && entry.description.trim()) ?? [],
		legendaryActions:
			value?.legendaryActions?.filter((entry) => entry.name.trim() && entry.description.trim()) ??
			[],
	};
}

export function normalizeCharacterData(value: Partial<CharacterData> | undefined): CharacterData {
	return {
		ancestry: value?.ancestry?.trim() || undefined,
		className: value?.className?.trim() || undefined,
		level:
			typeof value?.level === 'number' && Number.isFinite(value.level)
				? Math.max(1, Math.trunc(value.level))
				: undefined,
		background: value?.background?.trim() || undefined,
		alignment: value?.alignment?.trim() || undefined,
		armorClass:
			typeof value?.armorClass === 'number' && Number.isFinite(value.armorClass)
				? Math.trunc(value.armorClass)
				: undefined,
		hitPoints:
			typeof value?.hitPoints === 'number' && Number.isFinite(value.hitPoints)
				? Math.trunc(value.hitPoints)
				: undefined,
		speed: value?.speed?.trim() || undefined,
		proficiencyBonus: value?.proficiencyBonus?.trim() || undefined,
		abilities: value?.abilities ? normalizeAbilityScores(value.abilities) : undefined,
		goals: value?.goals?.map((entry) => entry.trim()).filter(Boolean) ?? [],
		bonds: value?.bonds?.map((entry) => entry.trim()).filter(Boolean) ?? [],
		flaws: value?.flaws?.map((entry) => entry.trim()).filter(Boolean) ?? [],
		notes: value?.notes?.trim() || undefined,
	};
}

export function normalizeImageData(value: Partial<ImageData> | undefined): ImageData {
	return {
		url: value?.url?.trim() ?? '',
		alt: value?.alt?.trim() || undefined,
		caption: value?.caption?.trim() || undefined,
		credit: value?.credit?.trim() || undefined,
		width:
			typeof value?.width === 'number' && Number.isFinite(value.width)
				? Math.max(1, Math.trunc(value.width))
				: undefined,
		height:
			typeof value?.height === 'number' && Number.isFinite(value.height)
				? Math.max(1, Math.trunc(value.height))
				: undefined,
	};
}

function normalizeStringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
		: [];
}

function normalizeRelationshipType(value: unknown): ObjectRelationshipType | null {
	return value === 'parent' ||
		value === 'child' ||
		value === 'ally' ||
		value === 'enemy' ||
		value === 'appears_in_session'
		? value
		: null;
}

export function normalizeObjectRelationships(value: unknown): ObjectRelationship[] {
	if (!Array.isArray(value)) return [];
	const normalized: ObjectRelationship[] = [];
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) continue;
		const source = entry as Record<string, unknown>;
		const type = normalizeRelationshipType(source.type);
		if (!type) continue;

		const targetId =
			typeof source.targetId === 'string' && source.targetId.trim()
				? createVaultObjectId(source.targetId.trim())
				: undefined;
		const sessionId =
			typeof source.sessionId === 'string' && source.sessionId.trim()
				? source.sessionId.trim()
				: undefined;
		const description =
			typeof source.description === 'string' && source.description.trim()
				? source.description.trim()
				: undefined;
		if (!targetId && !sessionId) continue;

		normalized.push({ type, targetId, sessionId, description });
	}
	return normalized;
}

export function normalizeNpcData(value: Partial<NpcData> | undefined): NpcData {
	return {
		role: value?.role?.trim() || undefined,
		ancestry: value?.ancestry?.trim() || undefined,
		alignment: value?.alignment?.trim() || undefined,
		disposition: value?.disposition?.trim() || undefined,
		armorClass:
			typeof value?.armorClass === 'number' && Number.isFinite(value.armorClass)
				? Math.trunc(value.armorClass)
				: undefined,
		hitPoints:
			typeof value?.hitPoints === 'number' && Number.isFinite(value.hitPoints)
				? Math.trunc(value.hitPoints)
				: undefined,
		goals: value?.goals?.map((entry) => entry.trim()).filter(Boolean) ?? [],
		secrets: value?.secrets?.map((entry) => entry.trim()).filter(Boolean) ?? [],
		notes: value?.notes?.trim() || undefined,
	};
}

export function normalizeLocationData(value: Partial<LocationData> | undefined): LocationData {
	return {
		locationType: value?.locationType?.trim() || undefined,
		region: value?.region?.trim() || undefined,
		population: value?.population?.trim() || undefined,
		climate: value?.climate?.trim() || undefined,
		dangerLevel: value?.dangerLevel?.trim() || undefined,
		features: normalizeStringList(value?.features),
		notableNpcIds: normalizeStringList(value?.notableNpcIds),
	};
}

export function normalizeFactionData(value: Partial<FactionData> | undefined): FactionData {
	return {
		factionType: value?.factionType?.trim() || undefined,
		alignment: value?.alignment?.trim() || undefined,
		influence: value?.influence?.trim() || undefined,
		leader: value?.leader?.trim() || undefined,
		goals: normalizeStringList(value?.goals),
		resources: normalizeStringList(value?.resources),
		headquartersId: value?.headquartersId?.trim() || undefined,
	};
}

export function normalizeQuestData(value: Partial<QuestData> | undefined): QuestData {
	return {
		status: value?.status?.trim() || undefined,
		giverId: value?.giverId?.trim() || undefined,
		objective: value?.objective?.trim() || undefined,
		reward: value?.reward?.trim() || undefined,
		dueSession: value?.dueSession?.trim() || undefined,
		steps: normalizeStringList(value?.steps),
		relatedLocationIds: normalizeStringList(value?.relatedLocationIds),
	};
}

export function normalizeItemData(value: Partial<ItemData> | undefined): ItemData {
	return {
		itemType: value?.itemType?.trim() || undefined,
		rarity: value?.rarity?.trim() || undefined,
		attunement: typeof value?.attunement === 'boolean' ? value.attunement : undefined,
		ownerId: value?.ownerId?.trim() || undefined,
		value: value?.value?.trim() || undefined,
		properties: normalizeStringList(value?.properties),
	};
}

export function normalizeEncounterData(value: Partial<EncounterData> | undefined): EncounterData {
	return {
		encounterType: value?.encounterType?.trim() || undefined,
		challengeRating: value?.challengeRating?.trim() || undefined,
		environment: value?.environment?.trim() || undefined,
		objective: value?.objective?.trim() || undefined,
		participants: normalizeStringList(value?.participants),
		rewards: normalizeStringList(value?.rewards),
	};
}

export function normalizeTimelineEventData(
	value: Partial<TimelineEventData> | undefined,
): TimelineEventData {
	return {
		date: value?.date?.trim() || undefined,
		era: value?.era?.trim() || undefined,
		significance: value?.significance?.trim() || undefined,
		summary: value?.summary?.trim() || undefined,
		involvedObjectIds: normalizeStringList(value?.involvedObjectIds),
		consequences: normalizeStringList(value?.consequences),
	};
}

export function normalizeVaultObject(object: VaultObject): VaultObject {
	switch (object.type) {
		case 'stat_block':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeStatBlockData(object.data),
			};
		case 'character':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeCharacterData(object.data),
			};
		case 'image':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeImageData(object.data),
			};
		case 'npc':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeNpcData(object.data),
			};
		case 'location':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeLocationData(object.data),
			};
		case 'faction':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeFactionData(object.data),
			};
		case 'quest':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeQuestData(object.data),
			};
		case 'item':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeItemData(object.data),
			};
		case 'encounter':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeEncounterData(object.data),
			};
		case 'timeline_event':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeTimelineEventData(object.data),
			};
	}
}

export function getVaultObjectTypeLabel(type: VaultObjectType): string {
	switch (type) {
		case 'stat_block':
			return 'Stat Block';
		case 'character':
			return 'Character';
		case 'image':
			return 'Image';
		case 'npc':
			return 'NPC';
		case 'location':
			return 'Location';
		case 'faction':
			return 'Faction';
		case 'quest':
			return 'Quest';
		case 'item':
			return 'Item';
		case 'encounter':
			return 'Encounter';
		case 'timeline_event':
			return 'Timeline Event';
	}
}

export function summarizeVaultObject(object: VaultObject): string {
	switch (object.type) {
		case 'stat_block': {
			const ac = object.data.armorClass !== undefined ? `AC ${object.data.armorClass}` : null;
			const hp = object.data.hitPoints ? `HP ${object.data.hitPoints}` : null;
			const cr = object.data.challengeRating ? `CR ${object.data.challengeRating}` : null;
			return [ac, hp, cr].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'character': {
			const cls = object.data.className
				? object.data.level
					? `${object.data.className} ${object.data.level}`
					: object.data.className
				: null;
			const ancestry = object.data.ancestry ?? null;
			return [ancestry, cls].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'image':
			return object.data.caption ?? object.data.credit ?? '';
		case 'npc': {
			const role = object.data.role ?? null;
			const ancestry = object.data.ancestry ?? null;
			return [role, ancestry].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'location': {
			const kind = object.data.locationType ?? null;
			const region = object.data.region ?? null;
			return [kind, region].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'faction': {
			const type = object.data.factionType ?? null;
			const influence = object.data.influence ?? null;
			return [type, influence].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'quest': {
			const status = object.data.status ?? null;
			const objective = object.data.objective ?? null;
			return [status, objective].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'item': {
			const type = object.data.itemType ?? null;
			const rarity = object.data.rarity ?? null;
			return [type, rarity].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'encounter': {
			const encounterType = object.data.encounterType ?? null;
			const cr = object.data.challengeRating ? `CR ${object.data.challengeRating}` : null;
			return [encounterType, cr].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'timeline_event': {
			const date = object.data.date ?? null;
			const era = object.data.era ?? null;
			return [date, era].filter((entry): entry is string => !!entry).join(' | ');
		}
	}
}
