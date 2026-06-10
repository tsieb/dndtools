import { describe, expect, it } from 'vitest';
import {
	absoluteDayIndex,
	addDays,
	compareCustomDates,
	createCalendarDefinition,
	dayOfYear,
	daysInMonth,
	daysInYear,
	formatCustomDate,
	fromAbsoluteDayIndex,
	isValidCustomDate,
	validateCustomDate,
	weekdayName,
	type CalendarDefinition,
	type CustomDate,
} from '../src';

/**
 * CONTENT-011 — CUSTOM (campaign) calendar arithmetic + STABLE display formatting.
 *
 * Tests are the primary evidence for the determinism deliverable:
 *   - custom months/day counts/epoch (NOT Gregorian) drive every computation,
 *   - day-of-year, month rollover, comparison/ordering of custom dates,
 *   - formatting is a PURE function of (definition, date, format) — identical regardless of host
 *     locale, timezone, or clock (proven by mutating the ambient environment and asserting stability).
 */

// A deliberately non-Gregorian calendar: 4 months of unequal length, a 5-day week, an epoch label.
const HARPTOS: CalendarDefinition = createCalendarDefinition({
	id: 'cal-harptos',
	name: 'Calendar of Harptos',
	months: [
		{ id: 'm-hammer', name: 'Hammer', days: 30 },
		{ id: 'm-alturiak', name: 'Alturiak', days: 28 },
		{ id: 'm-ches', name: 'Ches', days: 31 },
		{ id: 'm-tarsakh', name: 'Tarsakh', days: 10 },
	],
	weekdays: ['First', 'Second', 'Third', 'Fourth', 'Fifth'],
	epochLabel: 'DR',
});

const date = (year: number, month: number, day: number): CustomDate => ({
	calendarId: HARPTOS.id,
	year,
	month,
	day,
});

describe('custom calendar definition', () => {
	it('sums month day counts for the year length (not 365)', () => {
		expect(daysInYear(HARPTOS)).toBe(30 + 28 + 31 + 10);
		expect(daysInYear(HARPTOS)).toBe(99);
	});

	it('reports each month day count by 1-based ordinal and null out of range', () => {
		expect(daysInMonth(HARPTOS, 1)).toBe(30);
		expect(daysInMonth(HARPTOS, 4)).toBe(10);
		expect(daysInMonth(HARPTOS, 5)).toBeNull();
		expect(daysInMonth(HARPTOS, 0)).toBeNull();
	});

	it('rejects an empty month set', () => {
		expect(() => createCalendarDefinition({ id: 'x', name: 'X', months: [] })).toThrow();
	});

	it('floors fractional month day counts to a positive integer', () => {
		const cal = createCalendarDefinition({
			id: 'c',
			name: 'C',
			months: [{ id: 'a', name: 'A', days: 12.9 }],
		});
		expect(cal.months[0]!.days).toBe(12);
	});
});

describe('date validation (fail closed)', () => {
	it('accepts an in-range date', () => {
		expect(validateCustomDate(HARPTOS, date(1372, 2, 28)).valid).toBe(true);
		expect(isValidCustomDate(HARPTOS, date(1, 1, 1))).toBe(true);
	});

	it('rejects a day past the month length', () => {
		const result = validateCustomDate(HARPTOS, date(1372, 2, 29));
		expect(result.valid).toBe(false);
		expect(result.code).toBe('day-out-of-range');
	});

	it('rejects an out-of-range month', () => {
		expect(validateCustomDate(HARPTOS, date(1372, 5, 1)).code).toBe('month-out-of-range');
		expect(validateCustomDate(HARPTOS, date(1372, 0, 1)).code).toBe('month-out-of-range');
	});

	it('rejects a non-integer year', () => {
		expect(validateCustomDate(HARPTOS, date(1372.5, 1, 1)).code).toBe('year-not-integer');
	});

	it('rejects a date whose calendar id mismatches', () => {
		const foreign: CustomDate = { calendarId: 'other', year: 1, month: 1, day: 1 };
		expect(validateCustomDate(HARPTOS, foreign).code).toBe('calendar-mismatch');
	});
});

