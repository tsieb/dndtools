// @ts-check
'use strict';

// Electron main process for the Lamplight GM desktop shell.
//
// This wraps the SAME static build that ships to the web (apps/gm-react/dist) in a Chromium window.
// Local-first features continue to work offline; optional cloud, content, and AI integrations are
// constrained by the packaged network policy below. Narrow preload bridges provide native chrome,
// OS-encrypted secrets, and LAN discovery without exposing Node.js to the renderer.
//
// CommonJS (.cjs) because the package is `type: module`; Electron's main entry is CJS.

const {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	nativeTheme,
	net,
	protocol,
	session,
	safeStorage,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {
	APP_ORIGIN,
	APP_ENTRY_URL,
	registerAppScheme,
	installAppProtocol,
} = require('./app-protocol.cjs');
const { runStorageOriginMigration } = require('./storage-origin-migration.cjs');

// Privileged schemes must be declared before app.ready. The packaged handler is installed only after
// ready; development continues to load Vite over HTTP for HMR.
registerAppScheme(protocol);
const RENDERER_ROOT = path.join(__dirname, '..', 'dist');

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

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
let mainWindowReady = false;
let focusPrimaryWhenReady = false;
let primaryWindowCreationEnabled = false;
const managedWindows = new Set();

function focusPrimaryWindow() {
	if (!mainWindow || mainWindow.isDestroyed()) {
		focusPrimaryWhenReady = true;
		if (app.isReady() && primaryWindowCreationEnabled) createWindow();
		return;
	}
	if (!mainWindowReady) {
		focusPrimaryWhenReady = true;
		return;
	}
	if (mainWindow.isMinimized()) mainWindow.restore();
	if (!mainWindow.isVisible()) mainWindow.show();
	mainWindow.focus();
	focusPrimaryWhenReady = false;
}

// Align the userData directory name across dev and the packaged app (electron-builder productName is
// "Lamplight GM"), so IndexedDB/localStorage live at one predictable path testers can reset:
//   macOS  ~/Library/Application Support/Lamplight GM/
//   Linux  ~/.config/Lamplight GM/
app.setName('Lamplight GM');

// The "DND Tools GM" -> "Lamplight GM" rename moves that directory, and the vault lives inside it.
// Carry an existing install across rather than booting to an empty vault: prefer renaming the legacy
// folder (so the new name is what persists), and if that cannot be done — locked files, a cross-device
// appData root, an install that already has both — keep using the legacy path instead of silently
// abandoning it. Must run before any session or window exists, because Chromium resolves its profile
// directory once at startup. This name is a historical on-disk path, so it must NOT be rebranded.
const LEGACY_USER_DATA_NAME = 'DND Tools GM';
(function adoptLegacyUserDataDirectory() {
	const currentUserData = app.getPath('userData');
	const legacyUserData = path.join(path.dirname(currentUserData), LEGACY_USER_DATA_NAME);
	if (legacyUserData === currentUserData || !fs.existsSync(legacyUserData)) return;
	if (!fs.existsSync(currentUserData)) {
		try {
			fs.renameSync(legacyUserData, currentUserData);
			return;
		} catch {
			// Fall through to using the legacy directory in place.
		}
	}
	try {
		app.setPath('userData', legacyUserData);
	} catch {
		// Last resort: the new, empty directory. The legacy one is left untouched on disk.
	}
})();

// One Chromium profile owns the vault and encrypted secret map. A second process could otherwise race
// IndexedDB and read-modify-write credential updates, so redirect repeat launches to the primary window.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
	app.quit();
} else {
	app.on('second-instance', focusPrimaryWindow);
}

// In dev, `desktop:dev` sets VITE_DEV_SERVER_URL and we point the window at the Vite dev server (HMR).
// When packaged there is no dev server — the constrained custom protocol serves the built bundle.
const DEV_SERVER_URL = !app.isPackaged ? process.env.VITE_DEV_SERVER_URL : undefined;

function isTrustedAppDocumentUrl(value) {
	try {
		const target = new URL(value);
		const expected = new URL(DEV_SERVER_URL || APP_ENTRY_URL);
		target.hash = '';
		expected.hash = '';
		return target.href === expected.href;
	} catch {
		return false;
	}
}

