import { describe, expect, it } from 'vitest';
import {
	DEFAULT_VISIBILITY,
	evaluateVisibility,
	filterEntityForActor,
	isEntityVisibleToActor,
	normalizeVisibilityLevel,
	PERMISSION_STATE_SCHEMA_VERSION,
	type EntityVisibilityMetadata,
	type FilterableContent,
	type PermissionState,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

const PLAYER_B = { id: 'actor-player-b', role: 'player' as const, displayName: 'Player B' };

function state(extraGrants: PermissionState['grants'] = []): PermissionState {
	return {
		actors: {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[PLAYER_B.id]: PLAYER_B,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants: extraGrants,
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

// A note whose TITLE/CONTENT must never leak. Field/section ids themselves are content that the
// non-leak tests assert never appear in a non-DM payload.
const SECRET_NOTE_ID = 'note-villain-secret';

function noteMeta(over: Partial<EntityVisibilityMetadata> = {}): EntityVisibilityMetadata {
	return { entityType: 'note', entityId: SECRET_NOTE_ID, ...over };
}

const FULL_CONTENT: FilterableContent = {
	sectionIds: ['intro', 'secret-plans', 'public-notes'],
	fields: {
		'note.title': 'The Lich King Rises',
		'note.summary': 'A public summary',
		'note.dmNotes': 'The lich is the mayor in disguise',
	},
};

describe('PERM-002: visibility levels + pre-read evaluation (fail closed)', () => {
	it('default/absent visibility fails closed to dm-only for every non-DM', () => {
		expect(DEFAULT_VISIBILITY).toBe('dm-only');
		const meta = noteMeta(); // no entity rule at all
		expect(isEntityVisibleToActor(meta, PLAYER_ACTOR, state())).toBe(false);
		expect(isEntityVisibleToActor(meta, OBSERVER_ACTOR, state())).toBe(false);
		expect(isEntityVisibleToActor(meta, DM_ACTOR, state())).toBe(true);
	});

	it('normalizeVisibilityLevel coerces unknown/malformed values to dm-only', () => {
		expect(normalizeVisibilityLevel('player-visible')).toBe('player-visible');
		expect(normalizeVisibilityLevel('shared')).toBe('shared');
		expect(normalizeVisibilityLevel('dm-only')).toBe('dm-only');
		// adversarial / malformed
		expect(normalizeVisibilityLevel('public')).toBe('dm-only');
		expect(normalizeVisibilityLevel('PLAYER-VISIBLE')).toBe('dm-only');
		expect(normalizeVisibilityLevel(undefined)).toBe('dm-only');
		expect(normalizeVisibilityLevel(null)).toBe('dm-only');
		expect(normalizeVisibilityLevel(42)).toBe('dm-only');
		expect(normalizeVisibilityLevel({ level: 'player-visible' })).toBe('dm-only');
	});

	// AC1: a dm-only note queried by a player returns NO content — indistinguishable from not-found.
	it('AC1: a player querying a dm-only note gets the empty hidden result — no titles/values/counts', () => {
		const meta = noteMeta({ entity: { level: 'dm-only' } });
		const result = filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state());
		expect(result.visible).toBe(false);
		expect(result.hiddenReason).toBe('dm-only');
		expect(result.visibleSectionIds).toEqual([]);
		expect(result.visibleFields).toEqual({});
		// Non-leak: no section ids, no field keys, no counts of redacted content reach the actor.
		expect(result.redactedSectionIds).toEqual([]);
		expect(result.redactedFieldPaths).toEqual([]);
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('secret-plans');
		expect(serialized).not.toContain('Lich King');
		expect(serialized).not.toContain('dmNotes');
		expect(serialized).not.toContain('mayor');
	});

	it('player-visible content is readable by any authenticated player and observer', () => {
		const meta = noteMeta({ entity: { level: 'player-visible' } });
		const player = filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state());
		expect(player.visible).toBe(true);
		expect(player.visibleFields['note.title']).toBe('The Lich King Rises');
		expect(filterEntityForActor(meta, FULL_CONTENT, OBSERVER_ACTOR, state()).visible).toBe(true);
	});

	it('DM always receives the full, unredacted content', () => {
		const meta = noteMeta({
			entity: { level: 'player-visible' },
			fields: { 'note.dmNotes': { level: 'dm-only' } },
			sections: { 'secret-plans': { level: 'dm-only' } },
		});
		const dm = filterEntityForActor(meta, FULL_CONTENT, DM_ACTOR, state());
		expect(dm.visible).toBe(true);
		expect(dm.visibleSectionIds).toEqual(['intro', 'secret-plans', 'public-notes']);
		expect(dm.visibleFields['note.dmNotes']).toBe('The lich is the mayor in disguise');
		expect(dm.redactedFieldPaths).toEqual([]);
	});

	it('an unknown/unauthenticated actor receives the empty hidden result (unknown-actor)', () => {
		const meta = noteMeta({ entity: { level: 'player-visible' } });
		const result = filterEntityForActor(meta, FULL_CONTENT, undefined, state());
		expect(result.visible).toBe(false);
		expect(result.hiddenReason).toBe('unknown-actor');
		expect(result.visibleFields).toEqual({});
	});
});

describe('PERM-002: shared means delivery-only, not general readability', () => {
	it('AC4: shared content delivered to Player A is hidden from Player B (no assignment/grant)', () => {
		const meta = noteMeta({ entity: { level: 'shared', sharedWith: [PLAYER_ACTOR.id] } });
		const a = filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state());
		expect(a.visible).toBe(true);
		const b = filterEntityForActor(meta, FULL_CONTENT, PLAYER_B, state());
		expect(b.visible).toBe(false);
		expect(b.hiddenReason).toBe('not-shared');
		expect(JSON.stringify(b)).not.toContain('Lich King');
	});

	it('shared content with NO delivery channel is hidden from everyone non-DM (like dm-only)', () => {
		const meta = noteMeta({ entity: { level: 'shared' } });
		expect(filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state()).visible).toBe(false);
		expect(filterEntityForActor(meta, FULL_CONTENT, PLAYER_B, state()).visible).toBe(false);
	});

	it('shared content is delivered through a viewer-capable grant', () => {
		const meta = noteMeta({ entity: { level: 'shared' } });
		const grants = [
			{
				id: 'g-view',
				entityType: 'note' as const,
				entityId: SECRET_NOTE_ID,
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'viewer' as const,
				createdBy: DM_ACTOR.id,
				createdAt: '2026-06-03T00:00:00.000Z',
			},
		];
		expect(filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state(grants)).visible).toBe(
			true,
		);
		// Player B has no grant -> still hidden.
		expect(filterEntityForActor(meta, FULL_CONTENT, PLAYER_B, state(grants)).visible).toBe(false);
	});

	it('an editor (section-editor) grant inherits viewer and thus delivers shared content', () => {
		const meta = noteMeta({ entity: { level: 'shared' } });
		const grants = [
			{
				id: 'g-edit',
				entityType: 'note' as const,
				entityId: SECRET_NOTE_ID,
				playerActorId: PLAYER_ACTOR.id,
				capabilitySet: 'section-editor' as const,
				createdBy: DM_ACTOR.id,
				createdAt: '2026-06-03T00:00:00.000Z',
			},
		];
		expect(filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state(grants)).visible).toBe(
			true,
		);
	});
});

