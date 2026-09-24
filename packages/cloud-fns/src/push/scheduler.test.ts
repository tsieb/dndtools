import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	composeReminders,
	deliverDueReminders,
	FakePushTransport,
	reconcileReminders,
} from './scheduler';
import type { ScheduledSession } from './scheduler';
import { createReminderHandler } from './handler';

const now = Date.parse('2030-01-01T12:00:00Z');
const session = {
	id: 'session',
	summary: 'Friday game',
	startIso: '2030-01-01T13:00:00Z',
	reminderMinutes: 60,
};
describe('push scheduler contract', () => {
	beforeEach(() => {
		vi.spyOn(Date, 'now').mockReturnValue(now);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});
	it('scheduled ticks reconcile the calendar into the injected fake for consenting devices only', async () => {
		const transport = new FakePushTransport();
		const consent = new Set(['a']);
		let calendar: ScheduledSession[] = [session];
		const handler = createReminderHandler(
			{
				devices: async () => ['a', 'b'],
				sessions: async () => calendar,
				hasConsent: (id) => consent.has(id),
			},
			transport,
		);
		await handler();
		await handler();
		expect(transport.queued('a')).toEqual(composeReminders('a', [session], now));
		expect(transport.queued('a')).toHaveLength(1);
		expect(transport.queued('b')).toEqual([]);
		calendar = [{ ...session, cancelled: true }];
		await handler();
		expect(transport.queued('a')).toEqual([]);
		calendar = [session];
		await handler();
		expect(transport.queued('a')).toHaveLength(1);
		consent.clear();
		await handler();
		expect(transport.queued('a')).toEqual([]);
	});
	it('composes metadata with offset-aware calendar time and ignores invalid, cancelled and past sessions', () => {
		const reminders = composeReminders(
			'device',
			[
				session,
				session,
				{ ...session, id: 'cancelled', cancelled: true },
				{ ...session, id: 'past', startIso: '2020-01-01T00:00:00Z' },
				{ ...session, id: 'bad', startIso: 'invalid' },
				{ ...session, id: 'off', reminderMinutes: 0 },
				{ ...session, id: 'invalid-lead', reminderMinutes: NaN },
			],
			now,
		);
		expect(reminders).toHaveLength(1);
		expect(reminders[0]).toMatchObject({ dueAt: now, startsAt: now + 3600000, deviceId: 'device' });
		expect(
			composeReminders('device', [{ ...session, startIso: '2030-01-01T05:00:00-08:00' }], now),
		).toEqual(reminders);
	});
	it('requires per-device consent, replaces retries/reschedules and clears on revocation or cancellation', () => {
		const transport = new FakePushTransport();
		const consent = new Set<string>();
		const reconcile = (deviceId = 'a', sessions: ScheduledSession[] = [session]) =>
			reconcileReminders({
				deviceId,
				sessions,
				now,
				transport,
				hasConsent: (id) => consent.has(id),
			});
		reconcile();
		expect(transport.queued('a')).toEqual([]);
		consent.add('a');
		reconcile();
		reconcile();
		reconcile('b');
		expect(transport.queued('a')).toHaveLength(1);
		expect(transport.queued('b')).toEqual([]);
		reconcile('a', [{ ...session, startIso: '2030-01-02T13:00:00Z' }]);
		expect(transport.queued('a')).toHaveLength(1);
		expect(transport.queued('a')[0].startsAt).toBe(Date.parse('2030-01-02T13:00:00Z'));
		reconcile('a', [{ ...session, cancelled: true }]);
		expect(transport.queued('a')).toEqual([]);
		reconcile();
		consent.clear();
		reconcile();
		expect(transport.queued('a')).toEqual([]);
	});
	it('never invokes delivery without current consent and skips early/expired jobs', async () => {
		const reminders = composeReminders('a', [session], now);
		const sendIfConsented = vi.fn(async () => true);
		await expect(
			deliverDueReminders(reminders, now, async () => false, { sendIfConsented }),
		).resolves.toBe(0);
		await deliverDueReminders(reminders, now - 1, async () => true, { sendIfConsented });
		await deliverDueReminders(reminders, now + 3600000, async () => true, { sendIfConsented });
		expect(sendIfConsented).not.toHaveBeenCalled();
		await expect(
			deliverDueReminders(reminders, now, async () => true, { sendIfConsented }),
		).resolves.toBe(1);
	});
	it('scheduled handler rechecks consent after loading calendar data', async () => {
		const transport = new FakePushTransport();
		let consent = true;
		const handler = createReminderHandler(
			{
				devices: async () => ['a'],
				sessions: async () => {
					consent = false;
					return [session];
				},
				hasConsent: () => consent,
			},
			transport,
		);
		await expect(handler()).resolves.toEqual({ delivery: 'fake' });
		expect(transport.queued('a')).toEqual([]);
	});
});
