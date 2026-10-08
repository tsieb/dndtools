// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
	dispatchCommand,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import {
	__testing,
	LOCAL_VAULT_RENAMED_EVENT,
	createLocalVault,
	followCampaignIdentity,
	isPlaceholderVaultName,
	listLocalVaults,
	listQuarantinedDocuments,
	loadCoreState,
	persistFullState,
	renameLocalVault,
	selectLocalVaultForNextLoad,
	vaultPreferenceKey,
	type CampaignIdentityHost,
} from './coreStore';

// RC-UX-6.2 — the campaign block on disk, and the vault catalog following the campaign name.

const env = {
	vaultId: 'local-test',
	sourceId: 'test-device',
	ids: () => crypto.randomUUID(),
	clock: () => '2026-10-07T00:00:00.000Z',
};
const PARTY_NOTES = 'dndtools:react:invites';

beforeEach(() => {
	window.localStorage.clear();
	__testing.resetVaultSession();
	const factory = new IDBFactory();
	globalThis.indexedDB = factory;
	Dexie.dependencies.indexedDB = factory;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
	vi.restoreAllMocks();
	await __testing.closeDb();
	__testing.resetVaultSession();
});

async function loadedWithDm(): Promise<CoreStateSlice> {
	const loaded = await loadCoreState();
	return {
		...loaded,
		permissions: {
			...loaded.permissions,
			actors: { dm: { id: 'dm', role: 'dm', displayName: 'Default DM' } },
		},
	};
}

