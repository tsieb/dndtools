// @ts-check
'use strict';

// Dedicated to the two hidden migration windows. It exposes nothing through contextBridge and the
// main process removes both IPC handlers before the normal renderer exists.
const { ipcRenderer } = require('electron');

const DB_NAME = 'dndtools-v2';
const SOURCE_CHANNEL = 'storage-origin-migration:source';
const TARGET_CHANNEL = 'storage-origin-migration:target';
const DEFAULT_CHUNK_RECORDS = 128;
const ASSET_CHUNK_RECORDS = 1;
const MIGRATION_OWNER_KEY = 'dndtools:internal:storage-origin-migration';
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

const argument = (name) => {
	const prefix = `--${name}=`;
	const value = process.argv.find((entry) => entry.startsWith(prefix));
	return value ? value.slice(prefix.length) : '';
};
const mode = argument('dndtools-migration-mode');
const nonce = argument('dndtools-migration-nonce');
const interruptAfter = Number(argument('dndtools-migration-interrupt-after') || '0');

function requestResult(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
	});
}

function transactionDone(transaction) {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onabort = () =>
			reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
		transaction.onerror = () =>
			reject(transaction.error || new Error('IndexedDB transaction failed.'));
	});
}

function openDatabase(version, onUpgrade) {
	return new Promise((resolve, reject) => {
		const request =
			version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
		request.onupgradeneeded = (event) => {
			try {
				onUpgrade?.(request.result, event.oldVersion);
			} catch (error) {
				request.transaction?.abort();
				reject(error);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('Could not open IndexedDB.'));
		request.onblocked = () => reject(new Error('IndexedDB is blocked by another window.'));
	});
}

async function databaseExists() {
	if (typeof indexedDB.databases !== 'function') {
		throw new Error('This Chromium build cannot safely inspect existing databases.');
	}
	const databases = await indexedDB.databases();
	return databases.some((entry) => entry.name === DB_NAME);
}

function keyPathValue(value) {
	return Array.isArray(value) ? [...value] : value;
}

function databaseSchema(database) {
	const storeNames = Array.from(database.objectStoreNames).sort();
	if (storeNames.length === 0) return { name: DB_NAME, version: database.version, stores: [] };
	const transaction = database.transaction(storeNames, 'readonly');
	const stores = storeNames.map((name) => {
		const store = transaction.objectStore(name);
		const indexes = Array.from(store.indexNames)
			.sort()
			.map((indexName) => {
				const index = store.index(indexName);
				return {
					name: index.name,
					keyPath: keyPathValue(index.keyPath),
					unique: index.unique,
					multiEntry: index.multiEntry,
				};
			});
		return {
			name,
			keyPath: keyPathValue(store.keyPath),
			autoIncrement: store.autoIncrement,
			indexes,
		};
	});
	return { name: DB_NAME, version: database.version, stores };
}

async function sha256Bytes(bytes) {
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value) {
	return sha256Bytes(new TextEncoder().encode(value));
}

async function canonicalValue(value, seen = new WeakSet()) {
	if (value === null) return ['null'];
	if (value === undefined) return ['undefined'];
	if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
	if (typeof value === 'number') {
		if (Number.isNaN(value)) return ['number', 'NaN'];
		if (value === Infinity) return ['number', 'Infinity'];
		if (value === -Infinity) return ['number', '-Infinity'];
		if (Object.is(value, -0)) return ['number', '-0'];
		return ['number', String(value)];
	}
	if (typeof value === 'bigint') return ['bigint', value.toString()];
	if (value instanceof Date) return ['date', value.toISOString()];
	if (value instanceof ArrayBuffer) {
		return ['array-buffer', value.byteLength, await sha256Bytes(value)];
	}
	if (ArrayBuffer.isView(value)) {
		const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
		return [
			'array-buffer-view',
			value.constructor.name,
			value.byteLength,
			await sha256Bytes(bytes),
		];
	}
	if (value instanceof Blob) {
		const bytes = await value.arrayBuffer();
		return ['blob', value.type, value.size, await sha256Bytes(bytes)];
	}
	if (typeof value !== 'object') throw new Error('Unsupported value in legacy storage.');
	if (seen.has(value)) throw new Error('Cyclic values cannot be verified safely.');
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			const entries = [];
			for (const entry of value) entries.push(await canonicalValue(entry, seen));
			return ['array', entries];
		}
		if (value instanceof Map) {
			const entries = [];
			for (const [key, entry] of value) {
				entries.push([await canonicalValue(key, seen), await canonicalValue(entry, seen)]);
			}
			entries.sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
			return ['map', entries];
		}
		if (value instanceof Set) {
			const entries = [];
			for (const entry of value) entries.push(await canonicalValue(entry, seen));
			entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
			return ['set', entries];
		}
		const entries = [];
		for (const key of Object.keys(value).sort()) {
			entries.push([key, await canonicalValue(value[key], seen)]);
		}
		return ['object', entries];
	} finally {
		seen.delete(value);
	}
}

