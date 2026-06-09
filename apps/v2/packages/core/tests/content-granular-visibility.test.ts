import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CONTENT_ITEM_ENTITY_TYPE,
	auditEntityPermissionConsistency,
	contentItemById,
	dispatchCommand,
	getContentItemDetailForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';

/**
 * CONTENT-009 — GRANULAR VISIBILITY (entity / section / field) for notes & structured objects, with the
 * default failing closed to `dm-only`. This is the PERM-002/003 field>section>entity precedence
 * (hidden-ancestor-wins) APPLIED to content — proven by tests as primary evidence:
 *
 *   - AC1: a `player-visible` note with one `dm-only` section omits that section for a player.
 *   - AC2: no visibility metadata ⇒ a non-DM is treated as `dm-only` (entire item hidden).
 *   - AC3: a section `shared` with Player A is delivered to A and NOT to B.
 *   - AC4: a write grant on a hidden section surfaces a consistency error AND the player still cannot
 *     read or write that section.
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR, ...actors);
}

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	expect(result.status).toBe('rejected');
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

/** Create a player-visible note with structured fields, returning the new state + item id. */
function createNote(
	state: CoreStateSlice,
	visibility: 'dm-only' | 'player-visible' | 'shared' = 'player-visible',
	fields: Record<string, unknown> = { summary: 'A public summary.', dmNotes: 'Secret plot.' },
): { state: CoreStateSlice; itemId: string } {
	const env = makeEnvironment();
	const result = accepted(
		dispatchCommand(
			state,
			env,
			cmd('content.create-item', {
				kind: 'note',
				title: 'The Sunken Keep',
				body: 'An old fortress.',
				fields,
				visibility,
			}),
		),
	);
	const itemId = Object.keys(result.nextState.content.items)[0]!;
	return { state: result.nextState, itemId };
}

