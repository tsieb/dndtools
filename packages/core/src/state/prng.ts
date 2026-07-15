/**
 * MAP-004 — a deterministic, seeded pseudo-random number generator.
 *
 * This is a hard requirement for Contract 2 (Cloud Sync & Offline Model): procedural map generation
 * must produce BYTE-IDENTICAL output for the same parameters on every device, so a generate command
 * can be replayed/merged across devices. The generator therefore relies on NOTHING ambient — no
 * `Math.random()`, no `Date.now()`, no global state. The whole state is the 32-bit `seed`, advanced
 * by a small, fast, well-distributed integer hash (mulberry32). Given the same seed sequence, every
 * consumer gets the same stream.
 *
 * The PRNG is a pure value: each call returns the next number AND the next generator, so callers thread
 * the generator explicitly and never share mutable hidden state (which would re-introduce
 * nondeterminism under interleaving). A mutable cursor wrapper (`createRng`) is provided for the
 * common sequential case; it is still fully deterministic because it is seeded explicitly and never
 * reads ambient entropy.
 */

/** Coerce an arbitrary seed input into a 32-bit unsigned integer. Strings are hashed (FNV-1a). */
export function normalizeSeed(seed: number | string): number {
	if (typeof seed === 'number' && Number.isFinite(seed)) {
		// Fold the (possibly negative / fractional) number into a 32-bit unsigned int.
		return Math.abs(Math.trunc(seed)) >>> 0;
	}
	const text = String(seed);
	let hash = 0x811c9dc5; // FNV-1a offset basis
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		// FNV prime multiply, kept in 32-bit space via Math.imul.
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** One step of mulberry32: given a 32-bit state, return `[value in [0,1), nextState]`. */
function mulberry32(state: number): [number, number] {
	const t = (state + 0x6d2b79f5) >>> 0;
	let x = t;
	x = Math.imul(x ^ (x >>> 15), x | 1);
	x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
	const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	return [value, t];
}

/**
 * A mutable, explicitly-seeded random cursor. Deterministic by construction: two cursors seeded with
 * the same value produce the same stream of values in the same call order. No ambient entropy is ever
 * read. Use this for sequential generation; the order of `next*` calls IS part of the determinism
 * contract, so generation code must call it in a fixed order.
 */
export interface SeededRng {
	/** Next float in [0, 1). */
	next(): number;
	/** Next integer in [min, max] inclusive. */
	nextInt(min: number, max: number): number;
	/** True with probability `p` (0..1). */
	chance(p: number): boolean;
	/** Pick one element from a non-empty array. */
	pick<T>(items: readonly T[]): T;
	/**
	 * Next normally-distributed float (Box–Muller). Room sizes drawn from a normal distribution are
	 * what give a dungeon a few grand halls among many small chambers; a uniform draw gives the
	 * characteristic "every room is the same size" look of a naive generator.
	 */
	gaussian(mean: number, stdDev: number): number;
	/** Pick one element with per-item weights (weights need not sum to 1). */
	weighted<T>(items: readonly T[], weights: readonly number[]): T;
	/** Fisher–Yates shuffle. Returns a NEW array; the input is never mutated. */
	shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number | string): SeededRng {
	let state = normalizeSeed(seed);
	const next = (): number => {
		const [value, nextState] = mulberry32(state);
		state = nextState;
		return value;
	};
	return {
		next,
		nextInt(min: number, max: number): number {
			if (max < min) [min, max] = [max, min];
			return min + Math.floor(next() * (max - min + 1));
		},
		chance(p: number): boolean {
			return next() < p;
		},
		pick<T>(items: readonly T[]): T {
			if (items.length === 0) throw new Error('createRng.pick requires a non-empty array.');
			return items[Math.floor(next() * items.length)] as T;
		},
		gaussian(mean: number, stdDev: number): number {
			// Box–Muller. Guard u against 0 so log() never returns -Infinity.
			const u = Math.max(next(), Number.EPSILON);
			const v = next();
			return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
		},
		weighted<T>(items: readonly T[], weights: readonly number[]): T {
			if (items.length === 0) throw new Error('createRng.weighted requires a non-empty array.');
			if (weights.length !== items.length) {
				throw new Error('createRng.weighted requires one weight per item.');
			}
			let total = 0;
			for (const weight of weights) total += Math.max(0, weight);
			// All-zero (or negative) weights degrade to a uniform pick rather than throwing, so a caller
			// whose weight table happens to zero out still gets a deterministic result.
			if (total <= 0) return items[Math.floor(next() * items.length)] as T;
			let roll = next() * total;
			for (let i = 0; i < items.length; i += 1) {
				roll -= Math.max(0, weights[i] as number);
				if (roll < 0) return items[i] as T;
			}
			return items[items.length - 1] as T;
		},
		shuffle<T>(items: readonly T[]): T[] {
			// Fisher–Yates, descending — the canonical unbiased shuffle. Returns a new array; the input
			// is never mutated (a generator that shuffled its own input would not be replay-safe).
			const result = [...items];
			for (let i = result.length - 1; i > 0; i -= 1) {
				const j = Math.floor(next() * (i + 1));
				[result[i], result[j]] = [result[j] as T, result[i] as T];
			}
			return result;
		},
	};
}

/**
 * MAP-004 — derive an INDEPENDENT named sub-stream from a root seed.
 *
 * Why this exists: with a single shared RNG cursor, nudging any one parameter shifts every subsequent
 * PRNG draw, so bumping `roomCount` from 12 to 13 also reshuffles every name, every treasure, and
 * every river on the map. That makes a generator a slot machine rather than a tool. By deriving one
 * stream per subsystem, a change confined to one subsystem's parameters leaves the others' draws
 * untouched — the map stays recognizably "the same map, with one more room", which is the behaviour a
 * GM expects when they drag a slider.
 *
 * The derivation mixes the root seed with the stream name through the same FNV-1a/mulberry hashing the
 * rest of this module uses, so it stays dependency-free and byte-identical across platforms. Stream
 * names are part of the determinism contract: renaming a stream changes its output.
 */
export function deriveStream(rootSeed: number | string, streamName: string): number {
	const root = normalizeSeed(rootSeed);
	const name = normalizeSeed(streamName);
	// splitmix32-style avalanche of the two hashes so that adjacent root seeds (1, 2, 3 …) and similar
	// stream names ("rooms" / "roads") do not produce correlated streams.
	let mixed = (root ^ Math.imul(name ^ (name >>> 16), 0x45d9f3b)) >>> 0;
	mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
	mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
	return (mixed ^ (mixed >>> 16)) >>> 0;
}

/**
 * A lazily-instantiated set of named, independent RNG streams derived from one root seed. Each name
 * yields the SAME cursor on every call within a run (so a subsystem that draws in two places shares
 * one stream), and an independent stream across names. See {@link deriveStream} for why.
 */
export interface RngStreams {
	/** The root seed every stream is derived from. Carried so it can be persisted with the output. */
	readonly seed: number | string;
	/** Get (creating on first use) the named stream. */
	stream(name: string): SeededRng;
}

export function createRngStreams(seed: number | string): RngStreams {
	const cursors = new Map<string, SeededRng>();
	return {
		seed,
		stream(name: string): SeededRng {
			const existing = cursors.get(name);
			if (existing) return existing;
			const created = createRng(deriveStream(seed, name));
			cursors.set(name, created);
			return created;
		},
	};
}