function isTrustedDisplayUrl(value) {
	try {
		return isTrustedAppDocumentUrl(value) && new URL(value).hash === '#/display';
	} catch {
		return false;
	}
}

function isPrimaryWebContents(webContents) {
	return Boolean(
		mainWindow &&
		!mainWindow.isDestroyed() &&
		webContents === mainWindow.webContents &&
		isTrustedAppDocumentUrl(webContents.getURL()),
	);
}

function isPrimarySender(event) {
	return (
		isPrimaryWebContents(event.sender) &&
		event.senderFrame === event.sender.mainFrame &&
		isTrustedAppDocumentUrl(event.senderFrame.url)
	);
}

function isManagedSender(event) {
	if (event.senderFrame !== event.sender.mainFrame) return false;
	for (const win of managedWindows) {
		if (win.isDestroyed() || event.sender !== win.webContents) continue;
		return win === mainWindow
			? isTrustedAppDocumentUrl(event.senderFrame.url)
			: isTrustedDisplayUrl(event.senderFrame.url);
	}
	return false;
}

/**
 * Content-Security-Policy for the packaged custom-scheme app only. The app is same-origin and offline,
 * so this is defense-in-depth. Theme/motion/density pre-paint setup ships as a bundled local script, so
 * scripts remain self-only. `style-src` allows inline for React style props and
 * the token CSS; data:/blob: cover the self-hosted fonts and the seeded silent-WAV `data:` audio.
 * Not applied in dev, where Vite's HMR client needs 'unsafe-eval'.
 *
 * P2P (Epic 7.3): the LAN remote-player feature uses WebRTC data channels with NO STUN/TURN (LAN host
 * candidates only). The explicit CSP Level 3 `webrtc 'allow'` directive permits `RTCPeerConnection`.
 *
 * Cloud (opt-in): the build emits the exact Cognito, signaling, backup, and app API origins for its
 * environment. The main-process request filter admits those origins without regional or API wildcards.
 * STUN/TURN media is governed by `webrtc`, not `connect-src`, so no relay origin is listed here.
 * Content integrations add `api.open5e.com` and `docs.googleapis.com`; Google authorization itself is
 * web-only in this release, so the packaged shell does not admit the Google Identity Services
 * script/frame. Mirror feature-origin changes into the hosted policy in
 * infra/web-hosting/template.yaml, accounting for that runtime difference.
 */
function buildCsp() {
	const signalingOrigins = [...packagedNetworkOrigins]
		.filter((origin) => origin.startsWith('wss://'))
		.sort();
	return [
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"font-src 'self' data:",
		// Campaign media is stored locally and rendered from data:/blob: URLs. Arbitrary HTTPS media
		// would let a compromised renderer exfiltrate data through a URL path or query string.
		"img-src 'self' data: blob:",
		"media-src 'self' data: blob:",
		// Custom OpenAI-compatible HTTPS endpoints are admitted by the exact-origin main-process
		// allowlist. WebSocket signaling origins must also appear explicitly in CSP.
		`connect-src 'self' https: ${signalingOrigins.join(' ')} http://127.0.0.1:* http://localhost:* http://[::1]:*`,
		"webrtc 'allow'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'none'",
	].join('; ');
}

function applyCsp() {
	const csp = buildCsp();
	session.defaultSession.webRequest.onHeadersReceived(
		{ urls: [`${APP_ORIGIN}/*`] },
		(details, cb) => {
			cb({
				responseHeaders: {
					...details.responseHeaders,
					'Content-Security-Policy': [csp],
					'X-Content-Type-Options': ['nosniff'],
				},
			});
		},
	);
}

// Every packaged renderer network request is denied unless it is part of a product feature's
// explicit allowlist or a user-approved AI endpoint. This keeps the intentionally broad `https:`
// CSP needed for runtime-selected AI providers from becoming an exfiltration path.
const FIXED_NETWORK_ORIGINS = new Set([
	'https://api.open5e.com',
	'https://docs.googleapis.com',
	'https://api.anthropic.com',
	'https://api.openai.com',
]);
const approvedAiOrigins = new Set();
const packagedNetworkOrigins = new Set();
const packagedAiOrigins = new Set();

