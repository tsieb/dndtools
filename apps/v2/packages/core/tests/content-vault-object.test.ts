import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	VAULT_OBJECT_SUBTYPE_KEY,
	contentItemById,
	dispatchCommand,
	getContentItemsForActor,
	projectObjectFieldsForRole,
	readObjectSubtype,
	syncNoteToObject,
	syncObjectToNote,
	validateObjectFrontmatter,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';

/**
 * CONTENT-005 — STRUCTURED VAULT OBJECTS: note-backed records with SCHEMA-VALIDATED frontmatter (valid passes,
 * invalid FAILS CLOSED — no invalid revision committed) and deterministic frontmatter ↔ body SYNC. Tests are
 * the primary evidence.
 */

function base(...actors: Actor[]): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR, ...actors);
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

describe('CONTENT-005 — frontmatter schema validation (AC1/AC2: fail closed)', () => {
	it('accepts a valid stat-block-like character object frontmatter', () => {
		const result = validateObjectFrontmatter('character', {
			name: 'Bane',
			characterKind: 'npc',
		});
		expect(result.valid).toBe(true);
		expect(result.subtype).toBe('character');
		expect(result.issues).toEqual([]);
	});

	it('REJECTS a missing required field (no invalid object would commit)', () => {
		const result = validateObjectFrontmatter('character', { characterKind: 'npc' });
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === 'missing-required-field' && i.field === 'name')).toBe(true);
	});

	it('REJECTS a wrong-typed field', () => {
		const result = validateObjectFrontmatter('dice-table', {
			title: 'Wandering Monsters',
			dice: '1d20',
			entries: 'not-an-array',
		});
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === 'wrong-type' && i.field === 'entries')).toBe(true);
	});

	it('REJECTS an undeclared field (closed schema)', () => {
		const result = validateObjectFrontmatter('note', { bogus: 'x' });
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === 'undeclared-field' && i.field === 'bogus')).toBe(true);
	});

	it('does not leak raw values in diagnostics (names field + expectation only)', () => {
		const result = validateObjectFrontmatter('handout', { format: 'cipher', cipher: 42 });
		expect(result.valid).toBe(false);
		const message = result.issues.map((i) => i.message).join(' ');
		// The diagnostic names the field + expected type, never the raw value 42.
		expect(message).not.toContain('42');
		expect(message).toContain('cipher');
	});
});

describe('CONTENT-005 — frontmatter ↔ body synchronization (deterministic round-trip)', () => {
	it('object → note → object is a fixed point (editing the structured side reflects in note text)', () => {
		const object = {
			subtype: 'dice-table' as const,
			fields: { title: 'Loot', dice: '1d6', entries: ['gold', 'gem'] },
			body: '# Loot table\n\nRoll for treasure.',
			defaultVisibility: 'dm-only' as const,
		};
		const noteText = syncObjectToNote(object);
		// The subtype envelope key is serialized into the frontmatter.
		expect(noteText).toContain(`${VAULT_OBJECT_SUBTYPE_KEY}: dice-table`);
		expect(readObjectSubtype(noteText)).toBe('dice-table');
		const roundTrip = syncNoteToObject('dice-table', noteText);
		expect(roundTrip.fields).toEqual(object.fields);
		expect(roundTrip.body).toBe(object.body);
		// Serializing again is stable (no drift).
		expect(syncObjectToNote(roundTrip)).toBe(noteText);
	});

	it('note → object → note reflects an edit to the note frontmatter back into the structured fields', () => {
		const noteText = [
			'---',
			'calendarId: harptos',
			'occursOn: 1492-04-30',
			'title: Feast of the Moon',
			`${VAULT_OBJECT_SUBTYPE_KEY}: calendar-event`,
			'---',
			'A solemn remembrance.',
		].join('\n');
		const object = syncNoteToObject('calendar-event', noteText);
		expect(object.fields).toEqual({
			title: 'Feast of the Moon',
			calendarId: 'harptos',
			occursOn: '1492-04-30',
		});
		expect(object.body).toBe('A solemn remembrance.');
		// Validates against the calendar-event schema.
		expect(validateObjectFrontmatter('calendar-event', object.fields).valid).toBe(true);
	});
});

