export type VaultObjectId = string & { readonly __brand: 'VaultObjectId' };

export type VaultObjectType =
	| 'stat_block'
	| 'character'
	| 'image'
	| 'npc'
	| 'location'
	| 'faction'
	| 'quest'
	| 'item'
	| 'encounter'
	| 'timeline_event';

export type BaseObjectRelationshipType =
	| 'parent'
	| 'child'
	| 'ally'
	| 'enemy'
	| 'appears_in_session';

export type ObjectRelationshipType = BaseObjectRelationshipType | 'custom';

export interface ObjectRelationship {
	type: ObjectRelationshipType;
	label?: string;
	targetId?: VaultObjectId;
	sessionId?: string;
	description?: string;
}

export type AbilityScoreKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface AbilityScores {
	str: number;
	dex: number;
	con: number;
	int: number;
	wis: number;
	cha: number;
}

export interface StatBlockEntry {
	name: string;
	description: string;
}

export interface StatBlockData {
	size?: string;
	creatureType?: string;
	alignment?: string;
	armorClass?: number;
	hitPoints?: string;
	speed?: string;
	challengeRating?: string;
	abilities: AbilityScores;
	traits: StatBlockEntry[];
	actions: StatBlockEntry[];
	reactions: StatBlockEntry[];
	legendaryActions: StatBlockEntry[];
}

export interface CharacterData {
	ancestry?: string;
	className?: string;
	level?: number;
	background?: string;
	alignment?: string;
	armorClass?: number;
	hitPoints?: number;
	speed?: string;
	proficiencyBonus?: string;
	abilities?: AbilityScores;
	goals: string[];
	bonds: string[];
	flaws: string[];
	notes?: string;
}

export interface ImageData {
	url: string;
	alt?: string;
	caption?: string;
	credit?: string;
	width?: number;
	height?: number;
}

export interface NpcData {
	role?: string;
	ancestry?: string;
	alignment?: string;
	disposition?: string;
	armorClass?: number;
	hitPoints?: number;
	goals: string[];
	secrets: string[];
	notes?: string;
}

export interface LocationData {
	locationType?: string;
	region?: string;
	population?: string;
	climate?: string;
	dangerLevel?: string;
	features: string[];
	notableNpcIds: string[];
}

export interface FactionData {
	factionType?: string;
	alignment?: string;
	influence?: string;
	leader?: string;
	goals: string[];
	resources: string[];
	headquartersId?: string;
}

export interface QuestData {
	status?: string;
	giverId?: string;
	objective?: string;
	reward?: string;
	dueSession?: string;
	steps: string[];
	relatedLocationIds: string[];
}

export interface ItemData {
	itemType?: string;
	rarity?: string;
	attunement?: boolean;
	ownerId?: string;
	value?: string;
	properties: string[];
}

export interface EncounterData {
	encounterType?: string;
	challengeRating?: string;
	environment?: string;
	objective?: string;
	participants: string[];
	rewards: string[];
}

export interface TimelineEventData {
	date?: string;
	worldDateOffset?: number;
	era?: string;
	significance?: string;
	summary?: string;
	arcTag?: string;
	linkedSessionNoteId?: string;
	resolutionStatus?: string;
	involvedObjectIds: string[];
	consequences: string[];
}

export interface VaultObjectBase<TType extends VaultObjectType, TData> {
	id: VaultObjectId;
	type: TType;
	name: string;
	summary: string;
	tags: string[];
	relationships: ObjectRelationship[];
	data: TData;
	createdAt: string;
	updatedAt: string;
}

export type StatBlockObject = VaultObjectBase<'stat_block', StatBlockData>;
export type CharacterObject = VaultObjectBase<'character', CharacterData>;
export type ImageObject = VaultObjectBase<'image', ImageData>;
export type NpcObject = VaultObjectBase<'npc', NpcData>;
export type LocationObject = VaultObjectBase<'location', LocationData>;
export type FactionObject = VaultObjectBase<'faction', FactionData>;
export type QuestObject = VaultObjectBase<'quest', QuestData>;
export type ItemObject = VaultObjectBase<'item', ItemData>;
export type EncounterObject = VaultObjectBase<'encounter', EncounterData>;
export type TimelineEventObject = VaultObjectBase<'timeline_event', TimelineEventData>;

export type VaultObject =
	| StatBlockObject
	| CharacterObject
	| ImageObject
	| NpcObject
	| LocationObject
	| FactionObject
	| QuestObject
	| ItemObject
	| EncounterObject
	| TimelineEventObject;

export interface ObjectGraphNode {
	id: VaultObjectId;
	type: VaultObjectType;
	name: string;
}

export interface ObjectGraphEdge {
	fromId: VaultObjectId;
	type: ObjectRelationshipType;
	label?: string;
	toId?: VaultObjectId;
	sessionId?: string;
	description?: string;
	unresolved: boolean;
}

export interface ObjectRelationshipGraph {
	nodes: ObjectGraphNode[];
	edges: ObjectGraphEdge[];
}

export type ObjectLintSeverity = 'error' | 'warning';

export interface ObjectLintIssue {
	objectId: VaultObjectId;
	code: string;
	message: string;
	severity: ObjectLintSeverity;
	field?: string;
	suggestedFix?: string;
}

export interface VaultObjectHistoryEntry {
	id: string;
	objectId: VaultObjectId;
	recordedAt: string;
	reason: 'save' | 'delete' | 'revert';
	object: VaultObject;
}

export interface ObjectEmbedRef {
	type?: VaultObjectType;
	id: VaultObjectId;
	label?: string;
	position: number;
}

export function createVaultObjectId(id: string): VaultObjectId {
	return id as VaultObjectId;
}
