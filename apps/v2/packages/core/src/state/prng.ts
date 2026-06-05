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
	};
}
