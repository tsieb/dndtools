import { isAbilityId, normalizeSkillId, type AbilityId } from './skills';
import type {
	ImportKind,
	ImportSpell,
	ImportAttack,
	ImportProficiencies,
	ImportQuickCreate,
	ImportFieldNote,
	ImportParseResult,
} from './types';
import { isRecord, asFiniteNumber, asInt, nonEmptyString, plural } from './helpers';
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

export function mapNative(doc: Record<string, unknown>): ImportParseResult {
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
