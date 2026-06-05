import { describe, expect, it, vi } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	LOCAL_FIRST_WORKFLOWS,
	assertNoNetworkDependency,
	deriveLocalFirstStatus,
	dispatchCommand,
	evaluateWorkflowAvailability,
	findNetworkDependencies,
	getContentItemsForActor,
	getCharacterForActor,
	getCombatTrackerForActor,
	hasNoNetworkDependency,
	isLocalFirstWorkflow,
	searchContentForActor,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';

/**
 * SYNC-001 — local-first, zero-network core workflows.
 *
 * The keystone test PROVES that a core open → read → search → edit → run-session workflow completes
 * with NO network: it stubs the global `fetch`/`XMLHttpRequest` to throw, runs the workflow purely
 * through the Processing Core, and asserts every step succeeds without any network call. It also
 * proves the offline-availability + collaboration-status model and the no-network-dependency guard.
 */

const env = makeEnvironment();

function accept(state: CoreStateSlice, command: CoreCommand): CoreStateSlice {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') {
		throw new Error(`Expected ${command.type} accepted: ${result.rejection.code}`);
	}
	return result.nextState;
}

describe('SYNC-001 zero-network core workflow', () => {
	it('runs open → read → search → edit → session with NO network call', () => {
		// Hard-fail any network access during the workflow: if the offline path reaches for the network,
		// these throw and the test fails. The Processing Core performs no I/O, so they are never called.
		const fetchSpy = vi
			.fn()
			.mockImplementation(() => {
				throw new Error('network access is forbidden in the local-first path');
			});
		const xhrSpy = vi.fn().mockImplementation(() => {
			throw new Error('XHR is forbidden in the local-first path');
		});
		// Override the network globals for the duration of the offline workflow. Typed through a
		// record view so the test compiles in the jsdom/node environment without ambient DOM types.
		const networkGlobals = globalThis as unknown as Record<string, unknown>;
		const originalFetch = networkGlobals.fetch;
		const originalXhr = networkGlobals.XMLHttpRequest;
		networkGlobals.fetch = fetchSpy;
		networkGlobals.XMLHttpRequest = xhrSpy;

		try {
			// OPEN — start from a local vault (the in-memory slice stands in for the rehydrated device state).
			let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);

			// EDIT — create a note (durable local write through the command path).
			state = accept(state, {
				type: 'content.create-item',
				actorId: DM_ACTOR.id,
				payload: { kind: 'note', title: 'Goblin Lair', body: 'A dank cave by the river.' },
			});

			// EDIT — quick-create a character + edit its HP (combat workflow).
			const charResult = dispatchCommand(state, env, {
				type: 'character.quick-create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Goblin Boss', kind: 'npc', visibility: 'player-visible' },
			});
			if (charResult.status !== 'accepted') throw new Error('quick-create rejected');
			state = charResult.nextState;
			const characterId = (
				charResult.events.find((e) => e.kind === 'character.created') as { characterId: string }
			).characterId;
			state = accept(state, {
				type: 'character.edit-field',
				actorId: DM_ACTOR.id,
				payload: { characterId, path: 'combat.hp', value: 18 },
			});

			// READ — read the character + content + combat tracker through the actor-filtered queries.
			const character = getCharacterForActor(
				state.characters,
				state.permissions,
				DM_ACTOR.id,
				characterId,
			);
			expect(character).not.toBeNull();
			const items = getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id);
			expect(items.length).toBeGreaterThan(0);
			const combat = getCombatTrackerForActor(state.session.combat, state.permissions, DM_ACTOR.id);
			expect(combat).not.toBeNull();

			// SEARCH — search the local content index.
			const hits = searchContentForActor(state.content, state.permissions, DM_ACTOR.id, 'Goblin');
			expect(hits.length).toBeGreaterThan(0);

			// SESSION — create a scene, then move the session into prep then active (a core session workflow).
			const sceneResult = dispatchCommand(state, env, {
				type: 'scene.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Lair Encounter', visibility: 'dm-only' },
			});
			if (sceneResult.status !== 'accepted') throw new Error('scene.create rejected');
			state = sceneResult.nextState;
			const sceneId = (
				sceneResult.events.find((e) => e.kind === 'scene.created') as { sceneId: string }
			).sceneId;
			state = accept(state, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'prep' },
			});
			state = accept(state, {
				type: 'session.set-workflow',
				actorId: DM_ACTOR.id,
				payload: { workflow: 'active', activeSceneId: sceneId },
			});
			expect(state.session.workflow).toBe('active');

			// PROOF — nothing in the path reached for the network.
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(xhrSpy).not.toHaveBeenCalled();
		} finally {
			networkGlobals.fetch = originalFetch;
			networkGlobals.XMLHttpRequest = originalXhr;
		}
	});

	it('the dispatched state and query results carry no network dependency', () => {
		let state = buildInitialState(DM_ACTOR);
		state = accept(state, {
			type: 'content.create-item',
			actorId: DM_ACTOR.id,
			payload: { kind: 'note', title: 'Local Note', body: 'No network needed.' },
		});
		// The whole durable state slice (the offline source of truth) carries no network handle.
		expect(hasNoNetworkDependency(state.content)).toBe(true);
		expect(hasNoNetworkDependency(state.sync.operations)).toBe(true);
		expect(() =>
			assertNoNetworkDependency(getContentItemsForActor(state.content, state.permissions, DM_ACTOR.id)),
		).not.toThrow();
	});

	it('the no-network guard catches a smuggled fetch handle / URL fail-closed', () => {
		const withFetch = { handler: { fetch: () => undefined } };
		const findings = findNetworkDependencies(withFetch);
		expect(findings.length).toBeGreaterThan(0);
		expect(hasNoNetworkDependency(withFetch)).toBe(false);
		expect(() => assertNoNetworkDependency({ remote: 'https://example.com/sync' })).toThrow(
			/network dependency/,
		);
	});
});

describe('SYNC-001 offline availability + collaboration status', () => {
	it('declares the core offline-required workflows', () => {
		expect(LOCAL_FIRST_WORKFLOWS).toContain('read');
		expect(LOCAL_FIRST_WORKFLOWS).toContain('edit');
		expect(LOCAL_FIRST_WORKFLOWS).toContain('search');
		expect(LOCAL_FIRST_WORKFLOWS).toContain('session');
		expect(isLocalFirstWorkflow('combat')).toBe(true);
		expect(isLocalFirstWorkflow('cloud-sync')).toBe(false);
	});

	it('AC1: a core workflow over local content is available offline', () => {
		const availability = evaluateWorkflowAvailability({ workflow: 'edit', contentOnDevice: true });
		expect(availability.state).toBe('available');
	});

	it('AC2: content never synced to the device reports unavailable, not a whole-vault block', () => {
		const availability = evaluateWorkflowAvailability({ workflow: 'read', contentOnDevice: false });
		expect(availability.state).toBe('unavailable');
		// Another workflow over on-device content stays available — the vault is not blocked.
		const other = evaluateWorkflowAvailability({ workflow: 'search', contentOnDevice: true });
		expect(other.state).toBe('available');
	});

	it('AC3: offline marks collaboration unavailable and reports queued local operations', () => {
		const offline = deriveLocalFirstStatus({ online: false, queuedLocalOperationCount: 3 });
		expect(offline.localWorkflowsAvailable).toBe(true);
		expect(offline.collaboration).toBe('unavailable');
		expect(offline.queuedLocalOperationCount).toBe(3);
		expect(offline.summary).toMatch(/queued locally/i);

		const online = deriveLocalFirstStatus({ online: true });
		expect(online.collaboration).toBe('available');
	});
});
