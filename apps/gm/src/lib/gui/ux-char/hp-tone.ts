// UX-CHAR-011 — the glanceable HP threshold model shared by the party overview and any future
// vitals surface. Pure (no Svelte, no DOM) so it is unit-testable and cannot drift between callers.
//
// Thresholds (UX-CHAR-011 §spec): >50% high (green), 25–50% mid (amber), <25% low (red). The colour
// is expressed as a semantic status token name, never a literal, so it themes with the rest of the
// system (the design tokens define `--color-status-*` for every theme).

export type HpTone = 'high' | 'mid' | 'low';

/** Fraction of max HP remaining, clamped to [0, 1]. `maxHp <= 0` is treated as empty. */
export function hpRatio(hp: number, maxHp: number): number {
	if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 0;
	return Math.max(0, Math.min(1, hp / maxHp));
}

/** Glanceable tone bucket for an HP value. Boundaries match the spec: 0.5 is mid, 0.25 is mid. */
export function hpTone(hp: number, maxHp: number): HpTone {
	const ratio = hpRatio(hp, maxHp);
	if (ratio > 0.5) return 'high';
	if (ratio >= 0.25) return 'mid';
	return 'low';
}

/** A member is "critical" (red accent border on the card) at strictly below 25% HP. */
export function isCriticalHp(hp: number, maxHp: number): boolean {
	return hpTone(hp, maxHp) === 'low' && maxHp > 0;
}