describe('PERM-003: granularity + specificity precedence (field > section > entity)', () => {
	it('AC1: a dm-only field inside a player-visible entity is omitted; the entity stays visible', () => {
		const meta = noteMeta({
			entity: { level: 'player-visible' },
			fields: { 'note.dmNotes': { level: 'dm-only' } },
		});
		const result = filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state());
		expect(result.visible).toBe(true);
		expect(result.visibleFields).toHaveProperty('note.title');
		expect(result.visibleFields).not.toHaveProperty('note.dmNotes');
		expect(result.redactedFieldPaths).toEqual(['note.dmNotes']);
		// The omitted field's VALUE must never appear in the actor payload.
		expect(JSON.stringify(result.visibleFields)).not.toContain('mayor');
	});

	it('AC2: when section and field metadata conflict, the field rule wins', () => {
		// Section is player-visible but the field within it is dm-only -> field hidden.
		const metaFieldNarrower = noteMeta({
			entity: { level: 'player-visible' },
			sections: { 'secret-plans': { level: 'player-visible' } },
			fields: { 'plan.detail': { level: 'dm-only' } },
			fieldSections: { 'plan.detail': 'secret-plans' },
		});
		expect(
			evaluateVisibility(
				metaFieldNarrower,
				{ fieldPath: 'plan.detail' },
				PLAYER_ACTOR,
				state(),
			).visible,
		).toBe(false);

		// Section is dm-only but the field re-grants to player-visible -> hidden ancestor STILL wins.
		const metaFieldWider = noteMeta({
			entity: { level: 'player-visible' },
			sections: { 'secret-plans': { level: 'dm-only' } },
			fields: { 'plan.detail': { level: 'player-visible' } },
			fieldSections: { 'plan.detail': 'secret-plans' },
		});
		const decision = evaluateVisibility(
			metaFieldWider,
			{ fieldPath: 'plan.detail' },
			PLAYER_ACTOR,
			state(),
		);
		expect(decision.visible).toBe(false);
		if (!decision.visible) expect(decision.reason).toBe('hidden-ancestor');
	});

	it('a visible field inside a hidden entity stays hidden (hidden ancestor wins)', () => {
		const meta = noteMeta({
			entity: { level: 'dm-only' },
			fields: { 'note.title': { level: 'player-visible' } },
		});
		const decision = evaluateVisibility(meta, { fieldPath: 'note.title' }, PLAYER_ACTOR, state());
		expect(decision.visible).toBe(false);
		if (!decision.visible) {
			expect(decision.reason).toBe('hidden-ancestor');
			expect(decision.scope).toBe('entity');
		}
		// The whole entity filters to empty regardless of the per-field re-grant.
		const filtered = filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state());
		expect(filtered.visible).toBe(false);
		expect(filtered.visibleFields).toEqual({});
	});

	it('a hidden field inside a visible section inside a visible entity stays hidden', () => {
		const meta = noteMeta({
			entity: { level: 'player-visible' },
			sections: { 'secret-plans': { level: 'player-visible' } },
			fields: { 'plan.cipher': { level: 'dm-only' } },
			fieldSections: { 'plan.cipher': 'secret-plans' },
		});
		expect(
			evaluateVisibility(meta, { sectionId: 'secret-plans' }, PLAYER_ACTOR, state()).visible,
		).toBe(true);
		expect(
			evaluateVisibility(meta, { fieldPath: 'plan.cipher' }, PLAYER_ACTOR, state()).visible,
		).toBe(false);
	});

	it('section-level dm-only hides the section and every field attributed to it', () => {
		const meta = noteMeta({
			entity: { level: 'player-visible' },
			sections: { 'secret-plans': { level: 'dm-only' } },
			fieldSections: { 'plan.a': 'secret-plans', 'plan.b': 'secret-plans' },
		});
		const content: FilterableContent = {
			sectionIds: ['intro', 'secret-plans'],
			fields: { 'plan.a': 'x', 'plan.b': 'y', 'intro.text': 'visible' },
		};
		const result = filterEntityForActor(meta, content, PLAYER_ACTOR, state());
		expect(result.visible).toBe(true);
		expect(result.visibleSectionIds).toEqual(['intro']);
		expect(result.redactedSectionIds).toEqual(['secret-plans']);
		expect(Object.keys(result.visibleFields)).toEqual(['intro.text']);
		expect(result.redactedFieldPaths.sort()).toEqual(['plan.a', 'plan.b']);
	});

	it('exhaustive nesting matrix: child can only narrow, never widen, an ancestor', () => {
		const levels = ['dm-only', 'player-visible', 'shared'] as const;
		for (const entityLevel of levels) {
			for (const fieldLevel of levels) {
				const meta = noteMeta({
					entity: { level: entityLevel },
					fields: { 'f.x': { level: fieldLevel } },
				});
				const decision = evaluateVisibility(meta, { fieldPath: 'f.x' }, PLAYER_ACTOR, state());
				// A non-DM player with no shared delivery: visible iff BOTH entity and field are
				// player-visible. dm-only or undelivered shared at either level => hidden.
				const entityVisible = entityLevel === 'player-visible';
				const fieldVisible = fieldLevel === 'player-visible';
				expect(decision.visible).toBe(entityVisible && fieldVisible);
			}
		}
	});
});

describe('PERM-002 non-leak: redaction is reported to DM tooling but never to the actor payload', () => {
	it('redacted keys/values are absent from visibleFields and from visibleSectionIds', () => {
		const meta = noteMeta({
			entity: { level: 'player-visible' },
			sections: { 'secret-plans': { level: 'dm-only' } },
			fields: { 'note.dmNotes': { level: 'dm-only' } },
		});
		const result = filterEntityForActor(meta, FULL_CONTENT, PLAYER_ACTOR, state());
		// What the actor would actually receive: the visible surface only.
		const actorPayload = JSON.stringify({
			sections: result.visibleSectionIds,
			fields: result.visibleFields,
		});
		expect(actorPayload).not.toContain('secret-plans');
		expect(actorPayload).not.toContain('dmNotes');
		expect(actorPayload).not.toContain('mayor');
		// The DM-facing redaction report still names them (for diagnostics), separately.
		expect(result.redactedSectionIds).toContain('secret-plans');
		expect(result.redactedFieldPaths).toContain('note.dmNotes');
	});
});
