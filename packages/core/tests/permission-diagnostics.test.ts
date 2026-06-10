import { describe, expect, it } from 'vitest';
import {
	PERMISSION_STATE_SCHEMA_VERSION,
	actorCanViewPermissionDiagnostics,
	auditAccessAttempt,
	containsSensitiveData,
	getPermissionDiagnostics,
	getPermissionDiagnosticsForDm,
	type PermissionDiagnosticsInput,
	type PermissionGrant,
	type PermissionState,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

function grant(overrides: Partial<PermissionGrant>): PermissionGrant {
	return {
		id: overrides.id ?? 'grant-1',
		entityType: overrides.entityType ?? 'note',
		entityId: overrides.entityId ?? 'note-1',
		playerActorId: overrides.playerActorId ?? PLAYER_ACTOR.id,
		capabilitySet: overrides.capabilitySet ?? 'viewer',
		createdBy: overrides.createdBy ?? DM_ACTOR.id,
		createdAt: overrides.createdAt ?? '2026-06-04T00:00:00.000Z',
	};
}

function state(grants: PermissionGrant[] = []): PermissionState {
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

// A state with a write grant on hidden content and an observer write grant — both must show up in
// the DM diagnostics with actionable remediation.
function problematicState(): PermissionState {
	return state([
		grant({
			id: 'g-hidden-write',
			entityType: 'note',
			entityId: 'secret-note',
			capabilitySet: 'section-editor',
			playerActorId: PLAYER_ACTOR.id,
		}),
		grant({
			id: 'g-obs-write',
			entityType: 'scene',
			entityId: 's-1',
			capabilitySet: 'co-editor',
			playerActorId: OBSERVER_ACTOR.id,
		}),
	]);
}

const ENTITY_INPUT: PermissionDiagnosticsInput = {
	entityConsistency: {
		entities: [
			{ entityType: 'note', entityId: 'secret-note', visibility: 'dm-only' },
			{ entityType: 'scene', entityId: 's-1', visibility: 'player-visible' },
		],
		knownEntityKeys: ['note:secret-note', 'scene:s-1'],
	},
};

describe('PERM-014: only the DM may view permission diagnostics', () => {
	it('the DM is authorized; players and observers are not', () => {
		const s = state();
		expect(actorCanViewPermissionDiagnostics(s, DM_ACTOR.id)).toBe(true);
		expect(actorCanViewPermissionDiagnostics(s, PLAYER_ACTOR.id)).toBe(false);
		expect(actorCanViewPermissionDiagnostics(s, OBSERVER_ACTOR.id)).toBe(false);
		expect(actorCanViewPermissionDiagnostics(s, 'ghost')).toBe(false);
		expect(actorCanViewPermissionDiagnostics(s, null)).toBe(false);
	});
});

describe('PERM-014 AC1: the DM sees actionable diagnostics (reference, grant, remediation)', () => {
	it('a write grant on hidden content surfaces the affected reference + remediation to the DM', () => {
		const result = getPermissionDiagnostics(problematicState(), DM_ACTOR.id, ENTITY_INPUT);
		expect(result.kind).toBe('permission-diagnostics');
		if (result.kind !== 'permission-diagnostics') return;
		const problem = result.diagnostics.find((d) => d.kind === 'write-grant-on-hidden-content');
		expect(problem).toBeDefined();
		expect(problem?.grantId).toBe('g-hidden-write');
		expect(problem?.entityType).toBe('note');
		expect(problem?.entityId).toBe('secret-note');
		expect(problem?.remediation.length).toBeGreaterThan(0);
		expect(result.hasErrors).toBe(true);
	});

	it('folds role/grant consistency, entity consistency, and denied-access into one DM view', () => {
		const denied = auditAccessAttempt(
			state(),
			{ actorId: PLAYER_ACTOR.id, entityType: 'note', entityId: 'secret-note', access: 'read' },
			[{ entityType: 'note', entityId: 'secret-note', visibility: 'dm-only' }],
		);
		const deniedRecords = denied.kind === 'denied' ? [denied.audit] : [];
		const result = getPermissionDiagnosticsForDm(problematicState(), DM_ACTOR.id, {
			...ENTITY_INPUT,
			deniedAccess: deniedRecords,
		});
		const categories = new Set(result.diagnostics.map((d) => d.category));
		expect(categories.has('grant-consistency')).toBe(true);
		expect(categories.has('entity-consistency')).toBe(true);
		expect(categories.has('denied-access')).toBe(true);
		// Errors are ordered before warnings.
		const firstWarningIndex = result.diagnostics.findIndex((d) => d.severity === 'warning');
		const lastErrorIndex = result.diagnostics.map((d) => d.severity).lastIndexOf('error');
		if (firstWarningIndex !== -1 && lastErrorIndex !== -1) {
			expect(lastErrorIndex).toBeLessThan(firstWarningIndex);
		}
	});
});

describe('PERM-014 AC2: a non-DM sees only a generic reason — no leak', () => {
	it('a player gets a redacted unavailable view with no diagnostics array', () => {
		const result = getPermissionDiagnostics(problematicState(), PLAYER_ACTOR.id, ENTITY_INPUT);
		expect(result.kind).toBe('permission-diagnostics-redacted');
		if (result.kind !== 'permission-diagnostics-redacted') return;
		expect(result.reason).toBe('unavailable');
		// The redacted view exposes NOTHING about the underlying problems.
		expect(Object.keys(result)).toEqual(['kind', 'reason', 'message']);
		expect(result.message).not.toContain('secret-note');
		expect(JSON.stringify(result)).not.toContain('secret-note');
		expect(JSON.stringify(result)).not.toContain('g-hidden-write');
	});

	it('an observer also gets only a generic redacted view', () => {
		const result = getPermissionDiagnostics(problematicState(), OBSERVER_ACTOR.id, ENTITY_INPUT);
		expect(result.kind).toBe('permission-diagnostics-redacted');
		if (result.kind !== 'permission-diagnostics-redacted') return;
		expect(result.reason).toBe('unavailable');
	});

	it('an unknown/unauthenticated actor gets an unauthorized view', () => {
		for (const id of ['ghost', null, undefined, '']) {
			const result = getPermissionDiagnostics(problematicState(), id, ENTITY_INPUT);
			expect(result.kind).toBe('permission-diagnostics-redacted');
			if (result.kind !== 'permission-diagnostics-redacted') continue;
			expect(result.reason).toBe('unauthorized');
		}
	});

	it('ADVERSARIAL: no actor-scoped result of any kind leaks the hidden entity reference', () => {
		for (const id of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id, 'ghost', null]) {
			const result = getPermissionDiagnostics(problematicState(), id, ENTITY_INPUT);
			const serialized = JSON.stringify(result);
			expect(serialized).not.toContain('secret-note');
			expect(serialized).not.toContain('g-hidden-write');
			expect(containsSensitiveData(result)).toBe(false);
		}
	});
});

describe('PERM-014: a clean state yields an empty DM diagnostics view', () => {
	it('no problems means no diagnostics and no errors', () => {
		const result = getPermissionDiagnostics(state(), DM_ACTOR.id, {
			entityConsistency: { entities: [] },
		});
		expect(result.kind).toBe('permission-diagnostics');
		if (result.kind !== 'permission-diagnostics') return;
		expect(result.diagnostics).toHaveLength(0);
		expect(result.hasErrors).toBe(false);
		expect(result.errorCount).toBe(0);
		expect(result.warningCount).toBe(0);
	});
});
