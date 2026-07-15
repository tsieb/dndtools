import type { SeededRng } from '../state/prng';

/**
 * MAP-021 — deterministic, dependency-free fantasy name generation.
 *
 * Research §3.11's design note is the whole point of this module: "the SAME name base must drive
 * settlement names, NPC names, and region names within one culture — that coherence is 90% of the
 * perceived quality". So the syllable inventory below is ONE shared phonology (a broadly
 * Anglo-Norse-fantasy one: `thorn`, `gray`, `moor`, `barrow`), and each `kind` composes it through a
 * different TEMPLATE rather than through a different sound world. That is why "Blackmoor" (settlement),
 * "Thornwood" (region) and "the Greywater" (river) read as places in one map instead of three.
 *
 * Everything is drawn from the injected {@link SeededRng} — no `Math.random`, no clock — so a name is a
 * pure function of `{seed, call order}` and replays byte-identically across devices (Contract 2).
 * Callers should take a dedicated `'names'` sub-stream so that nudging, say, the room count does not
 * rename every town on the map.
 */

export type NameKind = 'settlement' | 'region' | 'river' | 'person' | 'dungeon' | 'tavern';

/**
 * The shared phonology. Roots are the load-bearing morphemes ("thorn", "grey", "bram"); they are reused
 * across every kind, which is what makes the output feel like one culture rather than six generators.
 */
const ROOTS: readonly string[] = [
	'ash',
	'black',
	'bram',
	'briar',
	'cold',
	'crow',
	'dun',
	'east',
	'elder',
	'fal',
	'fen',
	'grey',
	'grim',
	'hallow',
	'hart',
	'haven',
	'hollow',
	'iron',
	'kel',
	'mar',
	'mor',
	'north',
	'oak',
	'raven',
	'red',
	'rook',
	'salt',
	'shad',
	'stone',
	'storm',
	'thorn',
	'thrush',
	'wend',
	'west',
	'white',
	'wick',
	'wolf',
	'wyn',
];

/** Terrain morphemes. A settlement is a root + a place-suffix; a region is a root + a land-suffix. */
const SETTLEMENT_SUFFIXES: readonly string[] = [
	'bury',
	'by',
	'combe',
	'cross',
	'dale',
	'ferry',
	'ford',
	'gate',
	'hollow',
	'holm',
	'ham',
	'haven',
	'keep',
	'mill',
	'moor',
	'reach',
	'stead',
	'ton',
	'wall',
	'watch',
	'well',
	'wick',
];

const REGION_SUFFIXES: readonly string[] = [
	'fell',
	'fen',
	'heath',
	'march',
	'mere',
	'moor',
	'reach',
	'ridge',
	'scar',
	'vale',
	'wald',
	'wold',
	'wood',
];

/** Region names are often a bare compound ("Thornwood") and often an "The X of Y" phrase. */
const REGION_HEADS: readonly string[] = [
	'Barrens',
	'Downs',
	'Expanse',
	'Fells',
	'Hinterlands',
	'Lowlands',
	'Marches',
	'Reaches',
	'Wastes',
	'Wilds',
];

const RIVER_SUFFIXES: readonly string[] = [
	'brook',
	'burn',
	'flow',
	'mere',
	'race',
	'run',
	'water',
	'wash',
];

const RIVER_HEADS: readonly string[] = ['Bend', 'Current', 'Ford', 'Narrows', 'Rapids', 'Torrent'];

/** Person names are built from syllables rather than morphemes so they read as names, not places. */
const PERSON_ONSETS: readonly string[] = [
	'b',
	'br',
	'c',
	'd',
	'dr',
	'f',
	'g',
	'gr',
	'h',
	'k',
	'l',
	'm',
	'n',
	'r',
	's',
	'sh',
	'st',
	't',
	'th',
	'v',
	'w',
];

