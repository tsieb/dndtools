/**
 * CONTENT-011 — CUSTOM (campaign) CALENDAR arithmetic and STABLE display formatting.
 *
 * This is the determinism keystone for calendar/custom-time content, and it follows EXACTLY the same
 * discipline as the seeded PRNG (`state/prng.ts`): every function here is a PURE function of its
 * explicit inputs. It NEVER reads ambient state — no `Date`, no `Date.now()`, no `Intl`, no host
 * locale, no timezone. A custom date renders identically on every device and in every locale, because
 * the only inputs are the (calendar definition, date value, format spec). Gregorian assumptions are
 * NOT baked in: months, their day counts, the week, and the epoch all come from the calendar
 * definition (custom months, custom day counts, custom epoch label).
 *
 * A `CustomDate` is a structural value `{ calendarId, year, month, day }`, where `month`/`day` are
 * 1-based ordinals into the calendar definition. Arithmetic the content/timeline surfaces need —
 * validation, day-of-year, comparison/ordering, and month rollover when adding days — is implemented
 * here so notes, the graph, search, and session recap surfaces all derive the same answer from the
 * same definition (CONTENT-011 AC1 cross-surface consistency).
 *
 * Pure data + pure functions. No GUI, no storage. The durable content slice (`state/content.ts`)
 * stores calendar definitions and custom-date fields; this module is the policy the content commands
 * and queries compose. There is intentionally no leap-year/intercalary machinery yet — months carry
 * their own day counts, which already expresses fixed-length custom calendars without speculative
 * complexity. Later CONTENT epics can extend `CalendarDefinition` (e.g. an explicit leap rule)
 * without changing this value shape.
 */

export const CALENDAR_SCHEMA_VERSION = 1 as const;

/** One named month in a custom calendar, with its own fixed day count (≥ 1). */
export interface CalendarMonth {
	/** Stable, definition-local month id (used by content fields so a rename never re-points a date). */
	id: string;
	name: string;
	/** Number of days in this month. Must be a positive integer. */
	days: number;
}

/**
 * A campaign calendar DEFINITION: the complete, self-contained description from which every date is
 * computed and formatted. No part of date math reads anything outside this object + the date value.
 */
export interface CalendarDefinition {
	id: string;
	name: string;
	/** Ordered months (index 0 ⇒ ordinal month 1). At least one month is required. */
	months: CalendarMonth[];
	/**
	 * Ordered weekday names. Optional: when present, day-of-week is derived deterministically from the
	 * absolute day count since the epoch; when absent, weekday formatting is unavailable (omitted).
	 */
	weekdays?: string[];
	/** The label printed for the era/epoch (e.g. "AR", "PD"). Absent ⇒ no era suffix. */
	epochLabel?: string;
	schemaVersion: typeof CALENDAR_SCHEMA_VERSION;
}

/**
 * A point in a custom calendar. `year` may be any integer (including ≤ 0 for pre-epoch dates);
 * `month`/`day` are 1-based ordinals validated against the referenced calendar's month/day counts.
 */
export interface CustomDate {
	calendarId: string;
	year: number;
	month: number;
	day: number;
}

/** Why a `CustomDate` is invalid against its calendar definition. */
export type CalendarDateErrorCode =
	| 'calendar-mismatch'
	| 'year-not-integer'
	| 'month-out-of-range'
	| 'day-out-of-range';

export interface CalendarDateValidation {
	valid: boolean;
	code?: CalendarDateErrorCode;
	message?: string;
}

/** Build a calendar definition, normalizing day counts/names. Pure. Throws only on an empty month set. */
export function createCalendarDefinition(input: {
	id: string;
	name: string;
	months: Array<{ id: string; name: string; days: number }>;
	weekdays?: string[];
	epochLabel?: string;
}): CalendarDefinition {
	if (input.months.length === 0) {
		throw new Error('A calendar definition requires at least one month.');
	}
	const months: CalendarMonth[] = input.months.map((m) => ({
		id: m.id,
		name: m.name,
		days: Math.max(1, Math.trunc(m.days)),
	}));
	return {
		id: input.id,
		name: input.name,
		months,
		...(input.weekdays && input.weekdays.length > 0 ? { weekdays: [...input.weekdays] } : {}),
		...(input.epochLabel !== undefined ? { epochLabel: input.epochLabel } : {}),
		schemaVersion: CALENDAR_SCHEMA_VERSION,
	};
}

