import type { SeededRng } from '../state/prng';
import type { MapPoiCategory } from '../state/map-annotations';
import type { GeneratedGraph, GeneratedPoi } from './types';
import { norm } from './types';
import { generateName } from './names';

/**
 * MAP-021 — CONTENT STOCKING: turn a room graph into a keyed dungeon.
 *
 * The donjon lesson, verbatim from research §8.1: "donjon's breadth is not in map algorithms — it's that
 * every map generator is paired with content generators. A dungeon with keyed rooms and a stocked
 * encounter table is worth 10x a dungeon that's just walls." That is the entire justification for this
 * file. It is almost pure data, and it is the difference between a picture a GM admires and a dungeon a
 * GM can run tonight.
 *
 * The one piece of real logic here is KEY/LOCK ORDERING. A locked door whose key sits behind it is not a
 * puzzle, it is a bug, and it is the single failure that makes a generated dungeon unrunnable. So keys
 * are not scattered at random and hoped over: {@link stockDungeon} walks the graph outward from the
 * entrance and places each key in a room that is ALREADY REACHABLE at the moment its lock is introduced.
 * The construction makes an unreachable key impossible rather than unlikely.
 *
 * Determinism: every draw comes from the injected {@link SeededRng}, in a fixed order. Callers should use
 * a dedicated `'stocking'` sub-stream so re-rolling the contents does not redraw the map, and nudging the
 * map's geometry does not reroll the contents.
 */

/** The thematic lens the contents are drawn through. Research §1.7 — donjon's "Motif" knob. */
export type Motif =
	| 'abandoned'
	| 'undead'
	| 'goblinoid'
	| 'cult'
	| 'beast'
	| 'aberrant'
	| 'elemental'
	| 'fey'
	| 'construct'
	| 'bandit';

export const MOTIFS: readonly Motif[] = Object.freeze([
	'abandoned',
	'undead',
	'goblinoid',
	'cult',
	'beast',
	'aberrant',
	'elemental',
	'fey',
	'construct',
	'bandit',
]);

export interface StockOptions {
	motif: Motif;
	/** Party level, 1–20. Scales encounter size and treasure value. */
	level: number;
	/** 0..1 — how much of the dungeon is occupied. 0 is an empty ruin; 1 is a fully-garrisoned lair. */
	density: number;
}

/** One keyed room. Retained alongside the flat `notes` so callers can drive UI off the structure. */
export interface StockedRoom {
	nodeId: string;
	/** 1-based dungeon key number, assigned in breadth-first order from the entrance. */
	number: number;
	role: string;
	title: string;
	body: string;
	encounter: string | null;
	treasure: string | null;
	hazard: string | null;
	/** The key item this room contains, when a lock elsewhere depends on it. */
	keyItem: string | null;
}

/** A locked chokepoint and the room its key was placed in. */
export interface StockedLock {
	from: string;
	to: string;
	keyItem: string;
	/** The room holding the key. GUARANTEED reachable from the entrance without crossing this lock. */
	keyNodeId: string;
}

export interface StockResult {
	notes: Array<{ key: string; title: string; body: string }>;
	pois: GeneratedPoi[];
	rooms: StockedRoom[];
	locks: StockedLock[];
}

/* ------------------------------------------------------------------------------------------------ */
/* Motif tables                                                                                      */
/* ------------------------------------------------------------------------------------------------ */

interface MotifTable {
	label: string;
	/** Atmosphere fragments. One is drawn per room; they carry the theme more than the monsters do. */
	atmosphere: readonly string[];
	/** Denizens as `[name, weight, minLevel]`. `minLevel` gates the nastier entries out of low levels. */
	denizens: ReadonlyArray<readonly [string, number, number]>;
	bosses: readonly string[];
	hazards: readonly string[];
	features: readonly string[];
	trinkets: readonly string[];
}

