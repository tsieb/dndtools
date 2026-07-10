// @ts-check
'use strict';

// Electron main process for the DND Tools GM desktop shell.
//
// This wraps the SAME static build that ships to the web (apps/gm-react/dist) in a Chromium window.
// The renderer is the unmodified React app: it persists everything to IndexedDB and makes zero network
// requests, so the desktop build is fully offline. The main process adds only a window + hardening —
// there is no IPC surface yet (see electron/preload.cjs); the app needs none to function.
//
// CommonJS (.cjs) because the package is `type: module`; Electron's main entry is CJS.

const { app, BrowserWindow, ipcMain, session, shell, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Load the LAN discovery module (Epic 7.3 mDNS). Prefer the esbuild-BUNDLED variant (multicast-dns
 * inlined) so it works in the packaged app which ships no node_modules; fall back to the source module
 * in dev. If neither loads, discovery is simply unavailable and the renderer degrades to the code flow.
 */
function loadDiscovery() {
	for (const rel of ['./discovery.bundled.cjs', './discovery.cjs']) {
		try {
			return require(rel);
		} catch {
			/* try next */
		}
	}
	return null;
}
const discoveryModule = loadDiscovery();

// Align the userData directory name across dev and the packaged app (electron-builder productName is
// "DND Tools GM"), so IndexedDB/localStorage live at one predictable path testers can reset:
//   macOS  ~/Library/Application Support/DND Tools GM/
//   Linux  ~/.config/DND Tools GM/
app.setName('DND Tools GM');

// In dev, `desktop:dev` sets VITE_DEV_SERVER_URL and we point the window at the Vite dev server (HMR).
// When packaged there is no dev server — load the built bundle from disk.
const DEV_SERVER_URL = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;

/**
 * Content-Security-Policy for the packaged (file://) app only. The app is same-origin and offline, so
 * this is defense-in-depth. `script-src` MUST allow 'unsafe-inline' — index.html runs inline IIFEs to
 * resolve theme/motion/density before first paint. `style-src` allows inline for React style props and
 * the token CSS; data:/blob: cover the self-hosted fonts and the seeded silent-WAV `data:` audio.
 * Not applied in dev, where Vite's HMR client needs 'unsafe-eval'.
 *
 * P2P (Epic 7.3): the LAN remote-player feature uses WebRTC data channels with NO STUN/TURN (LAN host
 * candidates only). The explicit CSP Level 3 `webrtc 'allow'` directive permits `RTCPeerConnection`.
 *
 * Cloud (opt-in): cloud features add off-device origins to `connect-src` — the Cognito SRP endpoint
 * (`cognito-idp.<region>`) that amazon-cognito-identity-js calls for sign-in, the signaling WebSocket
 * (`wss://*.execute-api.<region>`) for internet remote play, and the sync-api HTTP endpoint
 * (`https://*.execute-api.<region>`) for E2EE cloud sync/backup. STUN/TURN media is governed by `webrtc`,
 * not `connect-src`, so no relay origin is listed here. Region is ca-central-1 (see infra/); nothing is
 * contacted until the user opts into a cloud feature. Content integrations add `api.open5e.com`
 * (compendium browse) and `docs.googleapis.com` (Google Docs vault source) — the Google OAuth popup is
 * a navigation, not a fetch, so accounts.google.com is deliberately absent. Mirror any change here into
 * infra/web-hosting/template.yaml (the CloudFront CSP).
 */
const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	"font-src 'self' data:",
	"img-src 'self' data: blob:",
	"media-src 'self' data: blob:",
	"connect-src 'self' https://cognito-idp.ca-central-1.amazonaws.com https://*.execute-api.ca-central-1.amazonaws.com wss://*.execute-api.ca-central-1.amazonaws.com https://api.open5e.com https://docs.googleapis.com",
	"webrtc 'allow'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'none'",
].join('; ');

function applyCsp() {
	session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
		cb({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': [CSP],
			},
		});
	});
}