function readPackagedNetworkPolicy() {
	if (!app.isPackaged) return;
	try {
		const file = path.join(__dirname, '..', 'dist', 'electron-network-policy.json');
		const raw = fs.readFileSync(file, 'utf8');
		if (Buffer.byteLength(raw, 'utf8') > 32 * 1024) return;
		const policy = JSON.parse(raw);
		if (!policy || policy.version !== 1) return;
		const addOrigins = (values, target) => {
			if (!Array.isArray(values) || values.length > 32) return;
			for (const value of values) {
				if (typeof value !== 'string' || value.length > 2048) continue;
				try {
					const url = new URL(value);
					if ((url.protocol === 'https:' || url.protocol === 'wss:') && url.origin === value) {
						target.add(value);
					}
				} catch {
					/* ignore malformed build-policy entries */
				}
			}
		};
		addOrigins(policy.cloudOrigins, packagedNetworkOrigins);
		addOrigins(policy.aiOrigins, packagedAiOrigins);
	} catch {
		// A package with no valid policy remains local-only; never fall back to a wildcard.
	}
}

function isFixedNetworkOrigin(url) {
	return (
		FIXED_NETWORK_ORIGINS.has(url.origin) ||
		packagedNetworkOrigins.has(url.origin) ||
		packagedAiOrigins.has(url.origin)
	);
}

function normalizeAiOrigin(value) {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.length > 2048 ||
		value !== value.trim()
	)
		return null;
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		return null;
	}
	if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/')
		return null;
	const loopback =
		parsed.hostname === 'localhost' ||
		parsed.hostname === '127.0.0.1' ||
		parsed.hostname === '[::1]';
	if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) return null;
	// Requiring the canonical origin prevents a caller from smuggling paths or ambiguous syntax.
	return value === parsed.origin ? parsed.origin : null;
}

function enforcePackagedNetworkAllowlist() {
	session.defaultSession.webRequest.onBeforeRequest(
		{ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
		(details, callback) => {
			let allowed = false;
			try {
				const url = new URL(details.url);
				allowed = isFixedNetworkOrigin(url) || approvedAiOrigins.has(url.origin);
			} catch {
				allowed = false;
			}
			callback({ cancel: !allowed });
		},
	);
}

const WINDOW_THEMES = {
	// Keep these values aligned with the renderer's --color-bg/--color-surface/--color-text-primary
	// tokens so the native controls and the adjacent drag strip read as one continuous title surface.
	tavern: { background: '#14100b', titleBar: '#1f1810', symbols: '#f2e8d8', source: 'dark' },
	parchment: { background: '#f3ebdd', titleBar: '#fdf8f0', symbols: '#221409', source: 'light' },
	'high-contrast': {
		background: '#000000',
		titleBar: '#000000',
		symbols: '#ffffff',
		source: 'dark',
	},
};
let currentWindowTheme = 'tavern';

function applyWindowTheme(win, themeName) {
	const theme = WINDOW_THEMES[themeName] ?? WINDOW_THEMES.tavern;
	win.setBackgroundColor(theme.background);
	nativeTheme.themeSource = theme.source;
	if (process.platform !== 'darwin' && typeof win.setTitleBarOverlay === 'function') {
		win.setTitleBarOverlay({ color: theme.titleBar, symbolColor: theme.symbols, height: 36 });
	}
	return true;
}

/**
 * Deny renderer permissions except the two capabilities used by explicit primary-window controls:
 * sanitized clipboard writes (copy links/codes) and speaker selection (audio output routing). Neither
 * permission is available to secondary windows; clipboard reads, media capture, location, notifications,
 * MIDI, device APIs, and every unknown permission remain denied in both dev and packaged builds.
 */
function configurePermissionPolicy() {
	session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
		callback(isPrimaryWebContents(webContents) && permission === 'speaker-selection');
	});
	session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
		return (
			isPrimaryWebContents(webContents) &&
			(permission === 'clipboard-sanitized-write' || permission === 'speaker-selection')
		);
	});
}

