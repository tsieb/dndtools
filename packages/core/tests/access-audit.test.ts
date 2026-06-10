import { describe, expect, it } from 'vitest';
import {
	PERMISSION_STATE_SCHEMA_VERSION,
	auditAccessAttempt,
	containsSensitiveData,
	type AccessRequest,
	type ConsistencyEntityRecord,
	type PermissionState,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR } from '../src/testing/fixtures';

function state(): PermissionState {
	return {
		actors: {
			[DM_ACTOR.id]: DM_ACTOR,
			[PLAYER_ACTOR.id]: PLAYER_ACTOR,
			[OBSERVER_ACTOR.id]: OBSERVER_ACTOR,
		},
		grants: [],
		schemaVersion: PERMISSION_STATE_SCHEMA_VERSION,
	};
}

// A hidden note whose TITLE and CONTENT must never leak through any denial path.
const HIDDEN_NOTE: ConsistencyEntityRecord = {
	entityType: 'note',
	entityId: 'note-villain-secret',
	visibility: 'dm-only',
};
const SHARED_NOTE: ConsistencyEntityRecord = {
	entityType: 'note',
	entityId: 'note-shared',
	visibility: 'shared',
	sharedWith: ['someone-else'],
};
const VISIBLE_NOTE: ConsistencyEntityRecord = {
	entityType: 'note',
	entityId: 'note-public',
	visibility: 'player-visible',
};

function read(actorId: string | null | undefined, entityId: string): AccessRequest {
	return { actorId, entityType: 'note', entityId, access: 'read' };
}
function write(actorId: string | null | undefined, entityId: string): AccessRequest {
	return { actorId, entityType: 'note', entityId, access: 'write' };
}

describe('PERM-010 AC1: denied access produces an audit record with actor + reference + reason', () => {
	it('a player requesting a hidden note by id is denied and audited', () => {
		const result = auditAccessAttempt(state(), read(PLAYER_ACTOR.id, HIDDEN_NOTE.entityId), [
			HIDDEN_NOTE,
		]);
		expect(result.kind).toBe('denied');
		if (result.kind !== 'denied') return;
		expect(result.audit.kind).toBe('access-denied');
		expect(result.audit.actorId).toBe(PLAYER_ACTOR.id);
		expect(result.audit.entityType).toBe('note');
		expect(result.audit.entityId).toBe(HIDDEN_NOTE.entityId);
		expect(result.audit.reason).toBe('not-visible');
	});
});

describe('PERM-010 AC2: the denial shown to the actor never reveals the hidden note', () => {
	it('a hidden-note denial is indistinguishable from not-found to the actor', () => {
		const hidden = auditAccessAttempt(state(), read(PLAYER_ACTOR.id, HIDDEN_NOTE.entityId), [
			HIDDEN_NOTE,
		]);
		const missing = auditAccessAttempt(state(), read(PLAYER_ACTOR.id, 'note-does-not-exist'), [
			HIDDEN_NOTE,
		]);
		expect(hidden.kind).toBe('denied');
		expect(missing.kind).toBe('denied');
		if (hidden.kind !== 'denied' || missing.kind !== 'denied') return;
		// Same public reason and message: the actor cannot distinguish hidden from non-existent.
		expect(hidden.public.publicReason).toBe('not-found');
		expect(missing.public.publicReason).toBe('not-found');
		expect(hidden.public.message).toBe(missing.public.message);
		expect(hidden.audit.maskedAsNotFound).toBe(true);
		expect(missing.audit.maskedAsNotFound).toBe(false);
	});

	it('a `shared` note not shared with the actor is also masked as not-found', () => {
		const result = auditAccessAttempt(state(), read(PLAYER_ACTOR.id, SHARED_NOTE.entityId), [
			SHARED_NOTE,
		]);
		expect(result.kind).toBe('denied');
		if (result.kind !== 'denied') return;
		expect(result.audit.reason).toBe('not-shared');
		expect(result.public.publicReason).toBe('not-found');
		expect(result.audit.maskedAsNotFound).toBe(true);
	});

	it('ADVERSARIAL: neither the public denial nor the audit record carries the title/content', () => {
		const titleLike = HIDDEN_NOTE.entityId; // even the id is just a reference, not a title
		const result = auditAccessAttempt(state(), read(PLAYER_ACTOR.id, HIDDEN_NOTE.entityId), [
			HIDDEN_NOTE,
		]);
		if (result.kind !== 'denied') throw new Error('expected denial');
		// The public message is a fixed generic string — it does not contain the entity reference.
		expect(result.public.message).not.toContain(titleLike);
		// Neither structure carries any secret-shaped data.
		expect(containsSensitiveData(result.public)).toBe(false);
		expect(containsSensitiveData(result.audit)).toBe(false);
		// The public result shape carries no title/value/content keys at all.
		expect(Object.keys(result.public)).toEqual(['kind', 'publicReason', 'message']);
	});
});

