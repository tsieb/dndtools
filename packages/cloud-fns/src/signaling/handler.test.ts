import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// The signaling handler is an UNTRUSTED relay: it brokers opaque encrypted
// offer/answer strings between a DM host and joining players and never sees session
// content. These tests drive the whole protocol against an in-memory fake of the AWS
// layer (DynamoDB + API GW management), while the join rate-limiter runs the REAL
// @dndtools/core policy (aliased to source in vitest.cloud.config.ts).

// --- Fake AWS layer, shared with the vi.mock factory via vi.hoisted -------------
const aws = vi.hoisted(() => {
	// table name -> (primary-key value -> stored record)
	const tables = new Map<string, Map<string, Record<string, unknown>>>();
	// which attribute is the partition key for each configured table
	const pk: Record<string, string> = {};
	// messages the handler posted back out over the socket, in order
	const sent: Array<{ connectionId: string; payload: Record<string, unknown> }> = [];
	// connection ids whose postToConnection should fail as "gone" (stale peer)
	const dead = new Set<string>();

	const tbl = (name: string) => {
		let t = tables.get(name);
		if (!t) tables.set(name, (t = new Map()));
		return t;
	};
	const stringify = (r: Record<string, unknown>) => {
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(r)) out[k] = String(v); // mimic DynamoDB S/N -> string
		return out;
	};

	return { tables, pk, sent, dead, tbl, stringify };
});

vi.mock('../lib/turn.ts', () => ({
	mintTurnCredentials: (secret: string, id: string, uri: string, ttl: number) => ({
		ttl,
		iceServers: [
			{ urls: 'stun:stun.l.google.com:19302' },
			{ urls: [`${uri}?transport=udp`], username: `${id}`, credential: `cred-for-${secret}` },
		],
	}),
}));

vi.mock('../lib/aws.ts', () => ({
	managementClient: () => ({ __fake: true }),
	getSecretField: async () => 'unit-test-secret',
	putItem: async (table: string, obj: Record<string, unknown>) => {
		const key = String(obj[aws.pk[table]]);
		aws.tbl(table).set(key, { ...obj });
	},
	getItem: async (table: string, key: Record<string, string>) => {
		const rec = aws.tbl(table).get(String(Object.values(key)[0]));
		return rec ? aws.stringify(rec) : undefined;
	},
	deleteItem: async (table: string, key: Record<string, string>) => {
		aws.tbl(table).delete(String(Object.values(key)[0]));
	},
	scanAll: async (table: string) => [...aws.tbl(table).values()].map(aws.stringify),
	postToConnection: async (_c: unknown, connectionId: string, payload: Record<string, unknown>) => {
		if (aws.dead.has(connectionId)) return false;
		aws.sent.push({ connectionId, payload });
		return true;
	},
}));

// Env is read at module top-level, so set it BEFORE importing the handler.
process.env.CONNECTIONS_TABLE = 'connections';
process.env.ROOMS_TABLE = 'rooms';
process.env.ATTEMPTS_TABLE = 'attempts';
process.env.TURN_SECRET_ARN = 'arn:aws:secretsmanager:region:acct:secret:turn';
process.env.TURN_URI = 'turn:203.0.113.10:3478';
process.env.TURN_TTL_SECONDS = '3600';
process.env.WS_ENDPOINT = 'https://ws.example.com/dev';

const { handler } = await import('./handler.ts');

// --- helpers --------------------------------------------------------------------
type Ctx = { connectionId: string; routeKey: string; sub?: string };
function event(ctx: Ctx, body?: unknown): APIGatewayProxyWebsocketEventV2 {
	return {
		requestContext: {
			connectionId: ctx.connectionId,
			routeKey: ctx.routeKey,
			...(ctx.sub ? { authorizer: { sub: ctx.sub } } : {}),
		},
		body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
	} as unknown as APIGatewayProxyWebsocketEventV2;
}
const call = (ctx: Ctx, body?: unknown) =>
	handler(event(ctx, body), {} as never, () => {}) as Promise<{ statusCode: number }>;

const sentTo = (connectionId: string) =>
	aws.sent.filter((m) => m.connectionId === connectionId).map((m) => m.payload);
