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
	forgetLocalVaultPreferences,
	isDemoLocalVault,
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
import { DEMO_VAULT_BACKUP_REFUSAL, exportFullVault, importFullVault } from '../backup';
import { setVaultPrivacyMode, vaultPrivacyMode } from '../../cloud/vaultMode';
import { SceneRuntime } from '../../runtime/SceneRuntime';
import { PREFERENCE_KEYS, readPreference, removePreference, writePreference } from '../preferences';

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

	it('isolates real campaign preference consumers both ways and keeps device preferences shared', async () => {
		// Pre-switcher values stay under their released keys for the original vault.
		localStorage.setItem(PREFERENCE_KEYS.paletteRecents, '["harbor"]');
		writePreference(PREFERENCE_KEYS.seenSpotlights, '["graph"]');
		writePreference(PREFERENCE_KEYS.partyNotes, '["ada@example.com"]');
		writePreference(PREFERENCE_KEYS.vaultChoice, 'fresh');
		writePreference(PREFERENCE_KEYS.theme, 'ember');
		writePreference(PREFERENCE_KEYS.onboarded, 'done');
		expect(localStorage.getItem(PREFERENCE_KEYS.seenSpotlights)).toBe('["graph"]');
		const second = createLocalVault('Mountain');
		await nextDocument(second.id);

		for (const key of [
			PREFERENCE_KEYS.paletteRecents,
			PREFERENCE_KEYS.seenSpotlights,
			PREFERENCE_KEYS.partyNotes,
			PREFERENCE_KEYS.vaultChoice,
		]) {
			expect(readPreference(key)).toBeNull();
		}
		expect(readPreference(PREFERENCE_KEYS.theme)).toBe('ember');
		expect(readPreference(PREFERENCE_KEYS.onboarded)).toBe('done');
		writePreference(PREFERENCE_KEYS.paletteRecents, '["mountain"]');
		writePreference(PREFERENCE_KEYS.seenSpotlights, '["dice"]');
		removePreference(PREFERENCE_KEYS.partyNotes);
		writePreference(PREFERENCE_KEYS.theme, 'slate');

		await nextDocument('primary');
		expect(readPreference(PREFERENCE_KEYS.paletteRecents)).toBe('["harbor"]');
		expect(readPreference(PREFERENCE_KEYS.seenSpotlights)).toBe('["graph"]');
		expect(readPreference(PREFERENCE_KEYS.partyNotes)).toBe('["ada@example.com"]');
		expect(readPreference(PREFERENCE_KEYS.vaultChoice)).toBe('fresh');
		expect(readPreference(PREFERENCE_KEYS.theme)).toBe('slate');

		await nextDocument(second.id);
		expect(readPreference(PREFERENCE_KEYS.paletteRecents)).toBe('["mountain"]');
		expect(readPreference(PREFERENCE_KEYS.seenSpotlights)).toBe('["dice"]');
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
		await expect(
			runtime.dispatch({
				type: 'scene.create',
				actorId: 'dm',
				payload: { name: 'Too late', visibility: 'dm-only' },
			}),
		).rejects.toThrow(/selected vault to open/);
		expect((await loadCoreState()).sync.operations).toHaveLength(0);
	});

	it('rolls back failed navigation and permits edits and a later switch', async () => {
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
		await expect(
			runtime.openLocalVault('primary', async () => {
				throw new Error('Navigation failed');
			}),
		).rejects.toThrow('Navigation failed');
		expect(localStorage.getItem(__testing.SELECTED_LOCAL_VAULT_KEY)).toBe(second.id);
		expect(runtime.vaultId).toBe(second.id);
		const result = await runtime.dispatch({
			type: 'scene.create',
			actorId: 'dm',
			payload: { name: 'Still here', visibility: 'dm-only' },
		});
		expect(result.status).toBe('accepted');
		expect((await loadCoreState()).sync.operations).toHaveLength(1);
		await runtime.openLocalVault('primary', () => {});
		expect(localStorage.getItem(__testing.SELECTED_LOCAL_VAULT_KEY)).toBe('primary');
	});

	it('does not overwrite another tab selection when rolling back a failed switch', () => {
		const second = createLocalVault('Second');
		const third = createLocalVault('Third');
		const rollback = selectLocalVaultForNextLoad(second.id);
		selectLocalVaultForNextLoad(third.id);
		rollback();
		expect(localStorage.getItem(__testing.SELECTED_LOCAL_VAULT_KEY)).toBe(third.id);
		expect(activeLocalVaultId()).toBe('primary');
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

describe('the demo vault is never backed up (RC-UX-3.7)', () => {
	it('refuses a full backup and a restore in the demo vault and leaves it unchanged', async () => {
		await note('Original campaign note');
		const backup = await exportFullVault();
		const demo = createLocalVault('Demo campaign', 'demo');
		await nextDocument(demo.id);
		expect(isDemoLocalVault()).toBe(true);
		await note('Demo note');
		const before = (await loadCoreState()).sync.operations.length;

		await expect(exportFullVault()).rejects.toThrow(DEMO_VAULT_BACKUP_REFUSAL);
		await expect(importFullVault(backup)).rejects.toThrow(DEMO_VAULT_BACKUP_REFUSAL);
		expect((await loadCoreState()).sync.operations.length).toBe(before);

		// Back in the GM's own vault both still work.
		await nextDocument('primary');
		expect(isDemoLocalVault()).toBe(false);
		await expect(exportFullVault()).resolves.toMatchObject({ format: 'dndtools-vault-backup' });
	});

	it('treats an extra vault missing from the catalog as the demo (fail closed)', () => {
		expect(isDemoLocalVault('primary')).toBe(false);
		expect(isDemoLocalVault(createLocalVault('Mountain').id)).toBe(false);
		expect(isDemoLocalVault(createLocalVault('Demo campaign', 'demo').id)).toBe(true);
		expect(isDemoLocalVault('local-unknown')).toBe(true);
	});

	it('forgets only the demo vault’s own preferences', () => {
		const demo = createLocalVault('Demo campaign', 'demo');
		const other = createLocalVault('Mountain');
		window.localStorage.setItem(vaultPreferenceKey('dndtools:react:recents', demo.id), '["a"]');
		window.localStorage.setItem(vaultPreferenceKey('dndtools:react:recents', other.id), '["b"]');
		window.localStorage.setItem('dndtools:react:recents', '["c"]');

		forgetLocalVaultPreferences(demo.id);

		expect(window.localStorage.getItem(vaultPreferenceKey('dndtools:react:recents', demo.id))).toBe(
			null,
		);
		expect(
			window.localStorage.getItem(vaultPreferenceKey('dndtools:react:recents', other.id)),
		).toBe('["b"]');
		expect(window.localStorage.getItem('dndtools:react:recents')).toBe('["c"]');
		expect(() => forgetLocalVaultPreferences('primary')).toThrow();
	});
});
