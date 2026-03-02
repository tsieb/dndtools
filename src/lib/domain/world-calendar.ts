import type {
	MoonPhaseStatus,
	WorldCalendar,
	WorldCalendarEra,
	WorldCalendarLeapRule,
	WorldCalendarMonth,
	WorldCalendarMoonCycle,
	WorldCalendarMonthCell,
	WorldCalendarMonthGrid,
	WorldDate,
	WorldDateFormat,
	WorldDateParts,
} from '$lib/types/world-calendar.js';

const GREGORIAN_MONTHS: WorldCalendarMonth[] = [
	{ name: 'January', days: 31 },
	{ name: 'February', days: 28 },
	{ name: 'March', days: 31 },
	{ name: 'April', days: 30 },
	{ name: 'May', days: 31 },
	{ name: 'June', days: 30 },
	{ name: 'July', days: 31 },
	{ name: 'August', days: 31 },
	{ name: 'September', days: 30 },
	{ name: 'October', days: 31 },
	{ name: 'November', days: 30 },
	{ name: 'December', days: 31 },
];

const GREGORIAN_DAY_NAMES = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
];

const GREGORIAN_LEAP_RULES: WorldCalendarLeapRule[] = [
	{
		name: 'Leap day every 4 years',
		interval: 4,
		monthIndex: 1,
		dayDelta: 1,
	},
	{
		name: 'Skip leap day every 100 years',
		interval: 100,
		monthIndex: 1,
		dayDelta: -1,
	},
	{
		name: 'Restore leap day every 400 years',
		interval: 400,
		monthIndex: 1,
		dayDelta: 1,
	},
];

export const DEFAULT_WORLD_CALENDAR: WorldCalendar = {
	version: 1,
	months: GREGORIAN_MONTHS,
	weekLength: 7,
	dayNames: GREGORIAN_DAY_NAMES,
	leapYearRules: GREGORIAN_LEAP_RULES,
	eras: [{ name: 'Common Era', epochOffset: 0 }],
	moonCycles: [],
	currentDayOffset: 0,
};

const DAY_OFFSET_PATTERN = /^-?\d{1,8}$/;
const ISO_EQUIVALENT_PATTERN = /^(-?\d{1,8})-(\d{1,2})-(\d{1,2})$/;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(min, Math.min(max, Math.trunc(value)));
	}
	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		if (Number.isFinite(parsed)) {
			return Math.max(min, Math.min(max, Math.trunc(parsed)));
		}
	}
	return fallback;
}

function normalizeString(value: unknown, fallback: string): string {
	if (typeof value === 'string' && value.trim().length > 0) {
		return value.trim();
	}
	return fallback;
}

function normalizeDayNames(raw: unknown, weekLength: number, fallback: string[]): string[] {
	const source = Array.isArray(raw) ? raw : fallback;
	const normalized = source
		.map((entry) => normalizeString(entry, 'Day'))
		.filter((entry) => entry.length > 0)
		.slice(0, weekLength);
	while (normalized.length < weekLength) {
		normalized.push(`Day ${normalized.length + 1}`);
	}
	return normalized;
}

function normalizeMonths(raw: unknown): WorldCalendarMonth[] {
	if (!Array.isArray(raw) || raw.length === 0) {
		return DEFAULT_WORLD_CALENDAR.months.map((month) => ({ ...month }));
	}
	return raw.slice(0, 24).map((entry, index) => {
		const source =
			typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
		return {
			name: normalizeString(source.name, `Month ${index + 1}`),
			days: clampInt(source.days, 30, 1, 500),
		};
	});
}

function normalizeLeapRules(raw: unknown, monthCount: number): WorldCalendarLeapRule[] {
	if (!Array.isArray(raw)) {
		return DEFAULT_WORLD_CALENDAR.leapYearRules.map((rule) => ({ ...rule }));
	}
	return raw.slice(0, 32).flatMap((entry, index) => {
		const source =
			typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
		const interval = clampInt(source.interval, 0, 1, 100_000);
		const dayDelta = clampInt(source.dayDelta, 0, -30, 30);
		if (interval <= 0 || dayDelta === 0) {
			return [];
		}
		return [
			{
				name: normalizeString(source.name, `Rule ${index + 1}`),
				interval,
				monthIndex: clampInt(source.monthIndex, 0, 0, Math.max(0, monthCount - 1)),
				dayDelta,
			},
		];
	});
}