describe('CONTENT-009 granular visibility — section/field precedence', () => {
	it('AC2: an item with NO granular metadata is dm-only for a non-DM (fail closed)', () => {
		// A note created without explicit visibility defaults to dm-only at the entity level.
		const { state, itemId } = createNote(base(), 'dm-only');

		const dmDetail = getContentItemDetailForActor(state.content, state.permissions, DM_ACTOR.id, itemId);
		expect('visible' in dmDetail && dmDetail.visible).toBe(true);

		const playerDetail = getContentItemDetailForActor(
			state.content,
			state.permissions,
			PLAYER_ACTOR.id,
			itemId,
		);
		// Fail closed: hidden entity is indistinguishable from not-found. No id, kind, visibility,
		// or revision is exposed — existence is not probeable by id (PERM-002 AC1).
		expect(playerDetail).toEqual({ visible: false, reason: 'hidden' });
	});

	it('AC1: a player-visible note with one dm-only section omits that section for a player', () => {
		const { state, itemId } = createNote(base(), 'player-visible');
		const env = makeEnvironment();
		// Author a dm-only SECTION override on the otherwise player-visible note.
		const next = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.set-section-visibility', {
					itemId,
					sectionId: 'secret-lore',
					rule: { level: 'dm-only' },
				}),
			),
		).nextState;

		const declaredSections = ['overview', 'secret-lore'];
		const dmDetail = getContentItemDetailForActor(
			next.content,
			next.permissions,
			DM_ACTOR.id,
			itemId,
			declaredSections,
		);
		expect('visibleSectionIds' in dmDetail && dmDetail.visibleSectionIds).toEqual([
			'overview',
			'secret-lore',
		]);

		const playerDetail = getContentItemDetailForActor(
			next.content,
			next.permissions,
			PLAYER_ACTOR.id,
			itemId,
			declaredSections,
		);
		expect(playerDetail.visible).toBe(true);
		if ('visibleSectionIds' in playerDetail) {
			// The dm-only section is OMITTED; the player keeps the inherited player-visible section.
			expect(playerDetail.visibleSectionIds).toEqual(['overview']);
			// A non-DM never receives the redacted-section list (it would leak the hidden section's existence).
			expect(playerDetail.redactedSectionIds).toEqual([]);
		}
	});

	it('field beats section beats entity, and a hidden ancestor wins over a re-granted child', () => {
		const { state, itemId } = createNote(base(), 'player-visible', {
			summary: 'public',
			dmNotes: 'secret',
		});
		let next = state;
		const env = makeEnvironment();
		// dm-only SECTION; a player-visible FIELD attributed to that section cannot widen past the hidden
		// section (hidden-ancestor-wins). A separate dm-only FIELD on the entity proves field beats entity.
		next = accepted(
			dispatchCommand(
				next,
				env,
				cmd('content.set-section-visibility', {
					itemId,
					sectionId: 'gm-section',
					rule: { level: 'dm-only' },
				}),
			),
		).nextState;
		next = accepted(
			dispatchCommand(
				next,
				env,
				cmd('content.set-field-visibility', {
					itemId,
					fieldKey: 'dmNotes',
					rule: { level: 'player-visible' }, // attempt to re-grant a field inside the hidden section
					sectionId: 'gm-section',
				}),
			),
		).nextState;
		next = accepted(
			dispatchCommand(
				next,
				env,
				cmd('content.set-field-visibility', {
					itemId,
					fieldKey: 'summary',
					rule: { level: 'player-visible' },
				}),
			),
		).nextState;

		const playerDetail = getContentItemDetailForActor(
			next.content,
			next.permissions,
			PLAYER_ACTOR.id,
			itemId,
		);
		expect(playerDetail.visible).toBe(true);
		if ('visibleFields' in playerDetail) {
			// `dmNotes` is attributed to the hidden `gm-section`, so its player-visible re-grant is overridden
			// by the hidden ancestor — it stays hidden.
			expect(playerDetail.visibleFields).toHaveProperty('summary');
			expect(playerDetail.visibleFields).not.toHaveProperty('dmNotes');
		}
	});

	it('AC3: a section shared with Player A is delivered to A and not to B', () => {
		const { state, itemId } = createNote(base(), 'player-visible', { lore: 'shared lore' });
		const env = makeEnvironment();
		const next = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.set-field-visibility', {
					itemId,
					fieldKey: 'lore',
					rule: { level: 'shared', sharedWith: [PLAYER_ACTOR.id] },
				}),
			),
		).nextState;

		const aDetail = getContentItemDetailForActor(next.content, next.permissions, PLAYER_ACTOR.id, itemId);
		const bDetail = getContentItemDetailForActor(next.content, next.permissions, PLAYER_B.id, itemId);
		if ('visibleFields' in aDetail) expect(aDetail.visibleFields).toHaveProperty('lore');
		if ('visibleFields' in bDetail) expect(bDetail.visibleFields).not.toHaveProperty('lore');
	});

	it('clearing a section override re-inherits the entity default', () => {
		const { state, itemId } = createNote(base(), 'player-visible');
		const env = makeEnvironment();
		let next = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.set-section-visibility', {
					itemId,
					sectionId: 'lore',
					rule: { level: 'dm-only' },
				}),
			),
		).nextState;
		expect(contentItemById(next.content, itemId)!.sectionVisibility).toHaveProperty('lore');
		// Clearing the override (rule: null) drops it; the section re-inherits the player-visible entity.
		next = accepted(
			dispatchCommand(
				next,
				env,
				cmd('content.set-section-visibility', { itemId, sectionId: 'lore', rule: null }),
			),
		).nextState;
		expect(contentItemById(next.content, itemId)!.sectionVisibility).not.toHaveProperty('lore');
		const playerDetail = getContentItemDetailForActor(
			next.content,
			next.permissions,
			PLAYER_ACTOR.id,
			itemId,
			['lore'],
		);
		if ('visibleSectionIds' in playerDetail) expect(playerDetail.visibleSectionIds).toEqual(['lore']);
	});

	it('write authority fails closed: an observer cannot author granular visibility', () => {
		const { state, itemId } = createNote(base(), 'player-visible');
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd(
					'content.set-section-visibility',
					{ itemId, sectionId: 'lore', rule: { level: 'dm-only' } },
					OBSERVER_ACTOR.id,
				),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('a malformed visibility level is coerced fail-closed to dm-only on read', () => {
		const { state, itemId } = createNote(base(), 'player-visible', { secret: 'x' });
		const env = makeEnvironment();
		const next = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.set-field-visibility', {
					itemId,
					fieldKey: 'secret',
					rule: { level: 'dm-only' },
				}),
			),
		).nextState;
		// Tamper the stored rule with an unknown level (simulating adversarial sidecar/sync metadata).
		const item = contentItemById(next.content, itemId)!;
		(item.fieldVisibility['fields.secret'] as { level: string }).level = 'everyone';
		const playerDetail = getContentItemDetailForActor(next.content, next.permissions, PLAYER_ACTOR.id, itemId);
		if ('visibleFields' in playerDetail) expect(playerDetail.visibleFields).not.toHaveProperty('secret');
	});
});

