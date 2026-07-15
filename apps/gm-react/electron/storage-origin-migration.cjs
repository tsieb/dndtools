// @ts-check
'use strict';

// One-time, fail-safe migration from the file:// origin used by v0.2.0 to the packaged
// dndtools://app origin. The legacy database is never deleted. Data crosses two isolated hidden
// renderers through validated, disk-backed chunks so large media blobs do not accumulate in the main
// process heap. A completion marker is written only after the target independently recomputes the
// source digest.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const v8 = require('node:v8');
const { pathToFileURL } = require('node:url');

const SOURCE_CHANNEL = 'storage-origin-migration:source';
const TARGET_CHANNEL = 'storage-origin-migration:target';
const MARKER_FILE = 'storage-origin-migration-v1.json';
const IN_PROGRESS_FILE = 'storage-origin-migration-v1.in-progress.json';
const MAX_CHUNK_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_TOTAL_RECORDS = 1_000_000;
const MIGRATION_TIMEOUT_MS = 30 * 60 * 1000;

const ALLOWED_LOCAL_STORAGE_KEYS = new Set([
	'dndtools:react:theme',
	'dndtools:react:motion',
	'dndtools:react:density',
	'dndtools:react:onboarded',
	'dndtools:react:vault-choice',
	'dndtools:react:invites',
	'dndtools:react:tier',
	'dndtools:react:plan',
	'dndtools:react:device-source-id',
	'dndtools.ai.provider-settings',
	'dndtools.ai.active-credential-scope',
	'dndtools.gdocs.connections',
]);
const ALLOWED_LOCAL_STORAGE_PREFIXES = [
	'dndtools:react:cloud-pushed-rev:',
	'dndtools:react:cloud-pushed-rev-v2:',
	'dndtools:react:cloud-sync-enabled:',
	'dndtools:react:entitlements:last:',
];

const STORE_DEFINITIONS = {
	documents: { keyPath: 'key', indexes: [] },
	operations: {
		keyPath: 'id',
		indexes: [{ name: 'sequence', keyPath: 'sequence', unique: false, multiEntry: false }],
	},
	migrationJournal: { keyPath: 'key', indexes: [] },
	assetBlobs: { keyPath: 'id', indexes: [] },
};

function isPlainObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isAllowedMigratedPreference(key) {
	return (
		typeof key === 'string' &&
		(ALLOWED_LOCAL_STORAGE_KEYS.has(key) ||
			ALLOWED_LOCAL_STORAGE_PREFIXES.some(
				(prefix) => key.startsWith(prefix) && key.length > prefix.length,
			))
	);
}

function validateLocalStorageEntries(value) {
	if (!Array.isArray(value) || value.length > 256) {
		throw new Error('Legacy preference list exceeded its safe limit.');
	}
	const seen = new Set();
	let totalChars = 0;
	return value.map((entry) => {
		if (
			!Array.isArray(entry) ||
			entry.length !== 2 ||
			!isAllowedMigratedPreference(entry[0]) ||
			typeof entry[1] !== 'string' ||
			entry[0].length > 512 ||
			entry[1].length > 2 * 1024 * 1024 ||
			seen.has(entry[0])
		) {
			throw new Error('Legacy preference data was not safe to migrate.');
		}
		seen.add(entry[0]);
		totalChars += entry[0].length + entry[1].length;
		if (totalChars > 8 * 1024 * 1024) {
			throw new Error('Legacy preference data exceeded its safe limit.');
		}
		return [entry[0], entry[1]];
	});
}

function validateLegacySchema(schema) {
	if (
		!isPlainObject(schema) ||
		!Number.isInteger(schema.version) ||
		!Array.isArray(schema.stores)
	) {
		throw new Error('Legacy database schema was invalid.');
	}
	// Dexie multiplies its public versions by ten before opening native IndexedDB.
	const expectedNames =
		schema.version === 10
			? ['documents', 'operations']
			: schema.version === 20
				? ['documents', 'migrationJournal', 'operations']
				: schema.version === 30
					? ['assetBlobs', 'documents', 'migrationJournal', 'operations']
					: null;
	if (!expectedNames || schema.stores.length !== expectedNames.length) {
		throw new Error('Legacy database version is not supported by this release.');
	}
	for (let index = 0; index < expectedNames.length; index += 1) {
		const store = schema.stores[index];
		const expected = STORE_DEFINITIONS[expectedNames[index]];
		if (
			!isPlainObject(store) ||
			store.name !== expectedNames[index] ||
			store.keyPath !== expected.keyPath ||
			store.autoIncrement !== false ||
			!Array.isArray(store.indexes) ||
			JSON.stringify(store.indexes) !== JSON.stringify(expected.indexes)
		) {
			throw new Error(`Legacy database store ${expectedNames[index]} had an unexpected schema.`);
		}
	}
	return schema;
}

