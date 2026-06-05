import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SESSION_CACHE_TTL_MS,
	computeParticipantCachePrivacyStatus,
	decideCacheEntry,
	evaluateCachePrivacy,
	hasPersistentAccess,
	isSealedCacheEntryUnreadable,
	type ParticipantCacheEntry,
	type PermissionGrant,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildPermissionState } from '../src/testing/fixtures';

/**
 * COLLAB-010 + COLLAB-014 — the explicit session-cache privacy policy. On leave: session-only content is
 * purged (online) or sealed (offline) UNLESS a persistent grant exists; sealing applies even offline;
 * persistent-granted content is retained; an unconfirmed device is marked purge-unconfirmed (no leak).
 */

const HANDOUT_ENTRY: ParticipantCacheEntry = {
	cacheKey: 'handout:handout-cipher',
	entityType: 'handout',
	entityId: 'handout-cipher',
	sessionOnly: true,
};
const PROJECTED_SCENE_ENTRY: ParticipantCacheEntry = {
	cacheKey: 'scene:scene-boss',
	entityType: 'scene',
	entityId: 'scene-boss',
	sessionOnly: true,
};
const OWN_CHARACTER_ENTRY: ParticipantCacheEntry = {
	cacheKey: 'character:char-mine',
	entityType: 'character',
	entityId: 'char-mine',
	sessionOnly: false, // durable owned content — never touched by session leave
};

/** Permission state where the player holds a PERSISTENT (non-expiring) viewer grant on the handout. */
function permissionWithPersistentHandoutGrant() {
	const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const grant: PermissionGrant = {
		id: 'grant-persistent-handout',
		entityType: 'handout',
		entityId: 'handout-cipher',
		playerActorId: PLAYER_ACTOR.id,
		capabilitySet: 'viewer',
		createdBy: DM_ACTOR.id,
		createdAt: '2026-06-04T00:00:00.000Z',
		expiresAt: null, // persistent
	};
	return { ...permission, grants: [grant] };
}

describe('COLLAB-010 — purge/seal participant cache on leave unless persistent access', () => {
	it('AC1 — leaving online PURGES session-only content the participant has no persistent grant on', () => {
		const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const result = evaluateCachePrivacy(
			{
				participant: PLAYER_ACTOR,
				entries: [HANDOUT_ENTRY, PROJECTED_SCENE_ENTRY, OWN_CHARACTER_ENTRY],
				permission,
				online: true,
				now: '2026-06-05T00:00:00.000Z',
			},
			'left',
		);
		// Both session-only entries are purged; the participant's own durable character is retained.
		expect(result.purgedKeys).toEqual(['handout:handout-cipher', 'scene:scene-boss']);
		expect(result.sealedKeys).toEqual([]);
		expect(result.retainedKeys).toEqual(['character:char-mine']);
	});

	it('AC2 — the DM-granted persistent handout is RETAINED while session-only scene is purged', () => {
		const permission = permissionWithPersistentHandoutGrant();
		const result = evaluateCachePrivacy(
			{
				participant: PLAYER_ACTOR,
				entries: [HANDOUT_ENTRY, PROJECTED_SCENE_ENTRY],
				permission,
				online: true,
				now: '2026-06-05T00:00:00.000Z',
			},
			'ended',
		);
		expect(result.retainedKeys).toEqual(['handout:handout-cipher']);
		expect(result.purgedKeys).toEqual(['scene:scene-boss']);
		// The retained key is the persistent-grant exemption on the policy too.
		expect(result.policy.persistentGrantExemptKeys).toEqual(['handout:handout-cipher']);
	});

	it('AC3 — leaving OFFLINE SEALS session-only content (key invalidation, unreadable in place)', () => {
		const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const result = evaluateCachePrivacy(
			{
				participant: PLAYER_ACTOR,
				entries: [HANDOUT_ENTRY, PROJECTED_SCENE_ENTRY],
				permission,
				online: false, // offline — cannot remove plaintext, so seal
				now: '2026-06-05T00:00:00.000Z',
			},
			'left',
		);
		expect(result.sealedKeys).toEqual(['handout:handout-cipher', 'scene:scene-boss']);
		expect(result.purgedKeys).toEqual([]);
		expect(result.policy.invalidatesSessionKey).toBe(true);
	});

	it('an observer never has a persistent grant — its session-only cache is always purged/sealed', () => {
		const permission = permissionWithPersistentHandoutGrant(); // grant is for the PLAYER, not observer
		const result = evaluateCachePrivacy(
			{ participant: OBSERVER_ACTOR, entries: [HANDOUT_ENTRY], permission, online: true },
			'left',
		);
		expect(result.purgedKeys).toEqual(['handout:handout-cipher']);
		expect(result.retainedKeys).toEqual([]);
	});

	it('an ACTIVE session retains everything (no purge/seal while the participant is in the session)', () => {
		const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const result = evaluateCachePrivacy(
			{ participant: PLAYER_ACTOR, entries: [HANDOUT_ENTRY], permission, online: true },
			'active',
		);
		expect(result.retainedKeys).toEqual(['handout:handout-cipher']);
		expect(result.purgedKeys).toEqual([]);
		expect(result.sealedKeys).toEqual([]);
	});

	it('decideCacheEntry: an EXPIRED grant does not count as persistent access (fail closed)', () => {
		const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const expiredGrant: PermissionGrant = {
			id: 'g-expired',
			entityType: 'handout',
			entityId: 'handout-cipher',
			playerActorId: PLAYER_ACTOR.id,
			capabilitySet: 'viewer',
			createdBy: DM_ACTOR.id,
			createdAt: '2026-06-01T00:00:00.000Z',
			expiresAt: '2026-06-02T00:00:00.000Z', // already expired at `now`
		};
		const withExpired = { ...permission, grants: [expiredGrant] };
		expect(
			hasPersistentAccess(HANDOUT_ENTRY, PLAYER_ACTOR, withExpired, '2026-06-05T00:00:00.000Z'),
		).toBe(false);
		const decision = decideCacheEntry(HANDOUT_ENTRY, PLAYER_ACTOR, withExpired, true, '2026-06-05T00:00:00.000Z');
		expect(decision.disposition).toBe('purge');
		expect(decision.persistentGrant).toBe(false);
	});
});