/**
 * Deny every renderer-initiated device-permission request (camera, mic, geolocation,
 * notifications, MIDI, etc.). The app needs none of them; a compromised renderer must
 * not be able to reach hardware or the network via a permission prompt. Applied to the
 * default session in both dev and packaged builds.
 */
function denyAllPermissions() {
	session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
	session.defaultSession.setPermissionCheckHandler(() => false);
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 960,
		minHeight: 600,
		show: false,
		// Dark tone matching the default "tavern" theme so there's no white flash before CSS paints.
		backgroundColor: '#1c1917',
		title: 'DND Tools GM',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			// The app embeds no third-party frames; <webview> is a large remote-content
			// attack surface, so pin it off explicitly rather than relying on the default.
			webviewTag: false,
		},
	});

	win.once('ready-to-show', () => win.show());

	// Never navigate the window itself to a remote origin, and route any target=_blank / window.open
	// to the OS browser instead of a new in-app frame. The app has no external links today; this is a
	// belt-and-suspenders guard so a future stray link can't turn the shell into a browser.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
		return { action: 'deny' };
	});
	win.webContents.on('will-navigate', (event, url) => {
		const current = win.webContents.getURL();
		// Allow in-app hash navigation (same document, HashRouter) and the initial load; block the rest.
		if (url === current) return;
		const sameDoc = current && url.split('#')[0] === current.split('#')[0];
		if (!sameDoc) {
			event.preventDefault();
			if (url.startsWith('http')) void shell.openExternal(url);
		}
	});

	if (DEV_SERVER_URL) {
		void win.loadURL(DEV_SERVER_URL);
		win.webContents.openDevTools({ mode: 'detach' });
	} else {
		void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
	}

	return win;
}

/**
 * Wire the LAN discovery IPC surface (Epic 7.3 S7.3.2). The renderer never touches sockets — it exchanges
 * only opaque, already-encrypted offer/answer codes across this bridge; the main process runs mDNS + the
 * LAN-TCP rendezvous. All handlers no-op if discovery is unavailable, so the renderer degrades to codes.
 */
function setupDiscoveryIpc(win) {
	if (!discoveryModule || !discoveryModule.available()) {
		ipcMain.handle('discovery:available', () => false);
		return;
	}
	const discovery = new discoveryModule.Discovery();
	const pendingOffer = new Map(); // reqId -> resolve(offerCode)   (host)
	const pendingAnswer = new Map(); // reqId -> resolve(answerCode) (joiner)
	let reqSeq = 0;

	discovery.setHandlers({
		onServices: (services) => win.webContents.send('discovery:services', services),
		// Host: a joiner arrived and needs an offer code — ask the renderer.
		onOfferRequest: () =>
			new Promise((resolve) => {
				const reqId = `o-${reqSeq++}`;
				pendingOffer.set(reqId, resolve);
				win.webContents.send('discovery:offer-request', { reqId });
			}),
		// Host: the joiner returned an answer code — hand it to the renderer to accept.
		onAnswer: (answerCode) => win.webContents.send('discovery:answer', { answerCode }),
	});

	ipcMain.handle('discovery:available', () => true);
	ipcMain.handle('discovery:advertise', (_e, { sessionId, name }) => discovery.advertise(sessionId, name));
	ipcMain.handle('discovery:stopAdvertise', () => discovery.stopAdvertise());
	ipcMain.handle('discovery:browse-start', () => discovery.startBrowse());
	ipcMain.handle('discovery:browse-stop', () => discovery.stopBrowse());
	ipcMain.handle('discovery:offer-response', (_e, { reqId, offerCode }) => {
		pendingOffer.get(reqId)?.(offerCode);
		pendingOffer.delete(reqId);
	});
	ipcMain.handle('discovery:answer-response', (_e, { reqId, answerCode }) => {
		pendingAnswer.get(reqId)?.(answerCode);
		pendingAnswer.delete(reqId);
	});
	// Joiner: connect to a discovered host; relay the offer to the renderer and await its answer.
	ipcMain.handle('discovery:connect', (_e, { service }) =>
		discovery.connect(service, (offerCode) =>
			new Promise((resolve) => {
				const reqId = `a-${reqSeq++}`;
				pendingAnswer.set(reqId, resolve);
				win.webContents.send('discovery:offer', { reqId, offerCode });
			}),
		),
	);

	win.on('closed', () => discovery.dispose());
}

