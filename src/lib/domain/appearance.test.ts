import { describe, expect, it } from 'vitest';
import { normalizeNoteReadingWidth, normalizeUiDensity } from './appearance.js';

describe('normalizeUiDensity', () => {
	it('returns standard for unsupported values', () => {
		expect(normalizeUiDensity('cozy')).toBe('standard');
		expect(normalizeUiDensity(null)).toBe('standard');
	});

	it('accepts supported values', () => {
		expect(normalizeUiDensity('standard')).toBe('standard');
		expect(normalizeUiDensity('compact')).toBe('compact');
	});
});

describe('normalizeNoteReadingWidth', () => {
	it('returns comfortable for unsupported values', () => {
		expect(normalizeNoteReadingWidth('ultra')).toBe('comfortable');
		expect(normalizeNoteReadingWidth(undefined)).toBe('comfortable');
	});

	it('accepts supported values', () => {
		expect(normalizeNoteReadingWidth('comfortable')).toBe('comfortable');
		expect(normalizeNoteReadingWidth('wide')).toBe('wide');
		expect(normalizeNoteReadingWidth('full')).toBe('full');
	});
});
