// Decisive TURN relay verification. Mints TURN credentials via the signaling WS
// (turnCredentials action), then forms a WebRTC data channel between two headless
// browser peers that are BOTH forced to iceTransportPolicy:'relay'. If the channel
// opens and a message round-trips, the traffic provably went through coturn —
// proving credential auth + relay allocation + media relay end-to-end.
//
//   WS_URL=wss://.../dev  TOKEN=<cognito-id-token>  node infra/verify-turn.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../apps/gm/package.json'));
const { chromium } = require('playwright');

const WS_URL = process.env.WS_URL;
const TOKEN = process.env.TOKEN;
if (!WS_URL || !TOKEN) {
  console.error('WS_URL and TOKEN env vars are required');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const ok = (n) => { console.log(`  ✓ ${n}`); passed++; };
const bad = (n, d) => { console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); failed++; };

// --- 1. Mint TURN credentials over the signaling WebSocket. ---------------
function mintCreds() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(TOKEN)}`);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timed out minting TURN creds')); }, 12000);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ action: 'turnCredentials' })));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'turn-credentials') {
        clearTimeout(timer);
        ws.close();
        resolve(msg.iceServers);
      }
    });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WS error minting creds')); });
  });
}

// Page-side: build a relay-ONLY peer, stashing it on window. (Playwright passes a
// single arg, so config is an object.)
const PEER_SETUP = ({ iceServers, isOfferer }) => {
  const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'relay' });
  window.__pc = pc;
  window.__relayCandidate = false;
  window.__open = false;
  window.__got = null;
  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate && e.candidate.candidate.includes(' typ relay')) window.__relayCandidate = true;
  });
  const wire = (ch) => {
    window.__chan = ch;
    ch.addEventListener('open', () => { window.__open = true; });
    ch.addEventListener('message', (e) => { window.__got = e.data; });
  };
  if (isOfferer) {
    wire(pc.createDataChannel('relaytest', { ordered: true }));
  } else {
    pc.addEventListener('datachannel', (e) => wire(e.channel));
  }
};

const gatherComplete = () =>
  new Promise((resolve) => {
    const pc = window.__pc;
    if (pc.iceGatheringState === 'complete') return resolve();
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') resolve();
    });
    setTimeout(resolve, 8000);
  });

const browser = await chromium.launch();
try {
  const iceServers = await mintCreds();
  const relay = (iceServers ?? []).find((s) => String(s.urls).includes('turn:'));
  if (relay?.username && relay?.credential) ok('minted TURN credentials over signaling WS');
  else { bad('minted TURN credentials', 'no relay server in response'); throw new Error('no creds'); }

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  a.on('console', (m) => m.type() === 'error' && console.log('  [A]', m.text()));
  b.on('console', (m) => m.type() === 'error' && console.log('  [B]', m.text()));
  // A blank secure-ish context is fine; RTCPeerConnection works on about:blank.
  await a.goto('about:blank');
  await b.goto('about:blank');

  // Offerer (A) and answerer (B), both relay-only.
  await a.evaluate(PEER_SETUP, { iceServers, isOfferer: true });
  await b.evaluate(PEER_SETUP, { iceServers, isOfferer: false });

  // A: create offer, gather relay candidates.
  await a.evaluate(async () => {
    const pc = window.__pc;
    await pc.setLocalDescription(await pc.createOffer());
  });
  await a.evaluate(gatherComplete);
  const offer = await a.evaluate(() => window.__pc.localDescription.sdp);

  // B: accept offer, create answer, gather.
  await b.evaluate(async (sdp) => {
    const pc = window.__pc;
    await pc.setRemoteDescription({ type: 'offer', sdp });
    await pc.setLocalDescription(await pc.createAnswer());
  }, offer);
  await b.evaluate(gatherComplete);
  const answer = await b.evaluate(() => window.__pc.localDescription.sdp);

  const relayA = await a.evaluate(() => window.__relayCandidate);
  const relayB = await b.evaluate(() => window.__relayCandidate);
  if (relayA && relayB) ok('both peers allocated a relay candidate on coturn');
  else bad('both peers allocated a relay candidate', `A=${relayA} B=${relayB} (TURN auth/allocation failed)`);

  // A: apply the answer → connection negotiates over relay only.
  await a.evaluate((sdp) => window.__pc.setRemoteDescription({ type: 'answer', sdp }), answer);

  // Wait for the data channel to open on the offerer.
  await a.waitForFunction(() => window.__open === true, null, { timeout: 20000 }).catch(() => {});
  const openA = await a.evaluate(() => window.__open);
  if (openA) ok('data channel opened through the TURN relay (relay-only policy)');
  else bad('data channel opened through the TURN relay', 'channel never opened — relay path failed');

  // Round-trip a message A → B.
  if (openA) {
    await a.evaluate(() => window.__chan.send('ping-through-turn'));
    await b.waitForFunction(() => window.__got !== null, null, { timeout: 8000 }).catch(() => {});
    const got = await b.evaluate(() => window.__got);
    if (got === 'ping-through-turn') ok('message round-tripped over the relayed data channel');
    else bad('message round-tripped over the relayed data channel', `received ${JSON.stringify(got)}`);
  }

  await ctxA.close();
  await ctxB.close();
} catch (err) {
  bad('verify-turn ran without throwing', String(err?.message ?? err));
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
