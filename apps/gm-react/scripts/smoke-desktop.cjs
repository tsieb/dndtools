// Electron smoke test for the desktop shell — validates the risks that ONLY appear under file://
// in a real Electron runtime (not covered by the web verify gates): relative-asset render, self-hosted
// fonts loading from disk, the production CSP not blocking anything, and — the headline risk —
// IndexedDB surviving a genuine process restart at the packaged userData path.
//
// Everything is driven through the real rendered DOM (production builds tree-shake the DEV-only
// window.__rt seam, so we can't dispatch directly — we use the actual scene-create form, exactly the
// user's path). Run twice against a FIXED userData dir:
//   electron scripts/smoke-desktop.cjs write   → boots, checks render/fonts/CSP, creates a unique scene
//   electron scripts/smoke-desktop.cjs verify  → boots again, asserts that scene came back from disk
// The unique scene name is passed via SMOKE_SCENE_NAME so both runs agree.

const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');

const MODE = process.argv.includes('verify') ? 'verify' : 'write';
const SCENE_NAME = process.env.SMOKE_SCENE_NAME || 'Smoke Scene';
const INDEX = path.join(__dirname, '..', 'dist', 'index.html');

app.setName('DND Tools GM Smoke');
if (process.env.SMOKE_USER_DATA) app.setPath('userData', process.env.SMOKE_USER_DATA);

const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"font-src 'self' data:",
	"img-src 'self' data: blob:",
	"media-src 'self' data: blob:",
	"connect-src 'self'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'none'",
].join('; ');

const diag = [];
function done(obj, code) {
	console.log('SMOKE_RESULT ' + JSON.stringify({ mode: MODE, ...obj, diag }));
	app.exit(code);
}
const fail = (msg) => done({ ok: false, error: msg }, 1);

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

app.whenReady().then(async () => {
	if (!process.env.SMOKE_NO_CSP) {
		session.defaultSession.webRequest.onHeadersReceived((d, cb) =>
			cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': [CSP] } }),
		);
	}

	const consoleErrors = [];
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
	win.webContents.on('did-fail-load', (_e, c, d, u) => diag.push('did-fail-load ' + c + ' ' + d + ' ' + u));

	try {
		await win.loadFile(INDEX);

		// Booted + seeded: the Command Center hub renders its seeded summary line.
		await waitFor(win, bodyHas('"Command Center"'), 15000, 'command-center render');

		if (MODE === 'write') {
			// Force each family to actually fetch its woff2 from file:// (a face isn't "loaded" until
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
			if (!fonts.inter || !fonts.cinzel || !fonts.mono) return fail('fonts not loaded: ' + JSON.stringify(fonts));

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

			return done({ ok: consoleErrors.length === 0, fonts, consoleErrors }, consoleErrors.length === 0 ? 0 : 2);
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
		if (!survived) return fail('scene did NOT survive restart — IndexedDB not persisted at userData');
		return done({ ok: true, survived, consoleErrors }, 0);
	} catch (e) {
		const st = await win.webContents
			.executeJavaScript(`({ rootLen: (document.getElementById('root')||{}).innerHTML?.length||0, body: (document.body.innerText||'').slice(0,200) })`)
			.catch((err) => ({ evalError: String(err) }));
		diag.push('state ' + JSON.stringify(st));
		fail(e && e.message ? e.message : String(e));
	}
});