const MOTIF_TABLES: Readonly<Record<Motif, MotifTable>> = Object.freeze({
	abandoned: {
		label: 'Abandoned',
		atmosphere: [
			'Dust lies undisturbed across the floor, thick enough to hold a footprint.',
			'A slow drip somewhere out of sight marks time. Nothing else moves.',
			'The ceiling has partly collapsed; daylight has never reached the rubble beneath.',
			'Furniture rots where it was left, as though everyone stepped out and never came back.',
			'Cobwebs hang in grey sheets and part reluctantly.',
		],
		denizens: [
			['a swarm of rats', 5, 1],
			['three giant centipedes', 4, 1],
			['a pair of stirges', 3, 1],
			['a rust monster nosing at the ironwork', 2, 3],
			['a gelatinous cube filling the passage', 1, 5],
		],
		bosses: [
			'a mad hermit who has lived down here for years, and does not believe the surface still exists',
			'an ochre jelly grown vast on the leavings of the dead',
		],
		hazards: [
			'the floor here is rotten and gives way under weight',
			'a section of ceiling is one tremor from coming down',
			'the air is foul and stale; lingering brings on a crushing headache',
		],
		features: [
			'a toppled statue, its face deliberately chiselled away',
			'a mural, half-flaked, showing a procession toward something the damage has erased',
			'a dry fountain choked with dead leaves that could not have blown this deep',
		],
		trinkets: [
			'a tarnished signet ring',
			'a water-stained ledger in a dead hand',
			'a child’s wooden horse',
		],
	},
	undead: {
		label: 'Undead',
		atmosphere: [
			'The cold here is wrong — it does not come from the stone.',
			'Grave-earth has been tracked across the floor in a long, shuffling trail.',
			'Candle stubs stand in every niche, all of them burnt out, none of them melted.',
			'The walls are lined with burial shelves, and several are empty.',
			'A faint chorus of whispering stops the moment anyone listens for it.',
		],
		denizens: [
			['four skeletons rising from the floor', 5, 1],
			['a pair of zombies, slow and patient', 5, 1],
			['a ghoul crouched over its work', 3, 2],
			['a wight and its two skeletal thralls', 2, 5],
			['a wraith seeping from the wall', 1, 7],
		],
		bosses: [
			'a lich’s apprentice, still faithfully tending an experiment its master abandoned',
			'a mummified priest-king who will demand to know why its tomb was opened',
		],
		hazards: [
			'a glyph of warding, worked into the threshold and still live',
			'the sarcophagus is trapped; opening it releases a gout of grave-gas',
			'a curse hangs over the room: anything taken from it must be given back, or worse',
		],
		features: [
			'an altar of black basalt, its channels still faintly wet',
			'a wall of names, chiselled small, running floor to ceiling and continuing behind the plaster',
			'a bier bearing a body that has not decayed at all',
		],
		trinkets: [
			'a jawless skull set with garnets',
			'a funerary mask of beaten silver',
			'a bone flute',
		],
	},
	goblinoid: {
		label: 'Goblinoid',
		atmosphere: [
			'The stink of unwashed bodies and old cookfires is immediate.',
			'Crude tally-marks are scratched by the door, hundreds of them.',
			'Bones — not all of them animal — have been swept into a corner.',
			'Someone has painted a leering face on the far wall in something brown.',
			'Filthy bedding is heaped against the walls, still warm.',
		],
		denizens: [
			['five goblins, squabbling', 5, 1],
			['a hobgoblin drilling three goblins into ragged order', 4, 2],
			['two bugbears lying in ambush', 3, 3],
			['a goblin boss and its bodyguard', 3, 2],
			['a worg and its handler', 2, 3],
		],
		bosses: [
			'a hobgoblin warlord who has read more books than the party has, and will say so',
			'a bugbear chieftain wearing a stolen breastplate two sizes too small',
		],
		hazards: [
			'a pit trap, crudely covered, with sharpened stakes at the bottom',
			'a net trap rigged to the doorframe',
			'a tripwire strung to a bell three rooms deep',
		],
		features: [
			'a war-drum made from a shield and a hide',
			'a shrine to a goblin god, built from spoons',
			'a cage, its bars bent outward from the inside',
		],
		trinkets: [
			'a stolen locket',
			'a captain’s commission, much folded',
			'a bag of mismatched teeth',
		],
	},
	cult: {
		label: 'Cult',
		atmosphere: [
			'The same sigil has been repeated on every surface, in every size.',
			'Incense has soaked into the stone; the smell is sweet and faintly rotten.',
			'Robes hang on pegs by the door, all of them identical.',
			'Chalk lines cross the floor in a pattern that is nearly, but not quite, symmetrical.',
			'A hymn is being sung somewhere below, and it does not pause for breath.',
		],
		denizens: [
			['three robed cultists mid-rite', 5, 1],
			['a cult fanatic and two acolytes', 4, 2],
			['a pair of hooded knife-men who do not speak', 3, 2],
			['a summoned imp, bored and chatty', 2, 3],
			['a cult priest completing a binding', 1, 5],
		],
		bosses: [
			'the cult’s founder, entirely sincere, entirely reasonable, and entirely wrong',
			'a possessed high priest whose voice arrives a half-second before their mouth moves',
		],
		hazards: [
			'a summoning circle, still charged — breaking the chalk breaks the binding',
			'a poisoned chalice left ready on the altar',
			'the room is warded: anyone bearing holy symbols takes searing pain crossing the threshold',
		],
		features: [
			'an idol of something with too many joints',
			'a reliquary containing a preserved hand, still warm',
			'a ledger of tithes naming three well-known townsfolk',
		],
		trinkets: [
			'a brass holy symbol, inverted',
			'a vial of dark oil',
			'a bound prayer-book in no known script',
		],
	},
	beast: {
		label: 'Beast lair',
		atmosphere: [
			'The floor is churned mud and bedding-straw; the smell is rank and animal.',
			'Claw-marks score the stone at shoulder height.',
			'A midden of gnawed bones fills half the chamber.',
			'Territorial spraying has stained the walls in overlapping arcs.',
			'Something very large sleeps here, and the depression it leaves is still warm.',
		],
		denizens: [
			['a pack of four wolves', 5, 1],
			['a giant spider dropping from the ceiling', 4, 1],
			['two dire boars', 3, 2],
			['a cave bear, woken and furious', 3, 3],
			['an owlbear, mid-meal', 2, 3],
		],
		bosses: [
			'a matriarch owlbear defending a nest of three eggs',
			'a young wyvern that has claimed the deepest chamber as a roost',
		],
		hazards: [
			'a natural fissure crosses the floor, wide enough to swallow a leg',
			'the nest is defended: disturbing it brings the pack back at a run',
			'spores drift from a shelf of pale fungus and burn the throat',
		],
		features: [
			'a nest woven from cloth, rope, and one very fine tapestry',
			'a half-buried skeleton in plate armour, the breastplate crumpled inward',
			'a spring of cold, clean water — the reason the lair is here at all',
		],
		trinkets: ['a splintered shield boss', 'a saddlebag, chewed open', 'a hunting horn'],
	},
	aberrant: {
		label: 'Aberrant',
		atmosphere: [
			'The geometry of the room is subtly wrong; the corners do not total what they should.',
			'Every surface is faintly damp with a fluid that is not water.',
			'Sound arrives late here, and from the wrong direction.',
			'The walls are ridged like the inside of something’s throat.',
			'Everyone present shares, briefly and without comment, the same intrusive thought.',
		],
		denizens: [
			['a gibbering mouther, flowing across the floor', 3, 3],
			['two grimlocks that hunt by sound alone', 4, 2],
			['a cloaker hanging among the shadows of the vault', 2, 5],
			['a pair of intellect devourers', 2, 5],
			['a mind flayer thrall, hollow-eyed and still obedient', 3, 4],
		],
		bosses: [
			'a mind flayer, mildly disappointed in the party’s cognitive potential',
			'an aboleth in a flooded cistern, which already knows their names',
		],
		hazards: [
			'a psychic residue clings here; sleeping in this room means not waking as quite the same person',
			'the floor is a membrane, and it flexes',
			'a pool of colourless liquid dissolves organic matter on contact',
		],
		features: [
			'a mirror that shows the room a half-second before anything happens in it',
			'a lump of unworked stone that everyone independently describes as looking back',
			'writing that changes language every time it is read',
		],
		trinkets: [
			'a smooth, warm stone that hums',
			'a lens of black glass',
			'a preserved brain in a jar',
		],
	},
	elemental: {
		label: 'Elemental',
		atmosphere: [
			'The heat is immediate and dry, and the stone ticks as it expands.',
			'Rime coats every surface; breath fogs and hangs.',
			'A wind blows steadily here, and there is nowhere for it to come from.',
			'Water sheets down the walls and drains away through no visible outlet.',
			'The air tastes of struck flint.',
		],
		denizens: [
			['four mephits, delighted to see anyone', 5, 1],
			['a pair of magma mephits guarding the vent', 4, 2],
			['an earth elemental sliding out of the wall', 3, 5],
			['two azers at a forge', 3, 4],
			['a water weird coiled in the cistern', 2, 4],
		],
		bosses: [
			'a bound fire elemental, and the increasingly frayed sigil holding it',
			'an efreeti who will happily bargain, and will happily cheat',
		],
		hazards: [
			'a vent of scalding steam cycles open every few breaths',
			'the floor is glare-ice over a drop',
			'a whirling column of air fills the chamber’s centre and will not be reasoned with',
		],
		features: [
			'a forge that has never gone out',
			'a rift in the wall opening onto somewhere that is not here',
			'a font of elemental water that never overflows and never empties',
		],
		trinkets: [
			'a fire-opal, warm to the touch',
			'a shard of never-melting ice',
			'a stone that will not fall',
		],
	},
	fey: {
		label: 'Fey',
		atmosphere: [
			'Moss and pale flowers grow where no light reaches.',
			'Someone is laughing, always just around the next corner.',
			'The room smells of cut grass and, underneath, of blood.',
			'Time here is slippery; the candles have burned down further than they should have.',
			'Ribbons hang from the ceiling, each one tied round a small bone.',
		],
		denizens: [
			['a knot of six pixies, none of them honest', 4, 1],
			['two blink dogs, wary but not hostile', 3, 2],
			['a redcap sharpening something', 3, 3],
			['a dryad and her furious oak', 2, 3],
			['a satyr running an unwinnable game of chance', 3, 2],
		],
		bosses: [
			'an archfey’s exiled courtier, who wants only to be invited home',
			'a green hag who has been expecting them, and has set out three cups',
		],
		hazards: [
			'a fairy ring; step inside and step out somewhere else',
			'a bargain is offered, and refusing it is itself an answer',
			'the food and drink here are excellent, and eating them is a mistake',
		],
		features: [
			'a door of woven briar that only opens for the polite',
			'a still pool that reflects a season other than this one',
			'a table set for a feast, everything still hot, no one there',
		],
		trinkets: [
			'an acorn that will not be cracked',
			'a key of green glass',
			'a written promise, signed',
		],
	},
	construct: {
		label: 'Construct',
		atmosphere: [
			'Machinery turns somewhere behind the walls, unhurried and exact.',
			'The floor is inlaid with brass tracks, worn bright by long use.',
			'Everything is clean. Nothing has been cleaned in a century.',
			'Identical alcoves line the wall, and most of them are occupied.',
			'A voice recites an inventory, in order, forever.',
		],
		denizens: [
			['four animated armours stepping down from their alcoves', 4, 2],
			['a pair of flying swords on patrol', 4, 1],
			['a clay golem, dormant until it is not', 2, 6],
			['a helmed horror executing standing orders', 3, 4],
			['a rug of smothering, indistinguishable from a rug', 3, 2],
		],
		bosses: [
			'a warforged custodian who has kept this place spotless since its makers died',
			'a stone golem that will not permit the vault door to be approached, and cannot be reasoned with',
		],
		hazards: [
			'a scything blade trap, still oiled, still perfectly maintained',
			'the corridor floor is a pressure plate, and the mechanism it drives is enormous',
			'an arcane turret tracks anyone who crosses the room without the proper token',
		],
		features: [
			'a workbench mid-project, tools laid out in order',
			'a wall of gears that displays, on request, an accurate map of this floor',
			'a rack of inert constructs awaiting a command word',
		],
		trinkets: ['a brass command-token', 'a schematic on oiled linen', 'a gear of unfamiliar alloy'],
	},
	bandit: {
		label: 'Bandit',
		atmosphere: [
			'A cookfire smoulders; someone left in a hurry.',
			'Stolen goods are stacked without any attempt at concealment.',
			'A crude map of the local roads is nailed to the wall, with three crosses on it.',
			'Someone is snoring, loudly, from a bedroll in the corner.',
			'Playing cards lie scattered across an upturned crate, mid-hand.',
		],
		denizens: [
			['four bandits, dicing and off-guard', 5, 1],
			['a bandit captain and two thugs', 4, 2],
			['a scout on the roof, and she has already seen them', 3, 2],
			['two guard dogs, chained but not securely', 3, 1],
			['a veteran deserter who wants no part of this', 2, 3],
		],
		bosses: [
			'the gang’s captain, who will offer them a job before offering them violence',
			'a spy running the whole operation for someone in town whose name is worth more than the loot',
		],
		hazards: [
			'a crossbow trap rigged to the strongbox lid',
			'a caltrop-strewn corridor, laid in the dark',
			'the ceiling beam is sawn through and roped — they intend to drop it',
		],
		features: [
			'a strongbox, still locked, and lighter than it looks',
			'a hostage, gagged, and not who they claim to be',
			'a tunnel out, freshly dug and badly shored',
		],
		trinkets: ['a purse of mixed coin', 'a merchant’s seal', 'a letter of safe passage, forged'],
	},
});

