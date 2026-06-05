import { describe, expect, it } from 'vitest';
import {
	assertStreamCarriesNoHiddenContent,
	filterCatchUpStream,
	filterReplicationStream,
	isOperationVisibleToRecipient,
	type EntityVisibilityMetadata,
	type SyncOperation,
} from '../src';
import { DM_ACTOR, OBSERVER_ACTOR, PLAYER_ACTOR, buildPermissionState } from '../src/testing/fixtures';

/**
 * COLLAB-009 — FILTER-BEFORE-SEND: hidden content must NEVER ENTER a player's/observer's replication
 * stream (filtered at the source, not hidden in the UI). The hard assertions serialize the delivered
 * stream and prove a DM-only secret is ABSENT.
 */

const SECRET = 'THE-VAMPIRE-IS-THE-MAYOR';

function op(overrides: Partial<SyncOperation> & Pick<SyncOperation, 'id' | 'entityType' | 'entityId'>): SyncOperation {
	return {
		vaultId: 'vault-1',
		sourceId: 'local-vault',
		actorId: DM_ACTOR.id,
		opType: 'update',
		dependencies: [],
		issuedAt: '2026-06-05T00:00:00.000Z',
		schemaVersion: 1,
		...overrides,
	};
}

/** A visibility source: a map keyed by `entityType:entityId`; an unlisted target ⇒ undefined ⇒ dm-only. */
function visibilitySource(records: EntityVisibilityMetadata[]) {
	const byKey = new Map(records.map((r) => [`${r.entityType}:${r.entityId}`, r]));
	return (o: SyncOperation): EntityVisibilityMetadata | undefined =>
		byKey.get(`${o.entityType}:${o.entityId}`);
}

