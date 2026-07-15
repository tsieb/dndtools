import type { CellGrid } from './grid';

/**
 * Per-cell distance to the nearest cell equal to `target`, in CELL units.
 *
 * A distance field is the cheapest way to make a generator look like it understands the place it drew:
 * elevation falls off from the coastline, danger rises with distance from the entrance, furniture hugs
 * the wall, the widest point of a cave (its distance-field maximum) is where the boss goes. It is a
 * field, consumed and discarded — never persisted.
 *
 * Two-pass chamfer with 1 / √2 weights: one forward sweep (top-left → bottom-right) propagating from the
 * already-settled neighbours, one backward sweep for the rest. Exact Euclidean would need Felzenszwalb's
 * transform; the chamfer's worst-case error is under 4% and no consumer here can tell the difference.
 * Cells with no `target` anywhere in the grid come back as `Infinity`, which is honest — a caller that
 * clamps is making a decision the field should not make for it.
 */
export function distanceField(g: CellGrid, target: number): Float32Array {
	const out = new Float32Array(g.w * g.h);
	const ORTHO = 1;
	const DIAG = Math.SQRT2;

	for (let i = 0; i < out.length; i += 1) {
		out[i] = g.cells[i] === target ? 0 : Infinity;
	}

	for (let y = 0; y < g.h; y += 1) {
		for (let x = 0; x < g.w; x += 1) {
			const i = y * g.w + x;
			let best = out[i] as number;
			if (best === 0) continue;
			if (x > 0) best = Math.min(best, (out[i - 1] as number) + ORTHO);
			if (y > 0) best = Math.min(best, (out[i - g.w] as number) + ORTHO);
			if (x > 0 && y > 0) best = Math.min(best, (out[i - g.w - 1] as number) + DIAG);
			if (x < g.w - 1 && y > 0) best = Math.min(best, (out[i - g.w + 1] as number) + DIAG);
			out[i] = best;
		}
	}

	for (let y = g.h - 1; y >= 0; y -= 1) {
		for (let x = g.w - 1; x >= 0; x -= 1) {
			const i = y * g.w + x;
			let best = out[i] as number;
			if (best === 0) continue;
			if (x < g.w - 1) best = Math.min(best, (out[i + 1] as number) + ORTHO);
			if (y < g.h - 1) best = Math.min(best, (out[i + g.w] as number) + ORTHO);
			if (x < g.w - 1 && y < g.h - 1) best = Math.min(best, (out[i + g.w + 1] as number) + DIAG);
			if (x > 0 && y < g.h - 1) best = Math.min(best, (out[i + g.w - 1] as number) + DIAG);
			out[i] = best;
		}
	}

	return out;
}