function normalizeEras(raw: unknown): WorldCalendarEra[] {
	if (!Array.isArray(raw) || raw.length === 0) {
		return DEFAULT_WORLD_CALENDAR.eras.map((era) => ({ ...era }));
	}
	const eras = raw.slice(0, 16).map((entry, index) => {
		const source =
			typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
		return {
			name: normalizeString(source.name, `Era ${index + 1}`),
			epochOffset: clampInt(source.epochOffset, 0, -10_000_000, 10_000_000),
		};
	});
	eras.sort((a, b) => a.epochOffset - b.epochOffset);
	return eras;
}

function normalizeMoonCycles(raw: unknown): WorldCalendarMoonCycle[] {
	if (!Array.isArray(raw)) return [];
	return raw.slice(0, 4).flatMap((entry, index) => {
		const source =
			typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
		const periodDays = clampInt(source.periodDays, 0, 1, 50_000);
		if (periodDays <= 0) return [];
		const phaseNames = Array.isArray(source.phaseNames)
			? source.phaseNames
					.map((phase) => normalizeString(phase, 'Phase'))
					.filter((phase) => phase.length > 0)
					.slice(0, 16)
			: [];
		return [
			{
				name: normalizeString(source.name, `Moon ${index + 1}`),
				periodDays,
				phaseNames: phaseNames.length > 0 ? phaseNames : ['New', 'Waxing', 'Full', 'Waning'],
				offsetDays: clampInt(source.offsetDays, 0, -100_000, 100_000),
			},
		];
	});
}

function modulo(value: number, mod: number): number {
	if (mod <= 0) return 0;
	const result = value % mod;
	return result < 0 ? result + mod : result;
}

function monthLengthsForYear(calendar: WorldCalendar, year: number): number[] {
	const lengths = calendar.months.map((month) => month.days);
	for (const rule of calendar.leapYearRules) {
		if (rule.interval <= 0) continue;
		if (year % rule.interval !== 0) continue;
		const index = rule.monthIndex;
		if (index < 0 || index >= lengths.length) continue;
		lengths[index] = Math.max(1, lengths[index]! + rule.dayDelta);
	}
	return lengths;
}

function yearLength(calendar: WorldCalendar, year: number): number {
	return monthLengthsForYear(calendar, year).reduce((sum, days) => sum + days, 0);
}

function startOfYearOffset(calendar: WorldCalendar, year: number): number {
	if (year === 1) return 0;
	let offset = 0;
	if (year > 1) {
		for (let cursor = 1; cursor < year; cursor += 1) {
			offset += yearLength(calendar, cursor);
		}
		return offset;
	}
	for (let cursor = 0; cursor >= year; cursor -= 1) {
		offset -= yearLength(calendar, cursor);
	}
	return offset;
}

export function normalizeWorldCalendar(raw: unknown): WorldCalendar {
	const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	const months = normalizeMonths(source.months);
	const weekLength = clampInt(source.weekLength, DEFAULT_WORLD_CALENDAR.weekLength, 1, 32);
	return {
		version: 1,
		months,
		weekLength,
		dayNames: normalizeDayNames(source.dayNames, weekLength, DEFAULT_WORLD_CALENDAR.dayNames),
		leapYearRules: normalizeLeapRules(source.leapYearRules, months.length),
		eras: normalizeEras(source.eras),
		moonCycles: normalizeMoonCycles(source.moonCycles),
		currentDayOffset: clampInt(source.currentDayOffset, 0, -10_000_000, 10_000_000),
	};
}

export function createWorldDate(dayOffset: number): WorldDate {
	return { dayOffset: Math.trunc(dayOffset) };
}

