import { describe, expect, it } from 'vitest';
import {
	CAPABILITY_SCHEMA_VERSION,
	activeGrantsForParticipant,
	ensureSessionInvitation,
	isInvitationExpired,
	joinSession,
	type PermissionGrant,
	type SessionInvitation,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildPermissionState,
} from '../src/testing/fixtures';
import { EMPTY_SESSION_STATE } from '../src/state/session-state';

/**
 * COLLAB-001 — the DM starts a collaborative session and issues invitations / local pairing codes that
 * authenticate participants as DM/Player/Observer. Hard assertions: a valid invitation returns the filtered
 * identity payload (role/participant/grants/scenes/cursor); an expired/revoked invitation discloses NOTHING;
 * a local paired join continues offline only when the credential is local-pairing-capable.
 */

const NOW = '2026-06-05T12:00:00.000Z';

function invitation(overrides: Partial<SessionInvitation> = {}): SessionInvitation {
	return {
		id: 'inv-1',
		sessionId: 'session-1',
		role: 'player',
		participantActorId: PLAYER_ACTOR.id,
		credentialKind: 'invitation',
		status: 'active',
		expiresAt: null,
		localPairingCapable: false,
		issuedBy: DM_ACTOR.id,
		issuedAt: '2026-06-05T00:00:00.000Z',
		...overrides,
	};
}

const PERMISSION = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

function identity(visibleSceneIds: string[] = ['scene-tavern'], syncCursor: string | null = null) {
	return {
		session: EMPTY_SESSION_STATE,
		permission: PERMISSION,
		visibleSceneIds,
		syncCursor,
	};
}

