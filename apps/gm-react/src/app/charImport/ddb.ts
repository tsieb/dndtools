import { normalizeSkillId, type AbilityId } from './skills';
import type {
	ImportSpell,
	ImportProficiencies,
	ImportQuickCreate,
	ImportFieldNote,
	ImportParseResult,
} from './types';
import { isRecord, asInt, nonEmptyString, plural } from './helpers';
import {
	DDB_STAT_IDS,
	DDB_ABILITY_NAMES,
	DDB_ALIGNMENTS,
	DDB_SKIPPED,
	DDB_META_KEYS,
	isEmptyish,
	ddbSpellDetail,
} from './ddbFields';
export function mapDdb(doc: Record<string, unknown>): ImportParseResult {
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
