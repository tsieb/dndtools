// Desktop auto-update smoke (RC-PLT-1.2). Runs inside Electron against a STAGED update feed served
// from loopback, so the real `electron-updater` code path — provider, feed parse, state machine,
// package verification — is exercised without touching GitHub or installing anything.
//
// Scenarios, in one process against one updater instance:
//   available    — the feed advertises a newer build; status + version + plain-text notes surface
//   up-to-date   — the feed advertises the running version; no update is offered
//   unreachable  — the feed 404s; the shell reports an honest error, never a silent success
//   tampered     — the advertised sha512 does not match the package; the download is refused
//
// Prints one `UPDATER_SMOKE_RESULT <json>` line and exits 0/1.
'use strict';

const { app } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const NEXT_VERSION = '99.0.0';
const ARTIFACT = `Lamplight-GM-${NEXT_VERSION}-x64.AppImage`;
const NOTES_HTML =
	'<h2>Highlights</h2><ul><li>Faster scenes</li><li>Fewer bugs &amp; crashes</li></ul>';

const feedName =
	process.platform === 'darwin'
		? 'latest-mac.yml'
		: process.platform === 'win32'
			? 'latest.yml'
			: 'latest-linux.yml';

const payload = Buffer.from('staged lamplight update package');
const realSha = crypto.createHash('sha512').update(payload).digest('base64');
const fakeSha = crypto.createHash('sha512').update('not the package').digest('base64');

function feedYaml(version, sha) {
	return [
		`version: ${version}`,
		'files:',
		`  - url: ${ARTIFACT}`,
		`    sha512: ${sha}`,
		`    size: ${payload.length}`,
		`path: ${ARTIFACT}`,
		`sha512: ${sha}`,
		`releaseDate: '2026-09-07T00:00:00.000Z'`,
		`releaseNotes: "${NOTES_HTML.replace(/"/g, '\\"')}"`,
	].join('\n');
}

/** @type {{ mode: 'available'|'up-to-date'|'unreachable'|'tampered' }} */
const scenario = { mode: 'available' };

const server = http.createServer((req, res) => {
	if (scenario.mode === 'unreachable') {
		res.writeHead(404).end('nope');
		return;
	}
	if (req.url && req.url.includes(feedName)) {
		const version = scenario.mode === 'up-to-date' ? app.getVersion() : NEXT_VERSION;
		const sha = scenario.mode === 'tampered' ? fakeSha : realSha;
		res.writeHead(200, { 'content-type': 'text/yaml' }).end(feedYaml(version, sha));
		return;
	}
	if (req.url && req.url.includes(ARTIFACT)) {
		res
			.writeHead(200, {
				'content-type': 'application/octet-stream',
				'content-length': payload.length,
			})
			.end(payload);
		return;
	}
	res.writeHead(404).end('nope');
});

const checks = [];
const record = (name, ok, detail) => checks.push({ name, ok, detail: ok ? undefined : detail });

async function main() {
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const port = server.address().port;
	process.env.LAMPLIGHT_UPDATE_FEED_URL = `http://127.0.0.1:${port}/`;

	// AppImageUpdater refuses to download unless it can see the running AppImage. Stage one so the
	// verification path is reachable on Linux CI/dev boxes.
	const stagedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lamplight-updater-smoke-'));
	app.setPath('userData', path.join(stagedHome, 'userData'));
	if (process.platform === 'linux') {
		const fakeAppImage = path.join(stagedHome, ARTIFACT);
		fs.writeFileSync(fakeAppImage, payload);
		process.env.APPIMAGE = fakeAppImage;
	}

	await app.whenReady();

	const { createUpdater } = require('../electron/updater.cjs');
	const seen = [];
	const updater = createUpdater({ app, onState: (state) => seen.push(state.status) });

	// 1 — a newer build is offered, with notes the renderer can print as plain text.
	scenario.mode = 'available';
	let state = await updater.check();
	record('available.status', state.status === 'available', `${state.status}: ${state.message}`);
	record('available.version', state.availableVersion === NEXT_VERSION, state.availableVersion);
	record(
		'available.notesArePlainText',
		typeof state.releaseNotes === 'string' &&
			!state.releaseNotes.includes('<') &&
			state.releaseNotes.includes('Fewer bugs & crashes'),
		state.releaseNotes,
	);
	record('available.checkedAt', typeof state.checkedAt === 'string', state.checkedAt);
	record('available.notDownloadedYet', !seen.includes('downloaded'), seen.join(','));

	// 2 — the advertised package is tampered with: verification must refuse it.
	scenario.mode = 'tampered';
	state = await updater.check();
	const tampered = state.status === 'available' ? await updater.download() : state;
	record('tampered.refused', tampered.status === 'error', tampered.status);
	record('tampered.neverInstalls', updater.install().status !== 'downloaded', tampered.status);
	record('tampered.honestMessage', Boolean(tampered.message), tampered.message);

	// 3 — same version on the feed: nothing is offered.
	scenario.mode = 'up-to-date';
	state = await updater.check();
	record('upToDate.status', state.status === 'up-to-date', `${state.status}: ${state.message}`);
	record('upToDate.noVersion', state.availableVersion === null, state.availableVersion);

	// 4 — the feed cannot be read: an honest failure, never a fake success.
	scenario.mode = 'unreachable';
	state = await updater.check();
	record('unreachable.status', state.status === 'error', state.status);
	record('unreachable.message', Boolean(state.message), state.message);

	const ok = checks.every((c) => c.ok);
	console.log(
		`UPDATER_SMOKE_RESULT ${JSON.stringify({ ok, checks: checks.filter((c) => !c.ok), count: checks.length })}`,
	);
	server.close();
	fs.rmSync(stagedHome, { recursive: true, force: true });
	app.exit(ok ? 0 : 1);
}

main().catch((error) => {
	console.log(
		`UPDATER_SMOKE_RESULT ${JSON.stringify({ ok: false, error: String(error && error.stack) })}`,
	);
	app.exit(1);
});