describe('CONTENT-005 — actor-filtered field projection (CONTENT-013 AC3)', () => {
	it('omits dm-only fields from a non-DM projection but keeps them for the DM', () => {
		const fields = { format: 'cipher', title: 'Sealed Letter', cipher: 'The key is under the oak' };
		const playerView = projectObjectFieldsForRole('handout', fields, 'player');
		expect(playerView).not.toHaveProperty('cipher');
		expect(playerView).toHaveProperty('title');
		const dmView = projectObjectFieldsForRole('handout', fields, 'dm');
		expect(dmView).toHaveProperty('cipher');
	});
});

describe('CONTENT-005 — create/update object commands (durable, fail closed)', () => {
	const env = makeEnvironment();

	it('creates a valid object, persisting the subtype envelope key, and rejects an invalid one', () => {
		const state = base();
		const created = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-object', {
					subtype: 'character',
					title: 'Bane',
					fields: { name: 'Bane', characterKind: 'npc' },
					body: 'An ancient foe.',
				}),
			),
		);
		const event = created.events[0] as { kind: string; subtype: string; itemId: string };
		expect(event.kind).toBe('content.object-changed');
		expect(event.subtype).toBe('character');
		const item = contentItemById(created.nextState.content, event.itemId)!;
		expect(item.kind).toBe('object');
		expect(item.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('character');
		// Fails closed to dm-only.
		expect(item.visibility).toBe('dm-only');

		// An invalid object (missing required `name`) is rejected; NO new item is committed.
		const before = Object.keys(created.nextState.content.items).length;
		const invalid = rejected(
			dispatchCommand(
				created.nextState,
				env,
				cmd('content.create-object', {
					subtype: 'character',
					title: 'Broken',
					fields: { characterKind: 'npc' },
				}),
			),
		);
		expect(invalid.rejection.code).toBe('object-schema-invalid');
		expect(Object.keys(invalid.nextState.content.items)).toHaveLength(before);
	});

	it('REJECTS a Scene routed to the object create command (Contract 4)', () => {
		const state = base();
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.create-object', { subtype: 'scene', title: 'My Scene', fields: {} }),
			),
		);
		// The schema enum rejects `scene` outright (invalid-payload), never creating a scene object.
		expect(['invalid-payload', 'object-schema-invalid']).toContain(result.rejection.code);
	});

	it('re-validates on update and never commits an invalid revision', () => {
		const state = base();
		const created = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-object', {
					subtype: 'dice-table',
					title: 'Loot',
					fields: { title: 'Loot', dice: '1d6', entries: ['gold'] },
				}),
			),
		);
		const itemId = (created.events[0] as { itemId: string }).itemId;
		const beforeRevision = contentItemById(created.nextState.content, itemId)!.revision;

		// A valid update succeeds.
		const updated = accepted(
			dispatchCommand(
				created.nextState,
				env,
				cmd('content.update-object', { itemId, fields: { entries: ['gold', 'gem', 'art'] } }),
			),
		);
		expect(contentItemById(updated.nextState.content, itemId)!.fields.entries).toEqual([
			'gold',
			'gem',
			'art',
		]);

		// An invalid update (clearing a required field) is rejected; the revision does not advance.
		const invalid = rejected(
			dispatchCommand(
				updated.nextState,
				env,
				cmd('content.update-object', { itemId, fields: { entries: 'oops' } }),
			),
		);
		expect(invalid.rejection.code).toBe('object-schema-invalid');
		expect(contentItemById(invalid.nextState.content, itemId)!.revision).toBe(beforeRevision + 1);
	});

	it('is DM-only for create; an observer cannot author objects', () => {
		const state = base();
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd(
					'content.create-object',
					{ subtype: 'note', title: 'x', fields: {} },
					OBSERVER_ACTOR.id,
				),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('keeps the created object out of a player view by default (dm-only)', () => {
		const state = base();
		const created = accepted(
			dispatchCommand(
				state,
				env,
				cmd('content.create-object', {
					subtype: 'note',
					title: 'Secret lore',
					fields: {},
				}),
			),
		);
		const playerItems = getContentItemsForActor(
			created.nextState.content,
			created.nextState.permissions,
			PLAYER_ACTOR.id,
		);
		expect(playerItems.find((i) => i.title === 'Secret lore')).toBeUndefined();
	});
});
