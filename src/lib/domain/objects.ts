import type {
	AbilityScores,
	BaseObjectRelationshipType,
	EncounterData,
	FactionData,
	CharacterData,
	HandoutData,
	ImageData,
	ItemData,
	LocationData,
	MapAnnotationLayerColorTheme,
	MapAnnotationLayerData,
	MapData,
	MapPoiCategory,
	MapPoiData,
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
import { normalizeContentVisibility } from '$lib/types/visibility.js';
import { normalizeMapFogState } from '$lib/domain/map-fog.js';

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
		dmNotes: value?.dmNotes?.trim() || undefined,
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

function normalizeFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.min(max, Math.max(min, value));
	}
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		if (Number.isFinite(parsed)) {
			return Math.min(max, Math.max(min, parsed));
		}
	}
	return fallback;
}

export const MAP_POI_CATEGORY_VALUES = [
	'city',
	'dungeon',
	'landmark',
	'structure',
	'secret',
	'encounter',
] as const satisfies readonly MapPoiCategory[];
const MAP_POI_CATEGORY_SET = new Set<string>(MAP_POI_CATEGORY_VALUES);
const MAP_LAYER_COLOR_VALUES = [
	'amber',
	'emerald',
	'azure',
	'rose',
	'violet',
	'slate',
] as const satisfies readonly MapAnnotationLayerColorTheme[];
const MAP_LAYER_COLOR_SET = new Set<string>(MAP_LAYER_COLOR_VALUES);
export const DEFAULT_MAP_LAYER_ID = 'layer-dm-notes';

function normalizeMapPoiCategory(value: unknown): MapPoiCategory {
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (MAP_POI_CATEGORY_SET.has(normalized)) {
			return normalized as MapPoiCategory;
		}
	}
	return 'landmark';
}

function normalizeMapLayerColorTheme(value: unknown): MapAnnotationLayerColorTheme {
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (MAP_LAYER_COLOR_SET.has(normalized)) {
			return normalized as MapAnnotationLayerColorTheme;
		}
	}
	return 'amber';
}

function toOptionalTrimmedString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

function makeUniqueId(
	preferredId: string | undefined,
	fallbackPrefix: string,
	used: Set<string>,
): string {
	const base = preferredId?.trim() || `${fallbackPrefix}-${used.size + 1}`;
	let candidate = base;
	let suffix = 2;
	while (used.has(candidate)) {
		candidate = `${base}-${suffix++}`;
	}
	used.add(candidate);
	return candidate;
}

export function createDefaultMapAnnotationLayers(): MapAnnotationLayerData[] {
	return [
		{
			id: DEFAULT_MAP_LAYER_ID,
			name: 'DM Notes',
			colorTheme: 'amber',
			visible: true,
			playerVisible: false,
		},
		{
			id: 'layer-history',
			name: 'History',
			colorTheme: 'slate',
			visible: true,
			playerVisible: true,
		},
		{
			id: 'layer-quest-markers',
			name: 'Quest Markers',
			colorTheme: 'emerald',
			visible: true,
			playerVisible: true,
		},
	];
}

function normalizeMapLayers(value: unknown): MapAnnotationLayerData[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const normalized: MapAnnotationLayerData[] = [];
	const usedIds = new Set<string>();
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) continue;
		const source = entry as Record<string, unknown>;
		const id = makeUniqueId(toOptionalTrimmedString(source.id), 'layer', usedIds);
		normalized.push({
			id,
			name: toOptionalTrimmedString(source.name) ?? `Layer ${normalized.length + 1}`,
			colorTheme: normalizeMapLayerColorTheme(source.colorTheme),
			visible: source.visible !== false,
			playerVisible: source.playerVisible === true,
		});
	}
	return normalized;
}

