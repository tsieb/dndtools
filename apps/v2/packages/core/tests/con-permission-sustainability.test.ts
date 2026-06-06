import { describe, expect, it } from 'vitest';
import {
	CAPABILITY_SET_SCHEMA,
	CAPABILITY_SET_SUSTAINABILITY_VERSION,
	MAX_CAPABILITY_SETS_PER_ENTITY_TYPE,
	RAW_FIELD_LIST_SIGNAL_KEYS,
	auditCapabilitySetGovernance,
	dispatchCommand,
	findRawFieldListGrant,
	isGovernedCapabilitySet,
	isRawFieldListGrant,
	summarizeCapabilitySetGovernance,
	type CapabilitySet,
	type CapabilitySetGovernanceProblem,
	type CoreCommand,
} from '../src';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';

/**
 * CON-004 — THE PERMISSION-SUSTAINABILITY CONSTRAINT GATE. CON-004's statement: "The system must never
 * allow per-instance raw field-list grants to replace schema-defined capability sets for player
 * permissions." Its acceptance criteria:
 *
 *   AC1 — Given a grant command contains a RAW FIELD LIST, when validated, then it is REJECTED.
 *   AC2 — Given the DM needs a new permission grouping, when supported, then it is added as a NAMED
 *         schema-defined capability set for that entity type.
 *
 * This file IS the gate. It mirrors the established mechanical-gate meta-tests (SEC-008 regression-gate
 * coverage, PERF-001 budget registry): the constraint is the single source of truth, and reality is
 * cross-checked against it so the named-capability-set model can never silently drift into a per-instance
 * field-list surface. The adversarial blocks at the bottom prove the gate goes RED on a deliberate
 * sustainability violation and GREEN on the real model.
 */

function grantCommand(payload: Record<string, unknown>, actorId = DM_ACTOR.id): CoreCommand {
	return { type: 'permission.grant-capability-set', actorId, payload };
}

function transferCommand(payload: Record<string, unknown>, actorId = DM_ACTOR.id): CoreCommand {
	return { type: 'permission.transfer-ownership', actorId, payload };
}

function kinds(problems: CapabilitySetGovernanceProblem[]): string[] {
	return problems.map((p) => p.kind).sort();
}

describe('CON-004 AC1 — a grant command containing a raw field list is rejected (fail closed)', () => {
	it('rejects a grant payload carrying a `fields` raw field-list key', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			grantCommand({
				entityType: 'character',
				entityId: 'char-1',
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'owner',
				// The forbidden drift: a per-instance raw field list smuggled into the grant.
				fields: ['hp', 'name', 'backstory'],
			}),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.rejection.message).toMatch(/CON-004/);
		expect(result.rejection.message).toMatch(/raw field-list|field-list grant/i);
	});

	it('rejects every declared raw-field-list signal key', () => {
		const env = makeEnvironment();
		for (const key of RAW_FIELD_LIST_SIGNAL_KEYS) {
			const result = dispatchCommand(
				buildInitialState(DM_ACTOR, PLAYER_ACTOR),
				env,
				grantCommand({
					entityType: 'character',
					entityId: 'char-1',
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'owner',
					[key]: ['some', 'fields'],
				}),
			);
			expect(result.status, `key "${key}" should be rejected`).toBe('rejected');
		}
	});

	it('rejects a separator-variant field-list key (case/dash/underscore insensitive)', () => {
		const env = makeEnvironment();
		for (const variant of ['allowed_fields', 'Allowed-Fields', 'FIELDLIST']) {
			const result = dispatchCommand(
				buildInitialState(DM_ACTOR, PLAYER_ACTOR),
				env,
				grantCommand({
					entityType: 'character',
					entityId: 'char-1',
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'owner',
					[variant]: ['hp'],
				}),
			);
			expect(result.status, `variant "${variant}" should be rejected`).toBe('rejected');
		}
	});

	it('rejects a `capabilitySet` that is a LIST of fields/sets rather than one named set', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			grantCommand({
				entityType: 'character',
				entityId: 'char-1',
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: ['hp', 'conditions'],
			}),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/CON-004/);
	});

	it('rejects a `capabilitySet` that is a structured field map rather than one named set', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			grantCommand({
				entityType: 'character',
				entityId: 'char-1',
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: { hp: 'write', name: 'read' },
			}),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/CON-004/);
	});

	it('also enforces the raw-field-list rejection on the ownership-transfer command', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			transferCommand({
				entityType: 'character',
				entityId: 'char-1',
				toPlayerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'owner',
				fieldGrants: ['hp'],
			}),
		);
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.message).toMatch(/CON-004/);
	});

	it('still ACCEPTS a clean single named-capability-set grant (the model is not broken)', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(
			buildInitialState(DM_ACTOR, PLAYER_ACTOR),
			env,
			grantCommand({
				entityType: 'character',
				entityId: 'char-1',
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'combat-participant',
			}),
		);
		expect(result.status).toBe('accepted');
	});
});

