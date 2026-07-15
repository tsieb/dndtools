// Real-Electron upgrade smoke for the v0.2.0 file:// -> dndtools://app storage migration.
// It seeds all released IndexedDB stores (including binary media), interrupts the first import,
// retries, and verifies both the target digest result and the narrow localStorage allowlist.

'use strict';

const { app, BrowserWindow, ipcMain, net, protocol } = require('electron');
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const {
	APP_ORIGIN,
	registerAppScheme,
	installAppProtocol,
} = require('../electron/app-protocol.cjs');
const {
	IN_PROGRESS_FILE,
	MARKER_FILE,
	runStorageOriginMigration,
} = require('../electron/storage-origin-migration.cjs');

const RENDERER_ROOT = path.join(__dirname, '..', 'dist');
const MIGRATION_HTML = path.join(RENDERER_ROOT, 'storage-origin-migration.html');
const userData = mkdtempSync(path.join(tmpdir(), 'dndtools-origin-migration-smoke-'));

registerAppScheme(protocol);
app.setName('DND Tools Origin Migration Smoke');
app.setPath('userData', userData);
// The harness intentionally cycles through hidden windows. Keep Electron alive between them just as
// the production main process does while its boot-time migration is in progress.
app.on('window-all-closed', () => undefined);

function createHiddenWindow() {
	const win = new BrowserWindow({
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			devTools: false,
		},
	});
	win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	return win;
}

async function seedLegacyOrigin() {
	const win = createHiddenWindow();
	try {
		await win.loadFile(MIGRATION_HTML);
		return await win.webContents.executeJavaScript(`(async () => {
			const deletion = indexedDB.deleteDatabase('dndtools-v2');
			await new Promise((resolve, reject) => {
				deletion.onsuccess = resolve;
				deletion.onerror = () => reject(deletion.error);
			});
			const request = indexedDB.open('dndtools-v2', 30);
			request.onupgradeneeded = () => {
				const database = request.result;
				database.createObjectStore('documents', { keyPath: 'key' });
				const operations = database.createObjectStore('operations', { keyPath: 'id' });
				operations.createIndex('sequence', 'sequence');
				database.createObjectStore('migrationJournal', { keyPath: 'key' });
				database.createObjectStore('assetBlobs', { keyPath: 'id' });
			};
			const database = await new Promise((resolve, reject) => {
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const transaction = database.transaction(
				['documents', 'operations', 'migrationJournal', 'assetBlobs'],
				'readwrite',
			);
			transaction.objectStore('documents').put({
				key: 'scene-state',
				doc: { schemaVersion: 1, fixture: 'legacy-scene' },
			});
			transaction.objectStore('operations').put({
				id: 'op-origin-smoke',
				sequence: 0,
				op: { id: 'op-origin-smoke', fixture: true },
			});
			transaction.objectStore('migrationJournal').put({
				key: 'migration-journal',
				entry: { phase: 'committing', fixture: true },
			});
			transaction.objectStore('assetBlobs').put({
				id: 'asset-origin-smoke',
				bytes: new Uint8Array([0, 1, 2, 127, 255]).buffer,
				mime: 'application/octet-stream',
				byteLength: 5,
				createdAt: '2026-07-14T00:00:00.000Z',
			});
			await new Promise((resolve, reject) => {
				transaction.oncomplete = resolve;
				transaction.onabort = () => reject(transaction.error);
				transaction.onerror = () => reject(transaction.error);
			});
			database.close();

			localStorage.setItem('dndtools:react:theme', 'parchment');
			localStorage.setItem('dndtools:react:onboarded', 'true');
			localStorage.setItem('dndtools:react:cloud-sync-enabled:account-fixture', 'true');
			localStorage.setItem('dndtools.ai.provider-settings', '{"provider":"anthropic"}');
			localStorage.setItem(
				'dndtools.ai.active-credential-scope',
				'anthropic:https://api.anthropic.com',
			);
			localStorage.setItem('dndtools:react:cloud-sync-enabled', 'legacy-unscoped-canary');
			localStorage.setItem('dndtools:react:notifications', 'removed-key-canary');
			localStorage.setItem('dndtools.ai.provider-key', 'secret-canary');
			sessionStorage.setItem('dndtools.gdocs.token', 'session-secret-canary');
			return { origin: location.origin };
		})()`);
	} finally {
		win.destroy();
	}
}

