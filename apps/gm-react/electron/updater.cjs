// @ts-check
'use strict';

// Desktop auto-update (RC-PLT-1.2). Wraps `electron-updater` in a small, explicit state machine so
// the main process owns every decision and the renderer only ever sees a plain, serializable status.
//
// Rules this module holds to:
//   * Nothing is downloaded or installed without the DM asking — `autoDownload` and
//     `autoInstallOnAppQuit` are both off, so an update never lands behind their back mid-session.
//   * The feed is the GitHub Releases provider baked into `app-update.yml` at package time (from
//     `publish:` in electron-builder.yml). A packaged build NEVER accepts a feed from the
//     environment; the `LAMPLIGHT_UPDATE_FEED_URL` override exists only for unpackaged smoke runs.
//   * Verification is electron-updater's own: the sha512 in the signed feed file is checked against
//     the downloaded package before it is allowed to install, and on Windows the installer's
//     Authenticode publisher is checked against `publisherName`. A mismatch surfaces as an honest
//     `error` status — never a silent success and never an install.
//   * Release notes arrive from GitHub as HTML. They are flattened to plain text here so the
//     renderer never has to trust remote markup.

/**
 * @typedef {'unsupported'|'idle'|'checking'|'available'|'downloading'|'downloaded'|'up-to-date'|'error'} UpdateStatus
 * @typedef {{
 *   status: UpdateStatus,
 *   currentVersion: string,
 *   availableVersion: string | null,
 *   releaseNotes: string | null,
 *   releaseDate: string | null,
 *   percent: number,
 *   message: string | null,
 *   checkedAt: string | null,
 * }} UpdateState
 */

const MAX_RELEASE_NOTES_CHARS = 4000;

/** Flatten GitHub's HTML release notes (string, or per-version list) into capped plain text. */
function plainReleaseNotes(notes) {
	/** @type {string} */
	let raw;
	if (typeof notes === 'string') raw = notes;
	else if (Array.isArray(notes))
		raw = notes
			.map((entry) =>
				entry && typeof entry === 'object'
					? `${entry.version ? `${entry.version}\n` : ''}${entry.note ?? ''}`
					: String(entry ?? ''),
			)
			.join('\n\n');
	else return null;

	const text = raw
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
		.replace(/<li[^>]*>/gi, '• ')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	if (text.length === 0) return null;
	return text.length > MAX_RELEASE_NOTES_CHARS
		? `${text.slice(0, MAX_RELEASE_NOTES_CHARS)}…`
		: text;
}

/** A user-facing reason why this build can never update itself in place. */
function unsupportedReason(app) {
	if (!app.isPackaged && !process.env.LAMPLIGHT_UPDATE_FEED_URL)
		return 'Updates are disabled in a development build.';
	if (process.platform === 'linux' && app.isPackaged && !process.env.APPIMAGE)
		return 'This build was installed by your package manager, which handles its updates.';
	return null;
}

/**
 * Create the updater. Returns null-free handles; every method resolves to the current state so the
 * renderer can render one shape and never has to guess.
 *
 * @param {{ app: import('electron').App, onState: (state: UpdateState) => void }} deps
 */
function createUpdater({ app, onState }) {
	const blocked = unsupportedReason(app);

	/** @type {UpdateState} */
	let state = {
		status: blocked ? 'unsupported' : 'idle',
		currentVersion: app.getVersion(),
		availableVersion: null,
		releaseNotes: null,
		releaseDate: null,
		percent: 0,
		message: blocked,
		checkedAt: null,
	};

	const publish = (patch) => {
		state = { ...state, ...patch };
		onState(state);
		return state;
	};

	if (blocked) {
		return {
			getState: () => state,
			check: async () => state,
			download: async () => state,
			install: () => state,
		};
	}

	// Required lazily: electron-updater builds its app adapter on first access, which needs a live
	// Electron app. Keeping it inside the factory lets the pure helpers above be unit-tested in Node.
	const { autoUpdater } = require('electron-updater');

	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;
	autoUpdater.allowDowngrade = false;
	autoUpdater.disableWebInstaller = true;
	autoUpdater.logger = null;

	// Unpackaged only: point the updater at a staged local feed so the desktop smoke can exercise the
	// real code path. A packaged build ignores this and always uses its baked-in GitHub provider.
	const override = !app.isPackaged ? process.env.LAMPLIGHT_UPDATE_FEED_URL : undefined;
	if (override) {
		autoUpdater.forceDevUpdateConfig = true;
		autoUpdater.setFeedURL({ provider: 'generic', url: override });
	}

	autoUpdater.on('checking-for-update', () => publish({ status: 'checking', message: null }));
	autoUpdater.on('update-available', (info) =>
		publish({
			status: 'available',
			availableVersion: info?.version ?? null,
			releaseNotes: plainReleaseNotes(info?.releaseNotes),
			releaseDate: typeof info?.releaseDate === 'string' ? info.releaseDate : null,
			percent: 0,
			message: null,
			checkedAt: new Date().toISOString(),
		}),
	);
	autoUpdater.on('update-not-available', () =>
		publish({
			status: 'up-to-date',
			availableVersion: null,
			releaseNotes: null,
			releaseDate: null,
			percent: 0,
			message: null,
			checkedAt: new Date().toISOString(),
		}),
	);
	autoUpdater.on('download-progress', (progress) =>
		publish({
			status: 'downloading',
			percent: Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0))),
		}),
	);
	autoUpdater.on('update-downloaded', (info) =>
		publish({
			status: 'downloaded',
			availableVersion: info?.version ?? state.availableVersion,
			percent: 100,
			message: null,
		}),
	);
	autoUpdater.on('error', (error) =>
		publish({ status: 'error', percent: 0, message: describeError(error) }),
	);

	return {
		getState: () => state,
		/** @returns {Promise<UpdateState>} */
		async check() {
			if (state.status === 'checking' || state.status === 'downloading') return state;
			try {
				await autoUpdater.checkForUpdates();
			} catch (error) {
				publish({ status: 'error', percent: 0, message: describeError(error) });
			}
			return state;
		},
		/** @returns {Promise<UpdateState>} */
		async download() {
			if (state.status !== 'available') return state;
			publish({ status: 'downloading', percent: 0, message: null });
			try {
				await autoUpdater.downloadUpdate();
			} catch (error) {
				publish({ status: 'error', percent: 0, message: describeError(error) });
			}
			return state;
		},
		/** Restart into the verified package. Refuses unless a download actually completed. */
		install() {
			if (state.status !== 'downloaded') return state;
			setImmediate(() => autoUpdater.quitAndInstall(false, true));
			return state;
		},
	};
}

function describeError(error) {
	const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
	const text = raw.replace(/\s+/g, ' ').trim();
	if (/sha512|checksum|signature|publisher/i.test(text))
		return 'The downloaded update failed its integrity check and was discarded.';
	if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::|ENETUNREACH|EAI_AGAIN/i.test(text))
		return 'Could not reach the update server.';
	return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

module.exports = { createUpdater, plainReleaseNotes, unsupportedReason };
