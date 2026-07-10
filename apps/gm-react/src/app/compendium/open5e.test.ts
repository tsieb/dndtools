import { describe, expect, it, vi } from 'vitest';
import {
	documentAttribution,
	isAbortError,
	listDocuments,
	projectCreature,
	projectSpell,
	searchLiveMonsters,
	searchMonsters,
	searchSpells,
	OPEN5E_API_BASE,
	SRD_ATTRIBUTION,
	SRD_DOCUMENT_KEY,
	type Open5eDocument,
} from './open5e';

// --- fixtures captured from the live v2 API (https://api.open5e.com/v2/) -------------------------

const RAW_CREATURE = {
	key: 'srd_goblin',
	name: 'Goblin',
	document: { name: 'System Reference Document 5.1', key: 'srd-2014' },
	type: { name: 'Humanoid', key: 'humanoid' },
	size: { name: 'Small', key: 'small' },
	challenge_rating: 0.25,
	experience_points: 50,
	alignment: 'neutral evil',
	languages: { as_string: 'Common, Goblin', data: [] },
	armor_class: 15,
	armor_detail: 'leather armor, shield',
	hit_points: 7,
	hit_dice: '2d6',
	speed: { walk: 30, unit: 'feet' },
	ability_scores: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
	saving_throws: {},
	skill_bonuses: { stealth: 6 },
	passive_perception: 9,
	darkvision_range: 60,
	blindsight_range: null,
	tremorsense_range: null,
	truesight_range: null,
	damage_immunities: null,
	resistances_and_immunities: {
		damage_immunities_display: 'acid',
		damage_resistances_display: '',
		damage_vulnerabilities_display: '',
		condition_immunities_display: '',
	},
	traits: [{ name: 'Nimble Escape', desc: 'The goblin can take the Disengage or Hide action as a bonus action.' }],
	actions: [
		{
			name: 'Scimitar',
			desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',
			action_type: 'ACTION',
			legendary_action_cost: 1, // v2 stamps this on plain actions too — must NOT survive projection
			usage_limits: null,
		},
		{
			name: 'Tail Swipe',
			desc: 'Sweeps its tail.',
			action_type: 'LEGENDARY_ACTION',
			legendary_action_cost: 2,
			usage_limits: { type: 'PER_DAY', param: 3 },
		},
	],
} as const;

const RAW_SPELL = {
	key: 'srd_acid-arrow',
	name: 'Acid Arrow',
	level: 2,
	school: { name: 'Evocation', key: 'evocation' },
	classes: [{ name: 'Druid' }, { name: 'Wizard' }],
	casting_time: 'action',
	range_text: '90 feet',
	verbal: true,
	somatic: true,
	material: true,
	material_specified: "Powdered rhubarb leaf and an adder's stomach.",
	duration: 'instantaneous',
	concentration: false,
	ritual: false,
	desc: 'A shimmering green arrow streaks toward a target within range.',
	higher_level: 'When you cast this spell using a spell slot of 3rd level or higher, the damage increases.',
} as const;

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as unknown as Response;
}

const listBody = (results: unknown[], count = results.length) => ({ count, next: null, results });

// --- projections ----------------------------------------------------------------------------------