async function inspectOrigin(url) {
	const win = createHiddenWindow();
	try {
		await win.loadURL(url);
		return await win.webContents.executeJavaScript(`(async () => {
			const request = indexedDB.open('dndtools-v2');
			const database = await new Promise((resolve, reject) => {
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			const names = Array.from(database.objectStoreNames);
			const transaction = database.transaction(names, 'readonly');
			const getAll = (name) => new Promise((resolve, reject) => {
				const result = transaction.objectStore(name).getAll();
				result.onsuccess = () => resolve(result.result);
				result.onerror = () => reject(result.error);
			});
			const rows = Object.fromEntries(await Promise.all(names.map(async name => [name, await getAll(name)])));
			await new Promise((resolve, reject) => {
				transaction.oncomplete = resolve;
				transaction.onabort = () => reject(transaction.error);
				transaction.onerror = () => reject(transaction.error);
			});
			database.close();
			const asset = rows.assetBlobs?.[0];
			return {
				origin: location.origin,
				counts: Object.fromEntries(Object.entries(rows).map(([name, entries]) => [name, entries.length])),
				assetBytes: asset ? Array.from(new Uint8Array(asset.bytes)) : null,
				documentFixture: rows.documents?.[0]?.doc?.fixture,
				operationId: rows.operations?.[0]?.id,
				journalPhase: rows.migrationJournal?.[0]?.entry?.phase,
				preferences: {
					theme: localStorage.getItem('dndtools:react:theme'),
					onboarded: localStorage.getItem('dndtools:react:onboarded'),
					scopedSync: localStorage.getItem('dndtools:react:cloud-sync-enabled:account-fixture'),
					provider: localStorage.getItem('dndtools.ai.provider-settings'),
					activeAiScope: localStorage.getItem('dndtools.ai.active-credential-scope'),
					unscopedSync: localStorage.getItem('dndtools:react:cloud-sync-enabled'),
					removed: localStorage.getItem('dndtools:react:notifications'),
					secret: localStorage.getItem('dndtools.ai.provider-key'),
					sessionSecret: sessionStorage.getItem('dndtools.gdocs.token'),
				},
			};
		})()`);
	} finally {
		win.destroy();
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function run() {
	assert(existsSync(MIGRATION_HTML), 'dist/storage-origin-migration.html is missing');
	installAppProtocol(protocol, net, RENDERER_ROOT);
	const seeded = await seedLegacyOrigin();
	assert(seeded.origin === 'file://', `unexpected legacy origin: ${seeded.origin}`);
	// Let Chromium finish releasing the fixture renderer before the migration opens the same file origin.
	await new Promise((resolve) => setTimeout(resolve, 100));

	let interrupted = false;
	let interruptionError = '';
	try {
		await runStorageOriginMigration({
			app,
			BrowserWindow,
			ipcMain,
			rendererRoot: RENDERER_ROOT,
			appOrigin: APP_ORIGIN,
			interruptAfter: 2,
		});
	} catch (error) {
		interruptionError = String(error);
		interrupted = /Simulated interrupted migration/.test(interruptionError);
	}
	assert(
		interrupted,
		`the simulated interrupted import did not fail as expected: ${interruptionError || 'no error'}`,
	);
	assert(
		existsSync(path.join(userData, IN_PROGRESS_FILE)),
		'interrupted import lost ownership marker',
	);

	const legacyAfterFailure = await inspectOrigin(
		`file://${MIGRATION_HTML.split(path.sep).join('/')}`,
	);
	assert(legacyAfterFailure.counts.assetBlobs === 1, 'legacy source was modified after failure');

	const migrated = await runStorageOriginMigration({
		app,
		BrowserWindow,
		ipcMain,
		rendererRoot: RENDERER_ROOT,
		appOrigin: APP_ORIGIN,
	});
	assert(migrated.status === 'imported', `unexpected migration status: ${migrated.status}`);
	assert(existsSync(path.join(userData, MARKER_FILE)), 'completion marker was not written');
	assert(!existsSync(path.join(userData, IN_PROGRESS_FILE)), 'in-progress marker survived success');

	const target = await inspectOrigin(`${APP_ORIGIN}/storage-origin-migration.html`);
	assert(target.origin === APP_ORIGIN, `unexpected target origin: ${target.origin}`);
	for (const name of ['assetBlobs', 'documents', 'migrationJournal', 'operations']) {
		assert(target.counts[name] === 1, `${name} was not migrated exactly once`);
	}
	assert(
		JSON.stringify(target.assetBytes) === JSON.stringify([0, 1, 2, 127, 255]),
		'asset bytes changed',
	);
	assert(target.documentFixture === 'legacy-scene', 'document content changed');
	assert(target.operationId === 'op-origin-smoke', 'operation content changed');
	assert(target.journalPhase === 'committing', 'migration journal changed');
	assert(target.preferences.theme === 'parchment', 'theme preference was not migrated');
	assert(target.preferences.onboarded === 'true', 'onboarding preference was not migrated');
	assert(
		target.preferences.scopedSync === 'true',
		'account-scoped cloud preference was not migrated',
	);
	assert(target.preferences.provider === '{"provider":"anthropic"}', 'provider settings changed');
	assert(
		target.preferences.activeAiScope === 'anthropic:https://api.anthropic.com',
		'active AI credential scope was not migrated',
	);
	assert(target.preferences.unscopedSync === null, 'legacy unscoped cloud preference leaked');
	assert(target.preferences.removed === null, 'removed preference leaked');
	assert(target.preferences.secret === null, 'secret canary leaked through localStorage');
	assert(target.preferences.sessionSecret === null, 'session secret canary leaked');

	const second = await runStorageOriginMigration({
		app,
		BrowserWindow,
		ipcMain,
		rendererRoot: RENDERER_ROOT,
		appOrigin: APP_ORIGIN,
	});
	assert(second.status === 'already-complete', 'second launch was not idempotent');
	return { ok: true, interrupted, migrated: migrated.status, second: second.status, target };
}

app.whenReady().then(async () => {
	try {
		const result = await run();
		console.log(`MIGRATION_SMOKE_RESULT ${JSON.stringify(result)}`);
		app.exit(0);
	} catch (error) {
		console.error(error);
		console.log(
			`MIGRATION_SMOKE_RESULT ${JSON.stringify({ ok: false, error: error?.message || String(error) })}`,
		);
		app.exit(1);
	} finally {
		rmSync(userData, { recursive: true, force: true });
	}
});
