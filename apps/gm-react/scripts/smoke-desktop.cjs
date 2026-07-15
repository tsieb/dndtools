// Electron smoke test for the desktop shell — validates the risks that only appear under the packaged
// custom app scheme in a real Electron runtime: exact/secure origin behavior, CORS request identity,
// relative-asset render, self-hosted fonts, production CSP, and IndexedDB across a process restart.
//
// Everything is driven through the real rendered DOM (production builds tree-shake the DEV-only
// window.__rt seam, so we can't dispatch directly — we use the actual scene-create form, exactly the
// user's path). Run twice against a FIXED userData dir:
//   electron scripts/smoke-desktop.cjs write   → boots, checks render/fonts/CSP, creates a unique scene
//   electron scripts/smoke-desktop.cjs verify  → boots again, asserts that scene came back from disk
// The unique scene name is passed via SMOKE_SCENE_NAME so both runs agree.

const { app, BrowserWindow, ipcMain, net, protocol, session } = require('electron');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { buildSmokeIpcPolicy, evaluateSmokeOutcome } = require('./smoke-ipc-policy.cjs');
const {
	APP_ORIGIN,
	APP_ENTRY_URL,
	registerAppScheme,
	installAppProtocol,
} = require('../electron/app-protocol.cjs');

const MODE = process.argv.includes('verify') ? 'verify' : 'write';
const SCENE_NAME = process.env.SMOKE_SCENE_NAME || 'Smoke Scene';
const RENDERER_ROOT = path.join(__dirname, '..', 'dist');
const PRELOAD = path.join(__dirname, '..', 'electron', 'preload.cjs');

registerAppScheme(protocol);
app.setName('DND Tools GM Smoke');
if (process.env.SMOKE_USER_DATA) app.setPath('userData', process.env.SMOKE_USER_DATA);

const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"font-src 'self' data:",
	"img-src 'self' data: blob:",
	"media-src 'self' data: blob:",
	"connect-src 'self' http://127.0.0.1:*",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'none'",
].join('; ');

const diag = [];
const consoleErrors = [];
const ipcInvocations = [];
const unexpectedPrivilegedCalls = [];
const corsProbeRequests = [];
let corsProbeServer = null;
function done(obj, code) {
	console.log(
		'SMOKE_RESULT ' +
			JSON.stringify({
				mode: MODE,
				...obj,
				consoleErrors,
				ipcInvocations,
				unexpectedPrivilegedCalls,
				corsProbeRequests,
				diag,
			}),
	);
	corsProbeServer?.close();
	app.exit(code);
}
const fail = (msg) => done({ ok: false, error: msg }, 1);

function succeed(obj) {
	const outcome = evaluateSmokeOutcome({ consoleErrors, unexpectedPrivilegedCalls });
	return done({ ...obj, ...outcome }, outcome.ok ? 0 : 2);
}

// This file is its own Electron main process, so the production preload cannot reach the handlers
// installed by electron/main.cjs. Keep the production bridge under test, but respond normally only to
// the two calls required to boot. Every other privileged call exposed by the preload is registered as
// a recorded tripwire and rejected: startup must not advertise, read/write secrets, or broaden network
// access. Parsing the preload also makes a newly-added invoke channel fail closed automatically.
function installSmokeIpc() {
	const policy = buildSmokeIpcPolicy(readFileSync(PRELOAD, 'utf8'));
	for (const entry of policy) {
		ipcMain.handle(entry.channel, () => {
			ipcInvocations.push(entry.channel);
			if (entry.startupRequired) return entry.response;
			unexpectedPrivilegedCalls.push(entry.channel);
			throw new Error(`desktop smoke blocked unexpected privileged IPC: ${entry.channel}`);
		});
	}
}

/** Poll an in-page boolean expression until true (or time out). */
function waitFor(win, expr, timeoutMs, label) {
	return win.webContents.executeJavaScript(
		`new Promise((res, rej) => { const t0 = Date.now(); (function p(){
			try { if (${expr}) return res(true); } catch (e) {}
			if (Date.now() - t0 > ${timeoutMs}) return rej(new Error('timeout: ${label}'));
			setTimeout(p, 100);
		})(); })`,
	);
}

const NAME_JS = JSON.stringify(SCENE_NAME);
const bodyHas = (s) => `document.body.innerText.includes(${s})`;

function startCorsProbe() {
	return new Promise((resolve, reject) => {
		const server = http.createServer((request, response) => {
			corsProbeRequests.push({ method: request.method, origin: request.headers.origin || null });
			response.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
			response.setHeader('Vary', 'Origin');
			if (request.method === 'OPTIONS') {
				response.setHeader('Access-Control-Allow-Methods', 'POST');
				response.setHeader('Access-Control-Allow-Headers', 'content-type');
				response.writeHead(204).end();
				return;
			}
			response.setHeader('Content-Type', 'application/json');
			response.end(JSON.stringify({ ok: true }));
		});
		server.once('error', reject);
		server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
			corsProbeServer = server;
			const address = server.address();
			resolve(`http://127.0.0.1:${address.port}/origin-probe`);
		});
	});
}

