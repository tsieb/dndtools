import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { mintTurnCredentials } from './turn.ts';

// The credential coturn will accept is base64(HMAC-SHA1(secret, username)) where
// username = "<unix-expiry>:<opaqueId>". These tests pin that contract exactly —
// if the derivation drifts, coturn silently rejects every relay allocation.
const SECRET = 'super-secret-shared-key';
const URI = 'turn:203.0.113.10:3478';

function expectedCredential(secret: string, username: string): string {
	return createHmac('sha1', secret).update(username).digest('base64');
}

afterEach(() => {
	vi.useRealTimers();
});

describe('mintTurnCredentials', () => {
	it('derives a coturn-verifiable credential from the shared secret and username', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
		const nowSec = Math.floor(Date.parse('2026-07-06T00:00:00.000Z') / 1000);

		const { iceServers } = mintTurnCredentials(SECRET, 'opaque-id-123', URI, 3600);
		const turn = iceServers.find((s) => String(s.urls).includes('turn:'))!;

		expect(turn.username).toBe(`${nowSec + 3600}:opaque-id-123`);
		// coturn recomputes the SAME HMAC and compares — reproduce it independently.
		expect(turn.credential).toBe(expectedCredential(SECRET, turn.username!));
	});

	it('embeds the TTL-based expiry in the username so coturn can time-box the allocation', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-06T12:00:00.000Z'));
		const nowSec = Math.floor(Date.parse('2026-07-06T12:00:00.000Z') / 1000);

		const { ttl, iceServers } = mintTurnCredentials(SECRET, 'id', URI, 120);
		const turn = iceServers.find((s) => String(s.urls).includes('turn:'))!;
		const expiry = Number(turn.username!.split(':')[0]);

		expect(ttl).toBe(120);
		expect(expiry).toBe(nowSec + 120);
	});

	it('returns a public STUN server plus the TURN relay over both udp and tcp', () => {
		const { iceServers } = mintTurnCredentials(SECRET, 'id', URI, 3600);

		const stun = iceServers.find((s) => String(s.urls).includes('stun:'));
		expect(stun).toBeDefined();
		expect(stun!.username).toBeUndefined(); // STUN needs no credentials

		const turn = iceServers.find(
			(s) => Array.isArray(s.urls) && s.urls.some((u) => u.includes('turn:')),
		);
		expect(turn).toBeDefined();
		expect(turn!.urls).toEqual([`${URI}?transport=udp`, `${URI}?transport=tcp`]);
		expect(turn!.credential).toBeTruthy();
	});

	it('produces distinct credentials for different opaque ids under the same secret', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
		const a = mintTurnCredentials(SECRET, 'alice', URI, 3600).iceServers.find((s) =>
			String(s.urls).includes('turn:'),
		)!;
		const b = mintTurnCredentials(SECRET, 'bob', URI, 3600).iceServers.find((s) =>
			String(s.urls).includes('turn:'),
		)!;

		expect(a.username).not.toBe(b.username);
		expect(a.credential).not.toBe(b.credential);
	});

	it('produces different credentials when the shared secret changes (secret actually gates the HMAC)', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
		const good = mintTurnCredentials('secret-A', 'id', URI, 3600).iceServers.find((s) =>
			String(s.urls).includes('turn:'),
		)!;
		const wrong = mintTurnCredentials('secret-B', 'id', URI, 3600).iceServers.find((s) =>
			String(s.urls).includes('turn:'),
		)!;

		expect(good.username).toBe(wrong.username); // same clock + id
		expect(good.credential).not.toBe(wrong.credential); // but the secret differs
	});
});
