import { expect, it } from 'vitest';
import { createPushClient, FakePushTransport } from './push';
const session = {
	id: 'event',
	summary: 'Game night',
	startIso: '2099-01-01T12:00:00Z',
	reminderMinutes: 60,
};
function storage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
}
it('defaults off, persists device opt-in, isolates devices and clears revoked previews', () => {
	const device = storage();
	const client = createPushClient(device);
	client.recordSession(session);
	expect(client.queued()).toEqual([]);
	client.setConsent(true);
	expect(client.queued()).toHaveLength(1);
	expect(createPushClient(device).optedIn()).toBe(true);
	expect(createPushClient(storage()).optedIn()).toBe(false);
	client.setConsent(false);
	expect(client.queued()).toEqual([]);
	client.recordSession(session);
	expect(client.queued()).toEqual([]);
});
it('fails closed on storage errors, including a failed opt-out write', () => {
	const device = storage();
	let fail = false;
	const client = createPushClient(
		{
			...device,
			setItem: (key, value) => {
				if (fail) throw Error('unavailable');
				device.setItem(key, value);
			},
		},
		new FakePushTransport(),
	);
	client.setConsent(true);
	client.recordSession(session);
	fail = true;
	expect(() => client.setConsent(false)).toThrow();
	expect(client.optedIn()).toBe(false);
	expect(client.queued()).toEqual([]);
});
