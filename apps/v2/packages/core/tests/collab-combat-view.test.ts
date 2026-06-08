import { describe, expect, it } from 'vitest';
import {
	assertCombatStreamCarriesNoHiddenCombatant,
	dispatchCommand,
	filterCombatStreamForRecipient,
	getSharedCombatView,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SyncOperation,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';
import type { Actor } from '../src/state/permission-state';

/**
 * COLLAB-006 — participants VIEW shared combat state ACCORDING TO ROLE AND GRANTS: current turn, VISIBLE
 * combatants only, HP/status summaries they may see, and PERMITTED INTERACTION CONTROLS (fail closed). A
 * participant never RECEIVES a hidden combatant's ops (filter-before-send). A STALE/cached view disables
 * every live-authority control.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

function activeSession(env: CoreEnvironment): { state: CoreStateSlice; sceneId: string } {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const sceneId = home.commandCenter.homeSceneId!;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		}),
	).nextState;
	return { state: active, sceneId };
}

/** Start combat with a visible hero (a character Player A runs) and a HIDDEN ambusher (an NPC). */
function startCombat(state: CoreStateSlice, env: CoreEnvironment): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: {
				combatants: [
					{ kind: 'character', name: 'Hero', characterId: 'char-hero', ac: 15, initiative: 18, maxHp: 30, hidden: false },
					{ kind: 'npc', name: 'Ambusher', ac: 13, initiative: 20, maxHp: 12, hidden: true, placeholder: null },
				],
			},
		}),
	).nextState;
}

