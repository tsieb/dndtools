import { describe, expect, it } from 'vitest';
import {
	fieldErrorAttributes,
	isColorIndependent,
	resolveStateIndicator,
	type StateKind,
} from '../../src/lib/gui/a11y/state-indicator';

// UX-A11Y-007 (WCAG 1.4.1): no state is colour-only. Every indicator carries a text label (the
// grayscale/AT-safe cue) and an optional redundant icon shape; the tone token is decorative.

describe('resolveStateIndicator', () => {
	it('gives a bloodied combatant a "Bloodied" text label, not just a colour (AC2/AC4)', () => {
		const indicator = resolveStateIndicator('health', 'bloodied');
		expect(indicator.label).toBe('Bloodied');
		expect(indicator.icon).toBeDefined();
		expect(isColorIndependent(indicator)).toBe(true);
	});

	it('labels visibility, sync, and status states with text + shape', () => {
		expect(resolveStateIndicator('visibility', 'dm-only').label).toBe('DM only');
		expect(resolveStateIndicator('sync', 'offline').label).toBe('Offline');
		expect(resolveStateIndicator('status', 'error').label).toBe('Error');
	});

	it('every defined state is colour-independent (has a non-empty label)', () => {
		const cases: Array<[StateKind, string[]]> = [
			['visibility', ['visible', 'hidden', 'dm-only']],
			['health', ['full', 'bloodied', 'critical', 'dead']],
			['sync', ['synced', 'syncing', 'offline', 'sync-error']],
			['status', ['success', 'warning', 'error', 'info']],
		];
		for (const [kind, values] of cases) {
			for (const value of values) {
				expect(isColorIndependent(resolveStateIndicator(kind, value)), `${kind}:${value}`).toBe(true);
			}
		}
	});

	it('fails closed on an unknown state (never silently colour-only)', () => {
		expect(() => resolveStateIndicator('health', 'sparkling')).toThrow();
	});
});

describe('fieldErrorAttributes (AC3: aria-invalid + aria-describedby)', () => {
	it('wires an invalid field to its error message id', () => {
		const attrs = fieldErrorAttributes('display-name');
		expect(attrs['aria-invalid']).toBe('true');
		expect(attrs.describedById).toBe('display-name-error');
		expect(attrs['aria-describedby']).toBe('display-name-error');
	});
});