const PERSON_NUCLEI: readonly string[] = ['a', 'ae', 'e', 'ea', 'i', 'ia', 'o', 'oa', 'u', 'y'];

const PERSON_CODAS: readonly string[] = [
	'',
	'',
	'l',
	'ld',
	'lm',
	'n',
	'nd',
	'r',
	'rd',
	'rn',
	's',
	'st',
	'th',
];

/** Bynames. A person is "Given" or "Given Surname"; the surname reuses the shared roots for coherence. */
const PERSON_SURNAME_SUFFIXES: readonly string[] = [
	'bane',
	'barrow',
	'brook',
	'crest',
	'fell',
	'hand',
	'helm',
	'mantle',
	'shade',
	'shield',
	'stride',
	'thorn',
	'ward',
	'wood',
];

const DUNGEON_ADJECTIVES: readonly string[] = [
	'Sunken',
	'Forgotten',
	'Shattered',
	'Weeping',
	'Silent',
	'Drowned',
	'Buried',
	'Hollow',
	'Cursed',
	'Broken',
	'Sundered',
	'Whispering',
	'Nameless',
	'Blighted',
];

const DUNGEON_NOUNS: readonly string[] = [
	'Barrow',
	'Crypt',
	'Vault',
	'Delve',
	'Warren',
	'Catacomb',
	'Undercroft',
	'Halls',
	'Sanctum',
	'Ossuary',
	'Reliquary',
	'Oubliette',
	'Keep',
	'Deep',
	'Hollow',
	'Labyrinth',
];

const TAVERN_ADJECTIVES: readonly string[] = [
	'Prancing',
	'Rusty',
	'Laughing',
	'Drunken',
	'Gilded',
	'Crooked',
	'Salty',
	'Sleeping',
	'Weary',
	'Brazen',
	'Silver',
	'Broken',
	'Dancing',
	'Wandering',
	'Bleeding',
	'Contented',
];

const TAVERN_NOUNS: readonly string[] = [
	'Sow',
	'Pony',
	'Griffon',
	'Tankard',
	'Anchor',
	'Lantern',
	'Crow',
	'Stag',
	'Dragon',
	'Boar',
	'Kettle',
	'Minstrel',
	'Hound',
	'Mermaid',
	'Axe',
	'Cask',
	'Wyvern',
	'Goat',
];

function capitalize(word: string): string {
	return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}

/** A CVC syllable from the person phonology. Kept separate so a "person" reads as a name, not a place. */
function personSyllable(rng: SeededRng): string {
	return rng.pick(PERSON_ONSETS) + rng.pick(PERSON_NUCLEI) + rng.pick(PERSON_CODAS);
}

function personGiven(rng: SeededRng): string {
	// Two syllables most of the time; one or three sometimes. A fixed two-syllable name generator is
	// the single most recognizable tell of a naive name generator.
	const syllables = rng.weighted([1, 2, 3], [2, 6, 2]);
	let name = '';
	for (let i = 0; i < syllables; i += 1) name += personSyllable(rng);
	// Collapse the vowel/consonant pileups a blind concatenation produces ("aea", "rdrn").
	name = name.replace(/([aeiouy])\1{1,}/g, '$1').replace(/(.)\1{2,}/g, '$1$1');
	return capitalize(name);
}

/**
 * Generate a name of the given kind. Deterministic in `rng`: the same cursor state and kind always
 * yields the same string, and the number of draws is a function of the kind only (never of a clock or
 * of ambient state), so a caller can reason about replay.
 */
