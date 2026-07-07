// End-to-end verification of the signaling stack. Requires Node 22+ (global
// WebSocket). Driven by infra/verify-signaling.sh, which supplies a real Cognito
// ID token via env. Exercises: authorizer rejection, advertise/browse/join,
// host↔client offer/answer relay, and TURN credential minting.
//
//   WS_URL=wss://.../dev  TOKEN=<cognito-id-token>  node infra/verify-signaling.mjs

const WS_URL = process.env.WS_URL;
const TOKEN = process.env.TOKEN;
if (!WS_URL || !TOKEN) {
  console.error('WS_URL and TOKEN env vars are required');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const ok = (name) => { console.log(`  ✓ ${name}`); passed++; };
const bad = (name, detail) => { console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failed++; };

function connect(token) {
  const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
  const ws = new WebSocket(url);
  ws.queue = [];
  ws.waiters = [];
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const i = ws.waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) { const [w] = ws.waiters.splice(i, 1); w.resolve(msg); }
    else ws.queue.push(msg);
  });
  return ws;
}

function opened(ws) {
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(true), { once: true });
    ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
    ws.addEventListener('close', (e) => reject(new Error(`closed ${e.code}`)), { once: true });
  });
}

function waitFor(ws, pred, timeoutMs = 8000) {
  const i = ws.queue.findIndex(pred);
  if (i >= 0) return Promise.resolve(ws.queue.splice(i, 1)[0]);
  return new Promise((resolve, reject) => {
    const w = { pred, resolve };
    ws.waiters.push(w);
    setTimeout(() => {
      const j = ws.waiters.indexOf(w);
      if (j >= 0) { ws.waiters.splice(j, 1); reject(new Error('timeout waiting for message')); }
    }, timeoutMs);
  });
}

const send = (ws, obj) => ws.send(JSON.stringify(obj));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('signaling verification\n');

  // 1. Authorizer rejects a connection with no token.
  console.log('auth:');
  try {
    const anon = connect(null);
    await opened(anon);
    bad('rejects connection without token', 'connection opened');
    try { anon.close(); } catch { /* already closed */ }
  } catch {
    ok('rejects connection without token');
  }

  // 2. Authorizer rejects a bogus token.
  try {
    const bogus = connect('not-a-real-jwt');
    await opened(bogus);
    bad('rejects connection with invalid token', 'connection opened');
    try { bogus.close(); } catch { /* already closed */ }
  } catch {
    ok('rejects connection with invalid token');
  }

  // 3. Valid token connects.
  const host = connect(TOKEN);
  const client = connect(TOKEN);
  try {
    await Promise.all([opened(host), opened(client)]);
    ok('accepts connection with valid token');
  } catch (e) {
    bad('accepts connection with valid token', String(e.message));
    finish(); return;
  }

  const sessionId = `verify-${Date.now()}`;

  // 4. Host advertises; server acks.
  console.log('\nrelay:');
  send(host, { action: 'advertise', sessionId, name: 'Verify Session' });
  try {
    await waitFor(host, (m) => m.type === 'advertised' && m.sessionId === sessionId);
    ok('host advertises a session');
  } catch (e) { bad('host advertises a session', e.message); }

  // 5. Client browses and sees the room.
  send(client, { action: 'browse' });
  try {
    const services = await waitFor(client, (m) => m.type === 'services');
    if (services.services?.some((s) => s.sessionId === sessionId)) ok('client browse lists the session');
    else bad('client browse lists the session', 'session absent from list');
  } catch (e) { bad('client browse lists the session', e.message); }

  // 6. Client joins → host receives an offer-request.
  send(client, { action: 'join', sessionId });
  let reqId;
  try {
    const offerReq = await waitFor(host, (m) => m.type === 'offer-request');
    reqId = offerReq.reqId;
    ok('client join reaches host as offer-request');
  } catch (e) { bad('client join reaches host as offer-request', e.message); }

  // 7. Host responds with an offer → client receives it.
  if (reqId) {
    send(host, { action: 'offer', reqId, offerCode: 'OFFER-BLOB' });
    try {
      const offer = await waitFor(client, (m) => m.type === 'offer');
      if (offer.offerCode === 'OFFER-BLOB') ok('host offer relays to client');
      else bad('host offer relays to client', 'offer payload mismatch');
    } catch (e) { bad('host offer relays to client', e.message); }

    // 8. Client answers → host receives it.
    send(client, { action: 'answer', reqId, answerCode: 'ANSWER-BLOB' });
    try {
      const answer = await waitFor(host, (m) => m.type === 'answer');
      if (answer.answerCode === 'ANSWER-BLOB') ok('client answer relays to host');
      else bad('client answer relays to host', 'answer payload mismatch');
    } catch (e) { bad('client answer relays to host', e.message); }
  }

  // 9. TURN credentials mint.
  console.log('\nturn:');
  send(client, { action: 'turnCredentials' });
  try {
    const creds = await waitFor(client, (m) => m.type === 'turn-credentials');
    const relay = creds.iceServers?.find((s) => String(s.urls).includes('turn:'));
    if (relay?.username && relay?.credential) ok('mints TURN credentials (username + HMAC credential)');
    else bad('mints TURN credentials', 'missing username/credential');
  } catch (e) { bad('mints TURN credentials', e.message); }

  await sleep(200);
  try { host.close(); client.close(); } catch { /* already closed */ }
  finish();
}

function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
