import { describe, expect, it } from 'vitest';
import { hpRatio, hpTone, isCriticalHp } from './hp-tone';

// UX-CHAR-011 — the glanceable HP threshold model. These boundaries drive the party overview's
// green/amber/red bar fill and the critical (red-accent-border) card state, so they are pinned here.

describe('hpRatio', () => {
	it('returns the clamped fraction of max HP remaining', () => {
		expect(hpRatio(52, 52)).toBe(1);
		expect(hpRatio(26, 52)).toBe(0.5);
		expect(hpRatio(13, 52)).toBe(0.25);
		expect(hpRatio(0, 52)).toBe(0);
	});

	it('clamps over-max and treats a non-positive max as empty (fail-safe)', () => {
		expect(hpRatio(80, 52)).toBe(1);
		expect(hpRatio(10, 0)).toBe(0);
		expect(hpRatio(-5, 52)).toBe(0);
		expect(hpRatio(Number.NaN, 52)).toBe(0);
	});
});

describe('hpTone', () => {
	it('is high above 50%', () => {
		expect(hpTone(52, 52)).toBe('high');
		expect(hpTone(27, 52)).toBe('high'); // 51.9%
	});

	it('is mid from 25% through 50% inclusive', () => {
		expect(hpTone(26, 52)).toBe('mid'); // exactly 50%
		expect(hpTone(13, 52)).toBe('mid'); // exactly 25%
	});

	it('is low strictly below 25%', () => {
		expect(hpTone(12, 52)).toBe('low'); // 23%
		expect(hpTone(0, 52)).toBe('low');
	});
});

describe('isCriticalHp', () => {
	it('is critical only when low and the character has real max HP', () => {
		expect(isCriticalHp(10, 52)).toBe(true); // 19%
		expect(isCriticalHp(13, 52)).toBe(false); // 25% → mid
		expect(isCriticalHp(0, 0)).toBe(false); // no stat block, not "critical"
	});
});
