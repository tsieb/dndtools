import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// The signaling handler is an UNTRUSTED relay: it brokers opaque encrypted
// offer/answer strings between a DM host and joining players and never sees session
// content. These tests drive the whole protocol against an in-memory fake of the AWS
// layer (DynamoDB + API GW management), while the join rate-limiter consumes the
// @dndtools/core SEC-005 ceiling with an atomic DynamoDB counter.

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

	return {
		tables,
		pk,
		sent,
		dead,
		tbl,
		stringify,
		planReadFails: false,
		appReadConsistency: [] as boolean[],
	};
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
	putItemConditional: async (
		table: string,
		obj: Record<string, unknown>,
		condition: { values?: Record<string, string | number> },
	) => {
		const key = String(obj[aws.pk[table]]);
		const existing = aws.tbl(table).get(key);
		if (existing) {
			const sameOwner = existing.sub === condition.values?.[':sub'];
			const expired = Number(existing.expiresAt) < Number(condition.values?.[':now']);
			if (!sameOwner && !expired) return false;
		}
		aws.tbl(table).set(key, { ...obj });
		return true;
	},
	getItem: async (table: string, key: Record<string, string>, consistentRead = false) => {
		if (table === 'app') aws.appReadConsistency.push(consistentRead);
		if (table === 'app' && aws.planReadFails) throw new Error('simulated entitlement outage');
		const rec = aws.tbl(table).get(String(Object.values(key)[0]));
		return rec ? aws.stringify(rec) : undefined;
	},
	deleteItem: async (table: string, key: Record<string, string>) => {
		aws.tbl(table).delete(String(Object.values(key)[0]));
	},
	scanAll: async (table: string) => [...aws.tbl(table).values()].map(aws.stringify),
	incrementCounterBelow: async (
		table: string,
		key: Record<string, string>,
		limit: number,
		expiresAt: number,
	) => {
		const id = String(Object.values(key)[0]);
		const current = Number(aws.tbl(table).get(id)?.requestCount ?? 0);
		if (current >= limit) return false;
		aws.tbl(table).set(id, { ...key, requestCount: current + 1, expiresAt });
		return true;
	},
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
process.env.APP_TABLE = 'app';
process.env.TURN_SECRET_ARN = 'arn:aws:secretsmanager:region:acct:secret:turn';
process.env.TURN_URI = 'turn:203.0.113.10:3478';
process.env.TURN_TTL_SECONDS = '3600';
process.env.WS_ENDPOINT = 'https://ws.example.com/dev';

const { handler } = await import('./handler.ts');

// --- helpers --------------------------------------------------------------------
const VALID_PUB_KEY =
	'BGsX0fLhLEJH+Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT+NC4v4af5uO5+tKfA+eFivOM1drMV7Oy7ZAaDe/UfU=';

type Ctx = {
	connectionId: string;
	routeKey: string;
	sub?: string;
	/** null deliberately leaves the authoritative entitlement row absent. */
	plan?: 'hearth' | 'lantern' | 'beacon' | null;
};
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
const call = (ctx: Ctx, body?: unknown) => {
	if (ctx.routeKey === '$connect' && ctx.sub && ctx.plan !== null) {
		const pk = `account#${ctx.sub}`;
		if (!aws.tbl('app').has(pk)) {
			aws.tbl('app').set(pk, { pk, sk: 'entitlement', plan: ctx.plan ?? 'lantern' });
		}
	}
	// Existing protocol tests predate mandatory ECDH keys. Supply one at the event boundary
	// unless the test explicitly provided pubKey (including null) to exercise rejection.
	let normalized = body;
	if (
		body &&
		typeof body === 'object' &&
		!Array.isArray(body) &&
		['join', 'offer'].includes(String((body as { action?: unknown }).action)) &&
		!Object.hasOwn(body, 'pubKey')
	) {
		normalized = { ...(body as Record<string, unknown>), pubKey: VALID_PUB_KEY };
	}
	return handler(event(ctx, normalized), {} as never, () => {}) as Promise<{ statusCode: number }>;
};

const sentTo = (connectionId: string) =>
	aws.sent.filter((m) => m.connectionId === connectionId).map((m) => m.payload);
const lastTo = (connectionId: string) => sentTo(connectionId).at(-1);
const room = (sessionId: string) => aws.tables.get('rooms')?.get(sessionId);
const conn = (connectionId: string) => aws.tables.get('connections')?.get(connectionId);

