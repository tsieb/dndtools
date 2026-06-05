import { describe, expect, it } from 'vitest';
import {
	PERMISSION_STATE_SCHEMA_VERSION,
	auditEntityPermissionConsistency,
	containsSensitiveData,
	type ConsistencyEntityRecord,
	type EntityConsistencyInput,
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

function entity(overrides: Partial<ConsistencyEntityRecord>): ConsistencyEntityRecord {
	return {
		entityType: overrides.entityType ?? 'note',
		entityId: overrides.entityId ?? 'note-1',
		visibility: overrides.visibility ?? 'player-visible',
		sharedWith: overrides.sharedWith,
	};
}

describe('PERM-007: write grant on non-visible content', () => {
	it('AC1: a player write grant on a dm-only note is reported to the DM', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityId: 'secret-note', visibility: 'dm-only' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-hidden-write',
					entityType: 'note',
					entityId: 'secret-note',
					capabilitySet: 'section-editor',
				}),
			]),
			input,
		);
		expect(report.hasErrors).toBe(true);
		const problem = report.problems.find((p) => p.grantId === 'g-hidden-write');
		expect(problem?.kind).toBe('write-grant-on-hidden-content');
		expect(problem?.severity).toBe('error');
		expect(problem?.entityId).toBe('secret-note');
	});

	it('a player write grant on a `shared` note NOT shared with them is reported', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityId: 'shared-note', visibility: 'shared', sharedWith: ['someone'] })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-shared-write',
					entityType: 'note',
					entityId: 'shared-note',
					capabilitySet: 'contributor',
				}),
			]),
			input,
		);
		expect(report.problems.some((p) => p.kind === 'write-grant-on-hidden-content')).toBe(true);
	});

	it('a player write grant on content visible to them is NOT reported', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityId: 'note-ok', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-ok',
					entityType: 'note',
					entityId: 'note-ok',
					capabilitySet: 'section-editor',
				}),
			]),
			input,
		);
		expect(report.problems.filter((p) => p.kind === 'write-grant-on-hidden-content')).toHaveLength(
			0,
		);
	});

	it('a READ-only (viewer) grant on dm-only content is NOT a write-grant problem', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityId: 'dm-note', visibility: 'dm-only' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({ id: 'g-view', entityType: 'note', entityId: 'dm-note', capabilitySet: 'viewer' }),
			]),
			input,
		);
		expect(report.problems.filter((p) => p.kind === 'write-grant-on-hidden-content')).toHaveLength(
			0,
		);
	});
});

describe('PERM-007: unknown capability set', () => {
	it('reports a grant with a capability set not defined for the entity type', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'widget', entityId: 'w-1', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-bad-cap',
					entityType: 'widget',
					entityId: 'w-1',
					capabilitySet: 'co-editor', // scene set, invalid for widget
				}),
			]),
			input,
		);
		const problem = report.problems.find((p) => p.kind === 'unknown-capability-set');
		expect(problem?.grantId).toBe('g-bad-cap');
		expect(problem?.capabilitySet).toBe('co-editor');
	});

	it('ADVERSARIAL: a forged garbage capability set is reported as unknown', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'note', entityId: 'note-1', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-garbage',
					entityType: 'note',
					entityId: 'note-1',
					capabilitySet: 'do-anything-9000' as never,
				}),
			]),
			input,
		);
		expect(report.problems.some((p) => p.kind === 'unknown-capability-set')).toBe(true);
	});

	it('a valid capability set for the entity type is NOT reported as unknown', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'character', entityId: 'c-1', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-owner',
					entityType: 'character',
					entityId: 'c-1',
					capabilitySet: 'owner',
					playerActorId: PLAYER_ACTOR.id,
				}),
			]),
			input,
		);
		expect(report.problems.filter((p) => p.kind === 'unknown-capability-set')).toHaveLength(0);
	});
});

describe('PERM-007: grant references a deleted/unavailable entity', () => {
	it('reports a grant whose target is absent from the known entity keys', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityId: 'note-live', visibility: 'player-visible' })],
			knownEntityKeys: ['note:note-live'],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-deleted',
					entityType: 'note',
					entityId: 'note-gone',
					capabilitySet: 'viewer',
				}),
			]),
			input,
		);
		const problem = report.problems.find((p) => p.kind === 'grant-references-deleted-entity');
		expect(problem?.entityId).toBe('note-gone');
	});

	it('treats an entity with a visibility record as known by default', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityId: 'note-1', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([grant({ id: 'g-1', entityType: 'note', entityId: 'note-1', capabilitySet: 'viewer' })]),
			input,
		);
		expect(report.problems.filter((p) => p.kind === 'grant-references-deleted-entity')).toHaveLength(
			0,
		);
	});
});

describe('PERM-007: multiple character owners', () => {
	it('reports a character with two distinct owner grants', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'character', entityId: 'hero', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-owner-a',
					entityType: 'character',
					entityId: 'hero',
					capabilitySet: 'owner',
					playerActorId: PLAYER_ACTOR.id,
				}),
				grant({
					id: 'g-owner-b',
					entityType: 'character',
					entityId: 'hero',
					capabilitySet: 'owner',
					playerActorId: 'actor-player-2',
				}),
			]),
			input,
		);
		const problem = report.problems.find((p) => p.kind === 'multiple-character-owners');
		expect(problem).toBeDefined();
		expect(problem?.entityId).toBe('hero');
	});

	it('does NOT report a single owner grant', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'character', entityId: 'hero', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-owner',
					entityType: 'character',
					entityId: 'hero',
					capabilitySet: 'owner',
					playerActorId: PLAYER_ACTOR.id,
				}),
			]),
			input,
		);
		expect(report.problems.filter((p) => p.kind === 'multiple-character-owners')).toHaveLength(0);
	});
});