/** The key items a lock can want. Chosen so the room text can name the thing without a lookup table. */
const KEY_ITEMS: readonly string[] = [
	'an iron key on a leather thong',
	'a heavy brass key, green with age',
	'a bone key carved with a single rune',
	'a key of blackened steel',
	'a bronze key stamped with a crest',
	'a small silver key, warm to the touch',
];

/** Loot lines by tier. Level drives the tier, so a level-1 room never contains a dragon's hoard. */
function treasureLine(rng: SeededRng, level: number, motif: Motif): string {
	const table = MOTIF_TABLES[motif];
	const coins = Math.max(1, Math.round(level * rng.nextInt(8, 22)));
	const tier = level <= 4 ? 0 : level <= 10 ? 1 : 2;
	const goods = [
		[
			`${coins} sp in a stained pouch`,
			`${coins} cp and ${table.trinkets[0]}`,
			`a set of tools worth ${coins} sp`,
		],
		[
			`${coins} gp and ${rng.pick(table.trinkets)}`,
			`a gemstone worth ${coins * 2} gp, and a potion of healing`,
			`${coins} gp, plus a scroll the party cannot yet read`,
		],
		[
			`${coins * 3} gp, ${rng.pick(table.trinkets)}, and a minor magic item`,
			`a hoard: ${coins * 5} gp, two gems, and a wand with three charges left`,
			`${coins * 4} gp in old mint, and an item someone will come looking for`,
		],
	][tier]!;
	return rng.pick(goods);
}

