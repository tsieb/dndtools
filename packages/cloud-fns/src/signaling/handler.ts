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

const CONNECTION_TTL_SECONDS = 4 * 60 * 60; // 4h
const ROOM_TTL_SECONDS = 6 * 60 * 60; // 6h
const ATTEMPT_TTL_SECONDS = 60 * 60; // 1h

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
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const { connectionId, routeKey } = event.requestContext;
  const authSub = (event.requestContext as unknown as { authorizer?: { sub?: string } }).authorizer?.sub;

  if (!connectionId) return { statusCode: 400, body: 'no connection' };
  const mgmt = managementClient(WS_ENDPOINT);

  try {
    if (routeKey === '$connect') {
      await putItem(CONNECTIONS_TABLE, {
        connectionId,
        sub: authSub ?? '',
        expiresAt: nowEpoch() + CONNECTION_TTL_SECONDS,
      });
      return ok;
    }

    if (routeKey === '$disconnect') {
      const conn = await getItem(CONNECTIONS_TABLE, { connectionId });
      if (conn?.hostSessionId) {
        await deleteItem(ROOMS_TABLE, { sessionId: conn.hostSessionId });
      }
      await deleteItem(CONNECTIONS_TABLE, { connectionId });
      return ok;
    }

    // $default — an application message.
    const conn = await getItem(CONNECTIONS_TABLE, { connectionId });
    const sub = conn?.sub || authSub || '';
    let msg: ClientEnvelope = {};
    try {
      msg = event.body ? (JSON.parse(event.body) as ClientEnvelope) : {};
    } catch {
      await postToConnection(mgmt, connectionId, { type: 'error', code: 'bad-json', message: 'Malformed message.' });
      return ok;
    }

    switch (msg.action) {
      case 'advertise': {
        if (!msg.sessionId) break;
        await putItem(ROOMS_TABLE, {
          sessionId: msg.sessionId,
          hostConnectionId: connectionId,
          name: msg.name ?? 'Session',
          sub,
          expiresAt: nowEpoch() + ROOM_TTL_SECONDS,
        });
        await putItem(CONNECTIONS_TABLE, {
          connectionId,
          sub,
          hostSessionId: msg.sessionId,
          expiresAt: nowEpoch() + CONNECTION_TTL_SECONDS,
        });
        await postToConnection(mgmt, connectionId, { type: 'advertised', sessionId: msg.sessionId });
        break;
      }

      case 'stopAdvertise': {
        const sessionId = conn?.hostSessionId;
        if (sessionId) await deleteItem(ROOMS_TABLE, { sessionId });
        await putItem(CONNECTIONS_TABLE, { connectionId, sub, expiresAt: nowEpoch() + CONNECTION_TTL_SECONDS });
        break;
      }

      case 'browse': {
        const rooms = await scanAll(ROOMS_TABLE);
        const services = rooms.map((r) => ({ sessionId: r.sessionId, name: r.name, host: 'cloud', port: 0 }));
        await postToConnection(mgmt, connectionId, { type: 'services', services });
        break;
      }

      case 'join': {
        if (!msg.sessionId) break;
        // Rate-limit joins per opaque user hash (SEC-005), reusing core policy.
        const sourceKey = sha256(sub || connectionId);
        const attemptRow = await getItem(ATTEMPTS_TABLE, { sourceKey });
        const record: JoinAttemptRecord | undefined = attemptRow
          ? { sourceKey, failedAt: JSON.parse(attemptRow.failedAt || '[]') }
          : undefined;
        const decision = evaluateJoinRateLimit(record, nowIso(), DEFAULT_JOIN_RATE_LIMIT);
        if (!decision.allowed) {
          await postToConnection(mgmt, connectionId, { type: 'error', code: 'rate-limited', message: decision.message });
          break;
        }

        const room = await getItem(ROOMS_TABLE, { sessionId: msg.sessionId });
        if (!room?.hostConnectionId) {
          const updated = recordFailedJoinAttempt(record, sourceKey, nowIso(), DEFAULT_JOIN_RATE_LIMIT);
          await putItem(ATTEMPTS_TABLE, {
            sourceKey,
            failedAt: JSON.stringify(updated.failedAt),
            expiresAt: nowEpoch() + ATTEMPT_TTL_SECONDS,
          });
          await postToConnection(mgmt, connectionId, { type: 'error', code: 'not-found', message: 'Session is not available.' });
          break;
        }

        // Remember which session this connection is joining, so the later answer
        // can be routed back to the host without the client knowing the host id.
        await putItem(CONNECTIONS_TABLE, {
          connectionId,
          sub,
          joiningSessionId: msg.sessionId,
          expiresAt: nowEpoch() + CONNECTION_TTL_SECONDS,
        });

        const delivered = await postToConnection(mgmt, room.hostConnectionId, {
          type: 'offer-request',
          reqId: connectionId,
        });
        if (!delivered) {
          // Host connection is stale — clean up the orphaned room.
          await deleteItem(ROOMS_TABLE, { sessionId: msg.sessionId });
          await postToConnection(mgmt, connectionId, { type: 'error', code: 'host-offline', message: 'The host is no longer connected.' });
        }
        break;
      }

      case 'offer': {
        // Host → joining client. reqId is the client's connection id.
        if (!msg.reqId || !msg.offerCode) break;
        await postToConnection(mgmt, msg.reqId, { type: 'offer', reqId: msg.reqId, offerCode: msg.offerCode });
        break;
      }

      case 'answer': {
        // Joining client → host. Route via the session this connection joined.
        if (!msg.answerCode) break;
        const sessionId = conn?.joiningSessionId;
        if (!sessionId) break;
        const room = await getItem(ROOMS_TABLE, { sessionId });
        if (room?.hostConnectionId) {
          await postToConnection(mgmt, room.hostConnectionId, {
            type: 'answer',
            reqId: msg.reqId ?? connectionId,
            answerCode: msg.answerCode,
          });
        }
        break;
      }

      case 'turnCredentials': {
        const secret = await getSecretField(TURN_SECRET_ARN, 'secret');
        const creds = mintTurnCredentials(secret, sha256(sub || connectionId).slice(0, 16), TURN_URI, TURN_TTL_SECONDS);
        await postToConnection(mgmt, connectionId, { type: 'turn-credentials', ...creds });
        break;
      }

      default:
        await postToConnection(mgmt, connectionId, { type: 'error', code: 'unknown-action', message: 'Unknown action.' });
    }

    return ok;
  } catch (err) {
    console.error('signaling error', { routeKey, connectionId, err });
    return { statusCode: 500, body: 'error' };
  }
};