beforeEach(() => {
	aws.tables.clear();
	aws.sent.length = 0;
	aws.dead.clear();
	aws.planReadFails = false;
	aws.appReadConsistency.length = 0;
	aws.pk.connections = 'connectionId';
	aws.pk.rooms = 'sessionId';
	aws.pk.attempts = 'sourceKey';
	aws.pk.app = 'pk';
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
		expect(lastTo('host')).toMatchObject({ type: 'error', code: 'invalid-message' });
	});

	it('atomically keeps a live session id reserved to its first owner', async () => {
		await call({ connectionId: 'host-1', routeKey: '$connect', sub: 'dm-1' });
		await call(
			{ connectionId: 'host-1', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-shared', name: 'Original' },
		);
		await call({ connectionId: 'host-2', routeKey: '$connect', sub: 'dm-2' });
		await call(
			{ connectionId: 'host-2', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-shared', name: 'Hijack' },
		);

		expect(lastTo('host-2')).toMatchObject({ type: 'error', code: 'session-taken' });
		expect(room('s-shared')).toMatchObject({ hostConnectionId: 'host-1', sub: 'dm-1' });
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

	it('browse is scoped to the caller — it never lists another user’s rooms', async () => {
		// Two different DMs each host a room.
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

		// A stranger browsing must NOT be able to enumerate anyone's live sessions: cross-tenant
		// browse was the enumeration half of the join-authorization finding. Joiners use the DM's
		// out-of-band join code instead.
		await call({ connectionId: 'browser', routeKey: '$connect', sub: 'player' });
		await call({ connectionId: 'browser', routeKey: '$default' }, { action: 'browse' });
		const strangerMsg = lastTo('browser') as {
			type: string;
			services: Array<{ sessionId: string; name: string }>;
		};
		expect(strangerMsg.type).toBe('services');
		expect(strangerMsg.services).toHaveLength(0);

		// A host browsing sees only its OWN room (e.g. to reconcile UI after a reconnect).
		await call({ connectionId: 'h1', routeKey: '$default' }, { action: 'browse' });
		const ownMsg = lastTo('h1') as {
			type: string;
			services: Array<{ sessionId: string; name: string; host: string }>;
		};
		expect(ownMsg.services).toEqual([
			expect.objectContaining({ sessionId: 's-1', name: 'One', host: 'cloud' }),
		]);
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

		expect(lastTo('host')).toEqual({
			type: 'offer-request',
			reqId: 'player',
			pubKey: VALID_PUB_KEY,
		});
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

		expect(lastTo('player')).toEqual({
			type: 'offer',
			reqId: 'player',
			offerCode: 'OPAQUE-OFFER',
			pubKey: VALID_PUB_KEY,
		});
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
			pubKey: VALID_PUB_KEY,
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
		// the attempt was recorded for later rate-limiting
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

	it('throttles a source after the core rate limit (5 attempts) and stays generic', async () => {
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'attacker' });
		// 5 joins against non-existent sessions fill the window.
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

	it('rate-limits credential minting across repeated requests from the same account', async () => {
		await call({ connectionId: 'c-1', routeKey: '$connect', sub: 'user-1' });
		for (let request = 0; request < 7; request += 1) {
			await call({ connectionId: 'c-1', routeKey: '$default' }, { action: 'turnCredentials' });
		}

		expect(lastTo('c-1')).toMatchObject({ type: 'error', code: 'turn-rate-limited' });
		expect(sentTo('c-1').filter((message) => message.type === 'turn-credentials')).toHaveLength(6);
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

	it('rejects non-object messages and unsupported fields instead of coercing them', async () => {
		await call({ connectionId: 'c-1', routeKey: '$connect', sub: 'user-1' });
		await call({ connectionId: 'c-1', routeKey: '$default' }, []);
		expect(lastTo('c-1')).toMatchObject({ type: 'error', code: 'invalid-message' });

		await call(
			{ connectionId: 'c-1', routeKey: '$default' },
			{ action: 'browse', plaintext: 'not an allowed field' },
		);
		expect(lastTo('c-1')).toMatchObject({ type: 'error', code: 'invalid-message' });
	});

	it('requires canonical on-curve P-256 public keys on join and offer frames', async () => {
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-1', name: 'Game' },
		);
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });

		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1', pubKey: null },
		);
		expect(lastTo('player')).toMatchObject({ type: 'error', code: 'invalid-message' });
		expect(conn('player')).not.toHaveProperty('joiningSessionId');

		const shapedButOffCurve = `${Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64')}`;
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1', pubKey: shapedButOffCurve },
		);
		expect(lastTo('player')).toMatchObject({ type: 'error', code: 'invalid-message' });

		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'offer', reqId: 'player', offerCode: 'sealed', pubKey: 'not-base64' },
		);
		expect(lastTo('host')).toMatchObject({ type: 'error', code: 'invalid-message' });
	});

	it('rejects a request with no connectionId as a 400', async () => {
		const res = await call({ connectionId: '', routeKey: '$default' }, { action: 'browse' });
		expect(res.statusCode).toBe(400);
	});
});