function encounterLine(rng: SeededRng, level: number, motif: Motif): string {
	const table = MOTIF_TABLES[motif];
	const eligible = table.denizens.filter(([, , minLevel]) => minLevel <= level);
	const pool = eligible.length > 0 ? eligible : table.denizens;
	// `pool` is derived by FILTER (order-preserving), never by a Set — the draw below must be replayable.
	const picked = rng.weighted(
		pool.map(([name]) => name),
		pool.map(([, weight]) => weight),
	);
	return picked;
}

/* ------------------------------------------------------------------------------------------------ */
/* Graph walking                                                                                     */
/* ------------------------------------------------------------------------------------------------ */

interface Adjacency {
	/** nodeId -> list of [neighbourId, edgeIndex]. Built in edge order; iteration order is stable. */
	map: Map<string, Array<[string, number]>>;
}

function buildAdjacency(graph: GeneratedGraph): Adjacency {
	const map = new Map<string, Array<[string, number]>>();
	for (const node of graph.nodes) map.set(node.id, []);
	graph.edges.forEach((edge, index) => {
		if (edge.kind !== 'corridor') return; // A secret edge is a rejected candidate, not a way through.
		map.get(edge.from)?.push([edge.to, index]);
		map.get(edge.to)?.push([edge.from, index]);
	});
	return { map };
}

