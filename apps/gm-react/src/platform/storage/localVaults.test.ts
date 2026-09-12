// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { dispatchCommand, searchContentForActor, type CoreStateSlice } from '@dndtools/core';
import {
	__testing,
	activeLocalVaultId,
	coreDatabaseName,
	createLocalVault,
	listLocalVaults,
	loadCoreState,
	markLocalVaultOpened,
	persistFullState,
	renameLocalVault,
	resetCoreStorage,
	selectLocalVaultForNextLoad,
	vaultPreferenceKey,
} from './coreStore';
import {
	addPrivateNote,
	closePrivateStores,
	listPrivateNotes,
	privateDatabaseName,
	resetPrivateStore,
} from './privateStore';
import { getAssetBytes, putAssetBytes } from './assetStore';
import { exportFullVault, importFullVault } from '../backup';
import { setVaultPrivacyMode, vaultPrivacyMode } from '../../cloud/vaultMode';
import { SceneRuntime } from '../../runtime/SceneRuntime';

beforeEach(() => {
	window.localStorage.clear();
	__testing.resetVaultSession();
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
	closePrivateStores();
	await __testing.closeDb();
	__testing.resetVaultSession();
});

async function nextDocument(id: string) {
	selectLocalVaultForNextLoad(id);
	closePrivateStores();
	await __testing.closeDb();
	__testing.resetVaultSession();
	expect(activeLocalVaultId()).toBe(id);
}

async function note(title: string): Promise<CoreStateSlice> {
	const loaded = await loadCoreState();
	const before = {
		...loaded,
		permissions: {
			...loaded.permissions,
			actors: { dm: { id: 'dm', role: 'dm' as const, displayName: 'GM' } },
		},
	};
	const result = dispatchCommand(
		before,
		{
			vaultId: activeLocalVaultId(),
			sourceId: 'test-device',
			ids: () => crypto.randomUUID(),
			clock: () => new Date().toISOString(),
		},
		{
			type: 'content.create-item',
			actorId: 'dm',
			payload: { kind: 'note', title, body: title, visibility: 'dm-only' },
		},
	);
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	await persistFullState(before, result.nextState);
	return result.nextState;
}

const search = (state: CoreStateSlice, query: string) =>
	searchContentForActor(state.content, state.permissions, 'dm', query);

