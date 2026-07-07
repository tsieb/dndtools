// Decisive cloud-sync verification against the DEPLOYED sync-api. Uses the REAL @dndtools/core E2EE
// (run via tsx so the core TS resolves), so it exercises the exact envelope format the app uses.
//
// Proves end-to-end:
//   1. an encrypted op pushes, pulls back as CIPHERTEXT, and decrypts to the original (server never saw plaintext)
//   2. the pulled ciphertext does NOT contain the plaintext secret (opaque to the server)
//   3. a full-state snapshot pushes and restores (fresh-device path)
//   4. the server REJECTS a payload that smuggles plaintext into a metadata field (SEC-009 AC4, fail closed)
//
//   SYNC_URL=https://.../dev  TOKEN=<cognito-id-token>  pnpm exec tsx infra/verify-sync.mjs
import {
  createVaultKeyring,
  encryptForKeyring,
  decryptFromKeyring,
  opServerVisibleFields,
  findServerVisibilityViolations,
  DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD,
} from '../packages/core/src/index.ts';

const SYNC_URL = process.env.SYNC_URL?.replace(/\/$/, '');
const TOKEN = process.env.TOKEN;
if (!SYNC_URL || !TOKEN) {
  console.error('SYNC_URL and TOKEN env vars are required');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const ok = (n) => { console.log(`  ✓ ${n}`); passed++; };
const bad = (n, d) => { console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); failed++; };

const VAULT = `verify-${Date.now()}`;
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const b64urlBytes = (s) => Math.floor((s.length * 3) / 4);

// A payload with an unambiguous secret the server must never be able to read.
const SECRET = 'phylactery-beneath-the-chapel';
const op = {
  id: 'op-1',
  vaultId: VAULT,
  sourceId: 'verify',
  actorId: 'actor-dm',
  entityType: 'note',
  entityId: 'n1',
  opType: 'note.create',
  value: { title: `The ${SECRET}`, body: 'Bearer eyJsecret.tok.en /home/dm/secret.md' },
  dependencies: [],
  issuedAt: new Date().toISOString(),
  schemaVersion: 1,
};

async function main() {
  const keyring = createVaultKeyring();

  // --- 1. push an encrypted op ------------------------------------------------
  const envelope = await encryptForKeyring(keyring, op);
  const meta = {
    participantId: op.actorId,
    revision: 0,
    size: b64urlBytes(envelope.ct),
    contentHash: envelope.contentHash,
    issuedAt: op.issuedAt,
  };
  // Client-side sanity: the metadata we send is all allowed classes, no plaintext.
  if (findServerVisibilityViolations(DNDTOOLS_CLOUD_SECURITY_DECISION_RECORD, opServerVisibleFields(VAULT, meta)).length === 0)
    ok('op metadata is all allowed server-visible classes (client check)');
  else bad('op metadata is all allowed server-visible classes');

  const pushRes = await fetch(`${SYNC_URL}/vaults/${VAULT}/operations`, {
    method: 'POST', headers, body: JSON.stringify({ ops: [{ meta, envelope }] }),
  });
  const pushBody = await pushRes.json().catch(() => ({}));
  if (pushRes.ok && Array.isArray(pushBody.accepted) && pushBody.accepted.includes(0)) ok('pushed an encrypted operation (accepted)');
  else bad('pushed an encrypted operation', `status=${pushRes.status} body=${JSON.stringify(pushBody)}`);

  // --- 2. pull it back as ciphertext + decrypt --------------------------------
  const pullRes = await fetch(`${SYNC_URL}/vaults/${VAULT}/operations?since=-1`, { headers });
  const pullBody = await pullRes.json();
  const pulled = pullBody.ops?.[0];
  if (pulled?.envelope?.ct) ok('pulled the operation back');
  else bad('pulled the operation back', JSON.stringify(pullBody));

  if (pulled?.envelope) {
    const ctText = JSON.stringify(pulled.envelope);
    if (!ctText.includes(SECRET) && !ctText.includes('Bearer')) ok('the stored ciphertext does NOT contain the plaintext secret');
    else bad('the stored ciphertext leaks the plaintext secret');

    const decrypted = await decryptFromKeyring(keyring, pulled.envelope);
    if (JSON.stringify(decrypted) === JSON.stringify(op)) ok('decrypted operation matches the original (round-trip)');
    else bad('decrypted operation matches the original');
  }

  // --- 3. snapshot push + restore ---------------------------------------------
  const slice = { note: 'whole vault state', sync: { operations: [op] } };
  const snapEnv = await encryptForKeyring(keyring, slice);
  const snapMeta = { revision: 1, size: b64urlBytes(snapEnv.ct), contentHash: snapEnv.contentHash, issuedAt: new Date().toISOString() };
  const putRes = await fetch(`${SYNC_URL}/vaults/${VAULT}/snapshot`, {
    method: 'PUT', headers, body: JSON.stringify({ meta: snapMeta, envelope: snapEnv }),
  });
  if (putRes.ok) ok('pushed a full-state snapshot'); else bad('pushed a full-state snapshot', `status=${putRes.status}`);

  const getRes = await fetch(`${SYNC_URL}/vaults/${VAULT}/snapshot/latest`, { headers });
  const getBody = await getRes.json();
  if (getRes.ok && getBody.envelope) {
    const restored = await decryptFromKeyring(keyring, getBody.envelope);
    if (JSON.stringify(restored) === JSON.stringify(slice)) ok('restored snapshot matches (fresh-device path)');
    else bad('restored snapshot matches');
  } else bad('fetched the latest snapshot', `status=${getRes.status}`);

  // --- 4. server rejects plaintext smuggled into a metadata field -------------
  const evilMeta = { ...meta, revision: 99, participantId: 'Bearer eyJevil.tok.en' };
  const evilRes = await fetch(`${SYNC_URL}/vaults/${VAULT}/operations`, {
    method: 'POST', headers, body: JSON.stringify({ ops: [{ meta: evilMeta, envelope }] }),
  });
  if (evilRes.status === 400) ok('server rejects plaintext smuggled into a metadata field (fail closed)');
  else bad('server rejects plaintext in metadata', `expected 400, got ${evilRes.status}`);
}

main()
  .catch((e) => bad('verify-sync ran without throwing', String(e?.message ?? e)))
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
