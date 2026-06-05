import { describe, expect, it } from 'vitest';
import {
	LEAST_PRIVILEGED_ROLE,
	PERMISSION_STATE_SCHEMA_VERSION,
	auditActorGrantConsistency,
	auditPermissionConsistency,
	computeBasePermissionFloor,
	computeEffectivePermissions,
	computeEffectivePermissionsForActor,
	decideCharacterDataRead,
	readCharacterDataForActor,
	resolveBaseRole,
	type PermissionGrant,
	type PermissionState,
	type RoleAssignmentRecord,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

function grant(overrides: Partial<PermissionGrant>): PermissionGrant {
	return {
		id: overrides.id ?? 'grant-1',
		entityType: overrides.entityType ?? 'scene',
		entityId: overrides.entityId ?? 'entity-1',
		playerActorId: overrides.playerActorId ?? OBSERVER_ACTOR.id,
		capabilitySet: overrides.capabilitySet ?? 'viewer',
		createdBy: overrides.createdBy ?? DM_ACTOR.id,
		createdAt: overrides.createdAt ?? '2026-06-04T00:00:00.000Z',
	};
}

function permissionState(grants: PermissionGrant[] = []): PermissionState {
	return {
		actors: {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants,
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

const DM_RECORD: RoleAssignmentRecord = { actorId: DM_ACTOR.id, role: 'dm' };
const PLAYER_RECORD: RoleAssignmentRecord = { actorId: PLAYER_ACTOR.id, role: 'player' };
const OBSERVER_RECORD: RoleAssignmentRecord = { actorId: OBSERVER_ACTOR.id, role: 'observer' };

describe('PERM-001: every authenticated participant resolves to exactly one base role', () => {
	it('resolves a single valid role unambiguously', () => {
		const resolution = resolveBaseRole(PLAYER_ACTOR.id, [PLAYER_RECORD]);
		expect(resolution.role).toBe('player');
		expect(resolution.authenticated).toBe(true);
		expect(resolution.normalized).toBe(false);
		expect(resolution.reason).toBe('single-role');
	});

	it('computes the base permission floor purely from the role (pure function of role)', () => {
		expect(computeBasePermissionFloor('dm')).toMatchObject({
			canWrite: true,
			canReadCharacterData: true,
			readOnly: false,
			maxGrantAction: 'write',
			allowsCharacterGrants: true,
		});
		expect(computeBasePermissionFloor('player')).toMatchObject({
			canWrite: true,
			canReadCharacterData: true,
			readOnly: false,
		});
		expect(computeBasePermissionFloor('observer')).toMatchObject({
			canWrite: false,
			canReadCharacterData: false,
			readOnly: true,
			maxGrantAction: 'read',
			allowsCharacterGrants: false,
		});
	});

	it('PERM-001 AC2: an unauthenticated participant infers no anonymous role and is denied', () => {
		for (const id of [null, undefined, '']) {
			const resolution = resolveBaseRole(id, [PLAYER_RECORD]);
			expect(resolution.authenticated).toBe(false);
			expect(resolution.actorId).toBeNull();
			expect(resolution.role).toBe(LEAST_PRIVILEGED_ROLE);
			expect(resolution.reason).toBe('unauthenticated');
		}
	});

	// --- Adversarial PERM-001: ambiguous/missing role records fail closed to least privilege ---

	it('ADVERSARIAL: a participant with no role record fails closed to observer', () => {
		const resolution = resolveBaseRole(PLAYER_ACTOR.id, []);
		expect(resolution.role).toBe('observer');
		expect(resolution.authenticated).toBe(true);
		expect(resolution.normalized).toBe(true);
		expect(resolution.reason).toBe('no-role-record');
	});

	it('ADVERSARIAL: a participant with two conflicting role records gets the LEAST privileged', () => {
		// A forged/stale dm record alongside a player record must NOT yield dm.
		const dmAndPlayer = resolveBaseRole(PLAYER_ACTOR.id, [
			{ actorId: PLAYER_ACTOR.id, role: 'dm' },
			{ actorId: PLAYER_ACTOR.id, role: 'player' },
		]);
		expect(dmAndPlayer.role).toBe('player');
		expect(dmAndPlayer.reason).toBe('conflicting-roles');

		// player + observer must yield observer (least privileged), never player.
		const playerAndObserver = resolveBaseRole(PLAYER_ACTOR.id, [
			{ actorId: PLAYER_ACTOR.id, role: 'player' },
			{ actorId: PLAYER_ACTOR.id, role: 'observer' },
		]);
		expect(playerAndObserver.role).toBe('observer');
		expect(playerAndObserver.normalized).toBe(true);

		// dm + player + observer must yield observer.
		const all = resolveBaseRole(PLAYER_ACTOR.id, [
			{ actorId: PLAYER_ACTOR.id, role: 'dm' },
			{ actorId: PLAYER_ACTOR.id, role: 'player' },
			{ actorId: PLAYER_ACTOR.id, role: 'observer' },
		]);
		expect(all.role).toBe('observer');
	});

	it('ADVERSARIAL: a malformed/unknown role value is ignored and fails closed to observer', () => {
		const resolution = resolveBaseRole(PLAYER_ACTOR.id, [
			{ actorId: PLAYER_ACTOR.id, role: 'super-admin' as never },
		]);
		expect(resolution.role).toBe('observer');
		expect(resolution.reason).toBe('unknown-role');
		expect(resolution.normalized).toBe(true);
	});

	it('ADVERSARIAL: a valid role with a dropped invalid sibling keeps the valid role but flags it', () => {
		const resolution = resolveBaseRole(PLAYER_ACTOR.id, [
			PLAYER_RECORD,
			{ actorId: PLAYER_ACTOR.id, role: 'wizard' as never },
		]);
		expect(resolution.role).toBe('player');
		expect(resolution.reason).toBe('unknown-role');
		expect(resolution.normalized).toBe(true);
	});

	it('ignores role records belonging to other actors', () => {
		const resolution = resolveBaseRole(PLAYER_ACTOR.id, [
			DM_RECORD,
			OBSERVER_RECORD,
			PLAYER_RECORD,
		]);
		expect(resolution.role).toBe('player');
		expect(resolution.reason).toBe('single-role');
	});
});

describe('PERM-001: effective permissions cap grants by role ceiling', () => {
	it('a player keeps a write grant within the player ceiling', () => {
		const writeGrant = grant({
			id: 'g-player-write',
			playerActorId: PLAYER_ACTOR.id,
			entityType: 'note-section',
			capabilitySet: 'section-editor',
		});
		const effective = computeEffectivePermissions(PLAYER_ACTOR.id, [PLAYER_RECORD], [writeGrant]);
		expect(effective.role).toBe('player');
		expect(effective.effectiveGrants).toHaveLength(1);
		expect(effective.droppedGrants).toHaveLength(0);
		expect(effective.canWrite).toBe(true);
	});

	it('a player keeps a character owner grant and may read character data', () => {
		const ownerGrant = grant({
			id: 'g-owner',
			playerActorId: PLAYER_ACTOR.id,
			entityType: 'character',
			entityId: 'char-1',
			capabilitySet: 'owner',
		});
		const effective = computeEffectivePermissions(PLAYER_ACTOR.id, [PLAYER_RECORD], [ownerGrant]);
		expect(effective.canReadCharacterData).toBe(true);
		expect(effective.effectiveGrants).toHaveLength(1);
		expect(effective.droppedGrants).toHaveLength(0);
	});

	it('only grants belonging to the actor are considered', () => {
		const otherGrant = grant({ id: 'g-other', playerActorId: 'someone-else' });
		const effective = computeEffectivePermissions(PLAYER_ACTOR.id, [PLAYER_RECORD], [otherGrant]);
		expect(effective.effectiveGrants).toHaveLength(0);
		expect(effective.droppedGrants).toHaveLength(0);
	});
});

describe('PERM-011: Observer surface is always read-only with no character data', () => {
	it('a clean observer (no grants) is read-only with no character data', () => {
		const effective = computeEffectivePermissions(OBSERVER_ACTOR.id, [OBSERVER_RECORD], []);
		expect(effective.role).toBe('observer');
		expect(effective.canWrite).toBe(false);
		expect(effective.canReadCharacterData).toBe(false);
		expect(effective.readOnly).toBe(true);
	});

	it('an observer keeps a benign read-only viewer grant on a non-character entity', () => {
		const viewerGrant = grant({
			id: 'g-view',
			playerActorId: OBSERVER_ACTOR.id,
			entityType: 'scene',
			capabilitySet: 'viewer',
		});
		const effective = computeEffectivePermissions(
			OBSERVER_ACTOR.id,
			[OBSERVER_RECORD],
			[viewerGrant],
		);
		// A viewer grant does not elevate the observer; it stays read-only with no character data.
		expect(effective.effectiveGrants).toHaveLength(1);
		expect(effective.droppedGrants).toHaveLength(0);
		expect(effective.canWrite).toBe(false);
		expect(effective.canReadCharacterData).toBe(false);
	});

	// --- ADVERSARIAL PERM-011: no grant can ever elevate an observer ---

	it('ADVERSARIAL: a forged write grant on an observer is dropped, surface stays read-only', () => {
		const forgedWrite = grant({
			id: 'g-forged-write',
			playerActorId: OBSERVER_ACTOR.id,
			entityType: 'scene',
			capabilitySet: 'co-editor',
		});
		const effective = computeEffectivePermissions(
			OBSERVER_ACTOR.id,
			[OBSERVER_RECORD],
			[forgedWrite],
		);
		expect(effective.canWrite).toBe(false);
		expect(effective.readOnly).toBe(true);
		expect(effective.effectiveGrants).toHaveLength(0);
		expect(effective.droppedGrants).toEqual([
			expect.objectContaining({ grantId: 'g-forged-write', reason: 'observer-write-grant' }),
		]);
	});

	it('ADVERSARIAL: a stale elevated widget manager grant on an observer is dropped', () => {
		const staleManager = grant({
			id: 'g-stale-manager',
			playerActorId: OBSERVER_ACTOR.id,
			entityType: 'widget',
			capabilitySet: 'manager',
		});
		const effective = computeEffectivePermissions(
			OBSERVER_ACTOR.id,
			[OBSERVER_RECORD],
			[staleManager],
		);
		expect(effective.canWrite).toBe(false);
		expect(effective.droppedGrants[0]?.reason).toBe('observer-write-grant');
	});

	it('ADVERSARIAL: a character grant on an observer is dropped and never yields character data', () => {
		const charGrant = grant({
			id: 'g-char',
			playerActorId: OBSERVER_ACTOR.id,
			entityType: 'character',
			entityId: 'char-9',
			capabilitySet: 'owner',
		});
		const effective = computeEffectivePermissions(
			OBSERVER_ACTOR.id,
			[OBSERVER_RECORD],
			[charGrant],
		);
		expect(effective.canReadCharacterData).toBe(false);
		expect(effective.effectiveGrants).toHaveLength(0);
		expect(effective.droppedGrants[0]?.reason).toBe('observer-character-grant');
	});

	it('ADVERSARIAL: even a character VIEWER grant on an observer is dropped (no character data)', () => {
		const charViewer = grant({
			id: 'g-char-viewer',
			playerActorId: OBSERVER_ACTOR.id,
			entityType: 'character',
			entityId: 'char-2',
			capabilitySet: 'viewer',
		});
		const effective = computeEffectivePermissions(
			OBSERVER_ACTOR.id,
			[OBSERVER_RECORD],
			[charViewer],
		);
		expect(effective.canReadCharacterData).toBe(false);
		expect(effective.droppedGrants[0]?.reason).toBe('observer-character-grant');
	});

	it('ADVERSARIAL: a malformed/unknown capability set on an observer fails closed (dropped)', () => {
		const malformed = grant({
			id: 'g-malformed',
			playerActorId: OBSERVER_ACTOR.id,
			entityType: 'scene',
			capabilitySet: 'do-anything-9000' as never,
		});
		const effective = computeEffectivePermissions(
			OBSERVER_ACTOR.id,
			[OBSERVER_RECORD],
			[malformed],
		);
		// Unknown capability sets are treated as write-capable, so they exceed the observer ceiling.
		expect(effective.canWrite).toBe(false);
		expect(effective.effectiveGrants).toHaveLength(0);
		expect(effective.droppedGrants[0]?.reason).toBe('observer-write-grant');
	});

	it('ADVERSARIAL: a participant with conflicting roles + a write grant resolves to observer and drops the grant', () => {
		// Two role records (observer + player) AND a forged co-editor grant: must collapse to the
		// least-privileged observer and drop the write grant.
		const forged = grant({
			id: 'g-combo',
			playerActorId: PLAYER_ACTOR.id,
			entityType: 'scene',
			capabilitySet: 'co-editor',
		});
		const effective = computeEffectivePermissions(
			PLAYER_ACTOR.id,
			[
				{ actorId: PLAYER_ACTOR.id, role: 'observer' },
				{ actorId: PLAYER_ACTOR.id, role: 'player' },
			],
			[forged],
		);
		expect(effective.role).toBe('observer');
		expect(effective.canWrite).toBe(false);
		expect(effective.canReadCharacterData).toBe(false);
		expect(effective.droppedGrants[0]?.reason).toBe('observer-write-grant');
	});

	it('ADVERSARIAL: an unauthenticated request never gains grants even if grants exist for that id', () => {
		const forged = grant({ id: 'g-x', playerActorId: '', capabilitySet: 'co-editor' });
		const effective = computeEffectivePermissions('', [], [forged]);
		expect(effective.authenticated).toBe(false);
		expect(effective.canWrite).toBe(false);
		expect(effective.effectiveGrants).toHaveLength(0);
	});
});

describe('PERM-011 AC1: dropped observer grants surface a consistency error to the DM', () => {
	it('reports an observer write grant as a consistency error', () => {
		const state = permissionState([
			grant({
				id: 'g-obs-write',
				playerActorId: OBSERVER_ACTOR.id,
				entityType: 'scene',
				capabilitySet: 'co-editor',
			}),
		]);
		const report = auditPermissionConsistency(state);
		expect(report.hasErrors).toBe(true);
		const problem = report.problems.find((p) => p.grantId === 'g-obs-write');
		expect(problem).toBeDefined();
		expect(problem?.kind).toBe('observer-write-grant');
		expect(problem?.severity).toBe('error');
		expect(problem?.actorId).toBe(OBSERVER_ACTOR.id);
		// Remediation must be generic and not leak any hidden title/value.
		expect(problem?.remediation).toContain('Observers cannot');
	});

	it('reports an observer character grant as a consistency error', () => {
		const state = permissionState([
			grant({
				id: 'g-obs-char',
				playerActorId: OBSERVER_ACTOR.id,
				entityType: 'character',
				entityId: 'char-1',
				capabilitySet: 'viewer',
			}),
		]);
		const problems = auditActorGrantConsistency(state, OBSERVER_ACTOR.id);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.kind).toBe('observer-character-grant');
	});

	it('does not raise consistency errors for a clean permission state', () => {
		const state = permissionState([
			grant({
				id: 'g-ok',
				playerActorId: PLAYER_ACTOR.id,
				entityType: 'note-section',
				capabilitySet: 'section-editor',
			}),
			grant({
				id: 'g-obs-view',
				playerActorId: OBSERVER_ACTOR.id,
				entityType: 'scene',
				capabilitySet: 'viewer',
			}),
		]);
		const report = auditPermissionConsistency(state);
		expect(report.hasErrors).toBe(false);
		expect(report.problems).toHaveLength(0);
	});

	it('reports a grant referencing an actor not in the session as a warning', () => {
		const state = permissionState([grant({ id: 'g-orphan', playerActorId: 'ghost-player' })]);
		const report = auditPermissionConsistency(state);
		const orphan = report.problems.find((p) => p.grantId === 'g-orphan');
		expect(orphan?.kind).toBe('orphan-grant-actor');
		expect(orphan?.severity).toBe('warning');
	});
});

describe('PERM-011 AC2: an observer requesting character data receives nothing', () => {
	it('denies character data to a clean observer', () => {
		const state = permissionState();
		const decision = decideCharacterDataRead(state, OBSERVER_ACTOR.id);
		expect(decision).toEqual({ kind: 'denied', reason: 'observer-no-character-data' });
		expect(readCharacterDataForActor(state, OBSERVER_ACTOR.id, { hp: 12 })).toBeNull();
	});

	it('ADVERSARIAL: denies character data to an observer even with a forged character owner grant', () => {
		const state = permissionState([
			grant({
				id: 'g-forged-owner',
				playerActorId: OBSERVER_ACTOR.id,
				entityType: 'character',
				entityId: 'char-1',
				capabilitySet: 'owner',
			}),
		]);
		expect(decideCharacterDataRead(state, OBSERVER_ACTOR.id).kind).toBe('denied');
		expect(readCharacterDataForActor(state, OBSERVER_ACTOR.id, { secret: 'backstory' })).toBeNull();
	});

	it('grants character data to the DM and to a player', () => {
		const state = permissionState();
		expect(decideCharacterDataRead(state, DM_ACTOR.id)).toEqual({ kind: 'granted' });
		expect(decideCharacterDataRead(state, PLAYER_ACTOR.id)).toEqual({ kind: 'granted' });
		expect(readCharacterDataForActor(state, DM_ACTOR.id, { hp: 30 })).toEqual({ hp: 30 });
	});

	it('denies character data to an unauthenticated or unknown actor', () => {
		const state = permissionState();
		expect(decideCharacterDataRead(state, '')).toEqual({
			kind: 'denied',
			reason: 'unauthenticated',
		});
		expect(decideCharacterDataRead(state, 'nobody')).toEqual({
			kind: 'denied',
			reason: 'unknown-actor',
		});
	});
});

describe('computeEffectivePermissionsForActor: state-driven convenience path', () => {
	it('matches the record-driven path for an observer with adversarial grants', () => {
		const state = permissionState([
			grant({
				id: 'g-1',
				playerActorId: OBSERVER_ACTOR.id,
				entityType: 'scene',
				capabilitySet: 'co-editor',
			}),
		]);
		const effective = computeEffectivePermissionsForActor(state, OBSERVER_ACTOR.id);
		expect(effective.role).toBe('observer');
		expect(effective.canWrite).toBe(false);
		expect(effective.canReadCharacterData).toBe(false);
		expect(effective.droppedGrants).toHaveLength(1);
	});

	it('returns an unauthenticated, least-privileged surface for a missing actor id', () => {
		const state = permissionState();
		const effective = computeEffectivePermissionsForActor(state, null);
		expect(effective.authenticated).toBe(false);
		expect(effective.role).toBe('observer');
	});
});