function readSmallJson(file) {
	try {
		const stat = fs.statSync(file);
		if (!stat.isFile() || stat.size > 16 * 1024) return null;
		const value = JSON.parse(fs.readFileSync(file, 'utf8'));
		return isPlainObject(value) ? value : null;
	} catch {
		return null;
	}
}

let atomicSequence = 0;
function atomicWriteJson(file, value) {
	const temp = `${file}.${process.pid}.${atomicSequence++}.tmp`;
	let descriptor = null;
	try {
		descriptor = fs.openSync(temp, 'wx', 0o600);
		fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8');
		fs.fsyncSync(descriptor);
		fs.closeSync(descriptor);
		descriptor = null;
		fs.renameSync(temp, file);
		try {
			fs.chmodSync(file, 0o600);
		} catch {
			// Windows and some managed filesystems do not expose POSIX modes.
		}
	} finally {
		if (descriptor !== null) {
			try {
				fs.closeSync(descriptor);
			} catch {
				// Best effort during an already-failing write.
			}
		}
		try {
			fs.unlinkSync(temp);
		} catch {
			// Renamed successfully or never created.
		}
	}
}

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

function withTimeout(promise, label) {
	let timer;
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`${label} did not finish within 30 minutes.`)),
				MIGRATION_TIMEOUT_MS,
			);
		}),
	]).finally(() => clearTimeout(timer));
}

function isDigest(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isTrustedMigrationEvent(event, win, expectedUrl, nonce, payload) {
	return Boolean(
		win &&
		!win.isDestroyed() &&
		event.sender === win.webContents &&
		event.senderFrame === event.sender.mainFrame &&
		event.senderFrame.url === expectedUrl &&
		isPlainObject(payload) &&
		payload.nonce === nonce,
	);
}

function createMigrationWindow(BrowserWindow, preload, mode, nonce, interruptAfter) {
	const additionalArguments = [
		`--dndtools-migration-mode=${mode}`,
		`--dndtools-migration-nonce=${nonce}`,
	];
	if (interruptAfter > 0) {
		additionalArguments.push(`--dndtools-migration-interrupt-after=${interruptAfter}`);
	}
	const win = new BrowserWindow({
		show: false,
		skipTaskbar: true,
		webPreferences: {
			preload,
			additionalArguments,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			devTools: false,
			webviewTag: false,
			backgroundThrottling: false,
		},
	});
	win.setMenuBarVisibility(false);
	win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	return win;
}

function attachWindowFailure(win, expectedUrl, target, label) {
	win.webContents.on('will-navigate', (event, url) => {
		if (url === expectedUrl) return;
		if (process.env.DNDTOOLS_MIGRATION_DEBUG === '1') {
			console.error(`${label} navigation mismatch`, { expectedUrl, url });
		}
		event.preventDefault();
		target.reject(new Error(`${label} attempted an unexpected navigation.`));
	});
	win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
		if (process.env.DNDTOOLS_MIGRATION_DEBUG === '1') {
			console.error(`${label} did-fail-load`, { code, description, url, isMainFrame });
		}
		if (isMainFrame !== false) {
			target.reject(new Error(`${label} failed to load (${code}: ${description}) at ${url}.`));
		}
	});
	win.webContents.on('render-process-gone', (_event, details) => {
		target.reject(new Error(`${label} renderer exited unexpectedly (${details.reason}).`));
	});
	win.webContents.on('preload-error', (_event, preloadPath, error) => {
		if (process.env.DNDTOOLS_MIGRATION_DEBUG === '1') {
			console.error(`${label} preload-error`, { preloadPath, error });
		}
		target.reject(new Error(`${label} preload failed.`));
	});
	win.on('unresponsive', () => target.reject(new Error(`${label} renderer became unresponsive.`)));
}

/**
 * @param {{
 *   app: import('electron').App,
 *   BrowserWindow: typeof import('electron').BrowserWindow,
 *   ipcMain: import('electron').IpcMain,
 *   rendererRoot: string,
 *   appOrigin: string,
 *   interruptAfter?: number,
 * }} options
 */
