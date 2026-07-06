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

const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');

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
 */
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

app.whenReady().then(() => {
	if (app.isPackaged) applyCsp();
	createWindow();

	// macOS: re-open a window when the dock icon is clicked and none are open.
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

// Quit when all windows are closed, except on macOS where apps stay resident until Cmd+Q.
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
