export type VaultObjectId = string & { readonly __brand: 'VaultObjectId' };

export type VaultObjectType = 'stat_block' | 'character' | 'image';

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

export interface VaultObjectBase<TType extends VaultObjectType, TData> {
	id: VaultObjectId;
	type: TType;
	name: string;
	summary: string;
	tags: string[];
	data: TData;
	createdAt: string;
	updatedAt: string;
}

export type StatBlockObject = VaultObjectBase<'stat_block', StatBlockData>;
export type CharacterObject = VaultObjectBase<'character', CharacterData>;
export type ImageObject = VaultObjectBase<'image', ImageData>;

export type VaultObject = StatBlockObject | CharacterObject | ImageObject;

export interface ObjectEmbedRef {
	type: VaultObjectType;
	id: VaultObjectId;
	label?: string;
	position: number;
}

export function createVaultObjectId(id: string): VaultObjectId {
	return id as VaultObjectId;
}
