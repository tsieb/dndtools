import type {
	EncounterData,
	FactionData,
	ImageData,
	ItemData,
	LocationData,
	NpcData,
	ObjectRelationship,
	QuestData,
	StatBlockData,
	TimelineEventData,
	VaultObjectType,
} from '$lib/types/object.js';
import {
	normalizeEncounterData,
	normalizeFactionData,
	normalizeImageData,
	normalizeItemData,
	normalizeLocationData,
	normalizeNpcData,
	normalizeQuestData,
	normalizeStatBlockData,
	normalizeTimelineEventData,
} from '$lib/domain/objects.js';

export type ObjectTemplateVariant = 'dnd5e';

export interface ObjectTemplateSeed {
	name: string;
	summary: string;
	tags: string[];
	relationships: ObjectRelationship[];
	data:
		| StatBlockData
		| ImageData
		| NpcData
		| LocationData
		| FactionData
		| QuestData
		| ItemData
		| EncounterData
		| TimelineEventData
		| Record<string, unknown>;
}

export function getObjectTemplateSeed(
	type: VaultObjectType,
	variant: ObjectTemplateVariant = 'dnd5e',
): ObjectTemplateSeed {
	if (variant !== 'dnd5e') {
		throw new Error(`Unsupported object template variant: ${variant}`);
	}

	switch (type) {
		case 'stat_block':
			return {
				name: 'New Stat Block',
				summary: '',
				tags: ['monster'],
				relationships: [],
				data: normalizeStatBlockData({
					size: 'Medium',
					creatureType: 'humanoid',
					alignment: 'neutral',
				}),
			};
		case 'character':
			return {
				name: 'New Character',
				summary: '',
				tags: ['character'],
				relationships: [],
				data: {
					ancestry: '',
					className: '',
					level: 1,
					background: '',
					alignment: '',
					armorClass: undefined,
					hitPoints: undefined,
					speed: '',
					proficiencyBonus: '',
					abilities: undefined,
					goals: [],
					bonds: [],
					flaws: [],
					notes: '',
				},
			};
		case 'image':
			return {
				name: 'New Image Asset',
				summary: '',
				tags: ['asset'],
				relationships: [],
				data: normalizeImageData({
					url: '',
					alt: '',
					caption: '',
					credit: '',
				}),
			};
		case 'npc':
			return {
				name: 'New NPC',
				summary: '',
				tags: ['npc'],
				relationships: [],
				data: normalizeNpcData({
					role: 'ally',
					alignment: 'neutral',
					goals: [],
					secrets: [],
				}),
			};
		case 'location':
			return {
				name: 'New Location',
				summary: '',
				tags: ['location'],
				relationships: [],
				data: normalizeLocationData({
					locationType: 'settlement',
					features: [],
					notableNpcIds: [],
				}),
			};
		case 'faction':
			return {
				name: 'New Faction',
				summary: '',
				tags: ['faction'],
				relationships: [],
				data: normalizeFactionData({
					factionType: 'guild',
					influence: 'local',
					goals: [],
					resources: [],
				}),
			};
		case 'quest':
			return {
				name: 'New Quest',
				summary: '',
				tags: ['quest'],
				relationships: [],
				data: normalizeQuestData({
					status: 'active',
					objective: '',
					steps: [],
					relatedLocationIds: [],
				}),
			};
		case 'item':
			return {
				name: 'New Item',
				summary: '',
				tags: ['item'],
				relationships: [],
				data: normalizeItemData({
					itemType: 'wondrous item',
					rarity: 'common',
					attunement: false,
					properties: [],
				}),
			};
		case 'encounter':
			return {
				name: 'New Encounter',
				summary: '',
				tags: ['encounter'],
				relationships: [],
				data: normalizeEncounterData({
					encounterType: 'combat',
					challengeRating: '',
					participants: [],
					rewards: [],
				}),
			};
		case 'timeline_event':
			return {
				name: 'New Timeline Event',
				summary: '',
				tags: ['timeline'],
				relationships: [],
				data: normalizeTimelineEventData({
					date: '',
					worldDateOffset: 0,
					era: '',
					significance: '',
					summary: '',
					involvedObjectIds: [],
					consequences: [],
				}),
			};
	}
}
