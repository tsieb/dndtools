/**
 * Character-file import mapper (WS-4). PURE and framework-free: text in → a validated
 * IMPORT PLAN of core dispatch payloads out. The executor (CharBuilder) turns the plan into
 * real commands: `character.quick-create` → `character.set-proficiencies` →
 * `character.set-spell` (per spell) → `character.update-attacks`.
 *
 * Two accepted shapes:
 *   - the D&D Beyond character-export JSON (the character-service document, optionally
 *     wrapped in `{ data: … }`), and
 *   - a simple NATIVE shape (documented on {@link NativeCharacterFile}).
 *
 * FAIL-CLOSED FIELD POLICY — never silent data loss:
 *   - every top-level input field is either CONSUMED (listed in `plan.mapped`) or REPORTED
 *     (listed in `plan.unmapped` with a reason). Nothing is dropped without a line in the
 *     report the user sees before committing.
 *   - sub-field failures (an unrecognized skill key, an attack without a name, a spell
 *     detail structure we can't parse) produce their own `unmapped` entries.
 *   - an unrecognized overall shape or malformed JSON fails the whole parse (`ok: false`).
 *   - imported characters land `dm-only` unless the native file explicitly says otherwise —
 *     visibility never silently widens on import.
 */

import { isAbilityId, normalizeSkillId, type AbilityId } from './skills';

// ── Plan types (mirror the core zod input schemas; validated again at dispatch) ────────────────

export type ImportKind = 'npc' | 'monster' | 'sidekick';

export interface ImportSpell {
	name: string;
	level: number;
	prepared: boolean;
	castingTime?: string;
	range?: string;
	components?: string;
	duration?: string;
	school?: string;
}

export interface ImportAttack {
	name: string;
	detail: string;
}

export interface ImportProficiencies {
	skills?: Record<string, 'proficient' | 'expertise'>;
	saves?: string[];
	proficiencyBonus?: number;
	hitDice?: { die: string; total: number; spent: number };
}

export interface ImportQuickCreate {
	kind: ImportKind;
	name: string;
	visibility: 'dm-only' | 'player-visible';
	abilityScores: Partial<Record<AbilityId, number>>;
	combat: { hp?: number; maxHp?: number; tempHp?: number; ac?: number };
	data: Record<string, string>;
	dmOnlyFields: string[];
}

/** One line of the import preview: which input field, and what happens to it. */
export interface ImportFieldNote {
	field: string;
	detail: string;
}

export interface ImportPlan {
	source: 'dndbeyond' | 'native';
	name: string;
	quickCreate: ImportQuickCreate;
	/** `character.set-proficiencies` payload (sans characterId), or null when nothing to set. */
	proficiencies: ImportProficiencies | null;
	/** One `character.set-spell` payload (sans characterId/id) per entry. */
	spells: ImportSpell[];
	/** `character.update-attacks` entries (sans ids); empty ⇒ no attack dispatch. */
	attacks: ImportAttack[];
	/** "Will import X" — every consumed input field. */
	mapped: ImportFieldNote[];
	/** "Couldn't map Y" — every input field NOT imported, with the reason. Shown before commit. */
	unmapped: ImportFieldNote[];
}

export type ImportParseResult = { ok: true; plan: ImportPlan } | { ok: false; error: string };

// ── Small helpers ──────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asFiniteNumber(v: unknown): number | undefined {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string' && v.trim() !== '') {
		const n = Number(v);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

function asInt(v: unknown): number | undefined {
	const n = asFiniteNumber(v);
	return n === undefined ? undefined : Math.trunc(n);
}