export function parseWorldDateInput(calendar: WorldCalendar, value: unknown): WorldDate | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return createWorldDate(value);
	}
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (DAY_OFFSET_PATTERN.test(trimmed)) {
		const parsed = Number.parseInt(trimmed, 10);
		if (Number.isFinite(parsed)) return createWorldDate(parsed);
	}
	const match = ISO_EQUIVALENT_PATTERN.exec(trimmed);
	if (!match) return null;
	const year = Number.parseInt(match[1] ?? '', 10);
	const month = Number.parseInt(match[2] ?? '', 10);
	const day = Number.parseInt(match[3] ?? '', 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
	const dayOffset = dayOffsetFromIsoEquivalent(calendar, year, month, day);
	if (dayOffset === null) return null;
	return createWorldDate(dayOffset);
}

export function dayOffsetFromIsoEquivalent(
	calendar: WorldCalendar,
	year: number,
	month: number,
	day: number,
): number | null {
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
	if (month < 1 || month > calendar.months.length) return null;
	const lengths = monthLengthsForYear(calendar, year);
	const monthLength = lengths[month - 1];
	if (!monthLength) return null;
	if (day < 1 || day > monthLength) return null;

	let offset = startOfYearOffset(calendar, year);
	for (let monthIndex = 0; monthIndex < month - 1; monthIndex += 1) {
		offset += lengths[monthIndex]!;
	}
	return offset + (day - 1);
}

export function getWorldDateParts(
	calendarInput: WorldCalendar,
	value: WorldDate | number,
): WorldDateParts {
	const calendar = normalizeWorldCalendar(calendarInput);
	const dayOffset = typeof value === 'number' ? Math.trunc(value) : Math.trunc(value.dayOffset);
	let year = 1;
	let dayRemainder = dayOffset;

	if (dayRemainder >= 0) {
		for (;;) {
			const length = yearLength(calendar, year);
			if (dayRemainder < length) break;
			dayRemainder -= length;
			year += 1;
		}
	} else {
		for (;;) {
			const previousYear = year - 1;
			const length = yearLength(calendar, previousYear);
			dayRemainder += length;
			year = previousYear;
			if (dayRemainder >= 0) break;
		}
	}

	const lengths = monthLengthsForYear(calendar, year);
	let monthIndex = 0;
	let monthRemainder = dayRemainder;
	while (monthIndex < lengths.length - 1 && monthRemainder >= lengths[monthIndex]!) {
		monthRemainder -= lengths[monthIndex]!;
		monthIndex += 1;
	}

	const dayOfMonth = monthRemainder + 1;
	const dayOfWeekIndex = modulo(dayOffset, calendar.weekLength);
	const dayName = calendar.dayNames[dayOfWeekIndex] ?? `Day ${dayOfWeekIndex + 1}`;
	const monthName = calendar.months[monthIndex]?.name ?? `Month ${monthIndex + 1}`;

	const eras = [...calendar.eras].sort((a, b) => a.epochOffset - b.epochOffset);
	let activeEra: WorldCalendarEra | null = null;
	for (const era of eras) {
		if (era.epochOffset <= dayOffset) {
			activeEra = era;
		} else {
			break;
		}
	}

	let eraYear: number | null = null;
	if (activeEra) {
		const relativeParts = getWorldDatePartsWithoutEra(calendar, dayOffset - activeEra.epochOffset);
		eraYear = relativeParts.year;
	}

	return {
		dayOffset,
		year,
		monthIndex,
		monthName,
		dayOfMonth,
		dayOfWeekIndex,
		dayName,
		eraName: activeEra?.name ?? null,
		eraYear,
	};
}

function getWorldDatePartsWithoutEra(
	calendar: WorldCalendar,
	dayOffset: number,
): {
	year: number;
} {
	let year = 1;
	let dayRemainder = dayOffset;
	if (dayRemainder >= 0) {
		for (;;) {
			const length = yearLength(calendar, year);
			if (dayRemainder < length) break;
			dayRemainder -= length;
			year += 1;
		}
		return { year };
	}
	for (;;) {
		const previousYear = year - 1;
		const length = yearLength(calendar, previousYear);
		dayRemainder += length;
		year = previousYear;
		if (dayRemainder >= 0) break;
	}
	return { year };
}