describe('PERM-007: observer write grant (entity audit)', () => {
	it('reports an observer write grant', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'scene', entityId: 's-1', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-obs-write',
					entityType: 'scene',
					entityId: 's-1',
					capabilitySet: 'co-editor',
					playerActorId: OBSERVER_ACTOR.id,
				}),
			]),
			input,
		);
		expect(report.problems.some((p) => p.kind === 'observer-write-grant')).toBe(true);
	});
});

describe('PERM-007 AC2: hidden widget binding in a player-view', () => {
	it('reports a player-view widget bound to dm-only data', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'note', entityId: 'secret', visibility: 'dm-only' })],
			playerViewWidgetBindings: [
				{
					sceneId: 'scene-1',
					playerActorId: PLAYER_ACTOR.id,
					widgetInstanceId: 'w-1',
					boundEntityType: 'note',
					boundEntityId: 'secret',
				},
			],
		};
		const report = auditEntityPermissionConsistency(state(), input);
		const problem = report.problems.find(
			(p) => p.kind === 'hidden-widget-binding-in-player-view',
		);
		expect(problem).toBeDefined();
		expect(problem?.widgetInstanceId).toBe('w-1');
		expect(problem?.entityId).toBe('secret');
	});

	it('does NOT report a player-view widget bound to player-visible data', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'note', entityId: 'public', visibility: 'player-visible' })],
			playerViewWidgetBindings: [
				{
					sceneId: 'scene-1',
					playerActorId: PLAYER_ACTOR.id,
					widgetInstanceId: 'w-2',
					boundEntityType: 'note',
					boundEntityId: 'public',
				},
			],
		};
		const report = auditEntityPermissionConsistency(state(), input);
		expect(
			report.problems.filter((p) => p.kind === 'hidden-widget-binding-in-player-view'),
		).toHaveLength(0);
	});

	it('ADVERSARIAL: a widget bound to a `shared` entity not shared with the player is reported', () => {
		const input: EntityConsistencyInput = {
			entities: [
				entity({
					entityType: 'note',
					entityId: 'shared-note',
					visibility: 'shared',
					sharedWith: ['other-player'],
				}),
			],
			playerViewWidgetBindings: [
				{
					sceneId: 'scene-1',
					playerActorId: PLAYER_ACTOR.id,
					widgetInstanceId: 'w-3',
					boundEntityType: 'note',
					boundEntityId: 'shared-note',
				},
			],
		};
		const report = auditEntityPermissionConsistency(state(), input);
		expect(report.problems.some((p) => p.kind === 'hidden-widget-binding-in-player-view')).toBe(
			true,
		);
	});

	it('ADVERSARIAL: a widget bound to an entity with NO visibility record fails closed (reported)', () => {
		const input: EntityConsistencyInput = {
			entities: [],
			playerViewWidgetBindings: [
				{
					sceneId: 'scene-1',
					playerActorId: PLAYER_ACTOR.id,
					widgetInstanceId: 'w-4',
					boundEntityType: 'note',
					boundEntityId: 'unknown',
				},
			],
		};
		const report = auditEntityPermissionConsistency(state(), input);
		expect(report.problems.some((p) => p.kind === 'hidden-widget-binding-in-player-view')).toBe(
			true,
		);
	});
});

describe('PERM-007 / PERM-014: consistency problems never leak hidden content', () => {
	it('no problem carries a title or field value — only references and generic remediation', () => {
		const input: EntityConsistencyInput = {
			entities: [
				entity({ entityType: 'note', entityId: 'secret', visibility: 'dm-only' }),
				entity({ entityType: 'character', entityId: 'hero', visibility: 'player-visible' }),
			],
			knownEntityKeys: ['note:secret', 'character:hero'],
			playerViewWidgetBindings: [
				{
					sceneId: 'scene-1',
					playerActorId: PLAYER_ACTOR.id,
					widgetInstanceId: 'w-1',
					boundEntityType: 'note',
					boundEntityId: 'secret',
				},
			],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-hidden-write',
					entityType: 'note',
					entityId: 'secret',
					capabilitySet: 'section-editor',
				}),
				grant({
					id: 'g-owner-a',
					entityType: 'character',
					entityId: 'hero',
					capabilitySet: 'owner',
					playerActorId: PLAYER_ACTOR.id,
				}),
				grant({
					id: 'g-owner-b',
					entityType: 'character',
					entityId: 'hero',
					capabilitySet: 'owner',
					playerActorId: 'actor-player-2',
				}),
			]),
			input,
		);
		expect(report.problems.length).toBeGreaterThan(0);
		for (const problem of report.problems) {
			// Remediation is generic and never contains a secret-shaped token / path.
			expect(containsSensitiveData(problem.remediation)).toBe(false);
			// The only entity-derived data is the type/id reference — assert the shape carries no
			// `title`/`value`/`content` fields.
			expect(Object.keys(problem)).not.toContain('title');
			expect(Object.keys(problem)).not.toContain('value');
			expect(Object.keys(problem)).not.toContain('content');
		}
	});

	it('a clean state produces no problems', () => {
		const input: EntityConsistencyInput = {
			entities: [entity({ entityType: 'note', entityId: 'note-1', visibility: 'player-visible' })],
		};
		const report = auditEntityPermissionConsistency(
			state([
				grant({
					id: 'g-ok',
					entityType: 'note',
					entityId: 'note-1',
					capabilitySet: 'section-editor',
					playerActorId: PLAYER_ACTOR.id,
				}),
			]),
			input,
		);
		expect(report.hasErrors).toBe(false);
		expect(report.problems).toHaveLength(0);
	});
});