const lastTo = (connectionId: string) => sentTo(connectionId).at(-1);
const room = (sessionId: string) => aws.tables.get('rooms')?.get(sessionId);
const conn = (connectionId: string) => aws.tables.get('connections')?.get(connectionId);

beforeEach(() => {
	aws.tables.clear();
	aws.sent.length = 0;
	aws.dead.clear();
	aws.pk.connections = 'connectionId';
	aws.pk.rooms = 'sessionId';
	aws.pk.attempts = 'sourceKey';
});

describe('$connect / $disconnect', () => {
	it('$connect persists the connection with the authorized sub', async () => {
		const res = await call({ connectionId: 'c-1', routeKey: '$connect', sub: 'user-1' });
		expect(res.statusCode).toBe(200);
		expect(conn('c-1')).toMatchObject({ connectionId: 'c-1', sub: 'user-1' });
	});

	it('$disconnect removes the connection AND tears down a room it was hosting', async () => {
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default', sub: 'dm' },
			{ action: 'advertise', sessionId: 's-1', name: 'Game' },
		);
		expect(room('s-1')).toBeDefined();

		await call({ connectionId: 'host', routeKey: '$disconnect' });

		expect(conn('host')).toBeUndefined();
		expect(room('s-1')).toBeUndefined(); // orphaned room cleaned up
	});
});

describe('advertise / stopAdvertise / browse', () => {
	it('advertise registers a room, links it to the host connection, and acks', async () => {
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-1', name: 'Curse of Strahd' },
		);

		expect(room('s-1')).toMatchObject({
			sessionId: 's-1',
			hostConnectionId: 'host',
			name: 'Curse of Strahd',
			sub: 'dm',
		});
		expect(conn('host')).toMatchObject({ hostSessionId: 's-1' });
		expect(lastTo('host')).toEqual({ type: 'advertised', sessionId: 's-1' });
	});

	it('advertise without a sessionId is ignored (no room created)', async () => {
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'advertise', name: 'No id' },
		);
		expect(aws.tables.get('rooms')?.size ?? 0).toBe(0);
	});

	it('stopAdvertise deletes the hosted room', async () => {
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-1', name: 'Game' },
		);
		await call({ connectionId: 'host', routeKey: '$default' }, { action: 'stopAdvertise' });
		expect(room('s-1')).toBeUndefined();
	});

	it('browse lists advertised rooms as cloud services', async () => {
		await call({ connectionId: 'h1', routeKey: '$connect', sub: 'dm1' });
		await call(
			{ connectionId: 'h1', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-1', name: 'One' },
		);
		await call({ connectionId: 'h2', routeKey: '$connect', sub: 'dm2' });
		await call(
			{ connectionId: 'h2', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-2', name: 'Two' },
		);

		await call({ connectionId: 'browser', routeKey: '$connect', sub: 'player' });
		await call({ connectionId: 'browser', routeKey: '$default' }, { action: 'browse' });

		const msg = lastTo('browser') as {
			type: string;
			services: Array<{ sessionId: string; name: string; host: string }>;
		};
		expect(msg.type).toBe('services');
		expect(msg.services).toHaveLength(2);
		expect(msg.services).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sessionId: 's-1', name: 'One', host: 'cloud' }),
				expect.objectContaining({ sessionId: 's-2', name: 'Two', host: 'cloud' }),
			]),
		);
	});
});

describe('join → offer → answer relay', () => {
	async function hostAdvertised(sessionId = 's-1') {
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'advertise', sessionId, name: 'Game' },
		);
	}

	it('join asks the host for an offer, keyed by the joiner connection id, and records the joined session', async () => {
		await hostAdvertised();
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1' },
		);

		expect(lastTo('host')).toEqual({ type: 'offer-request', reqId: 'player' });
		expect(conn('player')).toMatchObject({ joiningSessionId: 's-1' });
	});

	it('offer is relayed from the host to the joining client (reqId), carrying the opaque code untouched', async () => {
		await hostAdvertised();
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1' },
		);

		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'offer', reqId: 'player', offerCode: 'OPAQUE-OFFER' },
		);

		expect(lastTo('player')).toEqual({ type: 'offer', reqId: 'player', offerCode: 'OPAQUE-OFFER' });
	});

	it('answer is routed back to the host via the session the joiner joined (client never learns the host id)', async () => {
		await hostAdvertised();
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1' },
		);

		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'answer', answerCode: 'OPAQUE-ANSWER' },
		);

		expect(lastTo('host')).toEqual({
			type: 'answer',
			reqId: 'player',
			answerCode: 'OPAQUE-ANSWER',
		});
	});

	it('a full handshake keeps the two opaque codes intact end-to-end', async () => {
		await hostAdvertised();
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1' },
		);
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'offer', reqId: 'player', offerCode: 'OFFER#1' },
		);
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'answer', reqId: 'player', answerCode: 'ANSWER#1' },
		);

		expect(sentTo('player')).toContainEqual({
			type: 'offer',
			reqId: 'player',
			offerCode: 'OFFER#1',
		});
		expect(sentTo('host')).toContainEqual({
			type: 'answer',
			reqId: 'player',
			answerCode: 'ANSWER#1',
		});
	});
});

