// dndtools cloud signaling — one Lambda for the WebSocket $connect, $disconnect
// and $default routes of an API Gateway WebSocket API. It is a thin, UNTRUSTED
// relay: it brokers opaque encrypted offer/answer code strings between a DM
// (host) and joining players so a WebRTC data channel can form across the
// internet. It never sees session content — the WebRTC payloads are E2E
// encrypted by the existing net/ transport (per-invitation AES-GCM).
//
// The protocol maps 1:1 onto the client DiscoveryBridge interface:
//   host:   advertise / stopAdvertise / onOfferRequest / respondOffer / onAnswer
//   client: browse / join(connect) / onOffer / respondAnswer
//
// Security reuse: join attempts are throttled with @dndtools/core's
// evaluateJoinRateLimit / recordFailedJoinAttempt (SEC-005), keyed by an opaque
// per-user hash — never a session id.
import { createHash } from 'node:crypto';
import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import {
	evaluateJoinRateLimit,
	recordFailedJoinAttempt,
	DEFAULT_JOIN_RATE_LIMIT,
	type JoinAttemptRecord,
} from '@dndtools/core';
import {
	putItem,
	getItem,
	deleteItem,
	scanAll,
	managementClient,
	postToConnection,
	getSecretField,
} from '../lib/aws.ts';
import { mintTurnCredentials } from '../lib/turn.ts';

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const ROOMS_TABLE = process.env.ROOMS_TABLE!;
const ATTEMPTS_TABLE = process.env.ATTEMPTS_TABLE!;
const TURN_SECRET_ARN = process.env.TURN_SECRET_ARN!;
const TURN_URI = process.env.TURN_URI!;
const TURN_TTL_SECONDS = Number(process.env.TURN_TTL_SECONDS ?? '86400');
const WS_ENDPOINT = process.env.WS_ENDPOINT!;

// A live WebSocket outlives its authorizer (which runs only on $connect): every $default message
// re-derives identity from the stored connection row, so that row MUST survive the whole session or
// the socket starts rejecting host/join messages as unauthenticated. Size the TTLs past a long
// tabletop session (4–6h is routine) with headroom so a mid-session TTL sweep can't sever signaling.
const CONNECTION_TTL_SECONDS = 12 * 60 * 60; // 12h
const ROOM_TTL_SECONDS = 12 * 60 * 60; // 12h — a session stays discoverable/rejoinable as long as its host connection
const ATTEMPT_TTL_SECONDS = 60 * 60; // 1h

// Abuse bounds on client-supplied strings. Offer/answer codes are gzip+base64url
// WebRTC SDP bundles (a few KB); the WS frame limit is 128KB. Reject anything an
// order of magnitude past a real handshake rather than storing/relaying it.
const MAX_CODE_LEN = 64 * 1024;
const MAX_NAME_LEN = 128;
const MAX_SESSION_ID_LEN = 128;
const MAX_PUBKEY_LEN = 512; // base64 raw P-256 public key is ~88 chars

const nowIso = () => new Date().toISOString();
const nowEpoch = () => Math.floor(Date.now() / 1000);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const ok = { statusCode: 200, body: '' };

interface ClientEnvelope {
	action?: string;
	sessionId?: string;
	name?: string;
	reqId?: string;
	offerCode?: string;
	answerCode?: string;
	// Ephemeral ECDH (P-256) public key, base64. The client wraps the relayed offer/answer
	// codes under an ECDH-derived key so the relay never sees the session key; it only
	// forwards these public halves. Opaque to the server.
	pubKey?: string;
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
	const { connectionId, routeKey } = event.requestContext;
	const authSub = (event.requestContext as unknown as { authorizer?: { sub?: string } }).authorizer
		?.sub;

	if (!connectionId) return { statusCode: 400, body: 'no connection' };
	const mgmt = managementClient(WS_ENDPOINT);