/** Breadth-first reach from `start`, refusing to cross any edge index in `blocked`. */
function reachable(adjacency: Adjacency, start: string, blocked: ReadonlySet<number>): Set<string> {
	const seen = new Set<string>([start]);
	const queue: string[] = [start];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const [next, edgeIndex] of adjacency.map.get(current) ?? []) {
			if (blocked.has(edgeIndex)) continue;
			if (seen.has(next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}
	return seen;
}

/** Breadth-first ORDER (not just the set) plus the depth of each node. Depth 0 is the entrance. */
function breadthFirst(
	adjacency: Adjacency,
	start: string,
): { order: string[]; depth: Map<string, number> } {
	const depth = new Map<string, number>([[start, 0]]);
	const order: string[] = [start];
	const queue: string[] = [start];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const [next] of adjacency.map.get(current) ?? []) {
			if (depth.has(next)) continue;
			depth.set(next, (depth.get(current) ?? 0) + 1);
			order.push(next);
			queue.push(next);
		}
	}
	return { order, depth };
}

/**
 * Place a lock on each chokepoint edge and a key for it in a room that is ALREADY REACHABLE.
 *
 * The construction is what guarantees the property, so it is worth stating: locks are opened one at a
 * time, outward from the entrance. At each step we look only at chokepoints on the CURRENT frontier
 * (one endpoint inside the reachable set, one outside), and we draw that lock's key from the rooms that
 * are reachable RIGHT NOW — i.e. from rooms the party can already stand in without opening this lock or
 * any lock still shut. Then we open it and expand.
 *
 * A key can therefore never end up behind its own lock, and it can never end up behind a mutually
 * deadlocked PAIR of locks either (the naive "just put it on the entrance side" rule permits exactly
 * that: two branches, each holding the other's key). Both failures are impossible by construction rather
 * than merely unlikely, which is why this is a frontier walk and not a filter.
 */