describe('projectCreature', () => {
	const monster = projectCreature(RAW_CREATURE as unknown as Record<string, unknown>);

	it('maps the statblock scalars into the bundled-SRD shape', () => {
		expect(monster).toMatchObject({
			key: 'srd_goblin',
			name: 'Goblin',
			size: 'Small',
			type: 'Humanoid',
			alignment: 'neutral evil',
			cr: 0.25,
			xp: 50,
			ac: 15,
			acDetail: 'leather armor, shield',
			hp: 7,
			hitDice: '2d6',
			passivePerception: 9,
			languages: 'Common, Goblin',
		});
		expect(monster.abilityScores).toEqual(RAW_CREATURE.ability_scores);
		expect(monster.skillBonuses).toEqual({ stealth: 6 });
	});

	it('keeps only numeric/boolean speed modes (drops the unit string)', () => {
		expect(monster.speed).toEqual({ walk: 30 });
	});

	it('collects positive sense ranges and skips nulls', () => {
		expect(monster.senses).toEqual({ darkvision: 60 });
	});

	it('reads immunity display strings from resistances_and_immunities when top-level is null', () => {
		expect(monster.damageImmunities).toBe('acid');
		expect(monster.damageResistances).toBeUndefined();
		expect(monster.conditionImmunities).toBeUndefined();
	});

	it('keeps legendaryCost only on legendary actions and carries usage limits', () => {
		expect(monster.actions).toEqual([
			{ name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target.', actionType: 'ACTION' },
			{
				name: 'Tail Swipe',
				desc: 'Sweeps its tail.',
				actionType: 'LEGENDARY_ACTION',
				legendaryCost: 2,
				usageLimits: { type: 'PER_DAY', param: 3 },
			},
		]);
		expect(monster.traits).toEqual([expect.objectContaining({ name: 'Nimble Escape' })]);
	});
});

describe('projectSpell', () => {
	const spell = projectSpell(RAW_SPELL as unknown as Record<string, unknown>);

	it('maps into the bundled-SRD spell shape', () => {
		expect(spell).toMatchObject({
			key: 'srd_acid-arrow',
			name: 'Acid Arrow',
			level: 2,
			school: 'Evocation',
			castingTime: 'action',
			range: '90 feet',
			duration: 'instantaneous',
			classes: ['Druid', 'Wizard'],
			higherLevel: RAW_SPELL.higher_level,
		});
		expect(spell.concentration).toBeUndefined();
		expect(spell.ritual).toBeUndefined();
	});

	it('composes the V, S, M component line with the material detail', () => {
		expect(spell.components).toBe("V, S, M (Powdered rhubarb leaf and an adder's stomach.)");
	});
});

// --- live client URL construction ------------------------------------------------------------------

describe('searchLiveMonsters', () => {
	it('queries /v2/creatures/ with the SRD document filter, search, and CR params', async () => {
		const fetchFn = vi.fn(async (_input: string | URL | Request) => jsonResponse(listBody([RAW_CREATURE], 2)));
		const result = await searchLiveMonsters({ search: 'gobl', cr: 0.25, limit: 10 }, { fetchFn });

		expect(fetchFn).toHaveBeenCalledTimes(1);
		const url = new URL(fetchFn.mock.calls[0]![0] as string);
		expect(url.href.startsWith(`${OPEN5E_API_BASE}/creatures/`)).toBe(true);
		expect(url.searchParams.get('document__key')).toBe(SRD_DOCUMENT_KEY);
		expect(url.searchParams.get('name__icontains')).toBe('gobl');
		expect(url.searchParams.get('challenge_rating')).toBe('0.25');
		expect(url.searchParams.get('limit')).toBe('10');

		expect(result.source).toBe('live');
		expect(result.total).toBe(2);
		expect(result.attribution).toBe(SRD_ATTRIBUTION);
		expect(result.entries[0]?.name).toBe('Goblin');
	});

	it('uses an opted-in document key and that document own attribution', async () => {
		const doc: Open5eDocument = {
			key: 'tob',
			name: 'Tome of Beasts',
			displayName: 'Tome of Beasts',
			publisher: 'Kobold Press',
			licenses: [{ name: 'OPEN GAME LICENSE Version 1.0a', key: 'ogl-10a' }],
			permalink: 'https://koboldpress.com/',
		};
		const fetchFn = vi.fn(async (_input: string | URL | Request) => jsonResponse(listBody([])));
		const result = await searchLiveMonsters({ documentKey: 'tob' }, { fetchFn, document: doc });

		const url = new URL(fetchFn.mock.calls[0]![0] as string);
		expect(url.searchParams.get('document__key')).toBe('tob');
		expect(result.document).toBe('Tome of Beasts');
		expect(result.license).toContain('OPEN GAME LICENSE');
		expect(result.attribution).toContain('Kobold Press');
		expect(result.attribution).not.toBe(SRD_ATTRIBUTION);
	});
});

describe('searchSpells (live)', () => {
	it('queries /v2/spells/ with the level param', async () => {
		const fetchFn = vi.fn(async (_input: string | URL | Request) => jsonResponse(listBody([RAW_SPELL])));
		const result = await searchSpells({ level: 2 }, { fetchFn });
		const url = new URL(fetchFn.mock.calls[0]![0] as string);
		expect(url.pathname).toBe('/v2/spells/');
		expect(url.searchParams.get('level')).toBe('2');
		expect(result.source).toBe('live');
		expect(result.entries[0]?.components).toContain('V, S, M');
	});
});

// --- offline fallback -------------------------------------------------------------------------------

describe('fallback to the bundled SRD', () => {
	it('falls back on a rejected fetch (offline) and marks the result bundled', async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		const result = await searchMonsters({ search: 'goblin' }, { fetchFn });
		expect(result.source).toBe('bundled');
		expect(result.license).toBe('CC-BY-4.0');
		expect(result.attribution).toContain('System Reference Document 5.1');
		expect(result.entries.some((m) => m.name === 'Goblin')).toBe(true);
		expect(result.entries.every((m) => m.name.toLowerCase().includes('goblin'))).toBe(true);
	});

	it('falls back on a non-2xx response', async () => {
		const fetchFn = vi.fn(async () => jsonResponse({ detail: 'boom' }, 500));
		const result = await searchSpells({ level: 0 }, { fetchFn });
		expect(result.source).toBe('bundled');
		expect(result.entries.every((s) => s.level === 0)).toBe(true);
	});

	it('falls back on a malformed body (no results array)', async () => {
		const fetchFn = vi.fn(async () => jsonResponse({ nothing: true }));
		const result = await searchMonsters({}, { fetchFn });
		expect(result.source).toBe('bundled');
	});

	it('re-throws an intentional abort instead of falling back', async () => {
		const abort = new DOMException('The operation was aborted.', 'AbortError');
		const fetchFn = vi.fn(async () => {
			throw abort;
		});
		await expect(searchMonsters({}, { fetchFn })).rejects.toBe(abort);
		expect(isAbortError(abort)).toBe(true);
		expect(isAbortError(new TypeError('fetch failed'))).toBe(false);
	});
});