	try {
		if (routeKey === '$connect') {
			// Fail closed: the Cognito authorizer must have populated `sub`. Never
			// store a connection with an empty sub — downstream authorization
			// (room ownership) and the per-user rate-limit key both derive from it,
			// and an empty sub would let unauthenticated/degraded connections share a
			// single '' identity bucket.
			if (!authSub) return { statusCode: 401, body: 'unauthorized' };
			await putItem(CONNECTIONS_TABLE, {
				connectionId,
				sub: authSub,
				expiresAt: nowEpoch() + CONNECTION_TTL_SECONDS,
			});
			return ok;
		}

		if (routeKey === '$disconnect') {
			const conn = await getItem(CONNECTIONS_TABLE, { connectionId });
			if (conn?.hostSessionId) {
				// Only tear down the room if THIS connection is still its host: a host
				// that dropped and reconnected may have re-advertised the same session
				// from a new connection, and this stale $disconnect must not delete it.
				const room = await getItem(ROOMS_TABLE, { sessionId: conn.hostSessionId });
				if (room?.hostConnectionId === connectionId) {
					await deleteItem(ROOMS_TABLE, { sessionId: conn.hostSessionId });
				}
			}
			await deleteItem(CONNECTIONS_TABLE, { connectionId });
			return ok;
		}

		// $default — an application message.
		const conn = await getItem(CONNECTIONS_TABLE, { connectionId });
		const sub = conn?.sub || authSub || '';
		// Fail closed: a $default message must belong to an authenticated connection
		// (its $connect stored a sub). If not, reject rather than fall back to a
		// connectionId-keyed identity that would bypass the per-user rate-limit and
		// room-ownership checks.
		if (!sub) {
			await postToConnection(mgmt, connectionId, {
				type: 'error',
				code: 'unauthenticated',
				message: 'Not authenticated.',
			});
			return ok;
		}
		// Opaque per-user key reused for both the join rate-limit (SEC-005) and the
		// TURN credential id, so the two namespaces stay in lockstep. Derived from
		// the authenticated sub only (never a spoofable connection id).
		const sourceKey = sha256(sub);
		let msg: ClientEnvelope = {};
		try {
			msg = event.body ? (JSON.parse(event.body) as ClientEnvelope) : {};
		} catch {
			await postToConnection(mgmt, connectionId, {
				type: 'error',
				code: 'bad-json',
				message: 'Malformed message.',
			});
			return ok;
		}

		switch (msg.action) {
			case 'advertise': {
				if (!msg.sessionId || msg.sessionId.length > MAX_SESSION_ID_LEN) break;
				// Don't let one user hijack another's live rendezvous by re-advertising
				// its (browse-discoverable) session id. A host re-advertising or
				// reconnecting keeps the same sub, so legitimate re-hosts still pass.
				const existing = await getItem(ROOMS_TABLE, { sessionId: msg.sessionId });
				if (existing && existing.sub !== sub) {
					await postToConnection(mgmt, connectionId, {
						type: 'error',
						code: 'session-taken',
						message: 'That session is already hosted by someone else.',
					});
					break;
				}
				await putItem(ROOMS_TABLE, {
					sessionId: msg.sessionId,
					hostConnectionId: connectionId,
					name: (msg.name ?? 'Session').slice(0, MAX_NAME_LEN),
					sub,
					expiresAt: nowEpoch() + ROOM_TTL_SECONDS,
				});
				await putItem(CONNECTIONS_TABLE, {
					...conn,
					connectionId,
					sub,
					hostSessionId: msg.sessionId,
					expiresAt: nowEpoch() + CONNECTION_TTL_SECONDS,
				});
				await postToConnection(mgmt, connectionId, {
					type: 'advertised',
					sessionId: msg.sessionId,
				});
				break;
			}

			case 'stopAdvertise': {
				const sessionId = conn?.hostSessionId;
				if (sessionId) {
					const room = await getItem(ROOMS_TABLE, { sessionId });
					if (room?.hostConnectionId === connectionId) await deleteItem(ROOMS_TABLE, { sessionId });
				}
				// Drop hostSessionId but preserve any other connection state (e.g. a
				// concurrent joiningSessionId) instead of clobbering the whole row.
				await putItem(CONNECTIONS_TABLE, {
					...conn,
					connectionId,
					sub,
					hostSessionId: undefined,
					expiresAt: nowEpoch() + CONNECTION_TTL_SECONDS,
				});
				break;
			}

			case 'browse': {
				// SCOPED DISCOVERY: never return a global roster. A stranger's live session is not
				// enumerable — cross-tenant browse leaked every room's id+name to any authenticated
				// user, and an id was all that a join needed. Online joiners now use the DM's
				// out-of-band join code (session id + PIN), so browse only ever reflects the
				// caller's OWN advertised rooms (e.g. to reconcile UI after a reconnect).
				const rooms = (await scanAll(ROOMS_TABLE)).filter((r) => r.sub === sub);
				const services = rooms.map((r) => ({
					sessionId: r.sessionId,
					name: r.name,
					host: 'cloud',
					port: 0,
				}));
				await postToConnection(mgmt, connectionId, { type: 'services', services });
				break;
			}

			case 'join': {
				if (!msg.sessionId || msg.sessionId.length > MAX_SESSION_ID_LEN) break;
				if (msg.pubKey && msg.pubKey.length > MAX_PUBKEY_LEN) break;
				// Rate-limit joins per opaque user hash (SEC-005), reusing core policy.
				const attemptRow = await getItem(ATTEMPTS_TABLE, { sourceKey });
				const record: JoinAttemptRecord | undefined = attemptRow
					? { sourceKey, failedAt: JSON.parse(attemptRow.failedAt || '[]') }
					: undefined;
				const decision = evaluateJoinRateLimit(record, nowIso(), DEFAULT_JOIN_RATE_LIMIT);
				if (!decision.allowed) {
					await postToConnection(mgmt, connectionId, {
						type: 'error',
						code: 'rate-limited',
						message: decision.message,
					});
					break;
				}

				const room = await getItem(ROOMS_TABLE, { sessionId: msg.sessionId });
				if (!room?.hostConnectionId) {
					const updated = recordFailedJoinAttempt(
						record,
						sourceKey,
						nowIso(),
						DEFAULT_JOIN_RATE_LIMIT,
					);
					await putItem(ATTEMPTS_TABLE, {
						sourceKey,
						failedAt: JSON.stringify(updated.failedAt),
						expiresAt: nowEpoch() + ATTEMPT_TTL_SECONDS,
					});
					await postToConnection(mgmt, connectionId, {
						type: 'error',
						code: 'not-found',
						message: 'Session is not available.',
					});
					break;
				}

				// Remember which session this connection is joining, so the later answer
				// can be routed back to the host without the client knowing the host id.
				await putItem(CONNECTIONS_TABLE, {
					...conn,
					connectionId,
					sub,
					joiningSessionId: msg.sessionId,
					expiresAt: nowEpoch() + CONNECTION_TTL_SECONDS,
				});

				const delivered = await postToConnection(mgmt, room.hostConnectionId, {
					type: 'offer-request',
					reqId: connectionId,
					// Forward the joiner's ephemeral ECDH public key so the host can seal the
					// offer end-to-end (the relay never sees the session key). Opaque here.
					pubKey: msg.pubKey,
				});
				if (!delivered) {
					// Host connection is stale — clean up the orphaned room.
					await deleteItem(ROOMS_TABLE, { sessionId: msg.sessionId });
					await postToConnection(mgmt, connectionId, {
						type: 'error',
						code: 'host-offline',
						message: 'The host is no longer connected.',
					});
				}
				break;
			}

			case 'offer': {
				// Host → joining client. reqId is the target (joiner's) connection id.
				if (!msg.reqId || !msg.offerCode || msg.offerCode.length > MAX_CODE_LEN) break;
				if (msg.pubKey && msg.pubKey.length > MAX_PUBKEY_LEN) break;
				// AUTHORIZATION: only the actual host of the session the target is joining
				// may push it an offer. Without this, any authenticated user could inject
				// a forged offer into an arbitrary connection (even cross-session) simply
				// by naming its connectionId. Mirror the server-side resolution the
				// `answer` path already does, in reverse.
				const target = await getItem(CONNECTIONS_TABLE, { connectionId: msg.reqId });
				const targetSession = target?.joiningSessionId;
				if (!targetSession) break;
				const targetRoom = await getItem(ROOMS_TABLE, { sessionId: targetSession });
				if (targetRoom?.hostConnectionId !== connectionId) break; // sender is not the host
				await postToConnection(mgmt, msg.reqId, {
					type: 'offer',
					reqId: msg.reqId,
					offerCode: msg.offerCode,
					// The host's ephemeral ECDH public key, for the joiner to derive the
					// shared key and open the sealed offer. Opaque to the relay.
					pubKey: msg.pubKey,
				});
				break;
			}

			case 'answer': {
				// Joining client → host. Route via the session this connection joined.
				if (!msg.answerCode || msg.answerCode.length > MAX_CODE_LEN) break;
				const sessionId = conn?.joiningSessionId;
				if (!sessionId) break;
				const room = await getItem(ROOMS_TABLE, { sessionId });
				if (room?.hostConnectionId) {
					await postToConnection(mgmt, room.hostConnectionId, {
						type: 'answer',
						// Always the sender's own connection id — never a client-supplied
						// reqId, which a joiner could set to another joiner's id to cross-wire
						// the host's pending-handshake map.
						reqId: connectionId,
						answerCode: msg.answerCode,
					});
				}
				break;
			}

			case 'turnCredentials': {
				const secret = await getSecretField(TURN_SECRET_ARN, 'secret');
				const creds = mintTurnCredentials(
					secret,
					sourceKey.slice(0, 16),
					TURN_URI,
					TURN_TTL_SECONDS,
				);
				await postToConnection(mgmt, connectionId, { type: 'turn-credentials', ...creds });
				break;
			}

			default:
				await postToConnection(mgmt, connectionId, {
					type: 'error',
					code: 'unknown-action',
					message: 'Unknown action.',
				});
		}

		return ok;
	} catch (err) {
		console.error('signaling error', { routeKey, connectionId, err });
		return { statusCode: 500, body: 'error' };
	}
};
