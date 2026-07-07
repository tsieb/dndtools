import { describe, it, expect, vi } from 'vitest';
import { toItem, fromItem, postToConnection } from './aws.ts';

describe('DynamoDB marshalling (toItem / fromItem)', () => {
	it('marshals strings to {S} and numbers to {N} (stringified)', () => {
		expect(toItem({ connectionId: 'c-1', expiresAt: 1720000000 })).toEqual({
			connectionId: { S: 'c-1' },
			expiresAt: { N: '1720000000' },
		});
	});

	it('drops undefined attributes rather than writing NULL (DynamoDB rejects undefined)', () => {
		const item = toItem({ sessionId: 's-1', hostSessionId: undefined, name: 'Table' });
		expect(item).toEqual({ sessionId: { S: 's-1' }, name: { S: 'Table' } });
		expect('hostSessionId' in item).toBe(false);
	});

	it('unmarshals S and N attributes back to plain string values', () => {
		expect(fromItem({ connectionId: { S: 'c-1' }, expiresAt: { N: '1720000000' } })).toEqual({
			connectionId: 'c-1',
			expiresAt: '1720000000', // N comes back as a string — callers Number() where needed
		});
	});

	it('returns undefined for a missing item', () => {
		expect(fromItem(undefined)).toBeUndefined();
	});

	it('round-trips a flat record (numbers become strings on the way back)', () => {
		const original = { sourceKey: 'k', failedAt: '["2026-07-06T00:00:00Z"]', expiresAt: 42 };
		const back = fromItem(toItem(original));
		expect(back).toEqual({ sourceKey: 'k', failedAt: '["2026-07-06T00:00:00Z"]', expiresAt: '42' });
	});
});

describe('postToConnection', () => {
	it('sends JSON and returns true when the connection is live', async () => {
		const send = vi.fn().mockResolvedValue({});
		const client = { send } as never;

		const ok = await postToConnection(client, 'conn-1', { type: 'advertised', sessionId: 's-1' });

		expect(ok).toBe(true);
		expect(send).toHaveBeenCalledTimes(1);
		const cmd = send.mock.calls[0][0];
		// The command carries the target connection and a JSON-encoded body.
		expect(cmd.input.ConnectionId).toBe('conn-1');
		expect(JSON.parse(Buffer.from(cmd.input.Data).toString())).toEqual({
			type: 'advertised',
			sessionId: 's-1',
		});
	});

	it('returns false (swallows) when the peer connection is gone (410) so callers can prune it', async () => {
		const send = vi.fn().mockRejectedValue({ name: 'GoneException' });
		const client = { send } as never;

		await expect(postToConnection(client, 'stale', { type: 'ping' })).resolves.toBe(false);
	});

	it('rethrows non-Gone errors (a real failure must not look like a pruned connection)', async () => {
		const send = vi.fn().mockRejectedValue({ name: 'InternalServerError' });
		const client = { send } as never;

		await expect(postToConnection(client, 'conn', { type: 'ping' })).rejects.toMatchObject({
			name: 'InternalServerError',
		});
	});
});