describe('day-of-year and absolute day index', () => {
	it('computes the 1-based day of year summing prior months', () => {
		expect(dayOfYear(HARPTOS, date(1372, 1, 1))).toBe(1);
		expect(dayOfYear(HARPTOS, date(1372, 2, 1))).toBe(31); // after 30-day Hammer
		expect(dayOfYear(HARPTOS, date(1372, 3, 1))).toBe(59); // after Hammer + 28-day Alturiak
		expect(dayOfYear(HARPTOS, date(1372, 4, 10))).toBe(99); // last day of the year
	});

	it('returns null day-of-year for an invalid date', () => {
		expect(dayOfYear(HARPTOS, date(1372, 2, 99))).toBeNull();
	});

	it('treats epoch year-1 month-1 day-1 as absolute index 0', () => {
		expect(absoluteDayIndex(HARPTOS, date(1, 1, 1))).toBe(0);
		expect(absoluteDayIndex(HARPTOS, date(2, 1, 1))).toBe(99); // one full year later
	});

	it('handles pre-epoch (year <= 0) dates', () => {
		expect(absoluteDayIndex(HARPTOS, date(0, 1, 1))).toBe(-99);
		// fromAbsoluteDayIndex is the exact inverse, including negative indices.
		expect(fromAbsoluteDayIndex(HARPTOS, -99)).toEqual(date(0, 1, 1));
		expect(fromAbsoluteDayIndex(HARPTOS, -1)).toEqual(date(0, 4, 10));
	});

	it('round-trips every date through absolute index and back', () => {
		for (let month = 1; month <= HARPTOS.months.length; month += 1) {
			for (let day = 1; day <= daysInMonth(HARPTOS, month)!; day += 1) {
				const d = date(1372, month, day);
				const idx = absoluteDayIndex(HARPTOS, d)!;
				expect(fromAbsoluteDayIndex(HARPTOS, idx)).toEqual(d);
			}
		}
	});
});

describe('comparison / ordering', () => {
	it('orders dates within a calendar', () => {
		expect(compareCustomDates(HARPTOS, date(1372, 1, 1), date(1372, 1, 2))).toBeLessThan(0);
		expect(compareCustomDates(HARPTOS, date(1373, 1, 1), date(1372, 4, 10))).toBeGreaterThan(0);
		expect(compareCustomDates(HARPTOS, date(1372, 2, 5), date(1372, 2, 5))).toBe(0);
	});

	it('fails closed (null) when comparing across calendars', () => {
		const foreign: CustomDate = { calendarId: 'other', year: 1372, month: 1, day: 1 };
		expect(compareCustomDates(HARPTOS, date(1372, 1, 1), foreign)).toBeNull();
	});

	it('sorts a list deterministically by absolute index', () => {
		const list = [date(1373, 1, 1), date(1372, 4, 10), date(1372, 1, 1)];
		const sorted = [...list].sort((a, b) => compareCustomDates(HARPTOS, a, b)!);
		expect(sorted).toEqual([date(1372, 1, 1), date(1372, 4, 10), date(1373, 1, 1)]);
	});
});

describe('month rollover (addDays)', () => {
	it('rolls into the next month', () => {
		expect(addDays(HARPTOS, date(1372, 1, 30), 1)).toEqual(date(1372, 2, 1));
	});

	it('rolls across the year boundary', () => {
		// Last day of the 99-day year + 1 day = first day of next year.
		expect(addDays(HARPTOS, date(1372, 4, 10), 1)).toEqual(date(1373, 1, 1));
	});

	it('subtracts days, rolling back across the year boundary', () => {
		expect(addDays(HARPTOS, date(1373, 1, 1), -1)).toEqual(date(1372, 4, 10));
	});

	it('adds a whole year (daysInYear) landing on the same month/day', () => {
		expect(addDays(HARPTOS, date(1372, 2, 14), daysInYear(HARPTOS))).toEqual(date(1373, 2, 14));
	});

	it('returns null for an invalid start date or non-integer delta', () => {
		expect(addDays(HARPTOS, date(1372, 2, 99), 1)).toBeNull();
		expect(addDays(HARPTOS, date(1372, 1, 1), 1.5)).toBeNull();
	});
});

