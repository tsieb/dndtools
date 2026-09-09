import { describe, expect, it } from 'vitest';
import {
	CALENDAR_SCHEMA_VERSION,
	createCalendarDefinition,
	ensureVaultContentState,
	holidaysOn,
	migrateCalendarDefinition,
	moonPhasesOn,
	type CalendarDefinition,
	type VaultContentState,
} from '../src';

/**
 * RC-KNW-3.1 — moons, holidays, and the calendar-definition v1 → v2 migration.
 *
 * Moon phase and holiday matching are PURE derivations over the same absolute day index the rest of
 * the calendar arithmetic uses: nothing is stored, nothing reads a clock, and a definition persisted
 * before this slice existed hydrates forward without losing its months.
 */
const CALENDAR: CalendarDefinition = createCalendarDefinition({
	id: 'cal-moons',
	name: 'Wayfarer reckoning',
	months: [
		{ id: 'm1', name: 'Frostwane', days: 30 },
		{ id: 'm2', name: 'Seedfall', days: 28 },
	],
	weekdays: ['First', 'Second', 'Third'],
	epochLabel: 'WR',
	moons: [
		{ id: 'moon-selune', name: 'Selune', cycleDays: 8, offsetDays: 0 },
		{ id: 'moon-ember', name: 'Ember', cycleDays: 16, offsetDays: 4 },
	],
	holidays: [
		{ id: 'hol-thaw', name: 'First thaw', month: 2, day: 1 },
		{ id: 'hol-long', name: 'Longnight', month: 1, day: 30 },
	],
});

describe('RC-KNW-3.1 calendar moons', () => {
	it('derives a phase per moon from the epoch day', () => {
		const phases = moonPhasesOn(CALENDAR, { calendarId: 'cal-moons', year: 1, month: 1, day: 1 });
		expect(phases.map((p) => p.moonId)).toEqual(['moon-selune', 'moon-ember']);
		expect(phases[0]).toMatchObject({ dayInCycle: 0, phase: 'new' });
		// Ember is offset four days into a sixteen-day cycle ⇒ a quarter through it.
		expect(phases[1]).toMatchObject({ dayInCycle: 4, fraction: 0.25, phase: 'firstQuarter' });
	});

	it('walks the cycle and wraps back to new', () => {
		const at = (day: number) =>
			moonPhasesOn(CALENDAR, { calendarId: 'cal-moons', year: 1, month: 1, day })[0]?.phase;
		expect(at(5)).toBe('full');
		expect(at(9)).toBe('new');
	});

	it('stays non-negative for pre-epoch dates', () => {
		const phases = moonPhasesOn(CALENDAR, { calendarId: 'cal-moons', year: -3, month: 1, day: 1 });
		for (const phase of phases) {
			expect(phase.dayInCycle).toBeGreaterThanOrEqual(0);
			expect(phase.fraction).toBeLessThan(1);
		}
	});

	it('returns nothing for a calendar without moons or an invalid date', () => {
		const plain = createCalendarDefinition({
			id: 'cal-plain',
			name: 'Plain',
			months: [{ id: 'm1', name: 'One', days: 10 }],
		});
		expect(moonPhasesOn(plain, { calendarId: 'cal-plain', year: 1, month: 1, day: 1 })).toEqual([]);
		expect(moonPhasesOn(CALENDAR, { calendarId: 'cal-moons', year: 1, month: 1, day: 99 })).toEqual(
			[],
		);
	});
});

describe('RC-KNW-3.1 calendar holidays', () => {
	it('recurs annually on its ordinal month and day', () => {
		for (const year of [1, 2, 87]) {
			expect(holidaysOn(CALENDAR, { calendarId: 'cal-moons', year, month: 2, day: 1 })).toEqual([
				{ id: 'hol-thaw', name: 'First thaw', month: 2, day: 1 },
			]);
		}
		expect(holidaysOn(CALENDAR, { calendarId: 'cal-moons', year: 1, month: 2, day: 2 })).toEqual(
			[],
		);
	});

	it('clamps a holiday onto a day the month actually has, and drops one in a month that does not exist', () => {
		const clamped = createCalendarDefinition({
			id: 'cal-clamp',
			name: 'Clamp',
			months: [{ id: 'm1', name: 'Only', days: 5 }],
			holidays: [
				{ id: 'h1', name: 'Overflow', month: 1, day: 40 },
				{ id: 'h2', name: 'Nowhere', month: 7, day: 1 },
			],
		});
		expect(clamped.holidays).toEqual([{ id: 'h1', name: 'Overflow', month: 1, day: 5 }]);
	});
});

describe('RC-KNW-3.1 calendar definition migration', () => {
	it('upgrades a v1 definition additively and re-stamps the version', () => {
		const v1 = {
			id: 'cal-old',
			name: 'Old reckoning',
			months: [{ id: 'm1', name: 'Hammer', days: 30 }],
			weekdays: ['One', 'Two'],
			epochLabel: 'DR',
			schemaVersion: 1,
		};
		const migrated = migrateCalendarDefinition(v1);
		expect(migrated).not.toBeNull();
		expect(migrated?.schemaVersion).toBe(CALENDAR_SCHEMA_VERSION);
		expect(migrated?.months).toEqual(v1.months);
		expect(migrated?.weekdays).toEqual(v1.weekdays);
		expect(migrated?.epochLabel).toBe('DR');
		expect(migrated?.moons).toBeUndefined();
		expect(migrated?.holidays).toBeUndefined();
	});

	it('rejects a definition it cannot interpret', () => {
		expect(migrateCalendarDefinition(null)).toBeNull();
		expect(migrateCalendarDefinition({ id: 'x', name: 'x', months: [] })).toBeNull();
		expect(
			migrateCalendarDefinition({ name: 'no id', months: [{ id: 'm', name: 'M', days: 1 }] }),
		).toBeNull();
	});

	it('hydrates the persisted calendar registry through the migration', () => {
		const persisted = {
			calendars: {
				'cal-old': {
					id: 'cal-old',
					name: 'Old reckoning',
					months: [{ id: 'm1', name: 'Hammer', days: 30 }],
					schemaVersion: 1,
				},
				'cal-broken': { id: 'cal-broken', name: 'Broken', months: [] },
			},
		} as unknown as VaultContentState;
		const hydrated = ensureVaultContentState(persisted);
		expect(Object.keys(hydrated.calendars)).toEqual(['cal-old']);
		expect(hydrated.calendars['cal-old']?.schemaVersion).toBe(CALENDAR_SCHEMA_VERSION);
	});
});