describe('COLLAB-006 shared combat view', () => {
	it('a player sees the visible combatant + current turn; a hidden combatant is omitted (AC1/AC2, non-leak)', () => {
		const env = makeEnvironment();
		const combatState = startCombat(activeSession(env).state, env);

		const dmView = getSharedCombatView(combatState.session.combat, combatState.permissions, DM_ACTOR.id);
		// The DM sees BOTH combatants.
		expect(dmView.tracker.combatants.map((c) => c.name).sort()).toEqual(['Ambusher', 'Hero']);
		expect(dmView.tracker.hiddenCount).toBe(1);

		const playerView = getSharedCombatView(
			combatState.session.combat,
			combatState.permissions,
			PLAYER_ACTOR.id,
		);
		// The player sees ONLY the visible Hero — the hidden Ambusher (no placeholder) is omitted entirely.
		expect(playerView.tracker.combatants.map((c) => c.name)).toEqual(['Hero']);
		// No row, no name, no count leak about the hidden ambusher.
		expect(playerView.tracker.hiddenCount).toBe(0);
		expect(JSON.stringify(playerView)).not.toContain('Ambusher');
		// The shared turn/round refreshes for the player (visible turn data).
		expect(playerView.tracker.status).toBe('running');
		expect(playerView.tracker.round).toBe(1);
	});

	it('permitted controls are role/grant-gated and fail closed', () => {
		const env = makeEnvironment();
		const combatState = startCombat(activeSession(env).state, env);
		const combat = combatState.session.combat;
		const heroId = Object.values(combat.combatants).find((c) => c.name === 'Hero')!.id;

		// DM (live): may advance/end combat and edit every visible combatant.
		const dm = getSharedCombatView(combat, combatState.permissions, DM_ACTOR.id);
		expect(dm.controls.canAdvanceTurn).toBe(true);
		expect(dm.controls.canEndCombat).toBe(true);
		expect(dm.controls.editableCombatantIds.sort()).toEqual(
			Object.keys(combat.combatants).sort(),
		);

		// Player WITHOUT a combat-participant grant: NO controls (cannot advance/end, edits nothing).
		const playerNoGrant = getSharedCombatView(combat, combatState.permissions, PLAYER_ACTOR.id);
		expect(playerNoGrant.controls.canAdvanceTurn).toBe(false);
		expect(playerNoGrant.controls.canEndCombat).toBe(false);
		expect(playerNoGrant.controls.editableCombatantIds).toEqual([]);

		// Grant Player A combat-participant on the Hero character → they may edit ONLY the Hero combatant.
		const granted = accept(
			dispatch(combatState, env, {
				type: 'permission.grant-capability-set',
				actorId: DM_ACTOR.id,
				payload: {
					playerActorId: PLAYER_ACTOR.id,
					entityType: 'character',
					entityId: 'char-hero',
					capabilitySet: 'combat-participant',
				},
			}),
		).nextState;
		const playerGranted = getSharedCombatView(granted.session.combat, granted.permissions, PLAYER_ACTOR.id);
		expect(playerGranted.controls.editableCombatantIds).toEqual([heroId]);
		// Still cannot advance/end combat (DM-only).
		expect(playerGranted.controls.canAdvanceTurn).toBe(false);
		expect(playerGranted.controls.canEndCombat).toBe(false);

		// An observer never gets any control.
		const observer = getSharedCombatView(combat, combatState.permissions, OBSERVER_ACTOR.id);
		expect(observer.controls.editableCombatantIds).toEqual([]);
		expect(observer.controls.canAdvanceTurn).toBe(false);
	});

	it('a STALE/cached view disables every live-authority control (AC3)', () => {
		const env = makeEnvironment();
		const combatState = startCombat(activeSession(env).state, env);
		const combat = combatState.session.combat;

		// Even the DM, when viewing CACHED (stale) combat, cannot submit live-authority commands.
		const staleDm = getSharedCombatView(combat, combatState.permissions, DM_ACTOR.id, 'stale');
		expect(staleDm.stale).toBe(true);
		expect(staleDm.liveness).toBe('stale');
		expect(staleDm.controls.canAdvanceTurn).toBe(false);
		expect(staleDm.controls.canEndCombat).toBe(false);
		expect(staleDm.controls.editableCombatantIds).toEqual([]);
		// The player can still VIEW the cached visible state (the tracker is populated).
		const stalePlayer = getSharedCombatView(combat, combatState.permissions, PLAYER_ACTOR.id, 'stale');
		expect(stalePlayer.tracker.combatants.map((c) => c.name)).toEqual(['Hero']);
		expect(stalePlayer.controls.editableCombatantIds).toEqual([]);
	});

	it('filters combat OPS before they reach a player: hidden-combatant ops are not delivered (non-leak)', () => {
		const env = makeEnvironment();
		const { state, sceneId: _sceneId } = activeSession(env);
		const combatState = startCombat(state, env);
		const combat = combatState.session.combat;
		const ambusherId = Object.values(combat.combatants).find((c) => c.name === 'Ambusher')!.id;
		const heroId = Object.values(combat.combatants).find((c) => c.name === 'Hero')!.id;

		// Damage BOTH combatants → two resource ops, one per combatant.
		let next = accept(
			dispatch(combatState, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: ambusherId, kind: 'hp', delta: -4 },
			}),
		).nextState;
		next = accept(
			dispatch(next, env, {
				type: 'combat.apply-resource',
				actorId: DM_ACTOR.id,
				payload: { combatantId: heroId, kind: 'hp', delta: -3 },
			}),
		).nextState;

		const combatOps: SyncOperation[] = next.sync.operations.filter((op) => op.entityType === 'combat');
		// The full stream includes start + both resource ops.
		expect(combatOps.some((op) => op.path?.includes(ambusherId))).toBe(true);

		// Filter for the player (no grant on the ambusher): the ambusher's op is OMITTED entirely.
		const player = next.permissions.actors[PLAYER_ACTOR.id]!;
		const delivered = filterCombatStreamForRecipient(combatOps, next.session.combat, next.permissions, player);
		expect(delivered.some((op) => op.path?.includes(ambusherId))).toBe(false);
		// The hero's op (a visible combatant) IS delivered; the combat-level start op is delivered too.
		expect(delivered.some((op) => op.path?.includes(heroId))).toBe(true);
		expect(delivered.some((op) => op.opType === 'combat.start')).toBe(true);
		// The serialized delivered stream carries NOTHING about the hidden ambusher id.
		expect(JSON.stringify(delivered)).not.toContain(ambusherId);

		// The boundary guard passes for the correctly-filtered stream and THROWS if a hidden op slips in.
		expect(() =>
			assertCombatStreamCarriesNoHiddenCombatant(delivered, next.session.combat, next.permissions, player),
		).not.toThrow();
		expect(() =>
			assertCombatStreamCarriesNoHiddenCombatant(combatOps, next.session.combat, next.permissions, player),
		).toThrow(/Combat stream leak/);

		// The DM receives the full combat stream unfiltered.
		const dm = next.permissions.actors[DM_ACTOR.id]!;
		expect(filterCombatStreamForRecipient(combatOps, next.session.combat, next.permissions, dm)).toHaveLength(
			combatOps.length,
		);
	});

	it('an unknown actor gets an empty, control-less combat view (fail closed)', () => {
		const env = makeEnvironment();
		const combatState = startCombat(activeSession(env).state, env);
		const view = getSharedCombatView(combatState.session.combat, combatState.permissions, 'actor-ghost');
		expect(view.viewerActorId).toBeNull();
		expect(view.controls.editableCombatantIds).toEqual([]);
		expect(view.controls.canAdvanceTurn).toBe(false);
		// No combatants are returned to an unknown actor.
		expect(view.tracker.combatants).toEqual([]);
	});

	it('CHAR-015 AC2: observer receives ONLY the projected stat-block summary for visible combatants; hidden combatants are omitted (non-leak)', () => {
		// AC2: "Given a DM projects a visible stat-block summary to observers, when it renders,
		// then only the explicitly projected summary fields are delivered."
		// startCombat creates a visible Hero (ac=15, initiative=18) and a hidden Ambusher (no placeholder).
		const env = makeEnvironment();
		const combatState = startCombat(activeSession(env).state, env);

		const observerView = getSharedCombatView(
			combatState.session.combat,
			combatState.permissions,
			OBSERVER_ACTOR.id,
		);

		// Positive case: observer sees the non-hidden Hero combatant (the "non-character projection").
		expect(observerView.tracker.combatants).toHaveLength(1);
		const heroRow = observerView.tracker.combatants[0]!;
		expect(heroRow.name).toBe('Hero');
		expect(heroRow.redacted).toBe(false);

		// The delivered stat-block contains ONLY the projected summary fields (CombatantStatBlockView).
		// These are the explicit non-character projection fields the requirement permits.
		expect(heroRow.statBlock.ac).toBe(15);
		expect(heroRow.statBlock.initiative).toBe(18);
		const statBlockKeys = Object.keys(heroRow.statBlock).sort();
		expect(statBlockKeys).toEqual(['abilityScores', 'ac', 'initiative', 'notes'].sort());

		// The hidden Ambusher (no placeholder) is OMITTED entirely — no identity, no stat leak.
		expect(observerView.tracker.hiddenCount).toBe(0); // non-DM never receives the hidden count
		expect(JSON.stringify(observerView.tracker)).not.toContain('Ambusher');

		// Observers have no combat controls (no write authority).
		expect(observerView.controls.canAdvanceTurn).toBe(false);
		expect(observerView.controls.canEndCombat).toBe(false);
		expect(observerView.controls.editableCombatantIds).toEqual([]);
	});
});
