import { describe, expect, it } from 'vitest';
import {
	catchUpPhase,
	classifyCatchUpOp,
	deriveCatchUpFailureState,
	isCachedHandoutOpenable,
	orderCatchUpByDependency,
	type SessionCachePolicy,
	type SyncOperation,
} from '../src';
import { DM_ACTOR } from '../src/testing/fixtures';

/**
 * COLLAB-013 — mobile/reconnect catch-up across sleep, backgrounding, and intermittent connectivity. Hard
 * assertions: missed ops (Scene projection, handout delivery, grant revocation, combat) apply in DEPENDENCY
 * order; a revoked/sealed cached handout is UNREADABLE before any stale UI can open it; a mid-stream failure
 * shows stale/reconnecting and disables durable commands that require current grants.
 */

function op(
	overrides: Partial<SyncOperation> & Pick<SyncOperation, 'id'>,
): SyncOperation {
	return {
		vaultId: 'vault-1',
		sourceId: 'local-vault',
		actorId: DM_ACTOR.id,
		entityType: 'note',
		entityId: 'note-a',
		opType: 'update',
		dependencies: [],
		issuedAt: '2026-06-05T00:00:00.000Z',
		schemaVersion: 1,
		...overrides,
	};
}

function policy(overrides: Partial<SessionCachePolicy> = {}): SessionCachePolicy {
	return {
		schemaVersion: 1,
		ttlMs: 24 * 60 * 60 * 1000,
		issuedAt: '2026-06-05T00:00:00.000Z',
		invalidatesSessionKey: true,
		persistentGrantExemptKeys: [],
		...overrides,
	};
}

