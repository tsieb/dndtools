// P2P transport gate: proves the security-critical PURE modules of the LAN remote-player feature —
// message encryption (AES-GCM seal/open, wrong-key rejection) and the serverless connection-code
// encode/decode round-trip. These run headless under Node's WebCrypto (no browser, no WebRTC needed);
// the full WebRTC/loopback + two-device paths are verified separately (see docs/SECURITY.md). Exits
// non-zero on any failed assertion.
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => path.resolve(here, '..', 'src', 'net', rel);

const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok: !!ok, detail });
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Bundle a TS module (type-only core imports are erased) to an importable ESM file. */
async function load(entry) {
	const out = await build({
		entryPoints: [src(entry)],
		bundle: true,
		format: 'esm',
		platform: 'neutral',
		write: false,
		logLevel: 'silent',
	});
	const dir = await mkdtemp(path.join(tmpdir(), 'p2p-verify-'));
	const file = path.join(dir, entry.replace('.ts', '.mjs'));
	await writeFile(file, out.outputFiles[0].text);
	return import(pathToFileURL(file).href);
}

try {
	const crypto = await load('crypto.ts');
	const signaling = await load('signaling.ts');

	// 1 — AES-GCM seal/open round-trip preserves the message.
	const key = await crypto.generateSessionKey();
	const msg = { kind: 'snapshot', seq: 7, data: { hello: 'world', n: 42 } };
	const sealed = await crypto.seal(key, msg);
	check('sealed frame is not plaintext', !sealed.includes('world') && !sealed.includes('hello'));
	const opened = await crypto.open(key, sealed);
	check('seal → open round-trips the message', JSON.stringify(opened) === JSON.stringify(msg));

	// 2 — a wrong key cannot open the frame (a revoked/rotated peer is locked out).
	const otherKey = await crypto.generateSessionKey();
	let rejected = false;
	try {
		await crypto.open(otherKey, sealed);
	} catch {
		rejected = true;
	}
	check('wrong key fails to open (revocation works)', rejected);

	// 3 — key export/import preserves the key (the pairing-payload path).
	const exported = await crypto.exportKeyBase64(key);
	const reimported = await crypto.importKeyBase64(exported);
	const opened2 = await crypto.open(reimported, sealed);
	check(
		'exported→imported key still opens the frame',
		JSON.stringify(opened2) === JSON.stringify(msg),
	);

	// 4 — connection-code encode/decode round-trips the offer + answer payloads.
	const offer = {
		v: 1,
		role: 'offer',
		sessionId: 'sess-1',
		actorId: 'actor-player',
		displayName: 'Aria',
		participantRole: 'player',
		keyB64: exported,
		sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n',
	};
	const offerCode = await signaling.encodeCode(offer);
	const decodedOffer = await signaling.decodeCode(offerCode);
	check('offer code round-trips', JSON.stringify(decodedOffer) === JSON.stringify(offer));

	const answer = {
		v: 1,
		role: 'answer',
		sessionId: 'sess-1',
		actorId: 'actor-player',
		sdp: 'v=0\r\no=- 2 2 IN IP4 0.0.0.0\r\n',
	};
	const answerCode = await signaling.encodeCode(answer);
	const decodedAnswer = await signaling.decodeCode(answerCode);
	check('answer code round-trips', JSON.stringify(decodedAnswer) === JSON.stringify(answer));

	// 5 — a garbled code is rejected, not silently mis-decoded.
	let codeRejected = false;
	try {
		await signaling.decodeCode('!!!not-a-code!!!');
	} catch {
		codeRejected = true;
	}
	check('garbled connection code is rejected', codeRejected);
} catch (err) {
	check('verify-p2p ran without throwing', false, err instanceof Error ? err.message : String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} P2P checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