function createWindow() {
	const initialTheme = WINDOW_THEMES[currentWindowTheme];
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 720,
		minHeight: 520,
		show: false,
		autoHideMenuBar: true,
		// Keep native close/minimize/maximize controls, while allowing the compact title surface to
		// follow the app theme. The renderer reserves a 36px drag region beneath the overlay.
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
		...(process.platform === 'darwin'
			? { trafficLightPosition: { x: 14, y: 12 } }
			: {
					titleBarOverlay: {
						color: initialTheme.titleBar,
						symbolColor: initialTheme.symbols,
						height: 36,
					},
				}),
		// Dark tone matching the default "tavern" theme so there's no white flash before CSS paints.
		backgroundColor: initialTheme.background,
		title: 'Lamplight GM',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			devTools: !app.isPackaged,
			// The app embeds no third-party frames; <webview> is a large remote-content
			// attack surface, so pin it off explicitly rather than relying on the default.
			webviewTag: false,
		},
	});
	mainWindow = win;
	mainWindowReady = false;
	managedWindows.add(win);
	win.setMenuBarVisibility(false);
	attachDiscoveryToWindow(win);
	win.on('closed', () => {
		managedWindows.delete(win);
		if (mainWindow === win) {
			mainWindow = null;
			mainWindowReady = false;
			disposeDiscovery();
		}
	});

	win.once('ready-to-show', () => {
		if (mainWindow === win) mainWindowReady = true;
		win.show();
		if (mainWindow === win && focusPrimaryWhenReady) focusPrimaryWindow();
	});

	// Never navigate a managed window to a remote origin. Do not silently delegate an arbitrary
	// renderer-provided URL to the OS browser either: a compromised renderer could encode secrets in
	// that URL and bypass the packaged request allowlist through `shell.openExternal`. The app has no
	// external-link UI today; any future external-link feature needs its own narrow, user-confirmed IPC.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (isTrustedDisplayUrl(url)) {
			const displayTheme = WINDOW_THEMES[currentWindowTheme] ?? WINDOW_THEMES.tavern;
			return {
				action: 'allow',
				overrideBrowserWindowOptions: {
					width: 1280,
					height: 720,
					minWidth: 640,
					minHeight: 420,
					autoHideMenuBar: true,
					backgroundColor: displayTheme.background,
					title: 'Lamplight — Scene Display',
					titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
					...(process.platform === 'darwin'
						? { trafficLightPosition: { x: 14, y: 12 } }
						: {
								titleBarOverlay: {
									color: displayTheme.titleBar,
									symbolColor: displayTheme.symbols,
									height: 36,
								},
							}),
					webPreferences: {
						// The projector needs theme-aware window chrome only. Do not expose the primary
						// window's secret-store, discovery, or network-policy bridges to this child.
						preload: path.join(__dirname, 'window-preload.cjs'),
						contextIsolation: true,
						nodeIntegration: false,
						sandbox: true,
						devTools: !app.isPackaged,
						webviewTag: false,
					},
				},
			};
		}
		return { action: 'deny' };
	});
	win.webContents.on('did-create-window', (child) => {
		managedWindows.add(child);
		child.on('closed', () => managedWindows.delete(child));
		child.setMenuBarVisibility(false);
		applyWindowTheme(child, currentWindowTheme);
		child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
		const rejectChildNavigation = (event, url) => {
			if (isTrustedDisplayUrl(url)) return;
			event?.preventDefault?.();
			if (!child.isDestroyed()) child.destroy();
		};
		child.webContents.on('will-navigate', rejectChildNavigation);
		child.webContents.on('will-redirect', rejectChildNavigation);
		child.webContents.on('did-navigate', (event, url) => rejectChildNavigation(event, url));
		child.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
			if (isMainFrame) rejectChildNavigation(event, url);
		});
	});
	const rejectPrimaryNavigation = (event, url) => {
		if (isTrustedAppDocumentUrl(url)) return;
		event?.preventDefault?.();
	};
	win.webContents.on('will-navigate', rejectPrimaryNavigation);
	win.webContents.on('will-redirect', rejectPrimaryNavigation);
	win.webContents.on('did-navigate', (event, url) => {
		if (!isTrustedAppDocumentUrl(url) && !win.isDestroyed()) win.destroy();
	});
	win.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
		if (isMainFrame && !isTrustedAppDocumentUrl(url) && !win.isDestroyed()) win.destroy();
	});

	if (DEV_SERVER_URL) {
		void win.loadURL(DEV_SERVER_URL);
		win.webContents.openDevTools({ mode: 'detach' });
	} else {
		void win.loadURL(APP_ENTRY_URL);
	}

	return win;
}