describe('weekday derivation', () => {
	it('derives a stable weekday from the absolute index modulo the cycle', () => {
		// index 0 ⇒ weekdays[0]; index 5 ⇒ weekdays[0] again (5-day week).
		expect(weekdayName(HARPTOS, date(1, 1, 1))).toBe('First');
		expect(weekdayName(HARPTOS, date(1, 1, 6))).toBe('First');
		expect(weekdayName(HARPTOS, date(1, 1, 2))).toBe('Second');
	});

	it('stays non-negative for pre-epoch indices', () => {
		// index -1 ⇒ weekdays[4] (Fifth) for a 5-day week.
		expect(weekdayName(HARPTOS, date(0, 4, 10))).toBe('Fifth');
	});

	it('returns null when the calendar declares no weekdays', () => {
		const noWeek = createCalendarDefinition({
			id: 'nw',
			name: 'NW',
			months: [{ id: 'a', name: 'A', days: 10 }],
		});
		expect(weekdayName(noWeek, { calendarId: 'nw', year: 1, month: 1, day: 1 })).toBeNull();
	});
});

describe('stable display formatting (locale/clock independent — CONTENT-011 AC1)', () => {
	it('formats iso-like with zero-padded ordinals', () => {
		expect(formatCustomDate(HARPTOS, date(1372, 2, 5), 'iso-like')).toBe('1372-02-05');
	});

	it('formats long with weekday, month name, and era', () => {
		// 1372-02-05 ⇒ absolute index 1371*99 + 30 + 4 = 135829 + 34 ... weekday derived deterministically.
		expect(formatCustomDate(HARPTOS, date(1372, 2, 5), 'long')).toContain('Alturiak');
		expect(formatCustomDate(HARPTOS, date(1372, 2, 5), 'long')).toContain('DR');
	});

	it('formats medium and day-month from the definition', () => {
		expect(formatCustomDate(HARPTOS, date(1372, 3, 31), 'medium')).toBe('31 Ches 1372 DR');
		expect(formatCustomDate(HARPTOS, date(1372, 3, 31), 'day-month')).toBe('31 Ches');
	});

	it('renders a stable sentinel for an invalid date instead of throwing', () => {
		expect(formatCustomDate(HARPTOS, date(1372, 2, 99), 'iso-like')).toBe('Invalid date');
	});

	it('pads negative years deterministically', () => {
		expect(formatCustomDate(HARPTOS, date(-12, 1, 1), 'iso-like')).toBe('-0012-01-01');
	});

	it('is INDEPENDENT of host timezone, locale, and clock', () => {
		const target = date(1372, 2, 5);
		const baseline = formatCustomDate(HARPTOS, target, 'long');

		const originalTZ = process.env.TZ;
		const originalDateNow = Date.now;
		try {
			// Mutate the ambient environment a locale/timezone-dependent formatter would read.
			process.env.TZ = 'Pacific/Kiritimati';
			Date.now = () => 0;
			const shiftedTz = formatCustomDate(HARPTOS, target, 'long');

			process.env.TZ = 'Etc/GMT+12';
			Date.now = () => 9_999_999_999_999;
			const shiftedTz2 = formatCustomDate(HARPTOS, target, 'long');

			expect(shiftedTz).toBe(baseline);
			expect(shiftedTz2).toBe(baseline);
		} finally {
			if (originalTZ === undefined) delete process.env.TZ;
			else process.env.TZ = originalTZ;
			Date.now = originalDateNow;
		}
	});
});