/** Total number of days in one year of a calendar (sum of every month's day count). Pure. */
export function daysInYear(calendar: CalendarDefinition): number {
	return calendar.months.reduce((sum, month) => sum + month.days, 0);
}

/** The day count of an ordinal (1-based) month, or `null` when the ordinal is out of range. Pure. */
export function daysInMonth(calendar: CalendarDefinition, month: number): number | null {
	const entry = calendar.months[month - 1];
	return entry ? entry.days : null;
}

/**
 * Validate a `CustomDate` against its calendar definition (CONTENT-011 date validation). Fails closed:
 * a mismatched calendar id, a non-integer year, or an out-of-range month/day is rejected with a stable
 * structured code so a content command never commits an unrepresentable date. Pure.
 */
export function validateCustomDate(
	calendar: CalendarDefinition,
	date: CustomDate,
): CalendarDateValidation {
	if (date.calendarId !== calendar.id) {
		return {
			valid: false,
			code: 'calendar-mismatch',
			message: `Date references calendar ${date.calendarId}, not ${calendar.id}.`,
		};
	}
	if (!Number.isInteger(date.year)) {
		return { valid: false, code: 'year-not-integer', message: 'Year must be an integer.' };
	}
	if (!Number.isInteger(date.month) || date.month < 1 || date.month > calendar.months.length) {
		return {
			valid: false,
			code: 'month-out-of-range',
			message: `Month must be between 1 and ${calendar.months.length}.`,
		};
	}
	const monthDays = daysInMonth(calendar, date.month);
	if (monthDays === null || !Number.isInteger(date.day) || date.day < 1 || date.day > monthDays) {
		return {
			valid: false,
			code: 'day-out-of-range',
			message: `Day must be between 1 and ${monthDays ?? 0} for this month.`,
		};
	}
	return { valid: true };
}

/** Whether a `CustomDate` is valid for a calendar. Convenience over {@link validateCustomDate}. Pure. */
export function isValidCustomDate(calendar: CalendarDefinition, date: CustomDate): boolean {
	return validateCustomDate(calendar, date).valid;
}

/**
 * The 1-based DAY-OF-YEAR for a date (CONTENT-011 day-of-year arithmetic): the day's position counting
 * from the first day of the year, summing every prior month's day count. Returns `null` for an invalid
 * date so callers fail closed rather than computing a nonsense ordinal. Pure.
 */
export function dayOfYear(calendar: CalendarDefinition, date: CustomDate): number | null {
	if (!isValidCustomDate(calendar, date)) return null;
	let total = 0;
	for (let m = 1; m < date.month; m += 1) {
		total += daysInMonth(calendar, m) ?? 0;
	}
	return total + date.day;
}

/**
 * The ABSOLUTE day index of a date relative to the calendar epoch (year 1, month 1, day 1 ⇒ 0). This
 * is the canonical integer ordering key: comparing two dates is comparing their absolute day indices,
 * and weekday derivation is a modulo of it. Pure; never reads a real clock.
 *
 * Years with `year ≤ 0` are handled by direct multiplication because every year has the SAME number of
 * days in this model (months carry fixed day counts; there is no leap rule yet), so the index is
 * exactly `(year - 1) * daysInYear + (dayOfYear - 1)`. Returns `null` for an invalid date.
 */
export function absoluteDayIndex(calendar: CalendarDefinition, date: CustomDate): number | null {
	const doy = dayOfYear(calendar, date);
	if (doy === null) return null;
	return (date.year - 1) * daysInYear(calendar) + (doy - 1);
}

/**
 * Compare two dates IN THE SAME calendar for ordering (CONTENT-011 comparison/ordering). Returns a
 * negative number when `a` is earlier, positive when later, `0` when equal. Both must be valid and
 * share the calendar id; otherwise returns `null` (fail closed — never silently order across
 * calendars). Pure: ordering is purely structural, with no clock.
 */
export function compareCustomDates(
	calendar: CalendarDefinition,
	a: CustomDate,
	b: CustomDate,
): number | null {
	const ai = absoluteDayIndex(calendar, a);
	const bi = absoluteDayIndex(calendar, b);
	if (ai === null || bi === null || a.calendarId !== b.calendarId) return null;
	return ai - bi;
}