describe('local vault storage boundaries', () => {
	it('registers a pre-switcher vault in place without changing documents, operations or private notes', async () => {
		await note('Legacy harbor');
		await addPrivateNote('same-character', { title: 'Private legacy', body: 'Unchanged' });
		setVaultPrivacyMode('cloud-enhanced');
		const oldDocuments = await __testing.getDb().documents.toArray();
		const oldOperations = await __testing.getDb().operations.toArray();
		expect(localStorage.getItem(__testing.LOCAL_VAULTS_KEY)).toBeNull();
		expect(listLocalVaults()).toMatchObject([{ id: 'primary', lastOpenedAt: null }]);
		markLocalVaultOpened();
		renameLocalVault('primary', 'Harbor campaign');
		await __testing.closeDb();
		expect(coreDatabaseName()).toBe('dndtools-v2');
		expect(privateDatabaseName('same-character')).toBe('dndtools-private-same-character');
		expect(await __testing.getDb().documents.toArray()).toEqual(oldDocuments);
		expect(await __testing.getDb().operations.toArray()).toEqual(oldOperations);
		expect((await listPrivateNotes('same-character'))[0].body).toBe('Unchanged');
		expect(vaultPrivacyMode()).toBe('cloud-enhanced');
		expect(listLocalVaults()[0]).toMatchObject({
			name: 'Harbor campaign',
			lastOpenedAt: expect.any(String),
		});
	});

	it('isolates operation counts, actor search, assets, private records and privacy in both directions', async () => {
		const first = await note('Harbor lantern');
		const asset = await putAssetBytes(new TextEncoder().encode('original media'), 'text/plain');
		await addPrivateNote('same-character', { title: 'Harbor secret', body: 'Only here' });
		setVaultPrivacyMode('cloud-enhanced');
		localStorage.setItem(vaultPreferenceKey('test-preference'), 'harbor');
		const secondVault = createLocalVault('Mountain campaign');
		selectLocalVaultForNextLoad(secondVault.id);
		// The departing tab stays pinned even when the choice for the next tab changes.
		expect(activeLocalVaultId()).toBe('primary');
		expect((await loadCoreState()).sync.operations).toHaveLength(first.sync.operations.length);
		await nextDocument(secondVault.id);
		expect((await loadCoreState()).sync.operations).toHaveLength(0);
		expect(await listPrivateNotes('same-character')).toEqual([]);
		expect(await getAssetBytes(asset)).toBeNull();
		expect(vaultPrivacyMode()).toBe('private-e2ee');
		expect(localStorage.getItem(vaultPreferenceKey('test-preference'))).toBeNull();
		const second = await note('Mountain summit');
		expect(search(second, 'Harbor')).toEqual([]);
		expect(search(second, 'Mountain')).toHaveLength(1);
		await addPrivateNote('same-character', { title: 'Mountain secret', body: 'Other vault' });
		localStorage.setItem(vaultPreferenceKey('test-preference'), 'mountain');
		await nextDocument('primary');
		const original = await loadCoreState();
		expect(original.sync.operations).toEqual(first.sync.operations);
		expect(search(original, 'Mountain')).toEqual([]);
		expect(search(original, 'Harbor')).toHaveLength(1);
		expect((await listPrivateNotes('same-character'))[0].title).toBe('Harbor secret');
		expect(await getAssetBytes(asset)).not.toBeNull();
		expect(vaultPrivacyMode()).toBe('cloud-enhanced');
		expect(localStorage.getItem(vaultPreferenceKey('test-preference'))).toBe('harbor');
		await nextDocument(secondVault.id);
		expect((await loadCoreState()).sync.operations).toEqual(second.sync.operations);
		expect((await listPrivateNotes('same-character'))[0].title).toBe('Mountain secret');
		expect(localStorage.getItem(vaultPreferenceKey('test-preference'))).toBe('mountain');
	});

	it('exports, restores, and resets only the document vault, leaving the other vault intact', async () => {
		const original = await note('Harbor original');
		const second = createLocalVault('Mountain');
		await nextDocument(second.id);
		await note('Mountain original');
		await addPrivateNote('same-character', { title: 'Private', body: 'Excluded' });
		const backup = await exportFullVault();
		expect(JSON.stringify(backup)).not.toContain('Harbor');
		expect(JSON.stringify(backup)).not.toContain('Excluded');
		await note('Mountain later');
		await importFullVault(backup);
		expect((await loadCoreState()).sync.operations).toEqual(backup.slice.sync.operations);
		await resetCoreStorage();
		await resetPrivateStore('same-character');
		expect((await loadCoreState()).sync.operations).toHaveLength(0);
		expect(await listPrivateNotes('same-character')).toEqual([]);
		await nextDocument('primary');
		expect((await loadCoreState()).sync.operations).toEqual(original.sync.operations);
	});

	it('loads a new campaign without the original onboarding demo and drains writes before selection', async () => {
		const second = createLocalVault('Fresh');
		await nextDocument(second.id);
		const runtime = new SceneRuntime({
			defaultActorId: 'dm',
			env: {
				vaultId: second.id,
				sourceId: 'device',
				ids: () => crypto.randomUUID(),
				clock: () => new Date().toISOString(),
			},
		});
		await runtime.load();
		expect(runtime.loaded).toBe(true);
		expect(runtime.state.sync.operations).toHaveLength(0);
		expect(Object.keys(runtime.state.maps.maps)).toHaveLength(0);
		const events: string[] = [];
		let release!: () => void;
		const pending = runtime.runExclusiveMaintenance(async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			events.push('saved');
		});
		await Promise.resolve();
		const switching = runtime.openLocalVault('primary', () => {
			events.push('reload');
		});
		expect(events).toEqual([]);
		release();
		await Promise.all([pending, switching]);
		expect(events).toEqual(['saved', 'reload']);
		expect(runtime.vaultId).toBe(second.id);
	});

	it('rejects damaged catalogs, invalid names and unknown selections without replacing data', () => {
		expect(() => createLocalVault('   ')).toThrow(/name/);
		expect(() => createLocalVault('x'.repeat(81))).toThrow(/name/);
		expect(() => selectLocalVaultForNextLoad('missing')).toThrow(/not found/);
		localStorage.setItem(__testing.LOCAL_VAULTS_KEY, '{broken');
		expect(() => listLocalVaults()).toThrow(/damaged/);
		expect(localStorage.getItem(__testing.LOCAL_VAULTS_KEY)).toBe('{broken');
		localStorage.removeItem(__testing.LOCAL_VAULTS_KEY);
		localStorage.setItem(__testing.SELECTED_LOCAL_VAULT_KEY, 'missing');
		__testing.resetVaultSession();
		expect(() => activeLocalVaultId()).toThrow(/not found/);
	});
});
