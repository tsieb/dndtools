import { describe, expect, it } from 'vitest';
import {
	EMPTY_COMMAND_CENTER_STATE,
	addPlayersInputSchema,
	campaignNameOf,
	dispatchCommand,
	isCampaignIdentityShape,
	setCampaignIdentityInputSchema,
	type Actor,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

// RC-UX-6.2 — the campaign has a name and a party.

const CO_DM: Actor = { id: 'actor-co-dm', role: 'co-dm', displayName: 'Test Co-DM' };

function initial(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, CO_DM);
}

function setIdentity(payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type: 'campaign.set-identity', actorId, payload };
}

function addPlayers(displayNames: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type: 'permission.add-players', actorId, payload: { displayNames } };
}

function accept(state: CoreStateSlice, command: CoreCommand, env = makeEnvironment()) {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	return result;
}

describe('campaign.set-identity', () => {
	it('names the campaign: a trimmed name, the system and GM name, one op and one event', () => {
		const start = initial();
		const result = accept(
			start,
			setIdentity({
				name: '  Stormhold  ',
				systemPackageId: 'builtin:dnd5e',
				gmDisplayName: ' Jade ',
			}),
		);
		expect(result.nextState.commandCenter.campaign).toEqual({
			name: 'Stormhold',
			systemPackageId: 'builtin:dnd5e',
			gmDisplayName: 'Jade',
		});
		expect(campaignNameOf(result.nextState.commandCenter)).toBe('Stormhold');
		expect(result.operationIds).toHaveLength(1);
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op).toMatchObject({
			entityType: 'command-center',
			entityId: 'campaign',
			opType: 'campaign.set-identity',
			path: 'campaign',
			value: {
				campaign: { name: 'Stormhold', systemPackageId: 'builtin:dnd5e', gmDisplayName: 'Jade' },
				previous: null,
			},
		});
		expect(result.events).toEqual([
			{ kind: 'campaign.identity-set', name: 'Stormhold', actorId: DM_ACTOR.id },
		]);
		// Nothing else in the slice moved.
		expect(result.nextState.commandCenter.presets).toBe(start.commandCenter.presets);
		expect(result.nextState.permissions).toBe(start.permissions);
	});

	it('a rename keeps the recorded system and GM name, and an unchanged identity writes nothing', () => {
		const named = accept(
			initial(),
			setIdentity({ name: 'Stormhold', systemPackageId: 'builtin:dnd5e' }),
		).nextState;
		const renamed = accept(named, setIdentity({ name: 'The Sunken Crown' }));
		expect(renamed.nextState.commandCenter.campaign).toEqual({
			name: 'The Sunken Crown',
			systemPackageId: 'builtin:dnd5e',
			gmDisplayName: null,
		});
		expect(renamed.nextState.sync.operations.at(-1)!.value).toMatchObject({
			previous: { name: 'Stormhold' },
		});

		const again = accept(renamed.nextState, setIdentity({ name: ' The Sunken Crown ' }));
		expect(again.nextState).toBe(renamed.nextState);
		expect(again.operationIds).toEqual([]);
		expect(again.events).toEqual([]);

		const cleared = accept(renamed.nextState, setIdentity({ systemPackageId: null }));
		expect(cleared.nextState.commandCenter.campaign?.systemPackageId).toBeNull();
	});

	it('never creates the block without a name, so no placeholder name is ever stored', () => {
		const result = dispatchCommand(
			initial(),
			makeEnvironment(),
			setIdentity({ systemPackageId: 'builtin:dnd5e' }),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('invalid-state');
		expect(result.nextState.commandCenter).not.toHaveProperty('campaign');
	});

	it('refuses blank, over-long and control-character names, unknown systems and empty payloads', () => {
		for (const payload of [
			{ name: '   ' },
			{ name: 'x'.repeat(81) },
			{ name: 'Storm\u0007hold' },
			{ name: 'Stormhold', systemPackageId: 'not-installed' },
			{ name: 'Stormhold', gmDisplayName: 'x'.repeat(61) },
			{ name: 'Stormhold', extra: true },
			{},
			null,
		]) {
			const result = dispatchCommand(initial(), makeEnvironment(), setIdentity(payload));
			expect(result.status, JSON.stringify(payload)).toBe('rejected');
		}
	});

	it('is the campaign owner’s: a co-DM, player or observer is refused', () => {
		for (const actor of [CO_DM, PLAYER_ACTOR, OBSERVER_ACTOR]) {
			const result = dispatchCommand(
				initial(),
				makeEnvironment(),
				setIdentity({ name: 'Stormhold' }, actor.id),
			);
			expect(result.status, actor.role).toBe('rejected');
			if (result.status !== 'rejected') continue;
			expect(result.rejection.code).toBe('actor-not-authorized');
		}
	});
});

