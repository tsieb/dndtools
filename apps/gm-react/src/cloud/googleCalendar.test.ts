import { describe, expect, it } from 'vitest';
import { buildSessionEventPayload, isLikelyEmail } from './googleCalendar';

// P2 #8 (Calendar half) — the event payload is METADATA ONLY and must stay well-formed for the
// Calendar API: RFC3339 start/end, bounded duration/reminder, and attendee entries only for values
// that are actually emails (the onboarding roster mixes display names and emails).

describe('googleCalendar payload assembly', () => {
	const START = '2026-08-01T18:00:00.000Z';

	it('builds start/end from duration and an explicit popup reminder', () => {
		const p = buildSessionEventPayload({
			summary: '  Saltreach — session 7 ',
			startIso: START,
			durationMinutes: 180,
			attendeeEmails: [],
			reminderMinutes: 60,
		});
		expect(p.summary).toBe('Saltreach — session 7');
		expect(p.start.dateTime).toBe('2026-08-01T18:00:00.000Z');
		expect(p.end.dateTime).toBe('2026-08-01T21:00:00.000Z');
		expect(p.reminders).toEqual({
			useDefault: false,
			overrides: [{ method: 'popup', minutes: 60 }],
		});
		expect(p.attendees).toBeUndefined();
		expect(p.description).toBeUndefined();
	});

	it('keeps only real email attendees and carries the typed note verbatim', () => {
		const p = buildSessionEventPayload({
			summary: 'Session',
			startIso: START,
			durationMinutes: 120,
			attendeeEmails: ['Sera Duskwhisper', 'kara@example.com', 'not-an-email@', 'tor@example.org'],
			details: 'Bring snacks.',
			reminderMinutes: 0,
		});
		expect(p.attendees).toEqual([{ email: 'kara@example.com' }, { email: 'tor@example.org' }]);
		expect(p.description).toBe('Bring snacks.');
		expect(p.reminders).toEqual({ useDefault: true });
	});

	it('clamps absurd durations and reminders to Calendar-legal bounds', () => {
		const p = buildSessionEventPayload({
			summary: 'S',
			startIso: START,
			durationMinutes: 5,
			attendeeEmails: [],
			reminderMinutes: 999_999,
		});
		// duration floor is 15 minutes; reminder ceiling is Google's 4-week maximum.
		expect(p.end.dateTime).toBe('2026-08-01T18:15:00.000Z');
		expect(p.reminders.overrides?.[0]?.minutes).toBe(40_320);
	});

	it('rejects an unparseable start time instead of scheduling garbage', () => {
		expect(() =>
			buildSessionEventPayload({
				summary: 'S',
				startIso: 'yesterday-ish',
				durationMinutes: 60,
				attendeeEmails: [],
				reminderMinutes: 0,
			}),
		).toThrow(/invalid session start/i);
	});

	it('email shape check accepts addresses and rejects roster display names', () => {
		expect(isLikelyEmail(' kara@example.com ')).toBe(true);
		expect(isLikelyEmail('Sera Duskwhisper')).toBe(false);
		expect(isLikelyEmail('a@b')).toBe(false);
	});
});
