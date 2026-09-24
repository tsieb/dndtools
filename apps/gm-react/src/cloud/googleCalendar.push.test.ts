import { afterEach, expect, it, vi } from 'vitest';
const recordSession = vi.hoisted(() => vi.fn());
vi.mock('./push', () => ({ pushClient: { recordSession } }));
import { createSessionEvent } from './googleCalendar';
afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
it('queues only the canonical calendar metadata after successful creation', async () => {
	vi.stubGlobal('sessionStorage', {
		getItem: () => JSON.stringify({ accessToken: 'test-token', expiresAt: Date.now() + 60_000 }),
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({ id: 'calendar-id' }), { status: 200 })),
	);
	await createSessionEvent({
		summary: '  Game  ',
		startIso: '2099-01-01T04:00:00-08:00',
		durationMinutes: 120,
		reminderMinutes: 999999,
		attendeeEmails: ['player@example.com'],
		details: 'Private note',
	});
	expect(recordSession).toHaveBeenCalledExactlyOnceWith({
		id: 'calendar-id',
		summary: 'Game',
		startIso: '2099-01-01T12:00:00.000Z',
		reminderMinutes: 40320,
	});
});
it('does not queue a reminder when calendar creation fails', async () => {
	vi.stubGlobal('sessionStorage', {
		getItem: () => JSON.stringify({ accessToken: 'test-token', expiresAt: Date.now() + 60_000 }),
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('', { status: 500 })),
	);
	await expect(
		createSessionEvent({
			summary: 'Game',
			startIso: '2099-01-01T12:00:00Z',
			durationMinutes: 120,
			reminderMinutes: 60,
			attendeeEmails: [],
		}),
	).rejects.toThrow();
	expect(recordSession).not.toHaveBeenCalled();
});
