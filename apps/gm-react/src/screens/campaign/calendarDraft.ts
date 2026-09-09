/**
 * RC-KNW-3.1 — the calendar editor's DRAFT shape and its pure helpers.
 *
 * The editor holds numbers as raw TEXT while the DM types (so a field can be cleared and retyped
 * rather than snapping back to a coerced value on every keystroke) and normalizes once, at save.
 * Nothing here dispatches or reads state: it is the value layer the screen and the form share.
 */
import type { CalendarDefinition } from '@dndtools/core';
import type { MessageKey, MessageValues } from '../../i18n';

export type DraftMonth = { id: string; name: string; days: string };
export type DraftMoon = { id: string; name: string; cycleDays: string; offsetDays: string };
export type DraftHoliday = { id: string; name: string; month: number; day: string };

export interface Draft {
	id: string;
	name: string;
	epochLabel: string;
	weekdays: string;
	months: DraftMonth[];
	moons: DraftMoon[];
	holidays: DraftHoliday[];
}

/** The i18n lookup the sub-components receive, so they never re-open the provider themselves. */
export type Translate = (key: MessageKey, values?: MessageValues) => string;

/** A slug that is stable enough to be a definition-local id and safe for the core's `idSchema`. */
export function slug(prefix: string, seed: string, index: number): string {
	const base = seed
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${prefix}-${base || 'x'}-${index + 1}`;
}

export function emptyDraft(): Draft {
	return {
		id: '',
		name: '',
		epochLabel: '',
		weekdays: '',
		months: [{ id: 'month-1', name: '', days: '30' }],
		moons: [],
		holidays: [],
	};
}

export function draftFromDefinition(calendar: CalendarDefinition): Draft {
	return {
		id: calendar.id,
		name: calendar.name,
		epochLabel: calendar.epochLabel ?? '',
		weekdays: (calendar.weekdays ?? []).join(', '),
		months: calendar.months.map((m) => ({ id: m.id, name: m.name, days: String(m.days) })),
		moons: (calendar.moons ?? []).map((m) => ({
			id: m.id,
			name: m.name,
			cycleDays: String(m.cycleDays),
			offsetDays: String(m.offsetDays),
		})),
		holidays: (calendar.holidays ?? []).map((h) => ({
			id: h.id,
			name: h.name,
			month: h.month,
			day: String(h.day),
		})),
	};
}

/** Whole number from a draft text field, floored at `min`. Never NaN. */
export function num(text: string, fallback: number, min: number): number {
	const value = Number(text);
	if (!text.trim() || !Number.isFinite(value)) return fallback;
	return Math.max(min, Math.trunc(value));
}
