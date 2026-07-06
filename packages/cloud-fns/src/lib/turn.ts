// Mint short-lived TURN credentials using coturn's REST-API scheme
// (use-auth-secret). username = "<unix-expiry>:<opaque-id>", credential =
// base64(HMAC-SHA1(sharedSecret, username)). coturn recomputes the same HMAC to
// validate — no per-user state on the server. The shared secret never leaves the
// server; only the derived, time-boxed credential is sent to the client.
import { createHmac } from 'node:crypto';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnCredentials {
  iceServers: IceServer[];
  ttl: number;
}

const PUBLIC_STUN = 'stun:stun.l.google.com:19302';

/**
 * @param sharedSecret coturn static-auth-secret
 * @param opaqueId     an opaque, non-PII id embedded in the username (e.g. a hash)
 * @param turnUri      base TURN URI, e.g. "turn:1.2.3.4:3478"
 * @param ttlSeconds   credential lifetime
 */
export function mintTurnCredentials(
  sharedSecret: string,
  opaqueId: string,
  turnUri: string,
  ttlSeconds: number,
): TurnCredentials {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${opaqueId}`;
  const credential = createHmac('sha1', sharedSecret).update(username).digest('base64');

  return {
    ttl: ttlSeconds,
    iceServers: [
      // Free public STUN handles most peers; our own TURN is the relay fallback.
      { urls: PUBLIC_STUN },
      {
        urls: [`${turnUri}?transport=udp`, `${turnUri}?transport=tcp`],
        username,
        credential,
      },
    ],
  };
}
