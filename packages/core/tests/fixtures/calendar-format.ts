import { readFileSync } from 'node:fs';
import {
	formatCustomDate,
	type CalendarDefinition,
	type CustomDate,
} from '../../src/state/calendar';

// Invoked by calendar.test.ts with TZ and locale set before Node initializes Date/Intl.
const { calendar, target, now } = JSON.parse(readFileSync(0, 'utf8')) as {
	calendar: CalendarDefinition;
	target: CustomDate;
	now: number;
};
Date.now = () => now;
process.stdout.write(
	JSON.stringify({
		formatted: formatCustomDate(calendar, target, 'long'),
		offset: new Date('2024-01-01T00:00:00Z').getTimezoneOffset(),
		locale: new Intl.DateTimeFormat().resolvedOptions().locale,
		now: Date.now(),
	}),
);