export function generateName(rng: SeededRng, kind: NameKind): string {
	switch (kind) {
		case 'settlement': {
			// "Blackmoor", "Thornford" — a root + a place suffix, occasionally with an "Upper"/"Little"
			// qualifier, which is what stops a map of forty towns from reading as forty compounds.
			const base = capitalize(rng.pick(ROOTS) + rng.pick(SETTLEMENT_SUFFIXES));
			if (rng.chance(0.12)) {
				return `${rng.pick(['Upper', 'Lower', 'Little', 'Great', 'Old', 'New'])} ${base}`;
			}
			return base;
		}
		case 'region': {
			// Half compounds ("Thornwood"), half phrases ("The Grey Marches") — a region map wants both.
			if (rng.chance(0.45)) {
				const head = rng.pick(REGION_HEADS);
				const qualifier = capitalize(rng.pick(ROOTS));
				return `The ${qualifier} ${head}`;
			}
			return capitalize(rng.pick(ROOTS) + rng.pick(REGION_SUFFIXES));
		}
		case 'river': {
			// Rivers take the definite article — "the Greywater" — because that is how rivers are spoken
			// about at the table. A river called "Greywater" reads as a hamlet.
			if (rng.chance(0.2)) {
				return `The ${capitalize(rng.pick(ROOTS))} ${rng.pick(RIVER_HEADS)}`;
			}
			return `The ${capitalize(rng.pick(ROOTS) + rng.pick(RIVER_SUFFIXES))}`;
		}
		case 'person': {
			const given = personGiven(rng);
			if (rng.chance(0.55)) {
				const surname = capitalize(rng.pick(ROOTS) + rng.pick(PERSON_SURNAME_SUFFIXES));
				return `${given} ${surname}`;
			}
			return given;
		}
		case 'dungeon': {
			// "The Sunken Barrow" / "The Barrow of Thornfell" — the second form implies a history.
			if (rng.chance(0.3)) {
				const noun = rng.pick(DUNGEON_NOUNS);
				const of = capitalize(rng.pick(ROOTS) + rng.pick(REGION_SUFFIXES));
				return `The ${noun} of ${of}`;
			}
			return `The ${rng.pick(DUNGEON_ADJECTIVES)} ${rng.pick(DUNGEON_NOUNS)}`;
		}
		case 'tavern': {
			// Adjective + noun is the entire genre. The "X and Y" form is the other half of it.
			if (rng.chance(0.25)) {
				const a = rng.pick(TAVERN_NOUNS);
				let b = rng.pick(TAVERN_NOUNS);
				if (b === a) b = rng.pick(TAVERN_NOUNS.filter((noun) => noun !== a));
				return `The ${a} & ${b}`;
			}
			return `The ${rng.pick(TAVERN_ADJECTIVES)} ${rng.pick(TAVERN_NOUNS)}`;
		}
	}
}

/**
 * Generate `count` DISTINCT names of one kind. A map with two towns called Blackmoor is a bug the user
 * always notices, and rejection-sampling here keeps every caller from reimplementing the same loop.
 * Bounded retries: after `count * 12` attempts it disambiguates by ordinal rather than looping forever
 * on a small kind vocabulary.
 */
export function generateNames(rng: SeededRng, kind: NameKind, count: number): string[] {
	const seen = new Set<string>();
	const names: string[] = [];
	const maxAttempts = Math.max(1, count) * 12;
	let attempts = 0;
	while (names.length < count && attempts < maxAttempts) {
		attempts += 1;
		const candidate = generateName(rng, kind);
		if (seen.has(candidate)) continue;
		seen.add(candidate);
		names.push(candidate);
	}
	while (names.length < count) {
		// Deterministic fallback — never a clock, never a random retry.
		const candidate = `${generateName(rng, kind)} ${romanNumeral(names.length + 1)}`;
		if (!seen.has(candidate)) {
			seen.add(candidate);
			names.push(candidate);
		} else {
			names.push(`${candidate}-${names.length}`);
		}
	}
	return names;
}

const ROMAN: ReadonlyArray<[number, string]> = [
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I'],
];

function romanNumeral(value: number): string {
	let remaining = Math.max(1, Math.trunc(value));
	let out = '';
	for (const [amount, symbol] of ROMAN) {
		while (remaining >= amount) {
			out += symbol;
			remaining -= amount;
		}
	}
	return out;
}