async function runStorageOriginMigration(options) {
	const { app, BrowserWindow, ipcMain, rendererRoot, appOrigin } = options;
	const interruptAfter = Number.isInteger(options.interruptAfter) ? options.interruptAfter : 0;
	const userData = app.getPath('userData');
	const markerFile = path.join(userData, MARKER_FILE);
	const progressFile = path.join(userData, IN_PROGRESS_FILE);
	const completed = readSmallJson(markerFile);
	if (completed?.version === 1 && completed?.completed === true) {
		return { status: 'already-complete', marker: completed };
	}

	const migrationHtml = path.join(rendererRoot, 'storage-origin-migration.html');
	const preload = path.join(__dirname, 'storage-origin-migration-preload.cjs');
	if (!fs.existsSync(migrationHtml) || !fs.existsSync(preload)) {
		throw new Error('The packaged storage migration resources are missing.');
	}

	const nonce = crypto.randomBytes(32).toString('hex');
	const staging = path.join(
		userData,
		`.storage-origin-migration-${process.pid}-${nonce.slice(0, 12)}`,
	);
	fs.mkdirSync(staging, { recursive: false, mode: 0o700 });

	const sourceResult = deferred();
	const targetResult = deferred();
	// Preloads can report before loadFile/loadURL resolves. Attach rejection handlers immediately so a
	// fast failure is still observed by the later awaited promise without becoming unhandled first.
	void sourceResult.promise.catch(() => undefined);
	void targetResult.promise.catch(() => undefined);
	const sourceUrl = pathToFileURL(migrationHtml).href;
	const targetUrl = `${appOrigin}/storage-origin-migration.html`;
	let sourceWindow = null;
	let targetWindow = null;
	let sourceBegun = false;
	let sourceFinished = false;
	let totalStagedBytes = 0;
	let totalStagedRecords = 0;
	let plan = null;
	const stores = new Map();

	const rejectRendererError = (target, payload, label) => {
		const message =
			typeof payload.message === 'string' && payload.message.length <= 500
				? payload.message
				: 'Unknown renderer error.';
		target.reject(new Error(`${label}: ${message}`));
		return false;
	};

	ipcMain.handle(SOURCE_CHANNEL, async (event, payload) => {
		if (!isTrustedMigrationEvent(event, sourceWindow, sourceUrl, nonce, payload)) return false;
		if (payload.type === 'error')
			return rejectRendererError(sourceResult, payload, 'Legacy export failed');
		if (payload.type === 'begin') {
			if (sourceBegun) throw new Error('Legacy export began more than once.');
			const schema = payload.schema === null ? null : validateLegacySchema(payload.schema);
			const localStorageEntries = validateLocalStorageEntries(payload.localStorageEntries);
			plan = { schema, localStorageEntries };
			if (schema) {
				for (const store of schema.stores) stores.set(store.name, { nextChunk: 0, files: [] });
			}
			sourceBegun = true;
			return true;
		}
		if (payload.type === 'chunk') {
			if (!sourceBegun || sourceFinished || !plan?.schema) {
				throw new Error('Legacy export chunk arrived out of order.');
			}
			const store = stores.get(payload.storeName);
			if (
				!store ||
				!Number.isInteger(payload.chunkIndex) ||
				payload.chunkIndex !== store.nextChunk ||
				!Array.isArray(payload.records) ||
				payload.records.length === 0 ||
				payload.records.length > (payload.storeName === 'assetBlobs' ? 1 : 128) ||
				payload.records.some(
					(record) =>
						!isPlainObject(record) ||
						!Object.prototype.hasOwnProperty.call(record, 'key') ||
						!Object.prototype.hasOwnProperty.call(record, 'value'),
				)
			) {
				throw new Error('Legacy export chunk was invalid or out of sequence.');
			}
			const serialized = v8.serialize(payload.records);
			if (serialized.byteLength > MAX_CHUNK_BYTES) {
				throw new Error('A legacy storage record exceeded the 40 MiB migration limit.');
			}
			totalStagedBytes += serialized.byteLength;
			totalStagedRecords += payload.records.length;
			if (totalStagedBytes > MAX_TOTAL_BYTES || totalStagedRecords > MAX_TOTAL_RECORDS) {
				throw new Error('The legacy vault exceeded the safe automatic migration limit.');
			}
			const storeIndex = plan.schema.stores.findIndex((entry) => entry.name === payload.storeName);
			const file = path.join(staging, `${storeIndex}-${payload.chunkIndex}.bin`);
			fs.writeFileSync(file, serialized, { flag: 'wx', mode: 0o600 });
			store.files.push(file);
			store.nextChunk += 1;
			return true;
		}
		if (payload.type === 'finish') {
			if (
				!sourceBegun ||
				sourceFinished ||
				!Number.isInteger(payload.totalRecords) ||
				payload.totalRecords !== totalStagedRecords ||
				payload.totalRecords < 0 ||
				(plan?.schema === null
					? payload.databaseDigest !== null
					: !isDigest(payload.databaseDigest))
			) {
				throw new Error('Legacy export summary did not match its staged records.');
			}
			sourceFinished = true;
			plan.totalRecords = payload.totalRecords;
			plan.databaseDigest = payload.databaseDigest;
			sourceResult.resolve(plan);
			return true;
		}
		return false;
	});

	ipcMain.handle(TARGET_CHANNEL, async (event, payload) => {
		if (!isTrustedMigrationEvent(event, targetWindow, targetUrl, nonce, payload)) return false;
		if (payload.type === 'error')
			return rejectRendererError(targetResult, payload, 'Storage import failed');
		if (!sourceFinished || !plan)
			throw new Error('Storage import started before export completed.');
		if (payload.type === 'plan') {
			const progress = readSmallJson(progressFile);
			return {
				schema: plan.schema,
				localStorageEntries: plan.localStorageEntries,
				totalRecords: plan.totalRecords,
				databaseDigest: plan.databaseDigest,
				ownedPartialDigest:
					progress?.version === 1 && progress?.databaseDigest === plan.databaseDigest
						? progress.databaseDigest
						: null,
				stores: [...stores.entries()].map(([name, store]) => ({
					name,
					chunkCount: store.files.length,
				})),
			};
		}
		if (payload.type === 'claim') {
			if (!isDigest(payload.databaseDigest) || payload.databaseDigest !== plan.databaseDigest) {
				throw new Error('Storage import claim did not match the source digest.');
			}
			atomicWriteJson(progressFile, {
				version: 1,
				databaseDigest: plan.databaseDigest,
				claimedAt: new Date().toISOString(),
			});
			return true;
		}
		if (payload.type === 'chunk') {
			const store = stores.get(payload.storeName);
			if (
				!store ||
				!Number.isInteger(payload.chunkIndex) ||
				payload.chunkIndex < 0 ||
				payload.chunkIndex >= store.files.length
			) {
				throw new Error('Storage import requested an invalid chunk.');
			}
			const serialized = fs.readFileSync(store.files[payload.chunkIndex]);
			if (serialized.byteLength > MAX_CHUNK_BYTES)
				throw new Error('Staged migration chunk was invalid.');
			const records = v8.deserialize(serialized);
			if (!Array.isArray(records)) throw new Error('Staged migration chunk could not be decoded.');
			return records;
		}
		if (payload.type === 'complete') {
			if (!['imported', 'matched', 'no-data', 'conflict'].includes(payload.status)) return false;
			if (payload.status === 'conflict') {
				targetResult.reject(
					new Error(
						'The legacy vault and the new app origin both contain different data; neither was overwritten.',
					),
				);
				return false;
			}
			if (
				(payload.status === 'imported' || payload.status === 'matched') &&
				(payload.databaseDigest !== plan.databaseDigest ||
					payload.totalRecords !== plan.totalRecords)
			) {
				throw new Error('Storage import completion did not match the source digest.');
			}
			if (payload.status === 'no-data' && (plan.totalRecords !== 0 || payload.totalRecords !== 0)) {
				throw new Error('Storage import reported an invalid empty result.');
			}
			if (
				!isPlainObject(payload.localStorage) ||
				!Array.isArray(payload.localStorage.imported) ||
				!Array.isArray(payload.localStorage.preserved)
			) {
				throw new Error('Storage import preference summary was invalid.');
			}
			atomicWriteJson(markerFile, {
				version: 1,
				completed: true,
				status: payload.status,
				databaseDigest: plan.databaseDigest,
				totalRecords: plan.totalRecords,
				completedAt: new Date().toISOString(),
			});
			try {
				fs.unlinkSync(progressFile);
			} catch (error) {
				if (error?.code !== 'ENOENT') throw error;
			}
			targetResult.resolve({ status: payload.status, marker: readSmallJson(markerFile) });
			return true;
		}
		return false;
	});

	try {
		sourceWindow = createMigrationWindow(BrowserWindow, preload, 'source', nonce, 0);
		attachWindowFailure(sourceWindow, sourceUrl, sourceResult, 'Legacy storage exporter');
		await sourceWindow.loadFile(migrationHtml);
		await withTimeout(sourceResult.promise, 'Legacy storage export');
		if (!sourceWindow.isDestroyed()) sourceWindow.destroy();
		sourceWindow = null;

		targetWindow = createMigrationWindow(BrowserWindow, preload, 'target', nonce, interruptAfter);
		attachWindowFailure(targetWindow, targetUrl, targetResult, 'Storage importer');
		await targetWindow.loadURL(targetUrl);
		return await withTimeout(targetResult.promise, 'Storage import');
	} finally {
		if (sourceWindow && !sourceWindow.isDestroyed()) sourceWindow.destroy();
		if (targetWindow && !targetWindow.isDestroyed()) targetWindow.destroy();
		ipcMain.removeHandler(SOURCE_CHANNEL);
		ipcMain.removeHandler(TARGET_CHANNEL);
		fs.rmSync(staging, { recursive: true, force: true });
	}
}

module.exports = {
	IN_PROGRESS_FILE,
	MARKER_FILE,
	isAllowedMigratedPreference,
	runStorageOriginMigration,
	validateLegacySchema,
};
