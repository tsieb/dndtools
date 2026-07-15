/**
 * Seeded 2D value noise, fBm, and domain warping.
 *
 * Deterministic from the integer seed and nothing else: the lattice value at (ix, iy) is a pure integer
 * hash of (seed, ix, iy), so there is no permutation table to build, no state to thread, and no order
 * dependence — two devices sampling the same field in a different order still agree, which a table-based
 * gradient noise seeded from a shared RNG cursor would not guarantee.
 *
 * Value noise rather than Perlin/simplex because the consumers here (cave density, biome masks, coastline
 * displacement, elevation) all get simplified and smoothed downstream, where the visual difference
 * between value and gradient noise disappears — and value noise costs no gradient table and has no
 * patent-adjacent history.
 */

export interface NoiseField {
	/** Roughly -1..1. */
	at(x: number, y: number): number;
}

/** Integer hash → [0, 1). Same avalanche family as the repo's PRNG, so the distribution is known-good. */
function hash2(seed: number, x: number, y: number): number {
	let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
	h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0x297a2d39) >>> 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Quintic smoothstep 6t⁵-15t⁴+10t³. Its first AND second derivatives vanish at the ends, so the lattice
 *  does not show up as a faint grid of creases the way cubic smoothstep does once you stack octaves. */
function quintic(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

export function createValueNoise(seed: number): NoiseField {
	const s = seed >>> 0;
	return {
		at(x: number, y: number): number {
			const ix = Math.floor(x);
			const iy = Math.floor(y);
			const fx = quintic(x - ix);
			const fy = quintic(y - iy);
			const v00 = hash2(s, ix, iy);
			const v10 = hash2(s, ix + 1, iy);
			const v01 = hash2(s, ix, iy + 1);
			const v11 = hash2(s, ix + 1, iy + 1);
			const top = v00 + (v10 - v00) * fx;
			const bottom = v01 + (v11 - v01) * fx;
			return (top + (bottom - top) * fy) * 2 - 1;
		},
	};
}

export interface FbmOptions {
	octaves?: number;
	frequency?: number;
	lacunarity?: number;
	persistence?: number;
}

/**
 * Fractional Brownian motion: sum octaves of the same field at rising frequency and falling amplitude.
 * The sum is divided by the total amplitude, so the result stays in roughly -1..1 no matter how many
 * octaves are stacked — a caller thresholding at 0.0 gets the same coverage at 2 octaves as at 6.
 */
export function fbm(noise: NoiseField, options: FbmOptions = {}): NoiseField {
	const octaves = Math.max(1, Math.floor(options.octaves ?? 4));
	const frequency = options.frequency ?? 2;
	const lacunarity = options.lacunarity ?? 2;
	const persistence = options.persistence ?? 0.5;
	return {
		at(x: number, y: number): number {
			let sum = 0;
			let amplitude = 1;
			let total = 0;
			let f = frequency;
			for (let i = 0; i < octaves; i += 1) {
				sum += noise.at(x * f, y * f) * amplitude;
				total += amplitude;
				amplitude *= persistence;
				f *= lacunarity;
			}
			return total > 0 ? sum / total : 0;
		},
	};
}

/**
 * Offset the sample coordinates by another field before reading. This is the cheapest way to kill the
 * "noise looks like noise" look: the isolines stop being lumpy circles and start folding back on
 * themselves like real coastlines and cave walls. The x and y offsets are read from the same warp field
 * at decorrelated positions, so one field buys a two-component vector.
 */
export function domainWarp(field: NoiseField, warp: NoiseField, strength: number): NoiseField {
	return {
		at(x: number, y: number): number {
			const dx = warp.at(x, y) * strength;
			const dy = warp.at(x + 5.2, y + 1.3) * strength;
			return field.at(x + dx, y + dy);
		},
	};
}