describe('PERM-010: visible-but-unauthorized writes are a permission problem, not masked', () => {
	it('a player write on a visible note without the grant is denied as no-permission', () => {
		const result = auditAccessAttempt(
			state(),
			write(PLAYER_ACTOR.id, VISIBLE_NOTE.entityId),
			[VISIBLE_NOTE],
			{ hasRequiredPermission: false },
		);
		expect(result.kind).toBe('denied');
		if (result.kind !== 'denied') return;
		expect(result.audit.reason).toBe('no-permission');
		// Existence is not secret here (the note is visible), so the actor may be told it's a
		// permission issue — NOT masked as not-found.
		expect(result.public.publicReason).toBe('no-permission');
		expect(result.audit.maskedAsNotFound).toBe(false);
	});

	it('a player write on a visible note WITH the grant is granted', () => {
		const result = auditAccessAttempt(
			state(),
			write(PLAYER_ACTOR.id, VISIBLE_NOTE.entityId),
			[VISIBLE_NOTE],
			{ hasRequiredPermission: true },
		);
		expect(result.kind).toBe('granted');
	});

	it('a player write on a HIDDEN note is masked as not-found, never as no-permission', () => {
		// Critical: a write to hidden content must NOT reveal that the content exists by returning a
		// permission error. It collapses to not-found.
		const result = auditAccessAttempt(
			state(),
			write(PLAYER_ACTOR.id, HIDDEN_NOTE.entityId),
			[HIDDEN_NOTE],
			{ hasRequiredPermission: false },
		);
		if (result.kind !== 'denied') throw new Error('expected denial');
		expect(result.public.publicReason).toBe('not-found');
		expect(result.audit.reason).toBe('not-visible');
	});
});

describe('PERM-010: trust-boundary semantics', () => {
	it('the DM never crosses a trust boundary (not-a-denial)', () => {
		const result = auditAccessAttempt(state(), read(DM_ACTOR.id, HIDDEN_NOTE.entityId), [
			HIDDEN_NOTE,
		]);
		expect(result.kind).toBe('not-a-denial');
	});

	it('a read of content the actor can see is granted (no audit record)', () => {
		const result = auditAccessAttempt(state(), read(PLAYER_ACTOR.id, VISIBLE_NOTE.entityId), [
			VISIBLE_NOTE,
		]);
		expect(result.kind).toBe('granted');
	});

	it('an unknown actor is denied and masked', () => {
		const result = auditAccessAttempt(state(), read('ghost', HIDDEN_NOTE.entityId), [HIDDEN_NOTE]);
		if (result.kind !== 'denied') throw new Error('expected denial');
		expect(result.audit.reason).toBe('unknown-actor');
		expect(result.public.publicReason).toBe('unknown-actor');
	});

	it('an unauthenticated actor is denied', () => {
		for (const id of [null, undefined, '']) {
			const result = auditAccessAttempt(state(), read(id, HIDDEN_NOTE.entityId), [HIDDEN_NOTE]);
			expect(result.kind).toBe('denied');
		}
	});

	it('an observer requesting a hidden note is masked as not-found', () => {
		const result = auditAccessAttempt(state(), read(OBSERVER_ACTOR.id, HIDDEN_NOTE.entityId), [
			HIDDEN_NOTE,
		]);
		if (result.kind !== 'denied') throw new Error('expected denial');
		expect(result.public.publicReason).toBe('not-found');
	});
});