describe('COLLAB-013 — mobile / reconnect catch-up ordering, sealing, and stale state', () => {
	describe('AC1 — dependency ordering of mixed missed ops', () => {
		it('orders Scene projection, handout delivery, grant revocation, and combat by dependency, not wall-clock', () => {
			// A device woke after missing: a grant revocation (op-grant) that a handout delivery (op-handout)
			// depends on, a Scene projection (op-scene), and a combat update (op-combat) that depends on the
			// projection. Supplied OUT of dependency order (wall-clock order) to prove the sort is by dependency.
			const operations = [
				op({ id: 'op-combat', opType: 'combat.advance-turn', dependencies: ['op-scene'], issuedAt: '2026-06-05T00:00:04.000Z' }),
				op({ id: 'op-handout', opType: 'session.deliver-handout', dependencies: ['op-grant'], issuedAt: '2026-06-05T00:00:03.000Z' }),
				op({ id: 'op-scene', opType: 'session.project-player-view', issuedAt: '2026-06-05T00:00:02.000Z' }),
				op({ id: 'op-grant', opType: 'permission.revoke-grant', issuedAt: '2026-06-05T00:00:01.000Z' }),
			];
			const result = orderCatchUpByDependency(operations);
			const orderedIds = result.ordered.map((o) => o.id);
			// Every dependency precedes its dependent: op-grant before op-handout; op-scene before op-combat.
			expect(orderedIds.indexOf('op-grant')).toBeLessThan(orderedIds.indexOf('op-handout'));
			expect(orderedIds.indexOf('op-scene')).toBeLessThan(orderedIds.indexOf('op-combat'));
			expect(result.held).toEqual([]);
		});

		it('counts a dependency already applied before the disconnect as satisfied', () => {
			const operations = [op({ id: 'op-2', dependencies: ['op-1'] })];
			const result = orderCatchUpByDependency(operations, new Set(['op-1']));
			expect(result.ordered.map((o) => o.id)).toEqual(['op-2']);
			expect(result.held).toEqual([]);
		});

		it('HOLDS an op with a missing dependency fail closed (never applied out of order)', () => {
			const operations = [op({ id: 'op-2', dependencies: ['op-missing'] })];
			const result = orderCatchUpByDependency(operations);
			expect(result.ordered).toEqual([]);
			expect(result.held).toHaveLength(1);
			expect(result.held[0]!.operationId).toBe('op-2');
			expect(result.held[0]!.kind).toBe('missing-dependency');
			expect(result.held[0]!.unresolvedDependencies).toEqual(['op-missing']);
		});

		it('HOLDS a dependency cycle fail closed', () => {
			const operations = [
				op({ id: 'op-a', dependencies: ['op-b'] }),
				op({ id: 'op-b', dependencies: ['op-a'] }),
			];
			const result = orderCatchUpByDependency(operations);
			expect(result.ordered).toEqual([]);
			expect(result.held.map((h) => h.operationId)).toEqual(['op-a', 'op-b']);
			expect(result.held.every((h) => h.kind === 'dependency-cycle')).toBe(true);
		});

		it('is deterministic for independent ready ops (issuedAt then id)', () => {
			const operations = [
				op({ id: 'op-z', issuedAt: '2026-06-05T00:00:01.000Z' }),
				op({ id: 'op-a', issuedAt: '2026-06-05T00:00:01.000Z' }),
				op({ id: 'op-m', issuedAt: '2026-06-05T00:00:00.000Z' }),
			];
			expect(orderCatchUpByDependency(operations).ordered.map((o) => o.id)).toEqual(['op-m', 'op-a', 'op-z']);
		});
	});

	describe('AC2 — a revoked/sealed cached handout is unreadable before stale UI can open it', () => {
		it('a REVOKED cached handout is never openable', () => {
			expect(isCachedHandoutOpenable('handout:cipher', true, policy(), '2026-06-05T01:00:00.000Z')).toBe(false);
		});

		it('an unrevoked handout becomes UNREADABLE on local sealed-cache TTL expiry, even OFFLINE', () => {
			const p = policy({ ttlMs: 60 * 60 * 1000, issuedAt: '2026-06-05T00:00:00.000Z' });
			// Within TTL: still openable.
			expect(isCachedHandoutOpenable('handout:cipher', false, p, '2026-06-05T00:30:00.000Z')).toBe(true);
			// Past TTL: sealed/unreadable before any revoke op is delivered (offline revocation, AC2).
			expect(isCachedHandoutOpenable('handout:cipher', false, p, '2026-06-05T01:30:00.000Z')).toBe(false);
		});

		it('a persistent-granted handout (exempt) stays openable past TTL', () => {
			const p = policy({ ttlMs: 60 * 60 * 1000, persistentGrantExemptKeys: ['handout:cipher'] });
			expect(isCachedHandoutOpenable('handout:cipher', false, p, '2026-06-06T00:00:00.000Z')).toBe(true);
		});

		it('a non-positive TTL seals immediately (unreadable) for a non-exempt unrevoked handout', () => {
			expect(isCachedHandoutOpenable('handout:cipher', false, policy({ ttlMs: 0 }), '2026-06-05T00:00:01.000Z')).toBe(
				false,
			);
		});
	});

	describe('AC3 — mid-stream failure shows stale/reconnecting and disables durable commands', () => {
		it('a FAILED stream shows stale-reconnecting and disables durable commands', () => {
			const state = deriveCatchUpFailureState('failed');
			expect(state.uiStatus).toBe('stale-reconnecting');
			expect(state.controlState).toBe('disabled-stale');
			expect(state.durableCommandsDisabled).toBe(true);
		});

		it('an IN-PROGRESS stream shows syncing and keeps durable commands disabled', () => {
			const state = deriveCatchUpFailureState('in-progress');
			expect(state.uiStatus).toBe('syncing');
			expect(state.controlState).toBe('disabled-syncing');
			expect(state.durableCommandsDisabled).toBe(true);
		});

		it('a COMPLETE stream re-enables durable commands', () => {
			const state = deriveCatchUpFailureState('complete');
			expect(state.uiStatus).toBe('live');
			expect(state.controlState).toBe('enabled');
			expect(state.durableCommandsDisabled).toBe(false);
		});

		it('catchUpPhase maps the reconnect control state + held ops to a stream phase (fail closed)', () => {
			// A held (unorderable) op ⇒ failed, regardless of the control state.
			expect(catchUpPhase('enabled', 1)).toBe('failed');
			expect(catchUpPhase('disabled-stale', 0)).toBe('failed');
			expect(catchUpPhase('disabled-syncing', 0)).toBe('in-progress');
			expect(catchUpPhase('enabled', 0)).toBe('complete');
		});
	});

	describe('op classification', () => {
		it('classifies each missed op kind for ordering', () => {
			expect(classifyCatchUpOp(op({ id: 'a', opType: 'session.project-player-view' }))).toBe('scene-projection');
			expect(classifyCatchUpOp(op({ id: 'b', opType: 'session.project-active-map' }))).toBe('scene-projection');
			expect(classifyCatchUpOp(op({ id: 'c', opType: 'session.deliver-handout' }))).toBe('handout');
			expect(classifyCatchUpOp(op({ id: 'd', opType: 'session.revoke-handout' }))).toBe('handout');
			expect(classifyCatchUpOp(op({ id: 'e', opType: 'permission.revoke-grant' }))).toBe('grant');
			expect(classifyCatchUpOp(op({ id: 'f', opType: 'combat.advance-turn' }))).toBe('combat');
			expect(classifyCatchUpOp(op({ id: 'g', opType: 'scene.move-widget' }))).toBe('other');
		});
	});
});