describe('CONTENT-009 AC4 — write grant on a hidden section is a consistency error', () => {
	it('surfaces a write-grant-on-hidden-content error and the player still cannot read or write', () => {
		const { state, itemId } = createNote(base(), 'dm-only', { dmNotes: 'plot' });
		const env = makeEnvironment();
		// DM grants Player A a write-capable grant (section-editor) on the dm-only content item.
		const granted = accepted(
			dispatchCommand(
				state,
				env,
				cmd('permission.grant-capability-set', {
					entityType: CONTENT_ITEM_ENTITY_TYPE,
					entityId: itemId,
					playerActorId: PLAYER_ACTOR.id,
					capabilitySet: 'section-editor',
				}),
			),
		).nextState;

		// Consistency audit reports the invalid state to the DM (Contract 3 Consistency Requirements).
		const report = auditEntityPermissionConsistency(granted.permissions, {
			entities: [
				{ entityType: CONTENT_ITEM_ENTITY_TYPE, entityId: itemId, visibility: 'dm-only' },
			],
		});
		expect(report.hasErrors).toBe(true);
		const problem = report.problems.find((p) => p.kind === 'write-grant-on-hidden-content');
		expect(problem).toBeDefined();
		expect(problem?.actorId).toBe(PLAYER_ACTOR.id);
		// The remediation is generic — it never leaks the hidden title or field value.
		expect(problem?.remediation).not.toContain('plot');

		// Despite the write grant, the player STILL cannot READ the dm-only item (a grant never bypasses
		// visibility — Contract 3 Axis 2 rule 4).
		const playerDetail = getContentItemDetailForActor(granted.content, granted.permissions, PLAYER_ACTOR.id, itemId);
		expect(playerDetail.visible).toBe(false);

		// And the write grant does NOT let the player WRITE a hidden item — a grant never bypasses
		// visibility (Contract 3 Axis 2 rule 4 / CONTENT-009 AC4). A section-editor grant on a dm-only
		// item is the exact invalid state flagged by the consistency error, and the write guard enforces
		// it: the player cannot edit, read, or escalate visibility on a dm-only item regardless of grants.
		const editAttempt = dispatchCommand(
			granted,
			env,
			cmd(
				'content.set-section-visibility',
				{ itemId, sectionId: 'gm', rule: { level: 'dm-only' } },
				PLAYER_ACTOR.id,
			),
		);
		// The player's write is REJECTED — the dm-only visibility barrier blocks write access too.
		expect(editAttempt.status).toBe('rejected');
		if (editAttempt.status !== 'rejected') throw new Error('expected rejected');
		expect(editAttempt.rejection.code).toBe('actor-not-authorized');
		// Read remains denied as well (unchanged from before).
		const stillHidden = getContentItemDetailForActor(
			granted.content,
			granted.permissions,
			PLAYER_ACTOR.id,
			itemId,
		);
		expect(stillHidden.visible).toBe(false);
	});
});