describe('COLLAB-014 — explicit session-cache policy (TTL / key invalidation / offline revocation)', () => {
	it('AC1 — the computed policy declares a TTL and session-key invalidation', () => {
		const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const result = evaluateCachePrivacy(
			{ participant: PLAYER_ACTOR, entries: [HANDOUT_ENTRY], permission, online: false },
			'left',
			{ ttlMs: DEFAULT_SESSION_CACHE_TTL_MS, issuedAt: '2026-06-05T00:00:00.000Z' },
		);
		expect(result.policy.schemaVersion).toBe(1);
		expect(result.policy.ttlMs).toBe(DEFAULT_SESSION_CACHE_TTL_MS);
		expect(result.policy.invalidatesSessionKey).toBe(true);
		expect(result.policy.issuedAt).toBe('2026-06-05T00:00:00.000Z');
	});

	it('AC2 — a sealed entry becomes unreadable at local TTL expiry EVEN IF the revoke was not delivered', () => {
		const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const { policy } = evaluateCachePrivacy(
			{ participant: PLAYER_ACTOR, entries: [HANDOUT_ENTRY], permission, online: false },
			'left',
			{ ttlMs: 60_000, issuedAt: '2026-06-05T00:00:00.000Z' },
		);
		// Before TTL: still readable (the revoke op may yet arrive, but the seal-by-TTL has not fired).
		expect(
			isSealedCacheEntryUnreadable(policy, 'handout:handout-cipher', '2026-06-05T00:00:30.000Z'),
		).toBe(false);
		// At/after TTL: unreadable locally, with NO network round-trip (offline revocation).
		expect(
			isSealedCacheEntryUnreadable(policy, 'handout:handout-cipher', '2026-06-05T00:01:00.000Z'),
		).toBe(true);
		expect(
			isSealedCacheEntryUnreadable(policy, 'handout:handout-cipher', '2026-06-05T00:05:00.000Z'),
		).toBe(true);
	});

	it('AC2 — a non-positive TTL seals immediately; a bad clock fails closed to unreadable', () => {
		const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const { policy } = evaluateCachePrivacy(
			{ participant: PLAYER_ACTOR, entries: [HANDOUT_ENTRY], permission, online: false },
			'left',
			{ ttlMs: 0, issuedAt: '2026-06-05T00:00:00.000Z' },
		);
		expect(isSealedCacheEntryUnreadable(policy, 'handout:handout-cipher', '2026-06-05T00:00:00.000Z')).toBe(true);
		expect(isSealedCacheEntryUnreadable(policy, 'handout:handout-cipher', 'not-a-date')).toBe(true);
	});

	it('AC3 — a persistent-granted key is EXEMPT from TTL sealing (stays readable)', () => {
		const permission = permissionWithPersistentHandoutGrant();
		const result = evaluateCachePrivacy(
			{
				participant: PLAYER_ACTOR,
				entries: [HANDOUT_ENTRY, PROJECTED_SCENE_ENTRY],
				permission,
				online: false,
			},
			'left',
			{ ttlMs: 60_000, issuedAt: '2026-06-05T00:00:00.000Z' },
		);
		// The persistent handout is retained + exempt; the projected scene is sealed.
		expect(result.retainedKeys).toEqual(['handout:handout-cipher']);
		expect(result.sealedKeys).toEqual(['scene:scene-boss']);
		// Long after TTL, the exempt handout is still readable; the sealed scene is not.
		expect(
			isSealedCacheEntryUnreadable(result.policy, 'handout:handout-cipher', '2026-06-06T00:00:00.000Z'),
		).toBe(false);
		expect(
			isSealedCacheEntryUnreadable(result.policy, 'scene:scene-boss', '2026-06-06T00:00:00.000Z'),
		).toBe(true);
	});

	describe('AC4 — purge-unconfirmed status without exposing device secrets', () => {
		it('a participant whose device did not confirm the purge is marked purge-unconfirmed', () => {
			const status = computeParticipantCachePrivacyStatus(
				[PLAYER_ACTOR.id, OBSERVER_ACTOR.id],
				new Set([PLAYER_ACTOR.id]), // only the player confirmed
			);
			const byId = new Map(status.map((s) => [s.participantActorId, s]));
			expect(byId.get(PLAYER_ACTOR.id)?.status).toBe('confirmed');
			expect(byId.get(OBSERVER_ACTOR.id)?.status).toBe('purge-unconfirmed');
		});

		it('the status carries only the participant id + coarse status + a generic message (no leak)', () => {
			const status = computeParticipantCachePrivacyStatus([PLAYER_ACTOR.id], new Set());
			const entry = status[0]!;
			expect(entry).toEqual({
				participantActorId: PLAYER_ACTOR.id,
				status: 'purge-unconfirmed',
				message: expect.any(String),
			});
			// The message names no cached content, no entity ids, no device secrets.
			expect(entry.message).not.toContain('handout');
			expect(entry.message).not.toContain('scene-boss');
		});
	});
});