async function readStoreBatch(database, name, afterKey, count) {
	const transaction = database.transaction(name, 'readonly');
	const done = transactionDone(transaction);
	const store = transaction.objectStore(name);
	const range = afterKey === undefined ? undefined : IDBKeyRange.lowerBound(afterKey, true);
	const [keys, values] = await Promise.all([
		requestResult(store.getAllKeys(range, count)),
		requestResult(store.getAll(range, count)),
	]);
	await done;
	if (keys.length !== values.length) throw new Error(`Could not pair keys in ${name}.`);
	return values.map((value, index) => ({ key: keys[index], value }));
}

async function snapshotDatabase(database, onStore) {
	const schema = databaseSchema(database);
	const summaries = [];
	let totalRecords = 0;
	for (const store of schema.stores) {
		const summaryEntries = [];
		const chunkSize = store.name === 'assetBlobs' ? ASSET_CHUNK_RECORDS : DEFAULT_CHUNK_RECORDS;
		let afterKey;
		let count = 0;
		let chunkIndex = 0;
		for (;;) {
			const records = await readStoreBatch(database, store.name, afterKey, chunkSize);
			if (records.length === 0) break;
			for (const record of records) {
				summaryEntries.push([
					await canonicalValue(record.key),
					await sha256Text(JSON.stringify(await canonicalValue(record.value))),
				]);
			}
			count += records.length;
			totalRecords += records.length;
			await onStore?.(store.name, records, chunkIndex);
			chunkIndex += 1;
			afterKey = records[records.length - 1].key;
			if (records.length < chunkSize) break;
		}
		summaries.push({
			name: store.name,
			count,
			digest: await sha256Text(JSON.stringify(summaryEntries)),
		});
	}
	const databaseDigest = await sha256Text(JSON.stringify({ schema, stores: summaries }));
	return { schema, summaries, totalRecords, databaseDigest };
}

function allowedLocalStorageKey(key) {
	return (
		ALLOWED_LOCAL_STORAGE_KEYS.has(key) ||
		ALLOWED_LOCAL_STORAGE_PREFIXES.some(
			(prefix) => key.startsWith(prefix) && key.length > prefix.length,
		)
	);
}