app.whenReady().then(async () => {
	installSmokeIpc();
	installAppProtocol(protocol, net, RENDERER_ROOT);
	const corsProbeUrl = await startCorsProbe();

	if (!process.env.SMOKE_NO_CSP) {
		session.defaultSession.webRequest.onHeadersReceived({ urls: [`${APP_ORIGIN}/*`] }, (d, cb) =>
			cb({
				responseHeaders: {
					...d.responseHeaders,
					'Content-Security-Policy': [CSP],
					'X-Content-Type-Options': ['nosniff'],
				},
			}),
		);
	}

	const win = new BrowserWindow({
		show: false,
		width: 1280,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	win.webContents.on('console-message', (_e, level, message) => {
		// Ignore Electron's own dev-only insecure-CSP warning (absent when packaged).
		if (level >= 3 && !/Electron Security Warning/.test(message)) consoleErrors.push(message);
	});
	win.webContents.on('did-fail-load', (_e, c, d, u) =>
		diag.push('did-fail-load ' + c + ' ' + d + ' ' + u),
	);

	try {
		await win.loadURL(APP_ENTRY_URL);
		const runtime = await win.webContents.executeJavaScript(
			`({ href: location.href, origin: location.origin, protocol: location.protocol, secure: isSecureContext })`,
		);
		if (
			runtime.origin !== APP_ORIGIN ||
			runtime.protocol !== 'dndtools:' ||
			runtime.secure !== true
		) {
			return fail('unexpected app origin: ' + JSON.stringify(runtime));
		}
		const corsProbe = await win.webContents.executeJavaScript(
			`fetch(${JSON.stringify(corsProbeUrl)}, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}',
			}).then(response => response.json())`,
		);
		if (!corsProbe?.ok || corsProbeRequests.some((request) => request.origin !== APP_ORIGIN)) {
			return fail(
				'custom-scheme CORS origin mismatch: ' + JSON.stringify({ corsProbe, corsProbeRequests }),
			);
		}

		// Booted + seeded: the Command Center hub renders its seeded summary line.
		await waitFor(win, bodyHas('"Command Center"'), 15000, 'command-center render');

		if (MODE === 'write') {
			// Force each family to fetch its woff2 through the app scheme (a face isn't "loaded" until
			// something uses it), then confirm it resolved — this proves the self-hosted fonts work offline.
			const fonts = await win.webContents.executeJavaScript(
				`Promise.all([
					document.fonts.load('16px "Inter"'),
					document.fonts.load('24px "Cinzel"'),
					document.fonts.load('16px "JetBrains Mono"'),
				]).then(loaded => ({
					count: document.fonts.size,
					inter: document.fonts.check('16px "Inter"'),
					cinzel: document.fonts.check('24px "Cinzel"'),
					mono: document.fonts.check('16px "JetBrains Mono"'),
					facesResolved: loaded.map(f => f.length),
				}))`,
			);
			if (!fonts.inter || !fonts.cinzel || !fonts.mono)
				return fail('fonts not loaded: ' + JSON.stringify(fonts));

			// Create a uniquely-named scene through the real form (React-controlled input).
			await win.webContents.executeJavaScript(`location.hash = '#/scenes'`);
			await waitFor(win, `document.querySelector('#scene-name')`, 10000, 'scene-name input');
			await win.webContents.executeJavaScript(
				`(() => {
					const input = document.querySelector('#scene-name');
					const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
					setter.call(input, ${NAME_JS});
					input.dispatchEvent(new Event('input', { bubbles: true }));
					const form = input.closest('form');
					const submit = (form || document).querySelector('button[type="submit"]');
					submit.click();
				})()`,
			);
			// The new scene must render (applied to Core state), then flush to IndexedDB.
			await waitFor(win, bodyHas(NAME_JS), 10000, 'created scene renders');
			await new Promise((r) => setTimeout(r, 2500));

			return succeed({ runtime, corsProbe, fonts });
		}

		// verify: the scene created by the previous process must reappear from IndexedDB.
		await win.webContents.executeJavaScript(`location.hash = '#/scenes'`);
		await waitFor(win, `document.querySelector('#scene-name')`, 10000, 'scenes screen');
		let survived = false;
		try {
			await waitFor(win, bodyHas(NAME_JS), 6000, 'persisted scene renders');
			survived = true;
		} catch {
			survived = false;
		}
		if (!survived)
			return fail('scene did NOT survive restart — IndexedDB not persisted at userData');
		return succeed({ runtime, corsProbe, survived });
	} catch (e) {
		const st = await win.webContents
			.executeJavaScript(
				`({ rootLen: (document.getElementById('root')||{}).innerHTML?.length||0, body: (document.body.innerText||'').slice(0,200) })`,
			)
			.catch((err) => ({ evalError: String(err) }));
		diag.push('state ' + JSON.stringify(st));
		fail(e && e.message ? e.message : String(e));
	}
});