describe('authorization hardening', () => {
	it('$connect fails closed when the authorizer did not supply a sub', async () => {
		const res = await call({ connectionId: 'c-x', routeKey: '$connect' }); // no sub
		expect(res.statusCode).toBe(401);
		expect(conn('c-x')).toBeUndefined(); // nothing persisted for an unauthenticated connection
	});

	it('enforces Lantern/Beacon at connect and after an already-open socket is downgraded', async () => {
		const missing = await call({
			connectionId: 'free',
			routeKey: '$connect',
			sub: 'free-user',
			plan: null,
		});
		expect(missing.statusCode).toBe(403);
		expect(conn('free')).toBeUndefined();

		await call({ connectionId: 'paid', routeKey: '$connect', sub: 'paid-user' });
		aws.tbl('app').set('account#paid-user', {
			pk: 'account#paid-user',
			sk: 'entitlement',
			plan: 'hearth',
		});
		await call({ connectionId: 'paid', routeKey: '$default' }, { action: 'browse' });
		expect(lastTo('paid')).toMatchObject({ type: 'error', code: 'plan-required' });

		aws.planReadFails = true;
		const outage = await call({
			connectionId: 'outage',
			routeKey: '$connect',
			sub: 'outage-user',
		});
		expect(outage.statusCode).toBe(403);
		expect(conn('outage')).toBeUndefined();
		expect(aws.appReadConsistency.length).toBeGreaterThan(0);
		expect(aws.appReadConsistency.every(Boolean)).toBe(true);
	});

	it('$default rejects a message from a connection with no authenticated sub', async () => {
		// A socket that never completed an authenticated $connect (no stored sub, no authorizer sub).
		await call({ connectionId: 'ghost', routeKey: '$default' }, { action: 'browse' });
		expect(lastTo('ghost')).toMatchObject({ type: 'error', code: 'unauthenticated' });
	});

	it('does NOT relay an offer from a connection that is not the target session host', async () => {
		// Host advertises s-1; a player joins it (offer-request goes to the host).
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-1', name: 'Game' },
		);
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1' },
		);

		// A different authenticated user tries to inject a forged offer at the player.
		await call({ connectionId: 'evil', routeKey: '$connect', sub: 'evil' });
		await call(
			{ connectionId: 'evil', routeKey: '$default' },
			{ action: 'offer', reqId: 'player', offerCode: 'FORGED' },
		);
		expect(sentTo('player').some((m) => m.offerCode === 'FORGED')).toBe(false);

		// The real host CAN deliver an offer to the player it is joining.
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'offer', reqId: 'player', offerCode: 'REAL' },
		);
		expect(sentTo('player').some((m) => m.type === 'offer' && m.offerCode === 'REAL')).toBe(true);
	});

	it('routes an answer to the host using the sender connection id, ignoring a spoofed reqId', async () => {
		await call({ connectionId: 'host', routeKey: '$connect', sub: 'dm' });
		await call(
			{ connectionId: 'host', routeKey: '$default' },
			{ action: 'advertise', sessionId: 's-1', name: 'Game' },
		);
		await call({ connectionId: 'player', routeKey: '$connect', sub: 'p1' });
		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'join', sessionId: 's-1' },
		);

		await call(
			{ connectionId: 'player', routeKey: '$default' },
			{ action: 'answer', reqId: 'someone-elses-conn', answerCode: 'ANS' },
		);
		const ans = sentTo('host').find((m) => m.type === 'answer');
		expect(ans).toMatchObject({ answerCode: 'ANS', reqId: 'player' }); // sender id, not the spoofed reqId
	});
});
