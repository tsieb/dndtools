// Cloud implementation of the DiscoveryBridge interface — the third transport
// alongside Electron LAN mDNS and manual codes. It relays the SAME opaque,
// already-encrypted offer/answer code strings over the Cognito-gated signaling
// WebSocket, so SessionHost/SessionClient need no changes. Before hosting/joining
// it fetches minted STUN/TURN credentials and injects them into the RTC config so
// the (non-trickle) gathered SDP carries internet-reachable candidates.
import type { DiscoveryBridge, DiscoveredService } from './discovery';
import { setRtcIceServers } from './signaling';
import { cloudConfig, isCloudConfigured } from '../cloud/config';

interface ServerMessage {
  type: string;
  [k: string]: unknown;
}

type Waiter = {
  type: string;
  resolve: (m: ServerMessage) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export interface CloudBridge extends DiscoveryBridge {
  /** Close the signaling socket (session teardown). */
  close(): void;
}

export function createCloudBridge(getIdToken: () => Promise<string | null>): CloudBridge {
  let ws: WebSocket | null = null;
  let connecting: Promise<void> | null = null;

  const offerRequestCbs = new Set<(reqId: string) => void>();
  const answerCbs = new Set<(answerCode: string) => void>();
  const offerCbs = new Set<(reqId: string, offerCode: string) => void>();
  const servicesCbs = new Set<(services: DiscoveredService[]) => void>();
  const waiters: Waiter[] = [];

  function handleMessage(raw: string) {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    // Resolve any one-shot waiters for this message type.
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].type === msg.type) {
        clearTimeout(waiters[i].timer);
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
    switch (msg.type) {
      case 'offer-request':
        offerRequestCbs.forEach((cb) => cb(String(msg.reqId)));
        break;
      case 'offer':
        offerCbs.forEach((cb) => cb(String(msg.reqId), String(msg.offerCode)));
        break;
      case 'answer':
        answerCbs.forEach((cb) => cb(String(msg.answerCode)));
        break;
      case 'services':
        servicesCbs.forEach((cb) => cb((msg.services as DiscoveredService[]) ?? []));
        break;
      case 'error':
        console.warn('[cloud signaling]', msg.code, msg.message);
        break;
    }
  }

  async function ensureConnected(): Promise<void> {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    if (connecting) return connecting;
    connecting = (async () => {
      const token = await getIdToken();
      if (!token) throw new Error('Sign in to use online play.');
      await new Promise<void>((resolve, reject) => {
        const sock = new WebSocket(`${cloudConfig.signalingWsUrl}?token=${encodeURIComponent(token)}`);
        sock.addEventListener('open', () => {
          ws = sock;
          resolve();
        });
        sock.addEventListener('error', () => reject(new Error('Could not reach the signaling server.')));
        sock.addEventListener('close', () => {
          if (ws === sock) ws = null;
        });
        sock.addEventListener('message', (ev) => handleMessage(typeof ev.data === 'string' ? ev.data : ''));
      });
    })().finally(() => {
      connecting = null;
    });
    return connecting;
  }

  function send(obj: Record<string, unknown>): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('Not connected to the signaling server.');
    ws.send(JSON.stringify(obj));
  }

  function waitFor(type: string, timeoutMs = 10000): Promise<ServerMessage> {
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = waiters.findIndex((w) => w.timer === timer);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error(`Timed out waiting for ${type}.`));
      }, timeoutMs);
      waiters.push({ type, resolve, reject, timer });
    });
  }

  async function refreshTurn(): Promise<void> {
    send({ action: 'turnCredentials' });
    const creds = await waitFor('turn-credentials');
    setRtcIceServers((creds.iceServers as RTCIceServer[]) ?? []);
  }

  return {
    available: async () => isCloudConfigured && (await getIdToken()) !== null,

    async advertise(sessionId, name) {
      await ensureConnected();
      await refreshTurn();
      send({ action: 'advertise', sessionId, name });
      await waitFor('advertised');
      return { ok: true };
    },

    async stopAdvertise() {
      if (ws?.readyState === WebSocket.OPEN) send({ action: 'stopAdvertise' });
    },

    async browseStart() {
      await ensureConnected();
      send({ action: 'browse' });
    },

    async browseStop() {
      /* browse is one-shot; nothing to tear down */
    },

    async connect(service) {
      await ensureConnected();
      await refreshTurn();
      send({ action: 'join', sessionId: service.sessionId });
    },

    onOfferRequest(cb) {
      offerRequestCbs.add(cb);
      return () => offerRequestCbs.delete(cb);
    },
    async respondOffer(reqId, offerCode) {
      send({ action: 'offer', reqId, offerCode });
    },
    onAnswer(cb) {
      answerCbs.add(cb);
      return () => answerCbs.delete(cb);
    },
    onOffer(cb) {
      offerCbs.add(cb);
      return () => offerCbs.delete(cb);
    },
    async respondAnswer(reqId, answerCode) {
      send({ action: 'answer', reqId, answerCode });
    },
    onServices(cb) {
      servicesCbs.add(cb);
      return () => servicesCbs.delete(cb);
    },

    close() {
      for (const w of waiters.splice(0)) {
        clearTimeout(w.timer);
        w.reject(new Error('closed'));
      }
      ws?.close();
      ws = null;
    },
  };
}