function nonEmptyString(v: unknown): string | undefined {
	return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

// ── Entry point ────────────────────────────────────────────────────────────────────────────────

export function parseCharacterImport(text: string): ImportParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (err) {
		return {
			ok: false,
			error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
	if (!isRecord(raw)) {
		return {
			ok: false,
			error: 'The file is valid JSON but not a character document (expected an object).',
		};
	}
	// The D&D Beyond character service wraps the document in { data: … }.
	const doc = isRecord(raw.data) && looksLikeDdb(raw.data) ? raw.data : raw;
	if (isRecord(doc) && looksLikeDdb(doc)) return mapDdb(doc);
	if (nonEmptyString((doc as Record<string, unknown>).name))
		return mapNative(doc as Record<string, unknown>);
	return {
		ok: false,
		error:
			'Unrecognized character file — expected a D&D Beyond character export or a dndtools character JSON with at least a "name" field.',
	};
}

function looksLikeDdb(doc: Record<string, unknown>): boolean {
	return Array.isArray(doc.stats) && (Array.isArray(doc.classes) || isRecord(doc.modifiers));
}

// ── The simple NATIVE shape ────────────────────────────────────────────────────────────────────

/**
 * The native shape (all fields optional except `name`):
 * {
 *   "name": "…", "kind": "npc" | "monster" | "sidekick" | "pc",
 *   "visibility": "dm-only" | "player-visible",
 *   "abilityScores": { "str": 10, … }, "ac": 15, "hp": 22, "maxHp": 22, "tempHp": 0,
 *   "level": 3, "class": "…", "race": "…", "background": "…", "alignment": "…",
 *   "speed": 30, "bio": "…", "dmNotes": "…" (imported dm-only),
 *   "proficiencyBonus": 2, "skills": { "perception": "proficient" | "expertise", … },
 *   "saves": ["wis", "cha"], "hitDice": { "die": "d8", "total": 3, "spent": 0 },
 *   "attacks": [{ "name": "…", "detail": "…" }],
 *   "spells": [{ "name": "…", "level": 1, "prepared": true, "castingTime": "…",
 *                "range": "…", "components": "…", "duration": "…", "school": "…" }]
 * }
 */
interface NativeCharacterFile {
	name: string;
}
void 0 as unknown as NativeCharacterFile; // shape documented above; parsing is tolerant per-field

/** Meta keys a native file may carry that describe the file, not the character. */
const NATIVE_META_KEYS = new Set(['format', '$schema', 'version', 'exportedAt', 'source']);

function mapNative(doc: Record<string, unknown>): ImportParseResult {
	const mapped: ImportFieldNote[] = [];
	const unmapped: ImportFieldNote[] = [];
	const consumed = new Set<string>(NATIVE_META_KEYS);

	const take = <T>(key: string, value: T, detail: string): T => {
		consumed.add(key);
		mapped.push({ field: key, detail });
		return value;
	};

	const name = nonEmptyString(doc.name)!;
	take('name', name, `character name "${name}"`);

	// Kind: quick-create excludes 'pc' (the guided draft flow owns PC creation) — a 'pc' file
	// imports as an NPC-kind sheet, stated in the report rather than silently coerced.
	let kind: ImportKind = 'npc';
	if (doc.kind !== undefined) {
		const rawKind = nonEmptyString(doc.kind)?.toLowerCase();
		if (rawKind === 'npc' || rawKind === 'monster' || rawKind === 'sidekick') {
			kind = take('kind', rawKind, `imported as ${rawKind.toUpperCase()}`);
		} else if (rawKind === 'pc') {
			kind = take(
				'kind',
				'npc',
				'PC files import as an NPC-kind sheet — the guided draft flow owns PC creation',
			);
		} else {
			consumed.add('kind');
			unmapped.push({
				field: 'kind',
				detail: `unknown kind "${String(doc.kind)}" — defaulting to NPC`,
			});
		}
	}

	// Visibility never silently widens: only an explicit, recognized value is honored.
	let visibility: 'dm-only' | 'player-visible' = 'dm-only';
	if (doc.visibility !== undefined) {
		const rawVis = nonEmptyString(doc.visibility)?.toLowerCase();
		if (rawVis === 'dm-only' || rawVis === 'player-visible') {
			visibility = take('visibility', rawVis, `visibility "${rawVis}"`);
		} else {
			consumed.add('visibility');
			unmapped.push({
				field: 'visibility',
				detail: `unknown visibility "${String(doc.visibility)}" — imported DM-only (fail closed)`,
			});
		}
	}

	// Ability scores.
	const abilityScores: Partial<Record<AbilityId, number>> = {};
	const abilitySource = isRecord(doc.abilityScores)
		? doc.abilityScores
		: isRecord(doc.abilities)
			? doc.abilities
			: null;
	const abilityKey = isRecord(doc.abilityScores) ? 'abilityScores' : 'abilities';
	if (abilitySource) {
		consumed.add(abilityKey);
		const got: string[] = [];
		for (const [k, v] of Object.entries(abilitySource)) {
			const key = k.toLowerCase();
			const n = asInt(v);
			if (isAbilityId(key) && n !== undefined) {
				abilityScores[key] = n;
				got.push(key.toUpperCase());
			} else {
				unmapped.push({ field: `${abilityKey}.${k}`, detail: 'not a recognized ability score' });
			}
		}
		if (got.length > 0) mapped.push({ field: abilityKey, detail: got.join(', ') });
	}

	// Combat block.
	const combat: ImportQuickCreate['combat'] = {};
	const maxHp = asInt(doc.maxHp) ?? asInt(doc.hp);
	if (maxHp !== undefined) {
		combat.maxHp = maxHp;
		combat.hp = asInt(doc.hp) ?? maxHp;
		if (doc.hp !== undefined) take('hp', combat.hp, `hit points ${combat.hp}`);
		if (doc.maxHp !== undefined) take('maxHp', combat.maxHp, `max hit points ${combat.maxHp}`);
	}
	const tempHp = asInt(doc.tempHp);
	if (tempHp !== undefined && tempHp >= 0)
		combat.tempHp = take('tempHp', tempHp, `temp HP ${tempHp}`);
	const ac = asInt(doc.ac);
	if (ac !== undefined) combat.ac = take('ac', ac, `armor class ${ac}`);

	// Simple string sheet fields → validated `data.*` writes at quick-create.
	const data: Record<string, string> = {};
	const dmOnlyFields: string[] = [];
	const stringField = (key: string, label: string) => {
		if (doc[key] === undefined) return;
		const v =
			nonEmptyString(doc[key]) ??
			(asFiniteNumber(doc[key]) !== undefined ? String(asFiniteNumber(doc[key])) : undefined);
		if (v !== undefined) {
			data[key] = take(key, v, `${label} "${v.length > 40 ? `${v.slice(0, 40)}…` : v}"`);
		} else {
			consumed.add(key);
			unmapped.push({ field: key, detail: `${label} is not a text value` });
		}
	};
	stringField('class', 'class');
	stringField('race', 'race');
	stringField('background', 'background');
	stringField('alignment', 'alignment');
	stringField('speed', 'speed');
	stringField('bio', 'bio');
	stringField('level', 'level');
	if (doc.dmNotes !== undefined) {
		const v = nonEmptyString(doc.dmNotes);
		consumed.add('dmNotes');
		if (v !== undefined) {
			data.dmNotes = v;
			dmOnlyFields.push('data.dmNotes');
			mapped.push({ field: 'dmNotes', detail: 'DM notes (marked DM-only)' });
		} else {
			unmapped.push({ field: 'dmNotes', detail: 'DM notes is not a text value' });
		}
	}

	// Proficiencies.
	const proficiencies: ImportProficiencies = {};
	if (isRecord(doc.skills)) {
		consumed.add('skills');
		const skills: Record<string, 'proficient' | 'expertise'> = {};
		for (const [k, v] of Object.entries(doc.skills)) {
			const id = normalizeSkillId(k);
			const level = nonEmptyString(v)?.toLowerCase();
			if (id && (level === 'proficient' || level === 'expertise')) skills[id] = level;
			else if (!id) unmapped.push({ field: `skills.${k}`, detail: 'unknown skill' });
			else
				unmapped.push({
					field: `skills.${k}`,
					detail: `unknown proficiency level "${String(v)}" (use "proficient" or "expertise")`,
				});
		}
		if (Object.keys(skills).length > 0) {
			proficiencies.skills = skills;
			mapped.push({
				field: 'skills',
				detail: `${plural(Object.keys(skills).length, 'skill proficiency')}`,
			});
		}
	}
	if (Array.isArray(doc.saves)) {
		consumed.add('saves');
		const saves: string[] = [];
		for (const s of doc.saves) {
			const key = nonEmptyString(s)?.toLowerCase();
			if (key && isAbilityId(key)) saves.push(key);
			else
				unmapped.push({
					field: `saves.${String(s)}`,
					detail: 'not an ability id (str/dex/con/int/wis/cha)',
				});
		}
		if (saves.length > 0) {
			proficiencies.saves = saves;
			mapped.push({ field: 'saves', detail: saves.map((s) => s.toUpperCase()).join(', ') });
		}
	}
	const profBonus = asInt(doc.proficiencyBonus);
	if (doc.proficiencyBonus !== undefined) {
		consumed.add('proficiencyBonus');
		if (profBonus !== undefined && profBonus >= 0 && profBonus <= 20) {
			proficiencies.proficiencyBonus = profBonus;
			mapped.push({ field: 'proficiencyBonus', detail: `+${profBonus}` });
		} else {
			unmapped.push({ field: 'proficiencyBonus', detail: 'must be an integer 0–20' });
		}
	}
	if (doc.hitDice !== undefined) {
		consumed.add('hitDice');
		const hd = doc.hitDice;
		const die = isRecord(hd) ? nonEmptyString(hd.die) : undefined;
		const total = isRecord(hd) ? asInt(hd.total) : undefined;
		const spent = isRecord(hd) ? (asInt(hd.spent) ?? 0) : 0;
		if (die && total !== undefined && total >= 0 && spent >= 0) {
			proficiencies.hitDice = { die, total, spent };
			mapped.push({ field: 'hitDice', detail: `${total}× ${die}` });
		} else {
			unmapped.push({
				field: 'hitDice',
				detail: 'expected { "die": "d8", "total": n, "spent": n }',
			});
		}
	}

	// Attacks.
	const attacks: ImportAttack[] = [];
	if (Array.isArray(doc.attacks)) {
		consumed.add('attacks');
		doc.attacks.forEach((a, i) => {
			const attackName = isRecord(a) ? nonEmptyString(a.name) : undefined;
			if (!attackName) {
				unmapped.push({ field: `attacks[${i}]`, detail: 'attack has no name' });
				return;
			}
			const detail = isRecord(a) ? (nonEmptyString(a.detail) ?? '') : '';
			attacks.push({ name: attackName, detail });
		});
		if (attacks.length > 0)
			mapped.push({ field: 'attacks', detail: plural(attacks.length, 'attack') });
	}

	// Spells.
	const spells: ImportSpell[] = [];
	if (Array.isArray(doc.spells)) {
		consumed.add('spells');
		doc.spells.forEach((s, i) => {
			if (!isRecord(s)) {
				unmapped.push({ field: `spells[${i}]`, detail: 'not a spell object' });
				return;
			}
			const spellName = nonEmptyString(s.name);
			const level = asInt(s.level);
			if (!spellName || level === undefined || level < 0 || level > 9) {
				unmapped.push({ field: `spells[${i}]`, detail: 'a spell needs a name and a level 0–9' });
				return;
			}
			spells.push({
				name: spellName,
				level,
				prepared: s.prepared === undefined ? true : s.prepared === true,
				...(nonEmptyString(s.castingTime) ? { castingTime: nonEmptyString(s.castingTime) } : {}),
				...(nonEmptyString(s.range) ? { range: nonEmptyString(s.range) } : {}),
				...(nonEmptyString(s.components) ? { components: nonEmptyString(s.components) } : {}),
				...(nonEmptyString(s.duration) ? { duration: nonEmptyString(s.duration) } : {}),
				...(nonEmptyString(s.school) ? { school: nonEmptyString(s.school) } : {}),
			});
		});
		if (spells.length > 0) mapped.push({ field: 'spells', detail: plural(spells.length, 'spell') });
	}

	// FAIL-CLOSED sweep: every remaining top-level key is reported, never silently dropped.
	for (const key of Object.keys(doc)) {
		if (!consumed.has(key))
			unmapped.push({ field: key, detail: 'no mapping for this field — not imported' });
	}

	return {
		ok: true,
		plan: {
			source: 'native',
			name,
			quickCreate: { kind, name, visibility, abilityScores, combat, data, dmOnlyFields },
			proficiencies: Object.keys(proficiencies).length > 0 ? proficiencies : null,
			spells,
			attacks,
			mapped,
			unmapped,
		},
	};
}

// ── The D&D Beyond character-export shape ──────────────────────────────────────────────────────

const DDB_STAT_IDS: Record<number, AbilityId> = {
	1: 'str',
	2: 'dex',
	3: 'con',
	4: 'int',
	5: 'wis',
	6: 'cha',
};
/** DDB modifier subTypes use FULL ability names (`dexterity-score`, `wisdom-saving-throws`). */
const DDB_ABILITY_NAMES: Record<string, AbilityId> = {
	strength: 'str',
	dexterity: 'dex',
	constitution: 'con',
	intelligence: 'int',
	wisdom: 'wis',
	charisma: 'cha',
};
const DDB_ALIGNMENTS: Record<number, string> = {
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
const DDB_SKIPPED: Record<string, string> = {
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
const DDB_META_KEYS = new Set([
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

function mapDdb(doc: Record<string, unknown>): ImportParseResult {
	const mapped: ImportFieldNote[] = [];
	const unmapped: ImportFieldNote[] = [];
	const consumed = new Set<string>(DDB_META_KEYS);

	const name = nonEmptyString(doc.name) ?? 'Imported character';
	consumed.add('name');
	mapped.push({ field: 'name', detail: `character name "${name}"` });
	mapped.push({
		field: 'kind',
		detail:
			'D&D Beyond characters import as an NPC-kind sheet (the guided draft flow owns PC creation), DM-only until shared',
	});

	// Ability scores: base stats + bonusStats + racial/ASI `-score` bonus modifiers; overrideStats win.
	const abilityScores: Partial<Record<AbilityId, number>> = {};
	{
		consumed.add('stats').add('bonusStats').add('overrideStats');
		const base = new Map<AbilityId, number>();
		if (Array.isArray(doc.stats)) {
			for (const entry of doc.stats) {
				if (!isRecord(entry)) continue;
				const ability = DDB_STAT_IDS[asInt(entry.id) ?? -1];
				const value = asInt(entry.value);
				if (ability && value !== undefined) base.set(ability, value);
			}
		}
		const addFrom = (list: unknown) => {
			if (!Array.isArray(list)) return;
			for (const entry of list) {
				if (!isRecord(entry)) continue;
				const ability = DDB_STAT_IDS[asInt(entry.id) ?? -1];
				const value = asInt(entry.value);
				if (ability && value !== undefined) base.set(ability, (base.get(ability) ?? 10) + value);
			}
		};
		addFrom(doc.bonusStats);
		// `-score` bonus modifiers (racial ASI etc.) from every modifier group.
		if (isRecord(doc.modifiers)) {
			for (const group of Object.values(doc.modifiers)) {
				if (!Array.isArray(group)) continue;
				for (const m of group) {
					if (!isRecord(m) || m.type !== 'bonus') continue;
					const sub = nonEmptyString(m.subType);
					if (!sub || !sub.endsWith('-score')) continue;
					const ability = DDB_ABILITY_NAMES[sub.slice(0, -'-score'.length)];
					const value = asInt(m.value ?? m.fixedValue);
					if (ability && value !== undefined) {
						base.set(ability, (base.get(ability) ?? 10) + value);
					}
				}
			}
		}
		if (Array.isArray(doc.overrideStats)) {
			for (const entry of doc.overrideStats) {
				if (!isRecord(entry)) continue;
				const ability = DDB_STAT_IDS[asInt(entry.id) ?? -1];
				const value = asInt(entry.value);
				if (ability && value !== undefined && entry.value !== null) base.set(ability, value);
			}
		}
		for (const [ability, value] of base) abilityScores[ability] = value;
		if (base.size > 0) {
			mapped.push({
				field: 'stats',
				detail: `ability scores (base + bonus + racial score modifiers${Array.isArray(doc.overrideStats) && doc.overrideStats.some((o) => isRecord(o) && o.value !== null) ? ' + overrides' : ''})`,
			});
		}
	}

	// Classes → level, class string, hit dice.
	const data: Record<string, string> = {};
	let totalLevel = 0;
	let hitDice: ImportProficiencies['hitDice'];
	if (Array.isArray(doc.classes)) {
		consumed.add('classes');
		const parts: string[] = [];
		let hitDiceSpent = 0;
		let firstDie: number | undefined;
		for (const cls of doc.classes) {
			if (!isRecord(cls)) continue;
			const level = asInt(cls.level) ?? 0;
			totalLevel += level;
			hitDiceSpent += asInt(cls.hitDiceUsed) ?? 0;
			const def = isRecord(cls.definition) ? cls.definition : {};
			const clsName = nonEmptyString(def.name);
			if (clsName) parts.push(level > 0 ? `${clsName} ${level}` : clsName);
			if (firstDie === undefined) firstDie = asInt(def.hitDice);
		}
		if (parts.length > 0) {
			data.class = parts.join(' / ');
			mapped.push({ field: 'classes', detail: data.class });
		}
		if (totalLevel > 0) data.level = String(totalLevel);
		if (firstDie !== undefined && totalLevel > 0) {
			hitDice = {
				die: `d${firstDie}`,
				total: totalLevel,
				spent: Math.min(hitDiceSpent, totalLevel),
			};
			mapped.push({
				field: 'hit dice',
				detail: `${hitDice.total}× ${hitDice.die} (from class levels)`,
			});
		}
	}

	// Hit points: base + CON modifier per level (the DDB formula); overrides win; removed subtracts.
	const combat: ImportQuickCreate['combat'] = {};
	{
		consumed
			.add('baseHitPoints')
			.add('bonusHitPoints')
			.add('overrideHitPoints')
			.add('removedHitPoints')
			.add('temporaryHitPoints');
		const conMod = Math.floor(((abilityScores.con ?? 10) - 10) / 2);
		const override = doc.overrideHitPoints === null ? undefined : asInt(doc.overrideHitPoints);
		const base = asInt(doc.baseHitPoints);
		const bonus = doc.bonusHitPoints === null ? 0 : (asInt(doc.bonusHitPoints) ?? 0);
		const maxHp = override ?? (base !== undefined ? base + bonus + conMod * totalLevel : undefined);
		if (maxHp !== undefined) {
			combat.maxHp = maxHp;
			combat.hp = Math.max(0, maxHp - (asInt(doc.removedHitPoints) ?? 0));
			mapped.push({
				field: 'hit points',
				detail: `${combat.hp}/${combat.maxHp}${override === undefined ? ' (base + CON × level)' : ' (override)'}`,
			});
		}
		const tempHp = asInt(doc.temporaryHitPoints);
		if (tempHp !== undefined && tempHp > 0) {
			combat.tempHp = tempHp;
			mapped.push({ field: 'temporaryHitPoints', detail: `temp HP ${tempHp}` });
		}
	}
	// AC is computed from inventory in D&D Beyond — not derivable here. Reported, defaulted to 10.
	unmapped.push({
		field: 'armor class',
		detail:
			'D&D Beyond derives AC from equipped items — set AC on the sheet after import (defaults to 10)',
	});

	// Race / background / alignment / backstory / inspiration.
	if (isRecord(doc.race)) {
		consumed.add('race');
		const raceName = nonEmptyString(doc.race.fullName) ?? nonEmptyString(doc.race.baseName);
		if (raceName) {
			data.race = raceName;
			mapped.push({ field: 'race', detail: raceName });
		}
	}
	if (isRecord(doc.background)) {
		consumed.add('background');
		const def = isRecord(doc.background.definition) ? doc.background.definition : {};
		const bg = nonEmptyString(def.name);
		if (bg) {
			data.background = bg;
			mapped.push({ field: 'background', detail: bg });
		}
	}
	if (doc.alignmentId !== undefined) {
		consumed.add('alignmentId');
		const alignment = DDB_ALIGNMENTS[asInt(doc.alignmentId) ?? -1];
		if (alignment) {
			data.alignment = alignment;
			mapped.push({ field: 'alignmentId', detail: alignment });
		} else if (doc.alignmentId !== null) {
			unmapped.push({
				field: 'alignmentId',
				detail: `unknown alignment id ${String(doc.alignmentId)}`,
			});
		}
	}
	if (isRecord(doc.notes)) {
		consumed.add('notes');
		const backstory = nonEmptyString(doc.notes.backstory);
		if (backstory) {
			data.bio = backstory;
			mapped.push({ field: 'notes.backstory', detail: 'backstory → bio' });
		}
		const otherNotes = Object.entries(doc.notes).filter(
			([k, v]) => k !== 'backstory' && nonEmptyString(v),
		);
		if (otherNotes.length > 0) {
			unmapped.push({
				field: 'notes',
				detail: `${otherNotes.map(([k]) => k).join(', ')} — not imported`,
			});
		}
	}
	if (doc.inspiration === true) {
		consumed.add('inspiration');
		data.inspiration = 'yes';
		mapped.push({ field: 'inspiration', detail: 'inspired' });
	} else {
		consumed.add('inspiration');
	}
	if (doc.currentXp !== undefined) {
		consumed.add('currentXp');
		unmapped.push({
			field: 'currentXp',
			detail: 'XP is managed by the advancement flow — set it on the sheet after import',
		});
	}

	// Proficiencies from modifiers: skill proficiency/expertise + `-saving-throws`.
	const proficiencies: ImportProficiencies = {};
	if (hitDice) proficiencies.hitDice = hitDice;
	if (isRecord(doc.modifiers)) {
		consumed.add('modifiers');
		const skills: Record<string, 'proficient' | 'expertise'> = {};
		const saves = new Set<string>();
		let unrecognized = 0;
		for (const group of Object.values(doc.modifiers)) {
			if (!Array.isArray(group)) continue;
			for (const m of group) {
				if (!isRecord(m)) continue;
				const type = nonEmptyString(m.type);
				const sub = nonEmptyString(m.subType);
				if (!type || !sub) continue;
				if (type === 'proficiency' || type === 'expertise') {
					const skill = normalizeSkillId(sub);
					if (skill) {
						// Expertise wins over plain proficiency when both appear.
						if (type === 'expertise' || skills[skill] !== 'expertise') {
							skills[skill] = type === 'expertise' ? 'expertise' : (skills[skill] ?? 'proficient');
						}
						continue;
					}
					if (sub.endsWith('-saving-throws')) {
						const short = DDB_ABILITY_NAMES[sub.slice(0, -'-saving-throws'.length)];
						if (short) {
							saves.add(short);
							continue;
						}
					}
					unrecognized += 1;
					continue;
				}
				if (type === 'bonus' && sub.endsWith('-score')) continue; // consumed by ability scores above
				unrecognized += 1;
			}
		}
		if (Object.keys(skills).length > 0) {
			proficiencies.skills = skills;
			mapped.push({
				field: 'modifiers (skills)',
				detail: plural(Object.keys(skills).length, 'skill proficiency'),
			});
		}
		if (saves.size > 0) {
			proficiencies.saves = [...saves];
			mapped.push({
				field: 'modifiers (saves)',
				detail: [...saves].map((s) => s.toUpperCase()).join(', '),
			});
		}
		if (unrecognized > 0) {
			unmapped.push({
				field: 'modifiers',
				detail: `${plural(unrecognized, 'other modifier')} (item/feat/misc bonuses) not imported — D&D Beyond derives these; review the sheet after import`,
			});
		}
	}
	// Proficiency bonus derives from level (the core does this when unset) — nothing to set.

	// Spells: classSpells[].spells[] + spells.{race,class,background,feat,item}[].
	const spells: ImportSpell[] = [];
	{
		const seen = new Set<string>();
		let skippedSpells = 0;
		const collect = (list: unknown) => {
			if (!Array.isArray(list)) return;
			for (const entry of list) {
				if (!isRecord(entry)) continue;
				const def = isRecord(entry.definition) ? entry.definition : null;
				if (!def) {
					skippedSpells += 1;
					continue;
				}
				const spellName = nonEmptyString(def.name);
				const level = asInt(def.level);
				if (!spellName || level === undefined || level < 0 || level > 9) {
					skippedSpells += 1;
					continue;
				}
				const dedupe = `${spellName.toLowerCase()}|${level}`;
				if (seen.has(dedupe)) continue;
				seen.add(dedupe);
				const detail = ddbSpellDetail(def);
				spells.push({
					name: spellName,
					level,
					prepared: entry.prepared === true || entry.alwaysPrepared === true || level === 0,
					...detail,
				});
			}
		};
		if (Array.isArray(doc.classSpells)) {
			consumed.add('classSpells');
			for (const cs of doc.classSpells) {
				if (isRecord(cs)) collect(cs.spells);
			}
		}
		if (isRecord(doc.spells)) {
			consumed.add('spells');
			for (const list of Object.values(doc.spells)) collect(list);
		}
		if (spells.length > 0) mapped.push({ field: 'spells', detail: plural(spells.length, 'spell') });
		if (skippedSpells > 0)
			unmapped.push({
				field: 'spells',
				detail: `${plural(skippedSpells, 'spell entry')} had no readable name/level`,
			});
	}

	// Deliberately-skipped keys (each with a reason) + the fail-closed sweep for everything else.
	for (const [key, reason] of Object.entries(DDB_SKIPPED)) {
		if (doc[key] !== undefined && !isEmptyish(doc[key]))
			unmapped.push({ field: key, detail: reason });
		consumed.add(key);
	}
	for (const key of Object.keys(doc)) {
		if (!consumed.has(key))
			unmapped.push({ field: key, detail: 'no mapping for this field — not imported' });
	}

	return {
		ok: true,
		plan: {
			source: 'dndbeyond',
			name,
			// Fail closed: an import is DM-only until the DM shares it (`character.set-sharing`).
			quickCreate: {
				kind: 'npc',
				name,
				visibility: 'dm-only',
				abilityScores,
				combat,
				data,
				dmOnlyFields: [],
			},
			proficiencies: Object.keys(proficiencies).length > 0 ? proficiencies : null,
			spells,
			attacks: [],
			mapped,
			unmapped,
		},
	};
}

/** Empty arrays/objects don't warrant an "unmapped" warning line. */
function isEmptyish(v: unknown): boolean {
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
function ddbSpellDetail(def: Record<string, unknown>): Partial<ImportSpell> {
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

// ── RC-SYS-2.5 — fitting the plan to the ACTIVE system package ─────────────────────────────────

/**
 * RC-SYS-2.5 — the parts of the active {@link import('@dndtools/core').SystemPackage} a 5e character
 * file has to be measured against, reduced to plain data so this module stays pure.
 *
 * `attributeKeys` and `skillKeys` are the package's own keys; both are matched case-insensitively
 * and 5e's long attribute names (`dexterity`) are recognised as the short ids the plan uses (`dex`).
 */
export interface SystemFitInput {
	displayName: string;
	attributeKeys: readonly string[];
	skillKeys: readonly string[];
	/** True when the package declares any `slots` resource — somewhere for a spell list to live. */
	declaresSpellSlots: boolean;
	/** True when the package declares a `proficiencyBonus` derived value. */
	declaresProficiencyBonus: boolean;
	/** What this system calls a spell, for the report line ("Spells", "Powers", "Moves"). */
	abilityPlural: string;
}

/** Long-form 5e attribute names → the short ids the import plan uses. */
const LONG_ABILITY_NAMES: Record<string, AbilityId> = {
	strength: 'str',
	dexterity: 'dex',
	constitution: 'con',
	intelligence: 'int',
	wisdom: 'wis',
	charisma: 'cha',
};

/** The short ability ids a package's `attributes[]` covers, under either naming. */
function declaredAbilityIds(attributeKeys: readonly string[]): Set<string> {
	const ids = new Set<string>();
	for (const raw of attributeKeys) {
		const key = raw.toLowerCase();
		if (isAbilityId(key)) ids.add(key);
		const long = LONG_ABILITY_NAMES[key];
		if (long) ids.add(long);
	}
	return ids;
}

/**
 * RC-SYS-2.5 — narrow an import plan to what the ACTIVE rules system can actually hold.
 *
 * `parseCharacterImport` reads a 5e character file and knows nothing about the campaign's system.
 * A campaign running a narrative package has no ability scores, no skill list and nowhere to put a
 * spell list, and importing them anyway would write a character its own system cannot describe. So
 * every part the package does not declare is REMOVED from the payloads and reported in
 * `plan.unmapped` — the same preview the DM already reads before committing, which is the only place
 * the difference can honestly be shown.
 *
 * Pure: a new plan, the input untouched. A package that declares the lot gets its plan back
 * unchanged, so 5e imports are byte-identical.
 */
export function applySystemFit(plan: ImportPlan, system: SystemFitInput): ImportPlan {
	const unmapped: ImportFieldNote[] = [...plan.unmapped];
	const declaredAbilities = declaredAbilityIds(system.attributeKeys);

	const abilityScores: Partial<Record<AbilityId, number>> = {};
	const droppedAbilities: string[] = [];
	for (const [id, score] of Object.entries(plan.quickCreate.abilityScores)) {
		if (declaredAbilities.has(id)) abilityScores[id as AbilityId] = score;
		else droppedAbilities.push(id.toUpperCase());
	}
	if (droppedAbilities.length > 0) {
		unmapped.push({
			field: 'abilityScores',
			detail: `${system.displayName} has no ${droppedAbilities.join(', ')} — not imported.`,
		});
	}

	let proficiencies = plan.proficiencies;
	if (proficiencies) {
		const declaredSkills = new Set(system.skillKeys.map((k) => k.toLowerCase()));
		const skills: Record<string, 'proficient' | 'expertise'> = {};
		const droppedSkills: string[] = [];
		for (const [key, level] of Object.entries(proficiencies.skills ?? {})) {
			if (declaredSkills.has(key.toLowerCase())) skills[key] = level;
			else droppedSkills.push(key);
		}
		if (droppedSkills.length > 0) {
			unmapped.push({
				field: 'proficiencies.skills',
				detail: `${system.displayName} does not list ${droppedSkills.join(', ')} — not imported.`,
			});
		}
		const saves = (proficiencies.saves ?? []).filter((s) => declaredAbilities.has(s.toLowerCase()));
		if (saves.length < (proficiencies.saves ?? []).length) {
			unmapped.push({
				field: 'proficiencies.saves',
				detail: `${system.displayName} has no saving throws for those attributes — not imported.`,
			});
		}
		if (!system.declaresProficiencyBonus && proficiencies.proficiencyBonus !== undefined) {
			unmapped.push({
				field: 'proficiencies.proficiencyBonus',
				detail: `${system.displayName} derives no proficiency bonus — not imported.`,
			});
		}
		proficiencies = {
			...proficiencies,
			...(Object.keys(skills).length > 0 ? { skills } : { skills: undefined }),
			...(saves.length > 0 ? { saves } : { saves: undefined }),
			...(system.declaresProficiencyBonus ? {} : { proficiencyBonus: undefined }),
		};
		// Nothing left to set is nothing to dispatch.
		const hasAny =
			Object.keys(proficiencies.skills ?? {}).length > 0 ||
			(proficiencies.saves ?? []).length > 0 ||
			proficiencies.proficiencyBonus !== undefined ||
			proficiencies.hitDice !== undefined;
		if (!hasAny) proficiencies = null;
	}

	let spells = plan.spells;
	if (!system.declaresSpellSlots && spells.length > 0) {
		unmapped.push({
			field: 'spells',
			detail: `${system.displayName} has no ${system.abilityPlural.toLowerCase()} to import them into — ${spells.length} not imported.`,
		});
		spells = [];
	}

	return {
		...plan,
		quickCreate: { ...plan.quickCreate, abilityScores },
		proficiencies,
		spells,
		unmapped,
	};
}
