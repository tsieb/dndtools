/**
 * A11Y-005 — single resolved motion preference state.
 *
 * These tests verify the (OS preference × user override) resolution matrix and the documented
 * precedence. Every case that could be exercised by the acceptance criteria is covered:
 *   AC1: OS reduce + user no-preference → 'reduced' (the documented AC1 case).
 *   AC2: any reduced/none level suppresses animations (enforced via the document token + CSS).
 */
import { describe, it, expect } from 'vitest';
import {
	resolveMotionPreference,
	isMotionOverride,
	MOTION_OVERRIDES,
	type MotionOverride,
	type ResolvedMotionLevel,
} from '../src/state/motion-preference';

describe('A11Y-005 — resolveMotionPreference — documented precedence matrix', () => {
	// ── AC1 case: OS-reduce + user-no-preference ────────────────────────────────────────────
	it('AC1: OS reduced motion enabled + user override no-preference → reduced', () => {
		expect(resolveMotionPreference(true, 'no-preference')).toBe<ResolvedMotionLevel>('reduced');
	});

	it('AC1: OS reduced motion enabled + override omitted (defaults to no-preference) → reduced', () => {
		expect(resolveMotionPreference(true)).toBe<ResolvedMotionLevel>('reduced');
	});

	// ── Full OS-preference × user-override matrix ───────────────────────────────────────────
	describe('OS motion NORMAL (false)', () => {
		it('user no-preference → full', () => {
			expect(resolveMotionPreference(false, 'no-preference')).toBe<ResolvedMotionLevel>('full');
		});
		it('user reduce → reduced (user wins over OS)', () => {
			expect(resolveMotionPreference(false, 'reduce')).toBe<ResolvedMotionLevel>('reduced');
		});
		it('user no-motion → none (user wins over OS)', () => {
			expect(resolveMotionPreference(false, 'no-motion')).toBe<ResolvedMotionLevel>('none');
		});
	});

	describe('OS motion REDUCED (true)', () => {
		it('user no-preference → reduced (OS preference takes effect)', () => {
			expect(resolveMotionPreference(true, 'no-preference')).toBe<ResolvedMotionLevel>('reduced');
		});
		it('user reduce → reduced', () => {
			expect(resolveMotionPreference(true, 'reduce')).toBe<ResolvedMotionLevel>('reduced');
		});
		it('user no-motion → none (user escalates beyond OS reduce)', () => {
			expect(resolveMotionPreference(true, 'no-motion')).toBe<ResolvedMotionLevel>('none');
		});
	});

	// ── Precedence ordering ──────────────────────────────────────────────────────────────────
	it('user no-motion overrides OS normal → none', () => {
		expect(resolveMotionPreference(false, 'no-motion')).toBe<ResolvedMotionLevel>('none');
	});
	it('user reduce overrides OS normal → reduced', () => {
		expect(resolveMotionPreference(false, 'reduce')).toBe<ResolvedMotionLevel>('reduced');
	});
	it('user reduce with OS reduced → reduced (not escalated to none)', () => {
		expect(resolveMotionPreference(true, 'reduce')).toBe<ResolvedMotionLevel>('reduced');
	});
	it('user no-motion with OS reduced → none (no-motion is the strongest suppressor)', () => {
		expect(resolveMotionPreference(true, 'no-motion')).toBe<ResolvedMotionLevel>('none');
	});

	// ── Only 'full' requires both OS=normal AND user=no-preference ──────────────────────────
	it('full motion requires OS normal AND user no-preference', () => {
		// Any OS-reduce or user-override pushes the level away from 'full'.
		const fullCases: [boolean, MotionOverride][] = [[false, 'no-preference']];
		for (const [os, ov] of fullCases) {
			expect(resolveMotionPreference(os, ov)).toBe<ResolvedMotionLevel>('full');
		}
		const nonFullCases: [boolean, MotionOverride][] = [
			[true, 'no-preference'],
			[false, 'reduce'],
			[false, 'no-motion'],
			[true, 'reduce'],
			[true, 'no-motion'],
		];
		for (const [os, ov] of nonFullCases) {
			expect(resolveMotionPreference(os, ov)).not.toBe<ResolvedMotionLevel>('full');
		}
	});

	// ── Pure / deterministic ─────────────────────────────────────────────────────────────────
	it('is deterministic: same inputs always yield the same output', () => {
		expect(resolveMotionPreference(true, 'no-preference')).toBe(
			resolveMotionPreference(true, 'no-preference'),
		);
		expect(resolveMotionPreference(false, 'reduce')).toBe(
			resolveMotionPreference(false, 'reduce'),
		);
	});
});

describe('A11Y-005 — MOTION_OVERRIDES closed set + isMotionOverride guard', () => {
	it('MOTION_OVERRIDES contains exactly the three override values', () => {
		expect(MOTION_OVERRIDES).toEqual(['no-preference', 'reduce', 'no-motion']);
	});

	it('isMotionOverride accepts all declared overrides', () => {
		for (const override of MOTION_OVERRIDES) {
			expect(isMotionOverride(override)).toBe(true);
		}
	});

	it('isMotionOverride rejects unknown strings, numbers, null, undefined', () => {
		expect(isMotionOverride('full')).toBe(false);
		expect(isMotionOverride('none')).toBe(false);
		expect(isMotionOverride('')).toBe(false);
		expect(isMotionOverride(0)).toBe(false);
		expect(isMotionOverride(null)).toBe(false);
		expect(isMotionOverride(undefined)).toBe(false);
	});
});
