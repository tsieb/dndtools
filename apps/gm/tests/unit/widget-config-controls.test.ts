import { describe, expect, it } from 'vitest';
import type { WidgetConfigField } from '@dndtools/core';
import { clampConfigNumber, configFieldValue } from '../../src/lib/gui/ux-canvas/widget-config-controls';

const countField: WidgetConfigField = {
	key: 'count',
	label: 'Rows shown',
	control: 'number',
	group: 'content',
	default: 8,
	min: 1,
	max: 50,
	step: 1,
};

describe('clampConfigNumber (finding 10)', () => {
	it('ignores a cleared (blank) field so it snaps back instead of committing 0', () => {
		// The original bug: Number('') === 0 is finite, so a cleared field committed 0 → clamped to min.
		expect(clampConfigNumber(countField, '')).toBeNull();
		expect(clampConfigNumber(countField, '   ')).toBeNull();
	});

	it('ignores a non-numeric entry', () => {
		expect(clampConfigNumber(countField, 'abc')).toBeNull();
	});

	it('clamps a valid entry to the declared [min, max]', () => {
		expect(clampConfigNumber(countField, '12')).toBe(12);
		expect(clampConfigNumber(countField, '0')).toBe(1); // below min
		expect(clampConfigNumber(countField, '999')).toBe(50); // above max
	});
});

describe('configFieldValue', () => {
	it('prefers the instance value, falling back to the field default', () => {
		expect(configFieldValue({ count: 3 }, countField)).toBe(3);
		expect(configFieldValue({}, countField)).toBe(8);
	});
});