/** The runtime surface `followCampaignIdentity` uses, over the pure reducer. */
function host(vaultId: string, start: CoreStateSlice) {
	const listeners = new Set<() => void>();
	const commands: string[] = [];
	const fake: CampaignIdentityHost & { state: CoreStateSlice; commands: string[] } = {
		vaultId,
		defaultActorId: 'dm',
		state: start,
		commands,
		async dispatch(command: CoreCommand): Promise<CommandResult> {
			commands.push(command.type);
			const result = dispatchCommand(fake.state, env, command);
			if (result.status === 'accepted' && result.nextState !== fake.state) {
				fake.state = result.nextState;
				for (const listener of listeners) listener();
			}
			return result;
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	return fake;
}

/** Let the adoption's queued dispatches settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the campaign block on disk', () => {
	it('a command-center document without one round-trips byte-identically', async () => {
		const stored = { homeSceneId: null, presets: {}, schemaVersion: 1 };
		await __testing.putRawDocument(__testing.COMMAND_CENTER_STATE_KEY, stored);
		const before = await loadedWithDm();
		expect(JSON.stringify(before.commandCenter)).toBe(JSON.stringify(stored));

		// A commit that touches another slice leaves it as it was, and the reload reads it back unchanged.
		const result = dispatchCommand(before, env, {
			type: 'permission.add-players',
			actorId: 'dm',
			payload: { displayNames: ['Ada'] },
		});
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		await persistFullState(before, result.nextState);
		await __testing.closeDb();
		const reloaded = await loadCoreState();
		expect(JSON.stringify(reloaded.commandCenter)).toBe(JSON.stringify(stored));
		const raw = await __testing.getDb().documents.get(__testing.COMMAND_CENTER_STATE_KEY);
		expect(JSON.stringify(raw?.doc)).toBe(JSON.stringify(stored));
	});

	it('a named campaign persists and reloads, and a damaged block is refused', async () => {
		const before = await loadedWithDm();
		const result = dispatchCommand(before, env, {
			type: 'campaign.set-identity',
			actorId: 'dm',
			payload: { name: 'Stormhold', systemPackageId: 'builtin:dnd5e' },
		});
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		await persistFullState(before, result.nextState);
		await __testing.closeDb();
		expect((await loadCoreState()).commandCenter.campaign).toEqual({
			name: 'Stormhold',
			systemPackageId: 'builtin:dnd5e',
			gmDisplayName: null,
		});

		await __testing.putRawDocument(__testing.COMMAND_CENTER_STATE_KEY, {
			homeSceneId: null,
			presets: {},
			campaign: { name: '', systemPackageId: null, gmDisplayName: null },
			schemaVersion: 1,
		});
		await __testing.closeDb();
		// A malformed block is corruption: the document is quarantined (its payload kept for
		// recovery) and never loaded as a campaign name.
		const recovered = await loadCoreState();
		expect(recovered.commandCenter).not.toHaveProperty('campaign');
		expect((await listQuarantinedDocuments()).map((entry) => entry.documentKey)).toContain(
			__testing.COMMAND_CENTER_STATE_KEY,
		);
	});
});

describe('followCampaignIdentity', () => {
	it('a pre-story vault keeps "Your campaign" as a placeholder: nothing is stored', async () => {
		expect(listLocalVaults()[0]!.name).toBe('Your campaign');
		expect(isPlaceholderVaultName('Your campaign')).toBe(true);
		const fake = host('primary', await loadedWithDm());
		const stop = followCampaignIdentity(fake);
		await settle();
		expect(fake.commands).toEqual([]);
		expect(fake.state.commandCenter).not.toHaveProperty('campaign');
		expect(fake.state.sync.operations).toHaveLength(0);
		stop();
	});

	it('a name the GM gave the vault becomes the campaign name once, and the catalog follows renames', async () => {
		const vault = createLocalVault('Mountain campaign');
		selectLocalVaultForNextLoad(vault.id);
		__testing.resetVaultSession();
		const fake = host(vault.id, await loadedWithDm());
		const renamed = vi.fn();
		window.addEventListener(LOCAL_VAULT_RENAMED_EVENT, renamed);
		const stop = followCampaignIdentity(fake);
		await vi.waitFor(() =>
			expect(fake.state.commandCenter.campaign?.name).toBe('Mountain campaign'),
		);

		await fake.dispatch({
			type: 'campaign.set-identity',
			actorId: 'dm',
			payload: { name: 'The Sunken Crown' },
		});
		const entry = () => listLocalVaults().find((entry) => entry.id === vault.id)!;
		expect(entry().name).toBe('The Sunken Crown');
		expect(renamed).toHaveBeenCalled();

		// A second follower (StrictMode, a later open) finds nothing left to adopt.
		stop();
		const again = followCampaignIdentity(fake);
		await settle();
		expect(
			fake.state.sync.operations.filter((op) => op.opType === 'campaign.set-identity'),
		).toHaveLength(2);
		again();
		window.removeEventListener(LOCAL_VAULT_RENAMED_EVENT, renamed);
	});

	it('a rename made from another vault is taken up when this vault opens', async () => {
		const vault = createLocalVault('Harbor');
		const start = await loadedWithDm();
		const named = dispatchCommand(start, env, {
			type: 'campaign.set-identity',
			actorId: 'dm',
			payload: { name: 'Harbor' },
		});
		if (named.status !== 'accepted') throw new Error(named.rejection.message);
		renameLocalVault(vault.id, 'Harbor of Lights');
		const fake = host(vault.id, named.nextState);
		const stop = followCampaignIdentity(fake);
		await vi.waitFor(() =>
			expect(fake.state.commandCenter.campaign?.name).toBe('Harbor of Lights'),
		);
		stop();
	});

	it('moves the released party roster into player actors once, keeping emails off the actors', async () => {
		const key = vaultPreferenceKey(PARTY_NOTES, 'primary');
		window.localStorage.setItem(
			key,
			JSON.stringify(['Ada', 'ada@example.com', ' Brannoc ', '', 'Default DM', 7]),
		);
		const fake = host('primary', await loadedWithDm());
		const stop = followCampaignIdentity(fake);
		await vi.waitFor(() => expect(fake.commands).toContain('permission.add-players'));
		await settle();
		const players = Object.values(fake.state.permissions.actors).filter(
			(actor) => actor.role === 'player',
		);
		expect(players.map((actor) => actor.displayName).sort()).toEqual(['Ada', 'Brannoc']);
		expect(JSON.stringify(fake.state.permissions)).not.toContain('@');
		// The email stays for the calendar invite it was collected for; the names are gone.
		expect(window.localStorage.getItem(key)).toBe('["ada@example.com"]');
		stop();

		// Once is once: a later open adds no one twice.
		const again = followCampaignIdentity(fake);
		await settle();
		expect(fake.commands.filter((type) => type === 'permission.add-players')).toHaveLength(1);
		again();
	});

	it('removes the roster preference when only names were in it', async () => {
		const key = vaultPreferenceKey(PARTY_NOTES, 'primary');
		window.localStorage.setItem(key, JSON.stringify(['Ada', 'Brannoc']));
		const fake = host('primary', await loadedWithDm());
		const stop = followCampaignIdentity(fake);
		await vi.waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
		expect(
			Object.values(fake.state.permissions.actors).filter((actor) => actor.role === 'player'),
		).toHaveLength(2);
		stop();
	});
});