describe('permission.add-players', () => {
	it('adds one player actor per name, with no email and nothing but a display name', () => {
		const result = accept(initial(), addPlayers(['  Ada ', 'Brannoc']));
		const added = Object.values(result.nextState.permissions.actors).filter(
			(actor) => !initial().permissions.actors[actor.id],
		);
		expect(added.map((actor) => actor.displayName).sort()).toEqual(['Ada', 'Brannoc']);
		for (const actor of added) {
			expect(actor.role).toBe('player');
			expect(Object.keys(actor).sort()).toEqual(['displayName', 'id', 'role']);
		}
		expect(result.operationIds).toHaveLength(2);
		const ops = result.nextState.sync.operations.slice(-2);
		expect(ops.map((op) => [op.entityType, op.opType])).toEqual([
			['permission-actor', 'permission.add-player'],
			['permission-actor', 'permission.add-player'],
		]);
		expect(JSON.stringify(ops)).not.toContain('@');
		expect(result.events.map((event) => event.kind)).toEqual([
			'permission.player-added',
			'permission.player-added',
		]);
	});

	it('the new seats are managed by the existing permission commands', () => {
		const added = accept(initial(), addPlayers(['Ada'])).nextState;
		const ada = Object.values(added.permissions.actors).find((a) => a.displayName === 'Ada')!;
		const renamed = accept(added, {
			type: 'permission.rename-actor',
			actorId: DM_ACTOR.id,
			payload: { targetActorId: ada.id, displayName: 'Ada the Bold' },
		}).nextState;
		const observer = accept(renamed, {
			type: 'permission.assign-role',
			actorId: DM_ACTOR.id,
			payload: { targetActorId: ada.id, role: 'observer' },
		}).nextState;
		expect(observer.permissions.actors[ada.id]).toEqual({
			id: ada.id,
			role: 'observer',
			displayName: 'Ada the Bold',
		});
	});

	it('refuses an email address, a name already on the roster and a name given twice', () => {
		for (const names of [
			['ada@example.com'],
			[PLAYER_ACTOR.displayName.toUpperCase()],
			['Ada', 'ada'],
			[],
			['   '],
			Array.from({ length: 21 }, (_, index) => `Player ${index}`),
		]) {
			const result = dispatchCommand(initial(), makeEnvironment(), addPlayers(names));
			expect(result.status, JSON.stringify(names)).toBe('rejected');
			if (result.status !== 'rejected') continue;
			expect(Object.keys(result.nextState.permissions.actors)).toHaveLength(4);
		}
	});

	it('is the campaign owner’s, as role assignment is', () => {
		for (const actor of [CO_DM, PLAYER_ACTOR, OBSERVER_ACTOR]) {
			const result = dispatchCommand(initial(), makeEnvironment(), addPlayers(['Ada'], actor.id));
			expect(result.status, actor.role).toBe('rejected');
		}
	});
});

describe('the campaign block round trip', () => {
	it('is absent until named, and stays absent (byte-identical) through other commands', () => {
		const state = initial();
		expect(state.commandCenter).not.toHaveProperty('campaign');
		expect(JSON.stringify(EMPTY_COMMAND_CENTER_STATE)).not.toContain('campaign');
		const before = JSON.stringify(state.commandCenter);
		const after = accept(state, addPlayers(['Ada'])).nextState;
		expect(JSON.stringify(after.commandCenter)).toBe(before);
		expect(campaignNameOf(after.commandCenter)).toBeNull();
	});

	it('a named block survives a JSON round trip unchanged and passes the shape check', () => {
		const named = accept(
			initial(),
			setIdentity({ name: 'Stormhold', systemPackageId: 'builtin:dnd5e', gmDisplayName: 'Jade' }),
		).nextState.commandCenter;
		const copy = JSON.parse(JSON.stringify(named));
		expect(copy).toEqual(named);
		expect(JSON.stringify(copy)).toBe(JSON.stringify(named));
		expect(isCampaignIdentityShape(copy.campaign)).toBe(true);
	});

	it('the shape check refuses a damaged block', () => {
		for (const value of [
			null,
			'Stormhold',
			{ name: 'Stormhold' },
			{ name: '', systemPackageId: null, gmDisplayName: null },
			{ name: ' padded ', systemPackageId: null, gmDisplayName: null },
			{ name: 'x'.repeat(81), systemPackageId: null, gmDisplayName: null },
			{ name: 'Stormhold', systemPackageId: 5, gmDisplayName: null },
			{ name: 'Stormhold', systemPackageId: null, gmDisplayName: null, extra: 1 },
		]) {
			expect(isCampaignIdentityShape(value), JSON.stringify(value)).toBe(false);
		}
		expect(
			isCampaignIdentityShape({ name: 'Stormhold', systemPackageId: null, gmDisplayName: null }),
		).toBe(true);
	});

	it('the input schemas trim and bound what they accept', () => {
		expect(setCampaignIdentityInputSchema.parse({ name: ' Stormhold ' })).toEqual({
			name: 'Stormhold',
		});
		expect(addPlayersInputSchema.parse({ displayNames: [' Ada '] })).toEqual({
			displayNames: ['Ada'],
		});
		expect(addPlayersInputSchema.safeParse({ displayNames: ['ada@example.com'] }).success).toBe(
			false,
		);
	});
});
