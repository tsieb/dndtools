import { describe, expect, it } from 'vitest';
import {
	DEFAULT_WORLD_CALENDAR,
	buildWorldCalendarMonthGrid,
	createWorldDate,
	dayOffsetFromIsoEquivalent,
	formatWorldDate,
	getMoonPhaseStatuses,
	getWorldDateParts,
	normalizeWorldCalendar,
	parseWorldDateInput,
} from './world-calendar.js';

describe('world-calendar', () => {
	it('normalizes calendar definitions with guardrails', () => {
		const normalized = normalizeWorldCalendar({
			weekLength: 3,
			dayNames: ['One'],
			months: [{ name: 'Moonrise', days: 12 }],
			moonCycles: [
				{
					name: 'Selene',
					periodDays: 18,
					phaseNames: ['New', 'Half', 'Full'],
				},
			],
		});

		expect(normalized.weekLength).toBe(3);
		expect(normalized.dayNames).toEqual(['One', 'Day 2', 'Day 3']);
		expect(normalized.months).toEqual([{ name: 'Moonrise', days: 12 }]);
		expect(normalized.moonCycles).toHaveLength(1);
	});

	it('formats Gregorian offsets in short, long, and iso styles', () => {
		expect(formatWorldDate(DEFAULT_WORLD_CALENDAR, 0, 'short')).toBe('1 January, Year 1');
		expect(formatWorldDate(DEFAULT_WORLD_CALENDAR, 0, 'iso')).toBe('0001-01-01');
		expect(formatWorldDate(DEFAULT_WORLD_CALENDAR, 0, 'long')).toContain('Monday');
	});

	it('maps Gregorian leap-year rules with additive deltas', () => {
		const leapDay = dayOffsetFromIsoEquivalent(DEFAULT_WORLD_CALENDAR, 4, 2, 29);
		const commonCenturyLeap = dayOffsetFromIsoEquivalent(DEFAULT_WORLD_CALENDAR, 100, 2, 29);
		const fourHundredLeap = dayOffsetFromIsoEquivalent(DEFAULT_WORLD_CALENDAR, 400, 2, 29);

		expect(leapDay).not.toBeNull();
		expect(commonCenturyLeap).toBeNull();
		expect(fourHundredLeap).not.toBeNull();
	});

	it('converts offsets to date parts and back for custom calendars', () => {
		const custom = normalizeWorldCalendar({
			months: [
				{ name: 'Dawn', days: 10 },
				{ name: 'Dusk', days: 10 },
			],
			weekLength: 5,
			dayNames: ['One', 'Two', 'Three', 'Four', 'Five'],
			leapYearRules: [{ name: 'Extra Dawn Day', interval: 2, monthIndex: 0, dayDelta: 1 }],
		});

		const parsed = parseWorldDateInput(custom, '0002-01-11');
		expect(parsed?.dayOffset).toBe(30);

		const parts = getWorldDateParts(custom, createWorldDate(30));
		expect(parts.year).toBe(2);
		expect(parts.monthName).toBe('Dawn');
		expect(parts.dayOfMonth).toBe(11);
	});

	it('builds month grid with event indicators', () => {
		const eventCounts = new Map<number, number>([
			[0, 2],
			[5, 1],
		]);
		const grid = buildWorldCalendarMonthGrid(DEFAULT_WORLD_CALENDAR, 0, eventCounts);
		expect(grid.monthName).toBe('January');
		expect(grid.weeks.length).toBeGreaterThan(0);
		const firstWeek = grid.weeks[0] ?? [];
		const currentCell = firstWeek.find((cell) => cell?.isCurrentDay);
		expect(currentCell?.eventCount).toBe(2);
	});

	it('computes moon phases for configured cycles', () => {
		const withMoon = normalizeWorldCalendar({
			...DEFAULT_WORLD_CALENDAR,
			moonCycles: [
				{
					name: 'Selune',
					periodDays: 8,
					phaseNames: ['New', 'Quarter', 'Half', 'Gibbous'],
					offsetDays: 0,
				},
			],
		});
		const phases = getMoonPhaseStatuses(withMoon, 3);
		expect(phases).toHaveLength(1);
		expect(phases[0]?.name).toBe('Selune');
		expect(phases[0]?.phaseName).toBe('Quarter');
	});
});
