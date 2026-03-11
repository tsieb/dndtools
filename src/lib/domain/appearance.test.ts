import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	normalizeHighContrast,
	normalizeNoteReadingWidth,
	normalizeReduceMotion,
	normalizeUiDensity,
	resolveHighContrast,
	resolveReducedMotion,
} from './appearance.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

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

describe('normalizeReduceMotion', () => {
	it('returns system for unsupported values', () => {
		expect(normalizeReduceMotion('always')).toBe('system');
		expect(normalizeReduceMotion(undefined)).toBe('system');
	});

	it('accepts supported values', () => {
		expect(normalizeReduceMotion('system')).toBe('system');
		expect(normalizeReduceMotion('reduce')).toBe('reduce');
		expect(normalizeReduceMotion('no-preference')).toBe('no-preference');
	});
});

describe('normalizeHighContrast', () => {
	it('returns system for unsupported values', () => {
		expect(normalizeHighContrast('always')).toBe('system');
		expect(normalizeHighContrast(null)).toBe('system');
	});

	it('accepts supported values', () => {
		expect(normalizeHighContrast('system')).toBe('system');
		expect(normalizeHighContrast('high')).toBe('high');
		expect(normalizeHighContrast('standard')).toBe('standard');
	});
});

describe('resolveReducedMotion', () => {
	it('resolves explicit preferences', () => {
		expect(resolveReducedMotion('reduce')).toBe(true);
		expect(resolveReducedMotion('no-preference')).toBe(false);
	});

	it('falls back to system preference for system mode', () => {
		vi.stubGlobal('window', {
			matchMedia: vi.fn().mockReturnValue({ matches: true }),
		});
		expect(resolveReducedMotion('system')).toBe(true);
	});
});

describe('resolveHighContrast', () => {
	it('resolves explicit preferences', () => {
		expect(resolveHighContrast('high')).toBe(true);
		expect(resolveHighContrast('standard')).toBe(false);
	});

	it('falls back to system preference for system mode', () => {
		vi.stubGlobal('window', {
			matchMedia: vi.fn().mockReturnValue({ matches: true }),
		});
		expect(resolveHighContrast('system')).toBe(true);
	});
});
