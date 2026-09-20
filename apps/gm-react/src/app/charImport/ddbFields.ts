import type { AbilityId } from './skills';
import type { ImportSpell } from './types';
import { isRecord, asInt, nonEmptyString, plural } from './helpers';
export const DDB_STAT_IDS: Record<number, AbilityId> = {
	1: 'str',
	2: 'dex',
	3: 'con',
	4: 'int',
	5: 'wis',
	6: 'cha',
};
/** DDB modifier subTypes use FULL ability names (`dexterity-score`, `wisdom-saving-throws`). */
export const DDB_ABILITY_NAMES: Record<string, AbilityId> = {
	strength: 'str',
	dexterity: 'dex',
	constitution: 'con',
	intelligence: 'int',
	wisdom: 'wis',
	charisma: 'cha',
};
export const DDB_ALIGNMENTS: Record<number, string> = {
	1: 'Lawful good',
	2: 'Neutral good',
	3: 'Chaotic good',
	4: 'Lawful neutral',
	5: 'Neutral',
	6: 'Chaotic neutral',
	7: 'Lawful evil',
	8: 'Neutral evil',
	9: 'Chaotic evil',
};

/** DDB top-level keys we deliberately do not import, each with an honest reason. */
export const DDB_SKIPPED: Record<string, string> = {
	inventory: 'items and equipment are not imported — no core inventory home for a character yet',
	currencies: 'currency is not imported — no core model home yet',
	feats: 'feats are not imported — record them in the bio if needed',
	actions: 'D&D Beyond computes attacks from inventory & class features — add attacks after import',
	customActions: 'custom actions are not imported — add attacks after import',
	options: 'class/feat option choices are not imported',
	choices: 'builder choices are not imported',
	conditions: 'active conditions are not imported — set them on the sheet after import',
	deathSaves: 'death-save state is not imported',
	spellSlots: 'spell-slot state is not imported — declare slots on the sheet after import',
	pactMagic: 'pact-magic slots are not imported — declare slots on the sheet after import',
	campaign: 'campaign linkage is not imported',
	traits:
		'personality traits/ideals/bonds/flaws are not imported — fold them into the bio if needed',
	customDefenseAdjustments: 'defense adjustments are not imported',
	customSenses: 'custom senses are not imported',
	customSpeeds: 'custom speeds are not imported',
	characterValues: 'override/adjustment values are not imported',
	creatures: 'companions/creatures are not imported',
	vehicles: 'vehicles are not imported',
	optionalClassFeatures: 'optional class features are not imported',
	optionalOrigins: 'optional origins are not imported',
};

/** Purely-cosmetic/service metadata: ignorable without a per-key report line. */
export const DDB_META_KEYS = new Set([
	'id',
	'userId',
	'username',
	'readonlyUrl',
	'avatarUrl',
	'frameAvatarUrl',
	'backdropAvatarUrl',
	'smallBackdropAvatarUrl',
	'largeBackdropAvatarUrl',
	'thumbnailBackdropAvatarUrl',
	'themeColor',
	'avatarId',
	'frameAvatarId',
	'backdropAvatarId',
	'smallBackdropAvatarId',
	'largeBackdropAvatarId',
	'thumbnailBackdropAvatarId',
	'defaultBackdrop',
	'decorations',
	'socialName',
	'gender',
	'faith',
	'age',
	'hair',
	'eyes',
	'skin',
	'height',
	'weight',
	'lifestyleId',
	'lifestyle',
	'preferences',
	'configuration',
	'dateModified',
	'providedFrom',
	'canEdit',
	'status',
	'statusSlug',
	'campaignSetting',
	'isAssignedToPlayer',
	'activeSourceCategories',
	'sources',
	'customItems',
]);

/** Empty arrays/objects don't warrant an "unmapped" warning line. */
export function isEmptyish(v: unknown): boolean {
	if (v === null) return true;
	if (Array.isArray(v)) return v.length === 0;
	if (isRecord(v)) return Object.values(v).every(isEmptyish);
	return false;
}

const DDB_ACTIVATION: Record<number, string> = {
	1: 'action',
	3: 'bonus action',
	4: 'reaction',
	6: 'minute',
	7: 'hour',
	8: 'special',
};

/** Best-effort SRD-style detail strings from a DDB spell definition. Unparsable ⇒ field omitted. */
export function ddbSpellDetail(def: Record<string, unknown>): Partial<ImportSpell> {
	const out: Partial<ImportSpell> = {};
	const school = nonEmptyString(def.school);
	if (school) out.school = school;

	const activation = isRecord(def.activation) ? def.activation : null;
	if (activation) {
		const type = DDB_ACTIVATION[asInt(activation.activationType) ?? -1];
		const time = asInt(activation.activationTime) ?? 1;
		if (type === 'action' || type === 'bonus action' || type === 'reaction' || type === 'special') {
			out.castingTime = type;
		} else if (type) {
			out.castingTime = plural(time, type);
		}
	}

	const range = isRecord(def.range) ? def.range : null;
	if (range) {
		const origin = nonEmptyString(range.origin)?.toLowerCase();
		const value = asInt(range.rangeValue);
		if (origin === 'self' || origin === 'touch' || origin === 'sight' || origin === 'unlimited') {
			out.range = origin.charAt(0).toUpperCase() + origin.slice(1);
		} else if (value !== undefined && value > 0) {
			out.range = `${value} feet`;
		}
	}

	if (Array.isArray(def.components)) {
		const parts = def.components
			.map((c) => ({ 1: 'V', 2: 'S', 3: 'M' })[asInt(c) ?? -1])
			.filter((c): c is string => !!c);
		if (parts.length > 0) out.components = parts.join(', ');
	}

	const duration = isRecord(def.duration) ? def.duration : null;
	if (duration) {
		const type = nonEmptyString(duration.durationType);
		const interval = asInt(duration.durationInterval);
		const unit = nonEmptyString(duration.durationUnit)?.toLowerCase();
		if (type === 'Instantaneous') out.duration = 'Instantaneous';
		else if (type === 'Concentration' && interval !== undefined && unit) {
			out.duration = `Concentration, up to ${plural(interval, unit)}`;
		} else if (interval !== undefined && unit) out.duration = plural(interval, unit);
	}
	return out;
}