describe('COLLAB-009 — filter-before-send replication-stream privacy', () => {
	// A stream: a player-visible note op, a DM-only secret note op (the leak risk), and a shared handout
	// delivered only to the player.
	const stream: SyncOperation[] = [
		op({ id: 'op-public', entityType: 'note', entityId: 'note-public', value: { body: 'The town square is busy.' } }),
		op({ id: 'op-secret', entityType: 'note', entityId: 'note-secret', value: { body: SECRET } }),
		op({ id: 'op-handout', entityType: 'handout', entityId: 'handout-1', value: { body: 'A torn map fragment.' } }),
	];

	const visibility = visibilitySource([
		{ entityType: 'note', entityId: 'note-public', entity: { level: 'player-visible' } },
		{ entityType: 'note', entityId: 'note-secret', entity: { level: 'dm-only' } },
		{
			entityType: 'handout',
			entityId: 'handout-1',
			entity: { level: 'shared', sharedWith: [PLAYER_ACTOR.id] },
		},
	]);

	const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

	it("a player's outbound stream contains ZERO dm-only content — the secret is absent (hard assertion)", () => {
		const result = filterReplicationStream(stream, PLAYER_ACTOR, visibility, permission);

		// The player receives only the player-visible note + the handout shared with them.
		expect(result.delivered.map((o) => o.id)).toEqual(['op-public', 'op-handout']);
		// The DM-only op is withheld AT THE SOURCE (recorded for sender diagnostics, never delivered).
		expect(result.withheld.map((w) => w.operationId)).toEqual(['op-secret']);
		expect(result.withheld[0]?.reason).toBe('target-not-visible');

		// THE keystone proof: serialize the delivered stream and assert the secret is nowhere in it.
		const wire = JSON.stringify(result.delivered);
		expect(wire).not.toContain(SECRET);
		expect(wire).not.toContain('note-secret');
		// The withheld record carries no op value either (only entity references + reason).
		expect(JSON.stringify(result.withheld)).not.toContain(SECRET);
	});

	it("an observer's outbound stream contains ZERO dm-only AND zero shared-to-others content", () => {
		const result = filterReplicationStream(stream, OBSERVER_ACTOR, visibility, permission);

		// The observer sees only the player-visible note; the handout is shared with the PLAYER, not them.
		expect(result.delivered.map((o) => o.id)).toEqual(['op-public']);
		expect(result.withheld.map((w) => w.operationId).sort()).toEqual(['op-handout', 'op-secret']);

		const wire = JSON.stringify(result.delivered);
		expect(wire).not.toContain(SECRET);
		expect(wire).not.toContain('A torn map fragment.');
	});

	it('the DM stream is unfiltered — the DM sees everything including the secret', () => {
		const result = filterReplicationStream(stream, DM_ACTOR, visibility, permission);
		expect(result.delivered.map((o) => o.id)).toEqual(['op-public', 'op-secret', 'op-handout']);
		expect(result.withheld).toHaveLength(0);
		expect(JSON.stringify(result.delivered)).toContain(SECRET);
	});

	it('fail closed: an op with NO recorded visibility metadata is dm-only and withheld from non-DM', () => {
		const orphan = [op({ id: 'op-orphan', entityType: 'note', entityId: 'note-unknown', value: { body: SECRET } })];
		const result = filterReplicationStream(orphan, PLAYER_ACTOR, visibilitySource([]), permission);
		expect(result.delivered).toHaveLength(0);
		expect(result.withheld[0]?.reason).toBe('target-not-visible');
		expect(JSON.stringify(result.delivered)).not.toContain(SECRET);
	});

	it('fail closed: an unknown/unauthenticated recipient receives the EMPTY stream', () => {
		const result = filterReplicationStream(stream, undefined, visibility, permission);
		expect(result.delivered).toHaveLength(0);
		expect(result.withheld.every((w) => w.reason === 'unknown-recipient')).toBe(true);
		expect(JSON.stringify(result.delivered)).not.toContain(SECRET);
	});

	it('field-scoped op: a hidden field on a visible entity is withheld (field-not-visible)', () => {
		const fieldVisibility = visibilitySource([
			{
				entityType: 'character',
				entityId: 'char-1',
				entity: { level: 'player-visible' },
				fields: { 'character.data.dmNotes': { level: 'dm-only' } },
			},
		]);
		const fieldStream: SyncOperation[] = [
			op({ id: 'op-hp', entityType: 'character', entityId: 'char-1', path: 'character.combat.hp', value: 12 }),
			op({
				id: 'op-dmnotes',
				entityType: 'character',
				entityId: 'char-1',
				path: 'character.data.dmNotes',
				value: { body: SECRET },
			}),
		];
		const result = filterReplicationStream(fieldStream, PLAYER_ACTOR, fieldVisibility, permission);
		expect(result.delivered.map((o) => o.id)).toEqual(['op-hp']);
		expect(result.withheld[0]?.reason).toBe('field-not-visible');
		expect(JSON.stringify(result.delivered)).not.toContain(SECRET);
	});

	describe('COLLAB-009 AC2 — catch-up delivers only NEWLY authorized, not-yet-sent content', () => {
		it('a player who gains visibility later receives only the newly-authorized op on catch-up', () => {
			const alreadyDelivered = new Set(['op-public']); // the public note was already delivered live

			// Before the grant: the handout is shared with NOBODY, so catch-up delivers nothing new.
			const noShare = visibilitySource([
				{ entityType: 'note', entityId: 'note-public', entity: { level: 'player-visible' } },
				{ entityType: 'note', entityId: 'note-secret', entity: { level: 'dm-only' } },
				{ entityType: 'handout', entityId: 'handout-1', entity: { level: 'shared' } },
			]);
			const before = filterCatchUpStream(stream, PLAYER_ACTOR, noShare, alreadyDelivered, permission);
			expect(before.delivered).toHaveLength(0);

			// After the DM shares the handout with the player: catch-up delivers ONLY the handout (newly
			// authorized) — not the already-sent public note, and never the dm-only secret.
			const after = filterCatchUpStream(stream, PLAYER_ACTOR, visibility, alreadyDelivered, permission);
			expect(after.delivered.map((o) => o.id)).toEqual(['op-handout']);
			expect(JSON.stringify(after.delivered)).not.toContain(SECRET);
		});
	});

	it('isOperationVisibleToRecipient is the per-op choke point used by the batch filter', () => {
		const secretOp = stream[1]!;
		const dm = isOperationVisibleToRecipient(
			secretOp,
			DM_ACTOR,
			{ entityType: 'note', entityId: 'note-secret', entity: { level: 'dm-only' } },
			permission,
		);
		const player = isOperationVisibleToRecipient(
			secretOp,
			PLAYER_ACTOR,
			{ entityType: 'note', entityId: 'note-secret', entity: { level: 'dm-only' } },
			permission,
		);
		expect(dm.visible).toBe(true);
		expect(player).toEqual({ visible: false, reason: 'target-not-visible' });
	});

	describe('boundary leak guard', () => {
		it('assertStreamCarriesNoHiddenContent passes for a correctly-filtered stream', () => {
			const result = filterReplicationStream(stream, PLAYER_ACTOR, visibility, permission);
			expect(() =>
				assertStreamCarriesNoHiddenContent(result.delivered, PLAYER_ACTOR, visibility, permission),
			).not.toThrow();
		});

		it('assertStreamCarriesNoHiddenContent THROWS if a hidden op was (wrongly) included', () => {
			// Simulate a buggy transport that bypassed the filter and tried to send the full stream.
			expect(() =>
				assertStreamCarriesNoHiddenContent(stream, PLAYER_ACTOR, visibility, permission),
			).toThrow(/leak/i);
		});
	});
});
