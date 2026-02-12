import { describe, it, expect, vi, afterEach } from 'vitest';
import { nowISO, formatDate, formatRelativeDate } from './date.js';

describe('nowISO', () => {
	it('returns an ISO 8601 string', () => {
		const result = nowISO();
		expect(() => new Date(result)).not.toThrow();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});
});

describe('formatDate', () => {
	it('formats a date in short month format', () => {
		const result = formatDate('2025-03-15T10:30:00.000Z');
		expect(result).toContain('2025');
		expect(result).toContain('15');
	});
});

describe('formatRelativeDate', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns "just now" for very recent dates', () => {
		const result = formatRelativeDate(new Date().toISOString());
		expect(result).toBe('just now');
	});

	it('returns seconds ago', () => {
		vi.useFakeTimers();
		const now = new Date('2025-06-01T12:00:30.000Z');
		vi.setSystemTime(now);
		expect(formatRelativeDate('2025-06-01T12:00:00.000Z')).toBe('30s ago');
	});

	it('returns minutes ago', () => {
		vi.useFakeTimers();
		const now = new Date('2025-06-01T12:10:00.000Z');
		vi.setSystemTime(now);
		expect(formatRelativeDate('2025-06-01T12:00:00.000Z')).toBe('10m ago');
	});

	it('returns hours ago', () => {
		vi.useFakeTimers();
		const now = new Date('2025-06-01T15:00:00.000Z');
		vi.setSystemTime(now);
		expect(formatRelativeDate('2025-06-01T12:00:00.000Z')).toBe('3h ago');
	});

	it('returns days ago', () => {
		vi.useFakeTimers();
		const now = new Date('2025-06-04T12:00:00.000Z');
		vi.setSystemTime(now);
		expect(formatRelativeDate('2025-06-01T12:00:00.000Z')).toBe('3d ago');
	});

	it('returns weeks ago', () => {
		vi.useFakeTimers();
		const now = new Date('2025-06-15T12:00:00.000Z');
		vi.setSystemTime(now);
		expect(formatRelativeDate('2025-06-01T12:00:00.000Z')).toBe('2w ago');
	});
});
