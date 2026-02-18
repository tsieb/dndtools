import type {
	AbilityScores,
	CharacterData,
	ImageData,
	StatBlockData,
	VaultObject,
	VaultObjectType,
} from '$lib/types/object.js';

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
		actions:
			value?.actions?.filter((entry) => entry.name.trim() && entry.description.trim()) ?? [],
		reactions:
			value?.reactions?.filter((entry) => entry.name.trim() && entry.description.trim()) ?? [],
		legendaryActions:
			value?.legendaryActions?.filter((entry) => entry.name.trim() && entry.description.trim()) ?? [],
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

export function normalizeVaultObject(object: VaultObject): VaultObject {
	switch (object.type) {
		case 'stat_block':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				data: normalizeStatBlockData(object.data),
			};
		case 'character':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				data: normalizeCharacterData(object.data),
			};
		case 'image':
			return {
				...object,
				name: object.name.trim(),
				summary: object.summary.trim(),
				tags: object.tags.map((tag) => tag.trim()).filter(Boolean),
				data: normalizeImageData(object.data),
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
	}
}
