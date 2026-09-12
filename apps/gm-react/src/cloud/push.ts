import { platformCapabilities } from '../platform/capabilities';
import {
	FakePushTransport,
	reconcileReminders,
	type PushTransport,
	type ScheduledSession,
} from '../../../../packages/cloud-fns/src/push/scheduler';
export { FakePushTransport, type PushTransport, type ScheduledSession };

const CONSENT_KEY = 'dndtools.push.fake-consent.v1';
const DEVICE_KEY = 'dndtools.push.device.v1';

export function createPushClient(
	storage: Pick<Storage, 'getItem' | 'setItem'>,
	transport = new FakePushTransport(),
) {
	let deviceId = '';
	try {
		deviceId = storage.getItem(DEVICE_KEY) || crypto.randomUUID();
		storage.setItem(DEVICE_KEY, deviceId);
	} catch {
		deviceId = ''; /* Unavailable device persistence fails closed. */
	}
	const sessions = new Map<string, ScheduledSession>();
	const listeners = new Set<() => void>();
	let revoked = false;
	const optedIn = () => {
		try {
			return !revoked && !!deviceId && storage.getItem(CONSENT_KEY) === deviceId;
		} catch {
			return false;
		}
	};
	const refresh = () => {
		reconcileReminders({
			deviceId,
			sessions: [...sessions.values()],
			now: Date.now(),
			hasConsent: optedIn,
			transport,
		});
		listeners.forEach((listener) => listener());
	};
	return {
		optedIn,
		setConsent(enabled: boolean) {
			// Clear pending work even if writing the opt-out preference fails.
			revoked = true;
			transport.replace(deviceId, []);
			storage.setItem(CONSENT_KEY, enabled ? deviceId : '');
			revoked = !enabled;
			refresh();
		},
		recordSession(session: ScheduledSession) {
			sessions.set(session.id, { ...session });
			refresh();
		},
		queued: () => (optedIn() ? transport.queued(deviceId) : []),
		refresh,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

const deviceStorage = {
	getItem: (key: string) => globalThis.localStorage.getItem(key),
	setItem: (key: string, value: string) => globalThis.localStorage.setItem(key, value),
};
export const pushClient = createPushClient(deviceStorage);
export const pushDeliveryAvailable = platformCapabilities.pushNotifications.available;
// Cross-tab opt-out must invalidate the fake queue as well.
if (typeof window !== 'undefined') window.addEventListener('storage', () => pushClient.refresh());
