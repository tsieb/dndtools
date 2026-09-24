/** Metadata-only calendar projection. Never include attendees, notes or vault content. */
export interface ScheduledSession {
	id: string;
	summary: string;
	startIso: string;
	reminderMinutes: number;
	cancelled?: boolean;
}
export interface PushReminder {
	id: string;
	deviceId: string;
	sessionId: string;
	title: string;
	body: string;
	dueAt: number;
	startsAt: number;
}
export interface PushTransport {
	readonly delivery: 'fake' | 'live';
	/** Replace pending reminders for this device, including cancellations and opt-out. */
	replace(deviceId: string, reminders: readonly PushReminder[]): void;
}

/** The fake has no network or notification API. A queue entry is never a delivery receipt. */
export class FakePushTransport implements PushTransport {
	readonly delivery = 'fake' as const;
	private pending = new Map<string, PushReminder[]>();
	replace(deviceId: string, reminders: readonly PushReminder[]): void {
		this.pending.set(
			deviceId,
			reminders.map((reminder) => ({ ...reminder })),
		);
	}
	queued(deviceId: string): PushReminder[] {
		return (this.pending.get(deviceId) ?? []).map((reminder) => ({ ...reminder }));
	}
}

export function composeReminders(
	deviceId: string,
	sessions: readonly ScheduledSession[],
	now: number,
): PushReminder[] {
	const reminders = new Map<string, PushReminder>();
	for (const session of sessions) {
		const startsAt = Date.parse(session.startIso);
		if (
			!deviceId ||
			!session.id ||
			session.cancelled ||
			!Number.isFinite(now) ||
			!Number.isFinite(startsAt) ||
			startsAt <= now ||
			!Number.isFinite(session.reminderMinutes) ||
			session.reminderMinutes <= 0
		)
			continue;
		const dueAt = startsAt - session.reminderMinutes * 60_000;
		if (!Number.isFinite(dueAt)) continue;
		reminders.set(session.id, {
			id: JSON.stringify([deviceId, session.id, startsAt, session.reminderMinutes]),
			deviceId,
			sessionId: session.id,
			title: 'Upcoming game session',
			body: `${session.summary.trim() || 'Game session'} · ${new Date(startsAt).toISOString()}`,
			dueAt,
			startsAt,
		});
	}
	return [...reminders.values()].sort((a, b) => a.dueAt - b.dueAt);
}

/** Consent is read at reconciliation time, never taken from a queued job's old snapshot. */
export function reconcileReminders(input: {
	deviceId: string;
	sessions: readonly ScheduledSession[];
	now: number;
	hasConsent: (deviceId: string) => boolean;
	transport: PushTransport;
}): void {
	input.transport.replace(
		input.deviceId,
		input.hasConsent(input.deviceId) === true
			? composeReminders(input.deviceId, input.sessions, input.now)
			: [],
	);
}

export interface ReminderDelivery {
	/** Must atomically deduplicate reminder.id, and enforce current device consent. */
	sendIfConsented(reminder: PushReminder): Promise<boolean>;
}

/** Separate due-time delivery seam; a fake build never installs a live delivery adapter. */
export async function deliverDueReminders(
	reminders: readonly PushReminder[],
	now: number,
	hasConsent: (deviceId: string) => Promise<boolean>,
	delivery: ReminderDelivery,
): Promise<number> {
	let sent = 0;
	for (const reminder of reminders) {
		if (
			reminder.dueAt <= now &&
			reminder.startsAt > now &&
			(await hasConsent(reminder.deviceId)) === true &&
			(await delivery.sendIfConsented(reminder))
		)
			sent++;
	}
	return sent;
}