function formatIsoYear(year: number): string {
	const absolute = Math.abs(year).toString().padStart(4, '0');
	return year < 0 ? `-${absolute}` : absolute;
}

export function formatWorldDate(
	calendarInput: WorldCalendar,
	value: WorldDate | number,
	format: WorldDateFormat = 'short',
): string {
	const parts = getWorldDateParts(calendarInput, value);
	const monthNumeric = String(parts.monthIndex + 1).padStart(2, '0');
	const dayNumeric = String(parts.dayOfMonth).padStart(2, '0');
	if (format === 'iso') {
		return `${formatIsoYear(parts.year)}-${monthNumeric}-${dayNumeric}`;
	}
	if (format === 'long') {
		const eraSuffix =
			parts.eraName && parts.eraYear !== null ? `, ${parts.eraName} ${parts.eraYear}` : '';
		return `${parts.dayName}, ${parts.dayOfMonth} ${parts.monthName}, Year ${parts.year}${eraSuffix}`;
	}
	return `${parts.dayOfMonth} ${parts.monthName}, Year ${parts.year}`;
}

export function getMoonPhaseStatuses(
	calendarInput: WorldCalendar,
	value: WorldDate | number,
): MoonPhaseStatus[] {
	const calendar = normalizeWorldCalendar(calendarInput);
	const dayOffset = typeof value === 'number' ? Math.trunc(value) : Math.trunc(value.dayOffset);
	return calendar.moonCycles.map((cycle) => {
		const shifted = dayOffset + cycle.offsetDays;
		const dayInCycle = modulo(shifted, cycle.periodDays);
		const phaseCount = Math.max(1, cycle.phaseNames.length);
		const phaseIndex = Math.floor((dayInCycle * phaseCount) / cycle.periodDays) % phaseCount;
		return {
			name: cycle.name,
			phaseName: cycle.phaseNames[phaseIndex] ?? 'Unknown',
			phaseIndex,
			phaseCount,
			periodDays: cycle.periodDays,
			dayInCycle,
		};
	});
}

export function buildWorldCalendarMonthGrid(
	calendarInput: WorldCalendar,
	value: WorldDate | number,
	eventCountsInput?: ReadonlyMap<number, number>,
): WorldCalendarMonthGrid {
	const calendar = normalizeWorldCalendar(calendarInput);
	const parts = getWorldDateParts(calendar, value);
	const lengths = monthLengthsForYear(calendar, parts.year);
	const monthLength = lengths[parts.monthIndex] ?? 1;
	const monthStartOffset = parts.dayOffset - (parts.dayOfMonth - 1);
	const leadingEmpty = modulo(monthStartOffset, calendar.weekLength);
	const eventCounts = eventCountsInput ?? new Map<number, number>();

	const cells: Array<WorldCalendarMonthCell | null> = [];
	for (let index = 0; index < leadingEmpty; index += 1) {
		cells.push(null);
	}
	for (let day = 1; day <= monthLength; day += 1) {
		const dayOffset = monthStartOffset + (day - 1);
		cells.push({
			dayOffset,
			dayOfMonth: day,
			isCurrentMonth: true,
			isCurrentDay: dayOffset === parts.dayOffset,
			isToday: dayOffset === calendar.currentDayOffset,
			eventCount: eventCounts.get(dayOffset) ?? 0,
		});
	}
	while (cells.length % calendar.weekLength !== 0) {
		cells.push(null);
	}

	const weeks: Array<Array<WorldCalendarMonthCell | null>> = [];
	for (let index = 0; index < cells.length; index += calendar.weekLength) {
		weeks.push(cells.slice(index, index + calendar.weekLength));
	}

	return {
		year: parts.year,
		monthIndex: parts.monthIndex,
		monthName: parts.monthName,
		dayNames: calendar.dayNames.slice(0, calendar.weekLength),
		weeks,
	};
}

export function asWorldDateOffset(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number.parseInt(trimmed, 10);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}
