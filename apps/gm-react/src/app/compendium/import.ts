/**
 * Compendium → vault import mappers (pure; unit-tested against the real core schemas).
 *
 * A monster becomes a `character.quick-create` payload with `kind: 'monster'` (CHAR-001) so it is
 * immediately usable by the roster and the EncounterBuilder: ability scores map onto the core's
 * str/dex/... keys, HP/AC land in the combat block, and everything the simplified core character
 * has no field for (type/size/CR/speed/senses/traits/...) is carried in validated `data.*`
 * entries. Visibility fails closed to `dm-only` — an imported monster never leaks to players.
 *
 * A spell becomes a `content.create-object` payload with the `spell` vault-object subtype
 * (frontmatter: name + level required; school/castingTime/range/components/duration/description
 * optional) and the full rules text in the markdown body. Visibility is omitted so the core's
 * subtype default (dm-only) applies.
 *
 * Both mappers append the source's legal attribution so it travels WITH the imported content.
 */

import type { CompendiumMonster, CompendiumSpell, MonsterAction } from './types';

/** The source metadata an import stamps onto the created entity (from the active result). */
export interface ImportSourceMeta {
	document: string;
	license: string;
	attribution: string;
}

/** Render a CR the way statblocks do: 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2". */
export function formatCr(cr: number): string {
	if (cr === 0.125) return '1/8';
	if (cr === 0.25) return '1/4';
	if (cr === 0.5) return '1/2';
	return String(cr);
}

/** "walk 30 ft., fly 60 ft. (hover)" from the speed record (booleans like `hover` become notes). */
export function formatSpeed(speed: Record<string, number | boolean> | undefined): string {
	if (!speed) return '';
	const parts: string[] = [];
	const notes: string[] = [];
	for (const [mode, value] of Object.entries(speed)) {
		if (typeof value === 'number' && value > 0) parts.push(`${mode} ${value} ft.`);
		else if (value === true) notes.push(mode);
	}
	return parts.join(', ') + (notes.length > 0 ? ` (${notes.join(', ')})` : '');
}

/** "darkvision 120 ft., passive Perception 20" from the senses record. */
export function formatSenses(
	senses: Record<string, number> | undefined,
	passivePerception: number | undefined,
): string {
	const parts = Object.entries(senses ?? {}).map(([sense, range]) => `${sense} ${range} ft.`);
	if (typeof passivePerception === 'number') parts.push(`passive Perception ${passivePerception}`);
	return parts.join(', ');
}

/** An action's one-line detail for the quick-create attack list (legendary/usage limits prefixed). */
export function actionDetail(action: MonsterAction): string {
	const tags: string[] = [];
	if (action.actionType === 'LEGENDARY_ACTION') tags.push(`Legendary${action.legendaryCost && action.legendaryCost > 1 ? ` (costs ${action.legendaryCost})` : ''}`);
	else if (action.actionType === 'BONUS_ACTION') tags.push('Bonus action');
	else if (action.actionType === 'REACTION') tags.push('Reaction');
	const usage = action.usageLimits;
	if (usage && typeof usage === 'object') {
		if (usage.type === 'PER_DAY' && typeof usage.param === 'number') tags.push(`${usage.param}/day`);
		else if (usage.type === 'RECHARGE_ON_ROLL' && typeof usage.param === 'number') tags.push(`recharge ${usage.param}-6`);
	}
	const prefix = tags.length > 0 ? `${tags.join(', ')}. ` : '';
	return `${prefix}${action.desc}`.trim();
}

/** The core ability-score keys, mapped from the compendium's long names. */
const ABILITY_KEYS: Array<[shortKey: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', longKey: string]> = [
	['str', 'strength'],
	['dex', 'dexterity'],
	['con', 'constitution'],
	['int', 'intelligence'],
	['wis', 'wisdom'],
	['cha', 'charisma'],
];