/**
 * Secure secret store for cloud auth tokens (SEC-004). Persists ONLY through the OS-backed
 * `safeStorage` encryption so secrets are never written in plaintext. FAIL-CLOSED: if encryption is
 * unavailable (e.g. no Linux keyring), `set` returns false and the renderer keeps tokens in memory
 * only (the user re-authenticates each session) rather than persisting them weakly. Values live in a
 * single JSON map of key → base64(ciphertext) under userData.
 */
function setupSecureStoreIpc() {
	const file = path.join(app.getPath('userData'), 'secure-store.json');

	// FAIL-CLOSED for real: on Linux, safeStorage.isEncryptionAvailable() also
	// returns true for the `basic_text` backend, which "encrypts" under a
	// hardcoded, well-known key (i.e. trivially reversible — effectively plaintext).
	// Treat that as unavailable so tokens stay in memory only, honouring SEC-004.
	const encryptionUsable = () => {
		if (!safeStorage.isEncryptionAvailable()) return false;
		if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
			return safeStorage.getSelectedStorageBackend() !== 'basic_text';
		}
		return true;
	};
	// The renderer may only touch its own secret namespaces: Cognito tokens ("cog:")
	// and the E2EE vault keyring ("vaultkey:"). Validating here means a compromised
	// renderer cannot read/enumerate/overwrite anything outside them via this bridge.
	const ALLOWED_KEY_PREFIXES = ['cog:', 'vaultkey:'];
	const isAllowedKey = (key) =>
		typeof key === 'string' && key.length <= 256 && ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p));

	const readAll = () => {
		try {
			return JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch {
			return {};
		}
	};
	const writeAll = (obj) => {
		fs.writeFileSync(file, JSON.stringify(obj), { mode: 0o600 });
		// `mode` only applies on creation; enforce 0600 on a pre-existing file too.
		try {
			fs.chmodSync(file, 0o600);
		} catch {
			/* best effort */
		}
	};

	ipcMain.handle('secure-store:available', () => encryptionUsable());

	ipcMain.handle('secure-store:get', (_e, { key }) => {
		if (!encryptionUsable() || !isAllowedKey(key)) return null;
		const entry = readAll()[key];
		if (typeof entry !== 'string') return null;
		try {
			return safeStorage.decryptString(Buffer.from(entry, 'base64'));
		} catch {
			return null;
		}
	});

	ipcMain.handle('secure-store:set', (_e, { key, value }) => {
		if (!encryptionUsable() || !isAllowedKey(key)) return false;
		const all = readAll();
		all[key] = safeStorage.encryptString(String(value)).toString('base64');
		writeAll(all);
		return true;
	});

	ipcMain.handle('secure-store:remove', (_e, { key }) => {
		if (!encryptionUsable() || !isAllowedKey(key)) return false;
		const all = readAll();
		delete all[key];
		writeAll(all);
		return true;
	});

	// Only ever expose the app's own namespaced keys, never the raw file contents.
	ipcMain.handle('secure-store:keys', () => {
		if (!encryptionUsable()) return [];
		return Object.keys(readAll()).filter(isAllowedKey);
	});
}

app.whenReady().then(() => {
	if (app.isPackaged) applyCsp();
	denyAllPermissions();
	const win = createWindow();
	setupDiscoveryIpc(win);
	setupSecureStoreIpc();

	// macOS: re-open a window when the dock icon is clicked and none are open.
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

// Quit when all windows are closed, except on macOS where apps stay resident until Cmd+Q.
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