/**
 * Add a (possibly negative) whole number of days to a date, rolling over months and years
 * (CONTENT-011 month rollover). Pure: derives the result purely from the calendar definition. Returns
 * `null` for an invalid start date. The result is always a valid in-range date in the same calendar.
 */
export function addDays(
	calendar: CalendarDefinition,
	date: CustomDate,
	days: number,
): CustomDate | null {
	const base = absoluteDayIndex(calendar, date);
	if (base === null || !Number.isInteger(days)) return null;
	return fromAbsoluteDayIndex(calendar, base + days);
}

/**
 * Reconstruct a `CustomDate` from an absolute day index (the inverse of {@link absoluteDayIndex}).
 * Pure. Handles negative indices (pre-epoch) by flooring into whole years first, then walking months.
 */
export function fromAbsoluteDayIndex(calendar: CalendarDefinition, index: number): CustomDate {
	const yearLength = daysInYear(calendar);
	// Whole-year offset from the epoch year (year 1). Math.floor keeps negative indices correct.
	const yearOffset = Math.floor(index / yearLength);
	let remainder = index - yearOffset * yearLength; // always in [0, yearLength)
	const year = yearOffset + 1;
	let month = 1;
	for (const entry of calendar.months) {
		if (remainder < entry.days) break;
		remainder -= entry.days;
		month += 1;
	}
	return { calendarId: calendar.id, year, month, day: remainder + 1 };
}

/**
 * The deterministic WEEKDAY name for a date, or `null` when the calendar declares no weekday cycle or
 * the date is invalid. Derived from the absolute day index modulo the weekday count, so it is stable
 * across devices and independent of any host calendar. Pure.
 */
export function weekdayName(calendar: CalendarDefinition, date: CustomDate): string | null {
	if (!calendar.weekdays || calendar.weekdays.length === 0) return null;
	const index = absoluteDayIndex(calendar, date);
	if (index === null) return null;
	const cycle = calendar.weekdays.length;
	// Modulo that stays non-negative for pre-epoch (negative) indices.
	const position = ((index % cycle) + cycle) % cycle;
	return calendar.weekdays[position] ?? null;
}

/**
 * The supported STABLE format specs. Each is a pure mapping from (definition, date) to a string; none
 * consults a locale, timezone, or clock. `iso-like` is the canonical machine-stable form used as the
 * sort/equality key in displays and the cross-surface "consistent" rendering (CONTENT-011 AC1).
 */
export type CalendarDateFormat = 'iso-like' | 'long' | 'medium' | 'day-month';

/** Left-pad an integer to a fixed width with zeros (no locale digits, no `Intl`). Pure. */
function pad(value: number, width: number): string {
	const negative = value < 0;
	const digits = Math.abs(value).toString().padStart(width, '0');
	return negative ? `-${digits}` : digits;
}

/**
 * Render a `CustomDate` to a STABLE display string from the calendar definition + format spec ONLY
 * (CONTENT-011 stable display formatting). This is a pure function: the SAME inputs always yield the
 * SAME output on every device, in every locale, in every timezone. An invalid date renders a single
 * stable `Invalid date` sentinel rather than throwing, so a display surface never crashes on bad data.
 *
 *   - `iso-like`  ⇒ `YYYY-MM-DD` (zero-padded ordinals; the canonical sort/equality key).
 *   - `long`      ⇒ `<Weekday, >Day MonthName, Year< EpochLabel>` (weekday/era only when defined).
 *   - `medium`    ⇒ `Day MonthName Year< EpochLabel>`.
 *   - `day-month` ⇒ `Day MonthName`.
 */
export function formatCustomDate(
	calendar: CalendarDefinition,
	date: CustomDate,
	format: CalendarDateFormat = 'iso-like',
): string {
	if (!isValidCustomDate(calendar, date)) return 'Invalid date';
	const monthEntry = calendar.months[date.month - 1];
	const monthName = monthEntry ? monthEntry.name : `Month ${date.month}`;
	const era = calendar.epochLabel ? ` ${calendar.epochLabel}` : '';

	switch (format) {
		case 'iso-like':
			return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
		case 'long': {
			const weekday = weekdayName(calendar, date);
			const prefix = weekday ? `${weekday}, ` : '';
			return `${prefix}${date.day} ${monthName}, ${date.year}${era}`;
		}
		case 'medium':
			return `${date.day} ${monthName} ${date.year}${era}`;
		case 'day-month':
			return `${date.day} ${monthName}`;
		default:
			return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
	}
}