describe('CON-004 AC1 — findRawFieldListGrant detector (pure)', () => {
	it('returns null for a clean named-set grant payload', () => {
		expect(
			findRawFieldListGrant({
				entityType: 'character',
				entityId: 'char-1',
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'owner',
			}),
		).toBeNull();
		expect(isRawFieldListGrant({ capabilitySet: 'owner' })).toBe(false);
	});

	it('flags a field-list-shaped key with a CON-004 reason', () => {
		const finding = findRawFieldListGrant({ capabilitySet: 'owner', allowedFields: ['hp'] });
		expect(finding?.kind).toBe('field-list-key');
		expect(finding?.key).toBe('allowedFields');
		expect(finding?.message).toMatch(/CON-004/);
	});

	it('flags a non-name capabilitySet (array / object / blank)', () => {
		expect(findRawFieldListGrant({ capabilitySet: ['a', 'b'] })?.kind).toBe('capability-set-not-a-name');
		expect(findRawFieldListGrant({ capabilitySet: { a: 1 } })?.kind).toBe('capability-set-not-a-name');
		expect(findRawFieldListGrant({ capabilitySet: '   ' })?.kind).toBe('capability-set-not-a-name');
	});

	it('returns null for a non-object payload (the command schema rejects those earlier)', () => {
		expect(findRawFieldListGrant(null)).toBeNull();
		expect(findRawFieldListGrant('owner')).toBeNull();
		expect(findRawFieldListGrant(42)).toBeNull();
	});

	it('is deterministic — identical input yields identical findings', () => {
		const payload = { capabilitySet: 'owner', fields: ['x'] };
		expect(findRawFieldListGrant(payload)).toEqual(findRawFieldListGrant(payload));
	});
});

describe('CON-004 AC2 + sustainability — the real capability-set model is bounded and governed (GREEN)', () => {
	it('the real schema passes the governance audit with no problems', () => {
		const problems = auditCapabilitySetGovernance();
		expect(problems, `governance problems: ${problems.map((p) => p.message).join('; ')}`).toEqual([]);
	});

	it('no entity type exceeds the sustainability cap', () => {
		for (const [entityType, sets] of Object.entries(CAPABILITY_SET_SCHEMA)) {
			expect(sets.length, `"${entityType}" exceeds the cap`).toBeLessThanOrEqual(
				MAX_CAPABILITY_SETS_PER_ENTITY_TYPE,
			);
		}
	});

	it('every grantable set in the real schema is a GOVERNED named set (AC2 supported path)', () => {
		for (const [entityType, sets] of Object.entries(CAPABILITY_SET_SCHEMA)) {
			for (const set of sets) {
				expect(isGovernedCapabilitySet(entityType, set), `"${entityType}/${set}" is not governed`).toBe(
					true,
				);
			}
		}
	});

	it('a raw field name is NOT a governed capability set (the constraint holds)', () => {
		expect(isGovernedCapabilitySet('character', 'hp')).toBe(false);
		expect(isGovernedCapabilitySet('character', '')).toBe(false);
		expect(isGovernedCapabilitySet('made-up-type', 'owner')).toBe(false);
	});

	it('summarizes the governed model as within bound', () => {
		const summary = summarizeCapabilitySetGovernance();
		expect(summary.governed).toBe(true);
		expect(summary.maxSetsPerEntityType).toBe(MAX_CAPABILITY_SETS_PER_ENTITY_TYPE);
		expect(summary.entityTypeCount).toBeGreaterThan(0);
		expect(summary.totalCapabilitySets).toBeGreaterThan(0);
	});

	it('exposes a constraint-registry version', () => {
		expect(CAPABILITY_SET_SUSTAINABILITY_VERSION).toBe(1);
	});
});

describe('CON-004 sustainability — the gate goes RED on a deliberate violation (adversarial)', () => {
	it('RED: an entity type that exceeds the per-type cap is flagged as too-many-sets', () => {
		const overGrown: Record<string, readonly CapabilitySet[]> = {
			// Nine ad-hoc field-named "sets" — exactly the unmanageable surface CON-004 forbids.
			character: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
		};
		const problems = auditCapabilitySetGovernance(overGrown);
		expect(kinds(problems)).toContain('too-many-sets');
	});

	it('RED: a blank/unnamed set is flagged as blank-set-name', () => {
		const blank: Record<string, readonly CapabilitySet[]> = {
			character: ['owner', '   '],
		};
		expect(kinds(auditCapabilitySetGovernance(blank))).toContain('blank-set-name');
	});

	it('RED: a duplicate set name is flagged as duplicate-set-name', () => {
		const dup: Record<string, readonly CapabilitySet[]> = {
			character: ['owner', 'owner'],
		};
		expect(kinds(auditCapabilitySetGovernance(dup))).toContain('duplicate-set-name');
	});

	it('GREEN again: a small, well-named fixture schema passes the audit', () => {
		const fine: Record<string, readonly CapabilitySet[]> = {
			character: ['owner', 'viewer'],
		};
		expect(auditCapabilitySetGovernance(fine)).toEqual([]);
	});

	it('is deterministic — identical violating input yields identical problems', () => {
		const bad: Record<string, readonly CapabilitySet[]> = { character: ['owner', 'owner', '  '] };
		expect(auditCapabilitySetGovernance(bad)).toEqual(auditCapabilitySetGovernance(bad));
	});
});
