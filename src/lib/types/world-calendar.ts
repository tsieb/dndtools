export interface WorldDate {
	dayOffset: number;
}

export interface WorldCalendarMonth {
	name: string;
	days: number;
}

export interface WorldCalendarLeapRule {
	name: string;
	interval: number;
	monthIndex: number;
	dayDelta: number;
}

export interface WorldCalendarEra {
	name: string;
	epochOffset: number;
}

export interface WorldCalendarMoonCycle {
	name: string;
	periodDays: number;
	phaseNames: string[];
	offsetDays: number;
}

export interface WorldCalendar {
	version: 1;
	months: WorldCalendarMonth[];
	weekLength: number;
	dayNames: string[];
	leapYearRules: WorldCalendarLeapRule[];
	eras: WorldCalendarEra[];
	moonCycles: WorldCalendarMoonCycle[];
	currentDayOffset: number;
}

export type WorldDateFormat = 'short' | 'long' | 'iso';

export interface WorldDateParts {
	dayOffset: number;
	year: number;
	monthIndex: number;
	monthName: string;
	dayOfMonth: number;
	dayOfWeekIndex: number;
	dayName: string;
	eraName: string | null;
	eraYear: number | null;
}

export interface MoonPhaseStatus {
	name: string;
	phaseName: string;
	phaseIndex: number;
	phaseCount: number;
	periodDays: number;
	dayInCycle: number;
}

export interface WorldCalendarMonthCell {
	dayOffset: number;
	dayOfMonth: number;
	isCurrentMonth: boolean;
	isCurrentDay: boolean;
	isToday: boolean;
	eventCount: number;
}

export interface WorldCalendarMonthGrid {
	year: number;
	monthIndex: number;
	monthName: string;
	dayNames: string[];
	weeks: Array<Array<WorldCalendarMonthCell | null>>;
}