function readLocalStorageEntries() {
	const entries = [];
	let totalChars = 0;
	for (let index = 0; index < localStorage.length; index += 1) {
		const key = localStorage.key(index);
		if (!key || !allowedLocalStorageKey(key)) continue;
		const value = localStorage.getItem(key);
		if (value === null) continue;
		if (key.length > 512 || value.length > 2 * 1024 * 1024) {
			throw new Error('Legacy preference storage exceeds the safe migration limit.');
		}
		totalChars += key.length + value.length;
		if (entries.length >= 256 || totalChars > 8 * 1024 * 1024) {
			throw new Error('Legacy preference storage exceeds the safe migration limit.');
		}
		entries.push([key, value]);
	}
	return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

function applyLocalStorageEntries(entries) {
	const imported = [];
	const preserved = [];
	for (const [key, value] of entries) {
		if (!allowedLocalStorageKey(key)) throw new Error('Unexpected preference key in migration.');
		const existing = localStorage.getItem(key);
		if (existing === null) {
			localStorage.setItem(key, value);
			if (localStorage.getItem(key) !== value)
				throw new Error(`Could not verify preference ${key}.`);
			imported.push(key);
		} else {
			preserved.push(key);
		}
	}
	return { imported, preserved };
}

function schemasMatch(expected, actual) {
	return JSON.stringify(expected) === JSON.stringify(actual);
}

async function createTargetDatabase(schema) {
	return openDatabase(schema.version, (database, oldVersion) => {
		if (oldVersion !== 0) throw new Error('Target database changed while migration was preparing.');
		for (const storeSchema of schema.stores) {
			const store = database.createObjectStore(storeSchema.name, {
				keyPath: storeSchema.keyPath,
				autoIncrement: storeSchema.autoIncrement,
			});
			for (const index of storeSchema.indexes) {
				store.createIndex(index.name, index.keyPath, {
					unique: index.unique,
					multiEntry: index.multiEntry,
				});
			}
		}
	});
}

async function importChunk(database, storeSchema, records) {
	const transaction = database.transaction(storeSchema.name, 'readwrite');
	const done = transactionDone(transaction);
	try {
		const store = transaction.objectStore(storeSchema.name);
		for (const record of records) {
			if (storeSchema.keyPath === null) store.put(record.value, record.key);
			else store.put(record.value);
		}
		await done;
	} catch (error) {
		try {
			transaction.abort();
		} catch {
			// It may already have aborted.
		}
		await done.catch(() => undefined);
		throw error;
	}
}

function deleteDatabase() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(DB_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () =>
			reject(request.error || new Error('Could not clear partial migration.'));
		request.onblocked = () => reject(new Error('Partial migration database is still open.'));
	});
}

function hasTargetOwnership(databaseDigest) {
	try {
		const value = JSON.parse(localStorage.getItem(MIGRATION_OWNER_KEY) || 'null');
		return (
			value?.version === 1 &&
			typeof value.databaseDigest === 'string' &&
			value.databaseDigest === databaseDigest
		);
	} catch {
		return false;
	}
}

async function inspectTarget() {
	if (!(await databaseExists())) return { exists: false, snapshot: null };
	const database = await openDatabase();
	try {
		return { exists: true, snapshot: await snapshotDatabase(database) };
	} finally {
		database.close();
	}
}

async function exportSource() {
	const localStorageEntries = readLocalStorageEntries();
	if (!(await databaseExists())) {
		await ipcRenderer.invoke(SOURCE_CHANNEL, {
			nonce,
			type: 'begin',
			schema: null,
			localStorageEntries,
		});
		await ipcRenderer.invoke(SOURCE_CHANNEL, {
			nonce,
			type: 'finish',
			totalRecords: 0,
			databaseDigest: null,
		});
		return;
	}
	const database = await openDatabase();
	try {
		const schema = databaseSchema(database);
		await ipcRenderer.invoke(SOURCE_CHANNEL, {
			nonce,
			type: 'begin',
			schema,
			localStorageEntries,
		});
		const snapshot = await snapshotDatabase(database, async (storeName, records, chunkIndex) => {
			await ipcRenderer.invoke(SOURCE_CHANNEL, {
				nonce,
				type: 'chunk',
				storeName,
				chunkIndex,
				records,
			});
		});
		await ipcRenderer.invoke(SOURCE_CHANNEL, {
			nonce,
			type: 'finish',
			totalRecords: snapshot.totalRecords,
			databaseDigest: snapshot.databaseDigest,
		});
	} finally {
		database.close();
	}
}