/** Build the `character.quick-create` payload (kind 'monster') for a compendium monster. */
export function monsterToQuickCreatePayload(
	monster: CompendiumMonster,
	source: ImportSourceMeta,
): Record<string, unknown> {
	const abilityScores: Record<string, number> = {};
	for (const [shortKey, longKey] of ABILITY_KEYS) {
		const score = monster.abilityScores?.[longKey];
		if (typeof score === 'number') abilityScores[shortKey] = score;
	}

	const attacks = (monster.actions ?? [])
		.filter((a) => a.name !== '' && a.desc !== '')
		.map((a) => ({ name: a.name, detail: actionDetail(a) }));

	const combat: Record<string, number> = {};
	if (typeof monster.hp === 'number') {
		combat.hp = monster.hp;
		combat.maxHp = monster.hp;
	}
	if (typeof monster.ac === 'number') combat.ac = monster.ac;

	const data: Record<string, unknown> = {
		type: monster.type,
		size: monster.size,
		alignment: monster.alignment,
		cr: formatCr(monster.cr),
		compendiumKey: monster.key,
		source: `${source.document} (${source.license})`,
		attribution: source.attribution,
	};
	if (typeof monster.xp === 'number') data.xp = monster.xp;
	if (monster.hitDice) data.hitDice = monster.hitDice;
	if (monster.acDetail) data.acDetail = monster.acDetail;
	const speed = formatSpeed(monster.speed);
	if (speed !== '') data.speed = speed;
	const senses = formatSenses(monster.senses, monster.passivePerception);
	if (senses !== '') data.senses = senses;
	if (monster.languages) data.languages = monster.languages;
	if (monster.damageImmunities) data.damageImmunities = monster.damageImmunities;
	if (monster.damageResistances) data.damageResistances = monster.damageResistances;
	if (monster.damageVulnerabilities) data.damageVulnerabilities = monster.damageVulnerabilities;
	if (monster.conditionImmunities) data.conditionImmunities = monster.conditionImmunities;
	if (monster.savingThrows && Object.keys(monster.savingThrows).length > 0) data.savingThrows = monster.savingThrows;
	if (monster.skillBonuses && Object.keys(monster.skillBonuses).length > 0) data.skillBonuses = monster.skillBonuses;
	if (monster.traits && monster.traits.length > 0) data.traits = monster.traits;

	return {
		kind: 'monster',
		name: monster.name,
		visibility: 'dm-only', // fail closed — the DM shares deliberately, never by import default
		abilityScores,
		attacks,
		combat,
		data,
		dmOnlyFields: [],
	};
}

/** A short card summary from the full rules text (first sentence, capped). */
export function spellSummary(desc: string, maxLength = 180): string {
	const firstSentence = desc.split(/(?<=[.!?])\s/, 1)[0] ?? desc;
	if (firstSentence.length <= maxLength) return firstSentence;
	return `${firstSentence.slice(0, maxLength - 1).trimEnd()}…`;
}

/** The spell's duration line, folding the concentration flag in statblock style. */
export function spellDuration(spell: CompendiumSpell): string {
	if (spell.concentration && !/concentration/i.test(spell.duration)) {
		return `Concentration, up to ${spell.duration}`;
	}
	return spell.duration;
}

/** Build the `content.create-object` payload (subtype 'spell') for a compendium spell. */
export function spellToCreateObjectPayload(
	spell: CompendiumSpell,
	source: ImportSourceMeta,
): Record<string, unknown> {
	const fields: Record<string, unknown> = {
		name: spell.name,
		level: spell.level,
	};
	if (spell.school) fields.school = spell.school;
	if (spell.castingTime) fields.castingTime = spell.castingTime;
	if (spell.range) fields.range = spell.range;
	if (spell.components) fields.components = spell.components;
	const duration = spellDuration(spell);
	if (duration) fields.duration = duration;
	if (spell.desc) fields.description = spellSummary(spell.desc);

	const bodyParts: string[] = [spell.desc];
	if (spell.higherLevel) bodyParts.push(`**At higher levels.** ${spell.higherLevel}`);
	if (spell.ritual) bodyParts.push('*Can be cast as a ritual.*');
	if (spell.classes && spell.classes.length > 0) bodyParts.push(`**Classes:** ${spell.classes.join(', ')}`);
	bodyParts.push(`---\n*Source: ${source.document} (${source.license}). ${source.attribution}*`);

	return {
		subtype: 'spell',
		title: spell.name,
		fields,
		body: bodyParts.join('\n\n'),
		// visibility omitted — fails closed to the subtype default (dm-only)
	};
}