function normalizeMapPois(
	value: unknown,
	layers: readonly MapAnnotationLayerData[],
): MapPoiData[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const normalized: MapPoiData[] = [];
	const usedIds = new Set<string>();
	const availableLayerIds = new Set(layers.map((layer) => layer.id));
	const fallbackLayerId = layers[0]?.id;
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) continue;
		const source = entry as Record<string, unknown>;
		const id = makeUniqueId(toOptionalTrimmedString(source.id), 'poi', usedIds);
		const label = toOptionalTrimmedString(source.label) ?? `POI ${normalized.length + 1}`;
		const x = normalizeFiniteNumber(source.x, 0.5, 0, 1);
		const y = normalizeFiniteNumber(source.y, 0.5, 0, 1);
		const requestedLayerId = toOptionalTrimmedString(source.layerId);
		normalized.push({
			id,
			label,
			category: normalizeMapPoiCategory(source.category),
			x,
			y,
			layerId: requestedLayerId
				? availableLayerIds.has(requestedLayerId)
					? requestedLayerId
					: fallbackLayerId
				: fallbackLayerId,
			linkedNoteId: toOptionalTrimmedString(source.linkedNoteId),
			linkedObjectId: toOptionalTrimmedString(source.linkedObjectId),
		});
	}
	return normalized;
}

export function normalizeMapData(value: Partial<MapData> | undefined): MapData {
	const filePath = value?.filePath?.trim() ?? '';
	const hasScale =
		typeof value?.scale?.unitsPerGridSquare === 'number' &&
		Number.isFinite(value.scale.unitsPerGridSquare) &&
		value.scale.unitsPerGridSquare > 0;
	const hasGrid =
		value?.grid &&
		(typeof value.grid.originX === 'number' || typeof value.grid.originX === 'string');
	const hasViewport =
		value?.initialViewport &&
		(typeof value.initialViewport.zoom === 'number' ||
			typeof value.initialViewport.zoom === 'string');
	let layers = normalizeMapLayers(value?.layers);
	if ((!layers || layers.length === 0) && Array.isArray(value?.pois) && value.pois.length > 0) {
		layers = createDefaultMapAnnotationLayers();
	}
	const pois = normalizeMapPois(value?.pois, layers ?? []);
	const rawLastSessionFog = value?.lastSessionFog;
	const lastSessionFog =
		rawLastSessionFog &&
		typeof rawLastSessionFog === 'object' &&
		rawLastSessionFog !== null &&
		!Array.isArray(rawLastSessionFog)
			? (() => {
					const source = rawLastSessionFog as unknown as Record<string, unknown>;
					const fogState = normalizeMapFogState(source.fogState, {
						fallbackUpdatedAt: typeof source.savedAt === 'string' ? source.savedAt : undefined,
					});
					if (!fogState) return undefined;
					return {
						savedAt:
							typeof source.savedAt === 'string' && source.savedAt.trim()
								? source.savedAt
								: fogState.updatedAt,
						sourceBoardId: toOptionalTrimmedString(source.sourceBoardId),
						sourceCombatTileId: toOptionalTrimmedString(source.sourceCombatTileId),
						fogState,
					};
				})()
			: undefined;
	return {
		filePath,
		mimeType: value?.mimeType?.trim() || undefined,
		byteSize:
			typeof value?.byteSize === 'number' && Number.isFinite(value.byteSize)
				? Math.max(0, Math.trunc(value.byteSize))
				: undefined,
		width:
			typeof value?.width === 'number' && Number.isFinite(value.width)
				? Math.max(1, Math.trunc(value.width))
				: undefined,
		height:
			typeof value?.height === 'number' && Number.isFinite(value.height)
				? Math.max(1, Math.trunc(value.height))
				: undefined,
		areaNoteId: value?.areaNoteId?.trim() || undefined,
		scale: hasScale
			? {
					unitsPerGridSquare: normalizeFiniteNumber(
						value?.scale?.unitsPerGridSquare,
						5,
						0.01,
						1_000_000,
					),
					unitLabel: value?.scale?.unitLabel?.trim() || 'ft',
				}
			: undefined,
		grid: hasGrid
			? {
					type: value?.grid?.type === 'hex' ? 'hex' : 'square',
					visible: value?.grid?.visible !== false,
					originX: normalizeFiniteNumber(value?.grid?.originX, 0, -1_000_000, 1_000_000),
					originY: normalizeFiniteNumber(value?.grid?.originY, 0, -1_000_000, 1_000_000),
					cellSize: normalizeFiniteNumber(value?.grid?.cellSize, 70, 4, 20_000),
				}
			: undefined,
		initialViewport: hasViewport
			? {
					zoom: normalizeFiniteNumber(value?.initialViewport?.zoom, 1, 0.1, 8),
					panX: normalizeFiniteNumber(value?.initialViewport?.panX, 0, -10_000_000, 10_000_000),
					panY: normalizeFiniteNumber(value?.initialViewport?.panY, 0, -10_000_000, 10_000_000),
				}
			: undefined,
		layers,
		pois,
		lastSessionFog,
	};
}

function normalizeStringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
		: [];
}

const CORE_RELATIONSHIP_TYPES = new Set<BaseObjectRelationshipType>([
	'parent',
	'child',
	'ally',
	'enemy',
	'appears_in_session',
]);

function normalizeRelationshipType(value: unknown): ObjectRelationshipType | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return null;
	if (normalized === 'custom') return 'custom';
	if (CORE_RELATIONSHIP_TYPES.has(normalized as BaseObjectRelationshipType)) {
		return normalized as BaseObjectRelationshipType;
	}
	// Unknown relationship identifiers are preserved as custom labels.
	return 'custom';
}

export function normalizeObjectRelationships(value: unknown): ObjectRelationship[] {
	if (!Array.isArray(value)) return [];
	const normalized: ObjectRelationship[] = [];
	for (const entry of value) {
		if (typeof entry !== 'object' || entry === null) continue;
		const source = entry as Record<string, unknown>;
		const rawType = typeof source.type === 'string' ? source.type.trim() : '';
		const type = normalizeRelationshipType(rawType);
		if (!type) continue;
		const explicitLabel =
			typeof source.label === 'string' && source.label.trim() ? source.label.trim() : undefined;
		const implicitLabel =
			type === 'custom' &&
			rawType &&
			rawType.toLowerCase() !== 'custom' &&
			!CORE_RELATIONSHIP_TYPES.has(rawType.toLowerCase() as BaseObjectRelationshipType)
				? rawType
				: undefined;
		const label = type === 'custom' ? (explicitLabel ?? implicitLabel) : undefined;
		if (type === 'custom' && !label) continue;

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

		normalized.push({ type, label, targetId, sessionId, description });
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

const HANDOUT_TYPES = new Set(['letter', 'map_fragment', 'image', 'cipher', 'rumor', 'document']);
const HANDOUT_EFFECTS = new Set([
	'parchment',
	'torn_edge',
	'blood_stain',
	'burned_edge',
	'ink_blot',
]);
const HANDOUT_REVEAL_ANIMATIONS = new Set(['scroll_rollout', 'letter_unfold']);
type HandoutAgingEffect = NonNullable<HandoutData['visualStyle']>['effects'][number];

export function normalizeHandoutData(value: Partial<HandoutData> | undefined): HandoutData {
	const handoutType = HANDOUT_TYPES.has(String(value?.handoutType))
		? (value?.handoutType as HandoutData['handoutType'])
		: 'document';
	const delivered = value?.delivered === true;
	const effects = Array.isArray(value?.visualStyle?.effects)
		? value.visualStyle.effects
				.map((effect) => String(effect))
				.filter((effect): effect is HandoutAgingEffect => HANDOUT_EFFECTS.has(effect))
		: [];
	const revealAnimation = HANDOUT_REVEAL_ANIMATIONS.has(String(value?.revealAnimation))
		? (value?.revealAnimation as HandoutData['revealAnimation'])
		: handoutType === 'letter' || handoutType === 'cipher'
			? 'letter_unfold'
			: 'scroll_rollout';

	const normalized: HandoutData = {
		title: value?.title?.trim() || '',
		content: value?.content ?? '',
		handoutType,
		sourceNpcId: value?.sourceNpcId?.trim() || undefined,
		sourceLocationId: value?.sourceLocationId?.trim() || undefined,
		campaignSession: value?.campaignSession?.trim() || undefined,
		delivered,
		deliveredAt: delivered ? value?.deliveredAt?.trim() || undefined : undefined,
		revealAnimation,
		visualStyle: effects.length > 0 ? { effects } : undefined,
	};

	if (handoutType !== 'cipher') {
		return normalized;
	}

	const cipher = value?.cipher;
	const encryptedContent = cipher?.encryptedContent ?? normalized.content;
	const decodedContent = cipher?.decodedContent ?? '';
	normalized.cipher = {
		encryptedContent,
		decodedContent,
		substitutionKey: cipher?.substitutionKey?.trim() || '',
		decodedRevealed: cipher?.decodedRevealed === true,
		decodedRevealedAt: cipher?.decodedRevealedAt?.trim() || undefined,
	};
	normalized.content = encryptedContent;
	return normalized;
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
	const worldDateOffset =
		typeof value?.worldDateOffset === 'number' && Number.isFinite(value.worldDateOffset)
			? Math.trunc(value.worldDateOffset)
			: undefined;
	return {
		date: value?.date?.trim() || undefined,
		worldDateOffset: Number.isFinite(worldDateOffset) ? worldDateOffset : undefined,
		era: value?.era?.trim() || undefined,
		significance: value?.significance?.trim() || undefined,
		summary: value?.summary?.trim() || undefined,
		arcTag: value?.arcTag?.trim() || undefined,
		linkedSessionNoteId: value?.linkedSessionNoteId?.trim() || undefined,
		resolutionStatus: value?.resolutionStatus?.trim() || undefined,
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
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeStatBlockData(object.data),
			};
		case 'character':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeCharacterData(object.data),
			};
		case 'image':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeImageData(object.data),
			};
		case 'map':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeMapData(object.data),
			};
		case 'npc':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeNpcData(object.data),
			};
		case 'location':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeLocationData(object.data),
			};
		case 'faction':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeFactionData(object.data),
			};
		case 'quest':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeQuestData(object.data),
			};
		case 'item':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeItemData(object.data),
			};
		case 'handout':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeHandoutData(object.data),
			};
		case 'encounter':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
				relationships: normalizeObjectRelationships(object.relationships),
				data: normalizeEncounterData(object.data),
			};
		case 'timeline_event':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				visibility: normalizeContentVisibility(object.visibility),
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
		case 'map':
			return 'Map';
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
		case 'handout':
			return 'Handout';
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
		case 'map': {
			const dimensions =
				object.data.width && object.data.height
					? `${object.data.width}x${object.data.height}`
					: null;
			const scale = object.data.scale
				? `1 sq = ${object.data.scale.unitsPerGridSquare} ${object.data.scale.unitLabel}`
				: null;
			const poiCount =
				Array.isArray(object.data.pois) && object.data.pois.length > 0
					? `${object.data.pois.length} POI${object.data.pois.length === 1 ? '' : 's'}`
					: null;
			return [dimensions, scale, poiCount].filter((entry): entry is string => !!entry).join(' | ');
		}
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
		case 'handout': {
			const type = object.data.handoutType.replace(/_/g, ' ');
			const status = object.data.delivered ? 'Delivered' : 'Undelivered';
			return [type, status].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'encounter': {
			const encounterType = object.data.encounterType ?? null;
			const cr = object.data.challengeRating ? `CR ${object.data.challengeRating}` : null;
			return [encounterType, cr].filter((entry): entry is string => !!entry).join(' | ');
		}
		case 'timeline_event': {
			const date =
				object.data.date ??
				(object.data.worldDateOffset !== undefined ? `Day ${object.data.worldDateOffset}` : null);
			const era = object.data.era ?? null;
			return [date, era].filter((entry): entry is string => !!entry).join(' | ');
		}
	}
}
