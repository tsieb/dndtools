// Cloud implementation of the DiscoveryBridge interface — the third transport
// alongside Electron LAN mDNS and manual codes. It relays offer/answer code strings
// over the Cognito-gated signaling WebSocket, so SessionHost/SessionClient need no
// changes. Before hosting/joining it fetches minted STUN/TURN credentials and injects
// them into the RTC config so the (non-trickle) gathered SDP carries internet-reachable
// candidates.
//
// UNTRUSTED RELAY: unlike the LAN/QR path (where the pairing code travels out-of-band),
// the cloud path relays the code through the signaling server — and that code embeds the
// raw AES-GCM session key + SDP. So the bridge wraps every relayed code in an ephemeral
// ECDH (P-256) key agreement (net/cloudCrypto): each side sends only its ephemeral PUBLIC
// key, and the offer/answer codes are AES-GCM encrypted under the derived shared key. The
// relay therefore sees only public keys + ciphertext, never the session key or SDP. This
// is transparent to SessionHost/SessionClient (they still hand plaintext codes in/out);
// the wrap/unwrap and per-pairing key state live entirely here, keyed by reqId (the joiner
// connection id, which is stable across offer-request → offer → answer).
import type { DiscoveryBridge, DiscoveredService } from './discovery';
import { setRtcIceServers } from './signaling';
import { cloudConfig, isCloudConfigured } from '../cloud/config';
import { generateEcdhKeyPair, deriveWrapKey, wrapCode, unwrapCode, type EcdhKeyPair } from './cloudCrypto';

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

  // --- Ephemeral ECDH pairing state (see file header) ---------------------------------
  // Host side: the joiner's public key seen on offer-request, and the derived wrap key
  // per pairing (both keyed by reqId = joiner connection id).
  const hostPeerPubKey = new Map<string, string>();
  const hostWrapKey = new Map<string, CryptoKey>();
  // Joiner side: our ephemeral key pair for the in-flight join, and the derived wrap key
  // per pairing (keyed by reqId) so the answer can be sealed with the same key.
  let joinerKeyPair: EcdhKeyPair | null = null;
  const joinerWrapKey = new Map<string, CryptoKey>();
  // The out-of-band session join PIN (see cloudCrypto): the host advertises under one, and a
  // joiner supplies the one from the DM's join code. It is folded into every derived wrap key
  // so a peer without the PIN cannot open the sealed offer/answer — the cloud admission gate.
  let hostPin = '';
  let joinerPin = '';

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
        // Stash the joiner's ephemeral public key; respondOffer derives the wrap key from it.
        if (typeof msg.pubKey === 'string') hostPeerPubKey.set(String(msg.reqId), msg.pubKey);
        offerRequestCbs.forEach((cb) => cb(String(msg.reqId)));
        break;
      case 'offer':
        void handleIncomingOffer(msg);
        break;
      case 'answer':
        void handleIncomingAnswer(msg);
        break;
      case 'services':
        servicesCbs.forEach((cb) => cb((msg.services as DiscoveredService[]) ?? []));
        break;
      case 'error':
        console.warn('[cloud signaling]', msg.code, msg.message);
        // Fail any in-flight one-shot waiters fast with the server's reason,
        // rather than letting them stall until their timeout.
        for (const w of waiters.splice(0)) {
          clearTimeout(w.timer);
          w.reject(new Error(typeof msg.message === 'string' ? msg.message : 'Signaling error.'));
        }
        break;
    }
  }

  // Joiner: derive the shared key from the host's public key, unwrap the offer, and hand
  // the plaintext code to SessionClient. Retain the key (by reqId) for sealing the answer.
  async function handleIncomingOffer(msg: ServerMessage) {
    try {
      const reqId = String(msg.reqId);
      const hostPub = typeof msg.pubKey === 'string' ? msg.pubKey : '';
      if (!joinerKeyPair || !hostPub) throw new Error('missing key material for offer');
      const wrapKey = await deriveWrapKey(joinerKeyPair.privateKey, hostPub, joinerPin);
      joinerWrapKey.set(reqId, wrapKey);
      const offerCode = await unwrapCode(wrapKey, String(msg.offerCode));
      offerCbs.forEach((cb) => cb(reqId, offerCode));
    } catch (err) {
      console.warn('[cloud signaling] could not open relayed offer', err);
    }
  }

  // Host: look up the pairing wrap key by reqId and unwrap the answer for SessionHost.
  async function handleIncomingAnswer(msg: ServerMessage) {
    try {
      const reqId = String(msg.reqId ?? '');
      const wrapKey = hostWrapKey.get(reqId);
      if (!wrapKey) throw new Error('no pairing key for answer');
      const answerCode = await unwrapCode(wrapKey, String(msg.answerCode));
      answerCbs.forEach((cb) => cb(answerCode));
    } catch (err) {
      console.warn('[cloud signaling] could not open relayed answer', err);
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

    async advertise(sessionId, name, pin = '') {
      // The PIN never goes on the wire — it is folded into the ECDH-derived wrap key locally
      // (see respondOffer). The relay only ever forwards public keys + ciphertext.
      hostPin = pin;
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

    async connect(service, pin = '') {
      // The PIN (from the DM's out-of-band join code) is folded into the wrap key locally so
      // we can open the host's sealed offer; it never goes on the wire.
      joinerPin = pin;
      await ensureConnected();
      await refreshTurn();
      // Mint our ephemeral ECDH key and advertise its public half with the join so the
      // host can seal the offer to us; the relay only ever sees this public key.
      joinerKeyPair = await generateEcdhKeyPair();
      send({ action: 'join', sessionId: service.sessionId, pubKey: joinerKeyPair.publicKeyB64 });
    },

    onOfferRequest(cb) {
      offerRequestCbs.add(cb);
      return () => offerRequestCbs.delete(cb);
    },
    async respondOffer(reqId, offerCode) {
      // Derive the pairing key from our fresh ECDH key + the joiner's public key, seal the
      // offer under it, and send only our public key alongside the ciphertext.
      const joinerPub = hostPeerPubKey.get(reqId);
      if (!joinerPub) throw new Error('Missing joiner key — cannot secure the offer.');
      const kp = await generateEcdhKeyPair();
      const wrapKey = await deriveWrapKey(kp.privateKey, joinerPub, hostPin);
      hostWrapKey.set(reqId, wrapKey);
      const wrapped = await wrapCode(wrapKey, offerCode);
      send({ action: 'offer', reqId, offerCode: wrapped, pubKey: kp.publicKeyB64 });
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
      // Seal the answer with the same pairing key the offer was opened under.
      const wrapKey = joinerWrapKey.get(reqId);
      if (!wrapKey) throw new Error('Missing pairing key — cannot secure the answer.');
      const wrapped = await wrapCode(wrapKey, answerCode);
      send({ action: 'answer', reqId, answerCode: wrapped });
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
      hostPeerPubKey.clear();
      hostWrapKey.clear();
      joinerWrapKey.clear();
      joinerKeyPair = null;
      hostPin = '';
      joinerPin = '';
      ws?.close();
      ws = null;
    },
  };
}