describe('COLLAB-001 — session join and identity', () => {
	it('AC1 — a valid invitation returns role, participant id, grants, visible scenes, and sync cursor', () => {
		const outcome = joinSession(invitation(), 'remote', identity(['scene-b', 'scene-a'], 'op-42'), NOW);
		expect(outcome.admitted).toBe(true);
		if (!outcome.admitted) return;
		expect(outcome.result.sessionId).toBe('session-1');
		expect(outcome.result.participantActorId).toBe(PLAYER_ACTOR.id);
		expect(outcome.result.role).toBe('player');
		// Visible scenes are returned sorted, exactly as the actor-filtered read supplied them.
		expect(outcome.result.visibleSceneIds).toEqual(['scene-a', 'scene-b']);
		expect(outcome.result.syncCursor).toBe('op-42');
		expect(outcome.result.capabilitySchemaVersion).toBe(CAPABILITY_SCHEMA_VERSION);
		expect(outcome.result.grants).toEqual([]);
	});

	it('AC1 — a player joiner receives only their own ACTIVE grants (expired/other-player grants excluded)', () => {
		const myGrant: PermissionGrant = {
			id: 'grant-mine',
			entityType: 'character',
			entityId: 'char-mine',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'owner',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-04T00:00:00.000Z',
			expiresAt: null,
		};
		const expiredGrant: PermissionGrant = {
			...myGrant,
			id: 'grant-expired',
			entityId: 'char-old',
			expiresAt: '2026-06-04T00:00:00.000Z', // before NOW
		};
		const otherGrant: PermissionGrant = {
			...myGrant,
			id: 'grant-other',
			playerActorId: OBSERVER_ACTOR.id,
		};
		const permission = {
			...PERMISSION,
			grants: [myGrant, expiredGrant, otherGrant],
		};
		const outcome = joinSession(
			invitation(),
			'remote',
			{ session: EMPTY_SESSION_STATE, permission, visibleSceneIds: [], syncCursor: null },
			NOW,
		);
		expect(outcome.admitted).toBe(true);
		if (!outcome.admitted) return;
		// Only the joiner's active grant; the expired one is not restored and the other player's is excluded.
		expect(outcome.result.grants.map((g) => g.id)).toEqual(['grant-mine']);
	});

	it('AC2 — an EXPIRED invitation discloses NO session state (only a generic denial)', () => {
		const outcome = joinSession(
			invitation({ expiresAt: '2026-06-05T00:00:00.000Z' }),
			'remote',
			identity(),
			NOW,
		);
		expect(outcome.admitted).toBe(false);
		if (outcome.admitted) return;
		expect(outcome.reason).toBe('expired-credential');
		// The denial carries ONLY a reason + generic message — no role, participant id, scenes, or session id.
		expect(Object.keys(outcome).sort()).toEqual(['admitted', 'message', 'reason']);
		expect(outcome.message).not.toContain('session-1');
		expect(outcome.message).not.toContain(PLAYER_ACTOR.id);
	});

	it('AC2 — a REVOKED or CONSUMED invitation discloses NO session state', () => {
		for (const status of ['revoked', 'consumed'] as const) {
			const outcome = joinSession(invitation({ status }), 'remote', identity(), NOW);
			expect(outcome.admitted).toBe(false);
			if (outcome.admitted) continue;
			expect(outcome.reason).toBe('invalid-credential');
			expect(Object.keys(outcome).sort()).toEqual(['admitted', 'message', 'reason']);
		}
	});

	it('AC3 — a local-pairing-capable credential continues a LOCAL PAIRED join when remote is unavailable', () => {
		const outcome = joinSession(
			invitation({ credentialKind: 'local-pairing-code', localPairingCapable: true }),
			'local-paired',
			identity(['scene-local']),
			NOW,
		);
		expect(outcome.admitted).toBe(true);
		if (!outcome.admitted) return;
		expect(outcome.result.visibleSceneIds).toEqual(['scene-local']);
	});

	it('AC3 — a REMOTE-only credential over a local-paired (offline) channel fails closed (network-unavailable)', () => {
		const outcome = joinSession(
			invitation({ localPairingCapable: false }),
			'local-paired',
			identity(),
			NOW,
		);
		expect(outcome.admitted).toBe(false);
		if (outcome.admitted) return;
		expect(outcome.reason).toBe('network-unavailable');
	});

	it('fail closed — a credential whose actor role does not match the registered actor is denied', () => {
		// An invitation claiming `player` for the OBSERVER actor (role mismatch) can never elevate the role.
		const outcome = joinSession(
			invitation({ participantActorId: OBSERVER_ACTOR.id, role: 'player' }),
			'remote',
			identity(),
			NOW,
		);
		expect(outcome.admitted).toBe(false);
		if (outcome.admitted) return;
		expect(outcome.reason).toBe('role-mismatch');
	});

	it('fail closed — a credential for an unregistered participant is denied with no disclosure', () => {
		const outcome = joinSession(
			invitation({ participantActorId: 'actor-ghost' }),
			'remote',
			identity(),
			NOW,
		);
		expect(outcome.admitted).toBe(false);
		if (outcome.admitted) return;
		expect(outcome.reason).toBe('identity-mismatch');
	});

	it('an observer credential admits an observer and never carries write grants', () => {
		const writeGrant: PermissionGrant = {
			id: 'grant-bad',
			entityType: 'scene',
			entityId: 'scene-1',
			playerActorId: OBSERVER_ACTOR.id,
			capabilitySet: 'co-editor',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-04T00:00:00.000Z',
			expiresAt: null,
		};
		const permission = { ...PERMISSION, grants: [writeGrant] };
		const outcome = joinSession(
			invitation({ participantActorId: OBSERVER_ACTOR.id, role: 'observer' }),
			'remote',
			{ session: EMPTY_SESSION_STATE, permission, visibleSceneIds: [], syncCursor: null },
			NOW,
		);
		expect(outcome.admitted).toBe(true);
		if (!outcome.admitted) return;
		expect(outcome.result.role).toBe('observer');
		// Observers never receive grants on join (Contract 3), even if a stray grant record exists.
		expect(outcome.result.grants).toEqual([]);
	});

	it('isInvitationExpired fails closed on a malformed expiry and ignores an absent clock', () => {
		expect(isInvitationExpired(invitation({ expiresAt: 'not-a-date' }), NOW)).toBe(true);
		expect(isInvitationExpired(invitation({ expiresAt: null }), NOW)).toBe(false);
		// No clock supplied ⇒ time-expiry is not evaluated (a non-time check still applies elsewhere).
		expect(isInvitationExpired(invitation({ expiresAt: '2020-01-01T00:00:00.000Z' }))).toBe(false);
	});

	it('ensureSessionInvitation hydrates a partial credential fail closed (revoked, not local-pairing-capable)', () => {
		const hydrated = ensureSessionInvitation({ id: 'inv-x', sessionId: 'session-1' });
		expect(hydrated.status).toBe('revoked'); // most protective default
		expect(hydrated.localPairingCapable).toBe(false);
		// A hydrated-revoked credential never admits a join.
		const outcome = joinSession(hydrated, 'remote', identity(), NOW);
		expect(outcome.admitted).toBe(false);
	});

	it('activeGrantsForParticipant returns nothing for the DM and observers', () => {
		expect(activeGrantsForParticipant(PERMISSION, DM_ACTOR, NOW)).toEqual([]);
		expect(activeGrantsForParticipant(PERMISSION, OBSERVER_ACTOR, NOW)).toEqual([]);
	});
});