function placeLocks(graph: GeneratedGraph, entranceId: string, rng: SeededRng): StockedLock[] {
	const adjacency = buildAdjacency(graph);
	const chokepoints: number[] = [];
	graph.edges.forEach((edge, index) => {
		if (edge.kind === 'corridor' && edge.chokepoint === true) chokepoints.push(index);
	});
	if (chokepoints.length === 0) return [];

	const { depth } = breadthFirst(adjacency, entranceId);
	const unopened = new Set<number>(chokepoints);
	const locks: StockedLock[] = [];

	while (unopened.size > 0) {
		const accessible = reachable(adjacency, entranceId, unopened);

		// Frontier locks, collected by walking `chokepoints` in its FIXED array order (never the Set) so
		// the tie-break and the draw below are replayable.
		const frontier = chokepoints.filter((index) => {
			if (!unopened.has(index)) return false;
			const edge = graph.edges[index]!;
			return accessible.has(edge.from) || accessible.has(edge.to);
		});
		if (frontier.length === 0) break; // Everything left is behind an unreachable region; nothing to lock.

		// Shallowest first, so keys are handed out in the order a party would meet the doors.
		let chosen = frontier[0]!;
		let chosenDepth = Infinity;
		for (const index of frontier) {
			const edge = graph.edges[index]!;
			const near = accessible.has(edge.from) ? edge.from : edge.to;
			const d = depth.get(near) ?? Number.MAX_SAFE_INTEGER;
			if (d < chosenDepth) {
				chosenDepth = d;
				chosen = index;
			}
		}

		// Candidate key rooms: everything currently reachable. Sorted into a stable array first — drawing
		// from a Set's iteration order would make the whole dungeon dependent on insertion history.
		const candidates = graph.nodes.filter((node) => accessible.has(node.id)).map((node) => node.id);
		const preferred = candidates.filter((id) => id !== entranceId);
		const pool = preferred.length > 0 ? preferred : candidates;

		const keyNodeId = rng.pick(pool);
		const keyItem = rng.pick(KEY_ITEMS);
		const edge = graph.edges[chosen]!;
		locks.push({ from: edge.from, to: edge.to, keyItem, keyNodeId });
		unopened.delete(chosen);
	}

	return locks;
}

/* ------------------------------------------------------------------------------------------------ */
/* Stocking                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

const ROLE_TITLES: Readonly<Record<string, string>> = Object.freeze({
	entrance: 'Entrance',
	boss: 'Inner Sanctum',
	treasure: 'Vault',
	guard: 'Guard Post',
	shrine: 'Shrine',
	storage: 'Storeroom',
	room: 'Chamber',
});

const POI_CATEGORY_BY_ROLE: Readonly<Record<string, MapPoiCategory>> = Object.freeze({
	entrance: 'landmark',
	boss: 'quest',
	treasure: 'quest',
	shrine: 'landmark',
	guard: 'hazard',
});

/**
 * Key every room in the graph: a paragraph of description, an encounter drawn from the motif and scaled
 * to the party level, a treasure line, and a hazard or feature. Chokepoints become locked doors whose
 * keys are placed earlier in the walk (see {@link placeLocks}).
 */
