import {
	FakePushTransport,
	reconcileReminders,
	type PushTransport,
	type ScheduledSession,
} from './scheduler';

export interface ReminderSource {
	devices(): Promise<string[]>;
	sessions(deviceId: string): Promise<ScheduledSession[]>;
	hasConsent(deviceId: string): boolean;
}

/** Calendar and consent adapters are injected, so the scheduled trigger has no provider coupling. */
export function createReminderHandler(
	source: ReminderSource,
	transport: PushTransport = new FakePushTransport(),
) {
	return async () => {
		const now = Date.now();
		for (const deviceId of await source.devices()) {
			const sessions = await source.sessions(deviceId);
			reconcileReminders({
				deviceId,
				sessions,
				now,
				transport,
				hasConsent: (id) => source.hasConsent(id),
			});
		}
		return { delivery: transport.delivery };
	};
}

// RC-CLD-2.3 must supply authenticated calendar/consent storage and credentials before enabling
// the deployed schedule. No event payload can turn this build into a live sender.
export const handler = createReminderHandler({
	devices: async () => [],
	sessions: async () => [],
	hasConsent: () => false,
});