describe('join failure handling', () => {
	it('joining an unknown session returns a generic not-found (no room/host disclosure)', async () => {
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 'ghost' },
		);

		expect(lastTo('player')).toMatchObject({ type: 'error', code: 'not-found' });
		// a failed attempt was recorded for later rate-limiting
		expect(aws.tables.get('attempts')?.size).toBe(1);
	});

	it('a stale host connection yields host-offline AND prunes the orphaned room', async () => {
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-1', name: 'Game' },
		);
		aws.dead.add('host'); // host socket died without $disconnect

		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1' },
		);

		expect(lastTo('player')).toMatchObject({ type: 'error', code: 'host-offline' });
		expect(room('s-1')).toBeUndefined();
	});

	it('throttles a source after the core rate limit (5 failures) and stays generic', async () => {
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'attacker' });
		// 5 failed joins against non-existent sessions fill the window.
		for (let i = 0; i < 5; i++) {
			await call(
				{ connectionId: 'player', routeKey: '$default' },
				{ action: 'join', sessionId: `ghost-${i}` },
			);
		}
		expect(lastTo('player')).toMatchObject({ type: 'error', code: 'not-found' });

		// The 6th is rate-limited BEFORE any room lookup.
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 'ghost-6' },
		);
		expect(lastTo('player')).toMatchObject({ type: 'error', code: 'rate-limited' });
	});

	it('rate-limit is keyed by the authorized sub, not the session — different sessions share one bucket', async () => {
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'same-user' });
		for (let i = 0; i < 5; i++) {
			await call(
				{ connectionId: 'player', routeKey: '$default' },
				{ action: 'join', sessionId: `s-${i}` },
			);
		}
		// Only one attempts row exists (one opaque source key), proving the key is the user, not the session.
		expect(aws.tables.get('attempts')?.size).toBe(1);
	});
});

describe('turnCredentials', () => {
	it('mints and returns ICE servers for the caller', async () => {
		await call({ connectionId: 'c-1', routeKey: '$connect', sub: 'user-1' });
		await call({ connectionId: 'c-1', routeKey: '$default' }, { action: 'turnCredentials' });

		const msg = lastTo('c-1') as { type: string; iceServers: unknown[]; ttl: number };
		expect(msg.type).toBe('turn-credentials');
		expect(Array.isArray(msg.iceServers)).toBe(true);
		expect(msg.ttl).toBe(3600);
	});
});

describe('malformed / unknown messages', () => {
	it('reports bad JSON without throwing', async () => {
		await call({ connectionId: 'c-1', routeKey: '$connect', sub: 'user-1' });
		const res = await call({ connectionId: 'c-1', routeKey: '$default' }, '{not json');
		expect(res.statusCode).toBe(200);
		expect(lastTo('c-1')).toMatchObject({ type: 'error', code: 'bad-json' });
	});

	it('reports an unknown action', async () => {
		await call({ connectionId: 'c-1', routeKey: '$connect', sub: 'user-1' });
		await call({ connectionId: 'c-1', routeKey: '$default' }, { action: 'teleport' });
		expect(lastTo('c-1')).toMatchObject({ type: 'error', code: 'unknown-action' });
	});

	it('rejects a request with no connectionId as a 400', async () => {
		const res = await call({ connectionId: '', routeKey: '$default' }, { action: 'browse' });
		expect(res.statusCode).toBe(400);
	});
});