export function stockDungeon(
	graph: GeneratedGraph,
	rng: SeededRng,
	options: StockOptions,
): StockResult {
	const table = MOTIF_TABLES[options.motif];
	const level = Math.max(1, Math.min(20, Math.round(options.level)));
	const density = Math.max(0, Math.min(1, options.density));

	if (graph.nodes.length === 0) return { notes: [], pois: [], rooms: [], locks: [] };

	const entrance = graph.nodes.find((node) => node.role === 'entrance') ?? graph.nodes[0]!;
	const adjacency = buildAdjacency(graph);
	const { order } = breadthFirst(adjacency, entrance.id);

	// Rooms the graph does not connect to the entrance still have to be keyed — a disconnected node is a
	// generator bug, but silently dropping its contents turns that bug into a missing room at the table.
	const numbering = [...order];
	for (const node of graph.nodes) if (!numbering.includes(node.id)) numbering.push(node.id);

	const locks = placeLocks(graph, entrance.id, rng);
	const keysByRoom = new Map<string, string[]>();
	for (const lock of locks) {
		const existing = keysByRoom.get(lock.keyNodeId);
		if (existing) existing.push(lock.keyItem);
		else keysByRoom.set(lock.keyNodeId, [lock.keyItem]);
	}

	const byId = new Map(graph.nodes.map((node) => [node.id, node]));
	const rooms: StockedRoom[] = [];
	const pois: GeneratedPoi[] = [];

	for (let i = 0; i < numbering.length; i += 1) {
		const node = byId.get(numbering[i]!);
		if (!node) continue;
		const number = i + 1;
		const role = node.role || 'room';

		// PRNG call order per room is FIXED — atmosphere, encounter, treasure, hazard/feature — and every
		// draw happens unconditionally-or-not in a shape that depends only on the role and the params,
		// never on a clock or on iteration order.
		const atmosphere = rng.pick(table.atmosphere);

		let encounter: string | null = null;
		let treasure: string | null = null;
		let hazard: string | null = null;

		switch (role) {
			case 'entrance':
				// The entrance is where the party gets its bearings; ambushing them on the doormat is bad form.
				if (rng.chance(density * 0.3)) encounter = encounterLine(rng, level, options.motif);
				break;
			case 'boss':
				encounter = rng.pick(table.bosses);
				treasure = treasureLine(rng, level + 2, options.motif);
				break;
			case 'treasure':
				treasure = treasureLine(rng, level + 3, options.motif);
				// A hoard nobody guards is a hoard somebody already took.
				hazard = rng.pick(table.hazards);
				if (rng.chance(density)) encounter = encounterLine(rng, level, options.motif);
				break;
			case 'guard':
				encounter = encounterLine(rng, level, options.motif);
				if (rng.chance(density * 0.5)) treasure = treasureLine(rng, level, options.motif);
				break;
			case 'shrine':
				if (rng.chance(density * 0.6)) encounter = encounterLine(rng, level, options.motif);
				if (rng.chance(0.5)) treasure = treasureLine(rng, level, options.motif);
				break;
			case 'storage':
				if (rng.chance(density * 0.4)) encounter = encounterLine(rng, level, options.motif);
				if (rng.chance(0.7)) treasure = treasureLine(rng, level - 1, options.motif);
				break;
			default:
				if (rng.chance(density)) encounter = encounterLine(rng, level, options.motif);
				if (rng.chance(density * 0.6)) treasure = treasureLine(rng, level, options.motif);
				if (rng.chance(density * 0.35)) hazard = rng.pick(table.hazards);
				break;
		}

		const detail = rng.pick(table.features);
		const keyItems = keysByRoom.get(node.id) ?? [];

		const lines: string[] = [`${atmosphere} There is ${detail}.`];
		if (encounter) lines.push(`**Encounter:** ${capitalizeFirst(encounter)}.`);
		if (treasure) lines.push(`**Treasure:** ${capitalizeFirst(treasure)}.`);
		if (hazard) lines.push(`**Hazard:** ${capitalizeFirst(hazard)}.`);
		for (const keyItem of keyItems) {
			// Not capitalized, deliberately: the item string is an IDENTIFIER a caller may want to match
			// against `StockedLock.keyItem` (to cross-link the key to the door it opens), and it reads fine
			// after the label anyway.
			lines.push(`**Key:** ${keyItem} — it opens a locked door deeper in.`);
		}

		const title = `${number}. ${ROLE_TITLES[role] ?? capitalizeFirst(role)}`;
		const body = lines.join('\n\n');

		rooms.push({
			nodeId: node.id,
			number,
			role,
			title,
			body,
			encounter,
			treasure,
			hazard,
			keyItem: keyItems.length > 0 ? keyItems[0]! : null,
		});

		const category = POI_CATEGORY_BY_ROLE[role];
		if (category) {
			pois.push({
				id: `${node.id}-poi`,
				label: title,
				category,
				position: { x: norm(node.position.x), y: norm(node.position.y) },
				notes: body,
			});
		}
	}

	const notes = rooms.map((room) => ({ key: room.nodeId, title: room.title, body: room.body }));
	return { notes, pois, rooms, locks };
}