async function importTarget() {
	const plan = await ipcRenderer.invoke(TARGET_CHANNEL, { nonce, type: 'plan' });
	if (!plan || typeof plan !== 'object') throw new Error('Migration plan was unavailable.');
	let before = await inspectTarget();
	if (
		before.snapshot &&
		before.snapshot.totalRecords > 0 &&
		before.snapshot.databaseDigest !== plan.databaseDigest &&
		plan.ownedPartialDigest === plan.databaseDigest &&
		hasTargetOwnership(plan.databaseDigest)
	) {
		await deleteDatabase();
		localStorage.removeItem(MIGRATION_OWNER_KEY);
		before = { exists: false, snapshot: null };
	}
	if (before.snapshot && before.snapshot.totalRecords > 0) {
		const status =
			plan.databaseDigest && before.snapshot.databaseDigest === plan.databaseDigest
				? 'matched'
				: 'conflict';
		const localStorage =
			status === 'matched'
				? applyLocalStorageEntries(plan.localStorageEntries)
				: { imported: [], preserved: [] };
		if (status === 'matched') globalThis.localStorage.removeItem(MIGRATION_OWNER_KEY);
		await ipcRenderer.invoke(TARGET_CHANNEL, {
			nonce,
			type: 'complete',
			status,
			databaseDigest: before.snapshot.databaseDigest,
			totalRecords: before.snapshot.totalRecords,
			localStorage,
		});
		return;
	}

	if (!plan.schema || plan.totalRecords === 0) {
		const localStorage = applyLocalStorageEntries(plan.localStorageEntries);
		globalThis.localStorage.removeItem(MIGRATION_OWNER_KEY);
		await ipcRenderer.invoke(TARGET_CHANNEL, {
			nonce,
			type: 'complete',
			status: 'no-data',
			databaseDigest: null,
			totalRecords: 0,
			localStorage,
		});
		return;
	}

	let database;
	if (before.exists) {
		database = await openDatabase();
		if (!schemasMatch(plan.schema, databaseSchema(database))) {
			database.close();
			throw new Error('The empty target database has an unexpected schema.');
		}
	} else {
		database = await createTargetDatabase(plan.schema);
	}
	try {
		const claimed = await ipcRenderer.invoke(TARGET_CHANNEL, {
			nonce,
			type: 'claim',
			databaseDigest: plan.databaseDigest,
		});
		if (claimed !== true) throw new Error('Could not claim the empty migration target.');
		localStorage.setItem(
			MIGRATION_OWNER_KEY,
			JSON.stringify({ version: 1, databaseDigest: plan.databaseDigest }),
		);
		let queued = 0;
		for (const storeSchema of plan.schema.stores) {
			const storePlan = plan.stores.find((store) => store.name === storeSchema.name);
			if (!storePlan) throw new Error(`Migration plan missing store ${storeSchema.name}.`);
			for (let chunkIndex = 0; chunkIndex < storePlan.chunkCount; chunkIndex += 1) {
				const chunk = await ipcRenderer.invoke(TARGET_CHANNEL, {
					nonce,
					type: 'chunk',
					storeName: storeSchema.name,
					chunkIndex,
				});
				if (!Array.isArray(chunk))
					throw new Error(`Migration chunk missing for ${storeSchema.name}.`);
				queued += chunk.length;
				if (interruptAfter > 0 && queued >= interruptAfter) {
					throw new Error('Simulated interrupted migration.');
				}
				await importChunk(database, storeSchema, chunk);
			}
		}
	} finally {
		database.close();
	}

	const after = await inspectTarget();
	if (
		!after.snapshot ||
		after.snapshot.totalRecords !== plan.totalRecords ||
		after.snapshot.databaseDigest !== plan.databaseDigest
	) {
		throw new Error('Imported data did not match the legacy vault digest.');
	}
	const localStorageResult = applyLocalStorageEntries(plan.localStorageEntries);
	globalThis.localStorage.removeItem(MIGRATION_OWNER_KEY);
	await ipcRenderer.invoke(TARGET_CHANNEL, {
		nonce,
		type: 'complete',
		status: 'imported',
		databaseDigest: after.snapshot.databaseDigest,
		totalRecords: after.snapshot.totalRecords,
		localStorage: localStorageResult,
	});
}

async function reportError(channel, error) {
	const message = error instanceof Error ? error.message : 'Unknown storage migration error.';
	await ipcRenderer.invoke(channel, { nonce, type: 'error', message: message.slice(0, 500) });
}

if (/^[a-f0-9]{64}$/.test(nonce) && (mode === 'source' || mode === 'target')) {
	const channel = mode === 'source' ? SOURCE_CHANNEL : TARGET_CHANNEL;
	void (mode === 'source' ? exportSource() : importTarget()).catch((error) =>
		reportError(channel, error).catch(() => undefined),
	);
}
