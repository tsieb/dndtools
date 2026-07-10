/**
 * Compendium — shared result shapes for the Extensions "Compendium" tab.
 *
 * BOTH data sources project into these shapes so the UI is source-agnostic:
 *   - the live Open5e v2 API client (`open5e.ts`) projects `/v2/creatures/` + `/v2/spells/`
 *     responses into them, and
 *   - the bundled SRD dataset (`srd.ts`, the offline fallback) already ships in this shape
 *     (`src/assets/srd/*.json` — its entries are these interfaces verbatim).
 *
 * The `attribution` string on every result is a LEGAL requirement (CC-BY-4.0): the surface that
 * renders compendium entries must keep it visible.
 */

export type CompendiumKind = 'monster' | 'spell';

/** Where a result set came from: the live Open5e API or the bundled offline SRD copy. */
export type CompendiumSourceKind = 'live' | 'bundled';

export interface MonsterTrait {
	name: string;
	desc: string;
}

export interface MonsterAction {
	name: string;
	desc: string;
	/** e.g. 'ACTION' | 'LEGENDARY_ACTION' | 'BONUS_ACTION' | 'REACTION' (absent = plain action). */
	actionType?: string;
	legendaryCost?: number;
	/** e.g. `{ type: 'PER_DAY', param: 3 }` or `{ type: 'RECHARGE_ON_ROLL', param: 5 }`. */
	usageLimits?: { type?: string; param?: number } | null;
}

/** One monster/creature entry (the bundled SRD entry shape; the live client projects into it). */
export interface CompendiumMonster {
	key: string;
	name: string;
	size: string;
	type: string;
	alignment: string;
	cr: number;
	xp?: number;
	ac?: number;
	acDetail?: string;
	hp?: number;
	hitDice?: string;
	speed?: Record<string, number | boolean>;
	abilityScores?: Record<string, number>;
	savingThrows?: Record<string, number>;
	skillBonuses?: Record<string, number>;
	passivePerception?: number;
	senses?: Record<string, number>;
	languages?: string;
	damageImmunities?: string | null;
	damageResistances?: string | null;
	damageVulnerabilities?: string | null;
	conditionImmunities?: string | null;
	traits?: MonsterTrait[];
	actions?: MonsterAction[];
}

/** One spell entry (the bundled SRD entry shape; the live client projects into it). */
export interface CompendiumSpell {
	key: string;
	name: string;
	level: number;
	school: string;
	castingTime: string;
	range: string;
	components: string;
	duration: string;
	concentration?: boolean;
	ritual?: boolean;
	classes?: string[];
	desc: string;
	higherLevel?: string;
}

/** The search/filter inputs the Compendium UI can issue against either source. */
export interface CompendiumQuery {
	/** Case-insensitive name substring. */
	search?: string;
	/** Monsters only — exact challenge rating (fractional CRs are 0.125 / 0.25 / 0.5). */
	cr?: number;
	/** Spells only — exact spell level (0 = cantrip). */
	level?: number;
	/** Max entries to return (one page). */
	limit?: number;
	/** Live only — the Open5e document to search. Defaults to the SRD (`srd-2014`). */
	documentKey?: string;
}

/** A source-agnostic result page. `attribution` MUST stay visible wherever entries render. */
export interface CompendiumResult<T> {
	source: CompendiumSourceKind;
	/** Human-readable document name, e.g. "System Reference Document 5.1". */
	document: string;
	/** License short name, e.g. "CC-BY-4.0". */
	license: string;
	/** The full legal attribution string for the rendered material. */
	attribution: string;
	/** Total matches for the query (may exceed `entries.length` — one page is returned). */
	total: number;
	entries: T[];
}