/* ------------------------------------------------------------------------------------------------ */
/* Wilderness                                                                                        */
/* ------------------------------------------------------------------------------------------------ */

/** A site the region generator dropped on the map and wants content for. */
export interface RegionSite {
	id: string;
	position: { x: number; y: number };
	/** Optional pre-assigned label. When absent, one is generated. */
	label?: string;
	category?: MapPoiCategory;
}

export interface StockRegionOptions {
	/** The region's dominant threat. Drives the hooks the same way a dungeon's motif drives its rooms. */
	motif: Motif;
	level: number;
	density: number;
}

/** The kinds of thing a wilderness POI turns out to be, from research §5.3's `typeWeights`. */
const SITE_KINDS: ReadonlyArray<readonly [string, MapPoiCategory, number]> = Object.freeze([
	['a ruined watchtower', 'landmark', 4],
	['a barrow mound, recently disturbed', 'dungeon', 3],
	['a roadside shrine', 'landmark', 4],
	['a cave mouth exhaling cold air', 'dungeon', 4],
	['an abandoned mine head', 'dungeon', 3],
	['a ring of standing stones', 'landmark', 3],
	['a battlefield gone to grass', 'landmark', 2],
	['a hermit’s hut', 'npc', 2],
	['a woodcutter’s camp, lately empty', 'quest', 2],
	['a sinkhole with worked stone at its lip', 'dungeon', 2],
]);

const REGION_HOOKS: readonly string[] = [
	'Locals will not go within a mile of it after dark, and will not say why.',
	'Something has been taking livestock, and the trail ends here.',
	'A rival party came this way a tenday ago and has not come back.',
	'Whoever built it wanted it found. Whoever sealed it did not.',
	'There is a reward posted for anyone who clears it, and it has been posted a long time.',
	'The last person to come back from here has not spoken since.',
	'A merchant will pay well for what is inside, and will not say how they know it is there.',
];

/**
 * Stock a wilderness region: give every seeded site a name, a nature, and a HOOK — the sentence that
 * tells a GM why the party would go there. A POI with no hook is a dot on a map; the hook is the content.
 */
export function stockRegion(
	sites: readonly RegionSite[],
	rng: SeededRng,
	options: StockRegionOptions,
): StockResult {
	const table = MOTIF_TABLES[options.motif];
	const level = Math.max(1, Math.min(20, Math.round(options.level)));
	const density = Math.max(0, Math.min(1, options.density));

	const pois: GeneratedPoi[] = [];
	const notes: Array<{ key: string; title: string; body: string }> = [];

	for (const site of sites) {
		const [nature, defaultCategory] = rng.weighted(
			SITE_KINDS.map((entry) => [entry[0], entry[1]] as const),
			SITE_KINDS.map((entry) => entry[2]),
		);
		const label = site.label ?? generateName(rng, 'dungeon');
		const hook = rng.pick(REGION_HOOKS);
		const inhabitant = rng.chance(density)
			? `**Inhabited by:** ${capitalizeFirst(encounterLine(rng, level, options.motif))}.`
			: null;
		const spoil = rng.chance(density * 0.7)
			? `**Rumoured spoils:** ${capitalizeFirst(treasureLine(rng, level, options.motif))}.`
			: null;

		const body = [
			`${label} is ${nature}. ${hook}`,
			inhabitant,
			spoil,
			`The ${table.label.toLowerCase()} influence over this region is unmistakable here.`,
		]
			.filter((line): line is string => line !== null)
			.join('\n\n');

		notes.push({ key: site.id, title: label, body });
		pois.push({
			id: site.id,
			label,
			category: site.category ?? defaultCategory,
			position: { x: norm(site.position.x), y: norm(site.position.y) },
			notes: body,
		});
	}

	return { notes, pois, rooms: [], locks: [] };
}

function capitalizeFirst(text: string): string {
	return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}