function setupWindowIpc() {
	ipcMain.handle('window:set-theme', (event, themeName) => {
		if (!isManagedSender(event) || typeof themeName !== 'string' || !(themeName in WINDOW_THEMES))
			return false;
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win || win.isDestroyed()) return false;
		if (win === mainWindow) currentWindowTheme = themeName;
		return applyWindowTheme(win, themeName);
	});
	ipcMain.handle('network-policy:allow-ai-origin', async (event, value) => {
		if (!isPrimarySender(event)) return false;
		const origin = normalizeAiOrigin(value);
		if (!origin) return false;
		if (
			FIXED_NETWORK_ORIGINS.has(origin) ||
			packagedAiOrigins.has(origin) ||
			approvedAiOrigins.has(origin)
		)
			return true;
		if (approvedAiOrigins.size >= 32 && !approvedAiOrigins.has(origin)) return false;
		if (!mainWindow || mainWindow.isDestroyed()) return false;
		const choice = await dialog.showMessageBox(mainWindow, {
			type: 'warning',
			title: 'Allow AI provider?',
			message: `Allow ${origin} as an AI provider?`,
			detail:
				'Lamplight will send the API key and assistant requests you provide to this address. Only allow a provider you trust.',
			buttons: ['Cancel', 'Allow provider'],
			defaultId: 0,
			cancelId: 0,
			noLink: true,
		});
		if (choice.response !== 1) return false;
		approvedAiOrigins.add(origin);
		return true;
	});
}

/**
 * Wire the LAN discovery IPC surface. A nearby device is discoverable, but it is never admitted merely
 * for being on the same network: the host renderer must explicitly approve each offer request. The main
 * process also owns all timeouts and bounds so a silent/hostile LAN peer cannot retain memory or sockets.
 */
const MAX_PAIRING_CODE_CHARS = 256 * 1024;
const DISCOVERY_REQUEST_TIMEOUT_MS = 60_000;
/** @type {InstanceType<NonNullable<typeof discoveryModule>['Discovery']> | null} */
let activeDiscovery = null;
const pendingOffer = new Map(); // reqId -> { resolve, timer } (host approval)
const pendingAnswer = new Map(); // reqId -> { resolve, timer } (joiner renderer)
let discoveryReqSeq = 0;

function settlePending(map, reqId, value) {
	const pending = map.get(reqId);
	if (!pending) return false;
	clearTimeout(pending.timer);
	map.delete(reqId);
	pending.resolve(value);
	return true;
}

function disposeDiscovery() {
	for (const reqId of [...pendingOffer.keys()]) settlePending(pendingOffer, reqId, null);
	for (const reqId of [...pendingAnswer.keys()]) settlePending(pendingAnswer, reqId, null);
	activeDiscovery?.dispose();
	activeDiscovery = null;
}

function sendToPrimary(channel, payload) {
	if (!mainWindow || mainWindow.isDestroyed()) return false;
	mainWindow.webContents.send(channel, payload);
	return true;
}

function attachDiscoveryToWindow(win) {
	disposeDiscovery();
	if (!discoveryModule || !discoveryModule.available()) return;
	const discovery = new discoveryModule.Discovery();
	activeDiscovery = discovery;
	discovery.setHandlers({
		onServices: (services) => {
			if (mainWindow === win) sendToPrimary('discovery:services', services);
		},
		onOfferRequest: () =>
			new Promise((resolve) => {
				if (mainWindow !== win || win.isDestroyed()) return resolve(null);
				const reqId = `o-${discoveryReqSeq++}`;
				const timer = setTimeout(
					() => settlePending(pendingOffer, reqId, null),
					DISCOVERY_REQUEST_TIMEOUT_MS,
				);
				pendingOffer.set(reqId, { resolve, timer });
				if (!sendToPrimary('discovery:offer-request', { reqId })) {
					settlePending(pendingOffer, reqId, null);
				}
			}),
		onAnswer: (answerCode) => {
			if (mainWindow === win) sendToPrimary('discovery:answer', { answerCode });
		},
	});
}