// --- documents (the non-SRD opt-in) ----------------------------------------------------------------

describe('listDocuments', () => {
	it('pages through /v2/documents/ and surfaces each source license', async () => {
		const page1 = {
			count: 2,
			next: `${OPEN5E_API_BASE}/documents/?limit=100&page=2`,
			results: [
				{
					key: 'srd-2014',
					name: 'System Reference Document 5.1',
					display_name: '5e 2014 Rules',
					publisher: { name: 'Wizards of the Coast' },
					licenses: [{ name: 'Creative Commons Attribution 4.0', key: 'cc-by-40' }],
					permalink: 'https://dnd.wizards.com/resources/systems-reference-document',
				},
			],
		};
		const page2 = {
			count: 2,
			next: null,
			results: [
				{
					key: 'tob',
					name: 'Tome of Beasts',
					display_name: 'Tome of Beasts',
					publisher: { name: 'Kobold Press' },
					licenses: [{ name: 'OPEN GAME LICENSE Version 1.0a', key: 'ogl-10a' }],
					permalink: 'https://koboldpress.com/',
				},
			],
		};
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(page1))
			.mockResolvedValueOnce(jsonResponse(page2));
		const docs = await listDocuments({ fetchFn });
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(docs.map((d) => d.key)).toEqual(['srd-2014', 'tob']);
		expect(docs[1]!.licenses[0]!.name).toContain('OPEN GAME LICENSE');
		// The SRD keeps its canonical attribution; other documents get a composed one naming their license.
		expect(documentAttribution(docs[0]!)).toBe(SRD_ATTRIBUTION);
		expect(documentAttribution(docs[1]!)).toContain('OPEN GAME LICENSE Version 1.0a');
	});
});