function setupDiscoveryIpc() {
	const availableFor = (event) => isPrimarySender(event) && activeDiscovery !== null;
	ipcMain.handle('discovery:available', (event) => availableFor(event));
	ipcMain.handle('discovery:advertise', (event, payload) => {
		if (!availableFor(event) || !payload || typeof payload !== 'object') return { ok: false };
		const { sessionId, name } = payload;
		if (
			typeof sessionId !== 'string' ||
			!/^sess-[a-zA-Z0-9-]{1,96}$/.test(sessionId) ||
			typeof name !== 'string' ||
			name.length < 1 ||
			name.length > 80
		)
			return { ok: false };
		return activeDiscovery.advertise(sessionId, name);
	});
	ipcMain.handle('discovery:stopAdvertise', (event) => {
		if (!availableFor(event)) return;
		return activeDiscovery.stopAdvertise();
	});
	ipcMain.handle('discovery:browse-start', (event) => {
		if (availableFor(event)) activeDiscovery.startBrowse();
	});
	ipcMain.handle('discovery:browse-stop', (event) => {
		if (availableFor(event)) activeDiscovery.stopBrowse();
	});
	ipcMain.handle('discovery:offer-response', (event, payload) => {
		if (!isPrimarySender(event) || !payload || typeof payload !== 'object') return false;
		const { reqId, offerCode } = payload;
		if (
			typeof reqId !== 'string' ||
			typeof offerCode !== 'string' ||
			offerCode.length < 1 ||
			offerCode.length > MAX_PAIRING_CODE_CHARS
		)
			return false;
		return settlePending(pendingOffer, reqId, offerCode);
	});
	ipcMain.handle('discovery:offer-reject', (event, payload) => {
		if (!isPrimarySender(event) || !payload || typeof payload.reqId !== 'string') return false;
		return settlePending(pendingOffer, payload.reqId, null);
	});
	ipcMain.handle('discovery:answer-response', (event, payload) => {
		if (!isPrimarySender(event) || !payload || typeof payload !== 'object') return false;
		const { reqId, answerCode } = payload;
		if (
			typeof reqId !== 'string' ||
			typeof answerCode !== 'string' ||
			answerCode.length < 1 ||
			answerCode.length > MAX_PAIRING_CODE_CHARS
		)
			return false;
		return settlePending(pendingAnswer, reqId, answerCode);
	});
	// Joiner: connect only to an address learned from this discovery instance; relay the bounded offer
	// to the primary renderer and await its bounded answer.
	ipcMain.handle('discovery:connect', (event, payload) => {
		if (!availableFor(event) || !payload || typeof payload !== 'object') {
			return Promise.reject(new Error('Local-network discovery is unavailable.'));
		}
		return activeDiscovery.connect(
			payload.service,
			(offerCode) =>
				new Promise((resolve, reject) => {
					if (
						typeof offerCode !== 'string' ||
						offerCode.length < 1 ||
						offerCode.length > MAX_PAIRING_CODE_CHARS
					) {
						reject(new Error('The nearby table sent an invalid invitation.'));
						return;
					}
					const reqId = `a-${discoveryReqSeq++}`;
					const timer = setTimeout(
						() => settlePending(pendingAnswer, reqId, null),
						DISCOVERY_REQUEST_TIMEOUT_MS,
					);
					pendingAnswer.set(reqId, {
						resolve: (value) =>
							value === null
								? reject(new Error('The connection request timed out.'))
								: resolve(value),
						timer,
					});
					if (!sendToPrimary('discovery:offer', { reqId, offerCode })) {
						settlePending(pendingAnswer, reqId, null);
					}
				}),
		);
	});
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
	const MAX_STORE_BYTES = 1024 * 1024;
	const MAX_SECRET_CHARS = 64 * 1024;
	const MAX_SECRET_ENTRIES = 512;
	const tempFilePrefix = `${path.basename(file)}.`;
	let atomicWriteSequence = 0;

	// Remove temporary files left behind if a previous write was interrupted.
	try {
		for (const entry of fs.readdirSync(path.dirname(file), { withFileTypes: true })) {
			if (entry.isFile() && entry.name.startsWith(tempFilePrefix) && entry.name.endsWith('.tmp')) {
				try {
					fs.unlinkSync(path.join(path.dirname(file), entry.name));
				} catch {
					// A stale file that cannot be removed must not prevent startup.
				}
			}
		}
	} catch {
		// The user-data directory might not exist yet.
	}

	// FAIL-CLOSED for real: on Linux, safeStorage.isEncryptionAvailable() also
	// returns true for the `basic_text` backend, which "encrypts" under a
	// hardcoded, well-known key (i.e. trivially reversible — effectively plaintext).
	// Treat that as unavailable so tokens stay in memory only, honouring SEC-004.
	const encryptionUsable = () => {
		if (!safeStorage.isEncryptionAvailable()) return false;
		if (
			process.platform === 'linux' &&
			typeof safeStorage.getSelectedStorageBackend === 'function'
		) {
			return safeStorage.getSelectedStorageBackend() !== 'basic_text';
		}
		return true;
	};
	// The renderer may only touch its own secret namespaces: Cognito tokens ("cog:"),
	// E2EE vault keyrings ("vaultkey:"), and the user's BYO AI key ("ai:"). Validating here means a compromised
	// renderer cannot read/enumerate/overwrite anything outside them via this bridge.
	const ALLOWED_KEY_PREFIXES = ['cog:', 'vaultkey:', 'ai:'];
	const isAllowedKey = (key) =>
		typeof key === 'string' &&
		key.length <= 256 &&
		ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p));

	const readAll = () => {
		let serialized;
		try {
			if (fs.statSync(file).size > MAX_STORE_BYTES) return null;
			serialized = fs.readFileSync(file, 'utf8');
		} catch (error) {
			// Absence is the one valid empty-store state. An unreadable existing file must never be
			// collapsed to `{}` because the next write would silently destroy every credential.
			return error?.code === 'ENOENT' ? {} : null;
		}
		try {
			const parsed = JSON.parse(serialized);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
			const entries = Object.entries(parsed);
			if (
				entries.length > MAX_SECRET_ENTRIES ||
				entries.some(
					([key, value]) =>
						!isAllowedKey(key) ||
						typeof value !== 'string' ||
						value.length < 4 ||
						value.length > MAX_STORE_BYTES ||
						value.length % 4 !== 0 ||
						!/^[A-Za-z0-9+/]+={0,2}$/.test(value),
				)
			) {
				return null;
			}
			return parsed;
		} catch {
			return null;
		}
	};
	const writeAll = (obj) => {
		const serialized = JSON.stringify(obj);
		const tempFile = `${file}.${process.pid}.${atomicWriteSequence++}.tmp`;
		let descriptor = null;
		let created = false;
		let renamed = false;

		try {
			descriptor = fs.openSync(tempFile, 'wx', 0o600);
			created = true;
			fs.writeFileSync(descriptor, serialized, { encoding: 'utf8' });
			fs.fsyncSync(descriptor);
			fs.closeSync(descriptor);
			descriptor = null;
			fs.renameSync(tempFile, file);
			renamed = true;
			// `mode` only applies on creation; enforce 0600 on a pre-existing file too.
			try {
				fs.chmodSync(file, 0o600);
			} catch {
				/* best effort */
			}
		} finally {
			if (descriptor !== null) {
				try {
					fs.closeSync(descriptor);
				} catch {
					/* best effort */
				}
			}
			if (created && !renamed) {
				try {
					fs.unlinkSync(tempFile);
				} catch {
					/* best effort */
				}
			}
		}
	};

	ipcMain.handle('secure-store:available', (event) => {
		if (!isPrimarySender(event) || !encryptionUsable()) return false;
		if (readAll() === null) {
			// Availability and integrity are different states. Rejecting lets the renderer block
			// credential hydration instead of treating damage as an empty or temporarily unavailable
			// store and silently continuing with a different identity.
			throw new Error('The encrypted credential store is damaged or unreadable.');
		}
		return true;
	});

	ipcMain.handle('secure-store:get', (event, payload) => {
		const key = payload?.key;
		if (!isPrimarySender(event) || !encryptionUsable() || !isAllowedKey(key)) return null;
		const all = readAll();
		if (all === null) throw new Error('The encrypted credential store is damaged or unreadable.');
		const entry = all[key];
		if (typeof entry !== 'string') return null;
		try {
			return safeStorage.decryptString(Buffer.from(entry, 'base64'));
		} catch {
			// Distinguish corrupt ciphertext from an absent key. Vault custody must never interpret a
			// decrypt failure as "first use" and overwrite the only key with a newly generated one.
			throw new Error('An encrypted credential could not be decrypted on this device.');
		}
	});

	ipcMain.handle('secure-store:set', (event, payload) => {
		const key = payload?.key;
		const value = payload?.value;
		if (
			!isPrimarySender(event) ||
			!encryptionUsable() ||
			!isAllowedKey(key) ||
			typeof value !== 'string' ||
			value.length > MAX_SECRET_CHARS
		)
			return false;
		try {
			const all = readAll();
			if (all === null) return false;
			if (!(key in all) && Object.keys(all).length >= MAX_SECRET_ENTRIES) return false;
			all[key] = safeStorage.encryptString(value).toString('base64');
			if (Buffer.byteLength(JSON.stringify(all), 'utf8') > MAX_STORE_BYTES) return false;
			writeAll(all);
			return true;
		} catch {
			return false;
		}
	});

	ipcMain.handle('secure-store:remove', (event, payload) => {
		const key = payload?.key;
		if (!isPrimarySender(event) || !encryptionUsable() || !isAllowedKey(key)) return false;
		try {
			const all = readAll();
			if (all === null) return false;
			delete all[key];
			writeAll(all);
			return true;
		} catch {
			return false;
		}
	});

	// Only ever expose the app's own namespaced keys, never the raw file contents.
	ipcMain.handle('secure-store:keys', (event) => {
		if (!isPrimarySender(event) || !encryptionUsable()) return [];
		const all = readAll();
		if (all === null) throw new Error('The encrypted credential store is damaged or unreadable.');
		return Object.keys(all).filter(isAllowedKey);
	});
}

if (hasSingleInstanceLock) {
	app.whenReady().then(async () => {
		if (!DEV_SERVER_URL) installAppProtocol(protocol, net, RENDERER_ROOT);
		if (app.isPackaged) {
			readPackagedNetworkPolicy();
			applyCsp();
			enforcePackagedNetworkAllowlist();
		}
		configurePermissionPolicy();
		if (app.isPackaged) {
			try {
				await runStorageOriginMigration({
					app,
					BrowserWindow,
					ipcMain,
					rendererRoot: RENDERER_ROOT,
					appOrigin: APP_ORIGIN,
				});
			} catch (error) {
				console.error('Storage origin migration failed:', error);
				await dialog.showMessageBox({
					type: 'error',
					title: 'Lamplight could not safely upgrade your local data',
					message:
						'The application was not opened because the storage upgrade could not be verified.',
					detail:
						'Your existing campaign data was left untouched. Close Lamplight, keep the application data folder intact, and retry this version. If the problem continues, contact support before uninstalling or clearing app data.',
					buttons: ['Close Lamplight's],
					defaultId: 0,
					noLink: true,
				});
				app.quit();
				return;
			}
		}
		setupWindowIpc();
		setupDiscoveryIpc();
		setupSecureStoreIpc();
		primaryWindowCreationEnabled = true;
		createWindow();

		// macOS: re-open a window when the dock icon is clicked and none are open.
		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow();
		});
	});

	// Quit when all windows are closed, except on macOS where apps stay resident until Cmd+Q.
	app.on('window-all-closed', () => {
		if (primaryWindowCreationEnabled && process.platform !== 'darwin') app.quit();
	});
}
