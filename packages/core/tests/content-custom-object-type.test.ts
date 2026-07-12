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
	buildCustomObjectType,
	buildCustomObjectTypeSchemaRegistry,
	contentItemById,
	countObjectsOfSubtype,
	customObjectTypeById,
	dispatchCommand,
	ensureCustomObjectTypeMap,
	isCustomObjectTypeId,
	projectObjectFieldsForRole,
	suggestCustomObjectTypeId,
	validateCustomObjectTypeDefinition,
	validateObjectFrontmatter,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type CustomObjectTypeDraft,
} from '../src';

/**
 * CONTENT-005 (custom types) — USER-DEFINED VAULT OBJECT TYPES: definition validation (fail closed), the
 * DM-only define/update/delete lifecycle, instance create/edit validated against the custom field schema,
 * and the SAFER delete-with-instances rule (blocked while instances exist). Tests are the primary evidence.
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

const TAVERN_DRAFT = {
	id: 'custom:tavern',
	label: 'Tavern',
	fields: [
		{ key: 'proprietor', type: 'string', required: true },
		{ key: 'rooms', type: 'number' },
		{ key: 'rumor', type: 'string', dmOnly: true },
	],
} as const;

describe('CONTENT-005 (custom types) — definition validation (fail closed)', () => {
	it('accepts a well-formed draft (reserved id, label, valid fields)', () => {
		const result = validateCustomObjectTypeDefinition(TAVERN_DRAFT as CustomObjectTypeDraft);
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it('REJECTS an id outside the reserved custom: namespace', () => {
		const result = validateCustomObjectTypeDefinition({ id: 'tavern', label: 'X', fields: [] });
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === 'invalid-id')).toBe(true);
	});

	it('REJECTS an id that would name a built-in subtype (no collision possible)', () => {
		// 'character' has no colon so it fails the pattern; belt-and-braces against shadowing a built-in.
		const result = validateCustomObjectTypeDefinition({ id: 'character', label: 'X', fields: [] });
		expect(result.valid).toBe(false);
		expect(isCustomObjectTypeId('character')).toBe(false);
	});

	it('REJECTS a missing label', () => {
		const result = validateCustomObjectTypeDefinition({ id: 'custom:x', label: '   ', fields: [] });
		expect(result.issues.some((i) => i.code === 'missing-label')).toBe(true);
	});

	it('REJECTS an unknown field kind (fail closed against unmodellable fields)', () => {
		const result = validateCustomObjectTypeDefinition({
			id: 'custom:x',
			label: 'X',
			fields: [{ key: 'weird', type: 'date' }],
		});
		expect(result.issues.some((i) => i.code === 'unknown-field-kind' && i.field === 'weird')).toBe(true);
	});

	it('REJECTS a duplicate field key, a reserved envelope key, and a malformed key', () => {
		const dup = validateCustomObjectTypeDefinition({
			id: 'custom:x',
			label: 'X',
			fields: [{ key: 'a', type: 'string' }, { key: 'a', type: 'number' }],
		});
		expect(dup.issues.some((i) => i.code === 'duplicate-field-key')).toBe(true);

		const reserved = validateCustomObjectTypeDefinition({
			id: 'custom:x',
			label: 'X',
			fields: [{ key: VAULT_OBJECT_SUBTYPE_KEY, type: 'string' }],
		});
		expect(reserved.issues.some((i) => i.code === 'reserved-field-key')).toBe(true);

		const bad = validateCustomObjectTypeDefinition({
			id: 'custom:x',
			label: 'X',
			fields: [{ key: '9-bad key', type: 'string' }],
		});
		expect(bad.issues.some((i) => i.code === 'invalid-field-key')).toBe(true);
	});

	it('suggestCustomObjectTypeId derives a reserved-namespace slug from a label', () => {
		expect(suggestCustomObjectTypeId('Magic Item!')).toBe('custom:magic-item');
	});
});

describe('CONTENT-005 (custom types) — hydration is tolerant + fail closed', () => {
	it('drops a malformed/hostile record rather than poisoning the registry', () => {
		const map = ensureCustomObjectTypeMap({
			ok: {
				id: 'custom:ok',
				label: 'OK',
				fields: [{ key: 'name', type: 'string' }],
			},
			shadow: { id: 'character', label: 'shadow', fields: [] },
			junk: 42,
		});
		expect(Object.keys(map)).toEqual(['custom:ok']);
	});
});

describe('CONTENT-005 (custom types) — define/update/delete lifecycle (DM-only)', () => {
	const env = makeEnvironment();

	it('DM defines a custom type; it is stored and emits an object-type-changed event', () => {
		const created = accepted(dispatchCommand(base(), env, cmd('content.define-object-type', TAVERN_DRAFT)));
		const event = created.events[0] as { kind: string; typeId: string; mutation: string };
		expect(event.kind).toBe('content.object-type-changed');
		expect(event.mutation).toBe('define');
		const def = customObjectTypeById(created.nextState.content, 'custom:tavern')!;
		expect(def.label).toBe('Tavern');
		expect(def.fields.map((f) => f.key)).toEqual(['proprietor', 'rooms', 'rumor']);
		expect(def.revision).toBe(1);
		// Visibility fails closed to dm-only when not specified.
		expect(def.defaultVisibility).toBe('dm-only');
	});

	it('REJECTS a non-DM defining a type (reuses the vault-edit / DM-authority gate)', () => {
		const asPlayer = rejected(
			dispatchCommand(base(), env, cmd('content.define-object-type', TAVERN_DRAFT, PLAYER_ACTOR.id)),
		);
		expect(asPlayer.rejection.code).toBe('actor-not-authorized');
	});

	it('REJECTS defining a type whose id already exists (define is create-only)', () => {
		const first = accepted(dispatchCommand(base(), env, cmd('content.define-object-type', TAVERN_DRAFT)));
		const dupe = rejected(
			dispatchCommand(first.nextState, env, cmd('content.define-object-type', TAVERN_DRAFT)),
		);
		expect(dupe.rejection.code).toBe('custom-type-exists');
	});

	it('REJECTS an invalid draft at dispatch with per-field issues (no state change)', () => {
		const result = rejected(
			dispatchCommand(
				base(),
				env,
				cmd('content.define-object-type', { id: 'custom:x', label: 'X', fields: [{ key: 'k', type: 'nope' }] }),
			),
		);
		expect(result.rejection.code).toBe('custom-type-invalid');
		expect(result.rejection.issues?.some((i) => i.path === 'k')).toBe(true);
	});

	it('DM updates a type: replaces fields, preserves createdAt/author, bumps revision', () => {
		const created = accepted(dispatchCommand(base(), env, cmd('content.define-object-type', TAVERN_DRAFT)));
		const original = customObjectTypeById(created.nextState.content, 'custom:tavern')!;
		const updated = accepted(
			dispatchCommand(
				created.nextState,
				env,
				cmd('content.update-object-type', {
					id: 'custom:tavern',
					label: 'Inn',
					fields: [{ key: 'proprietor', type: 'string', required: true }],
				}),
			),
		);
		const def = customObjectTypeById(updated.nextState.content, 'custom:tavern')!;
		expect(def.label).toBe('Inn');
		expect(def.fields.map((f) => f.key)).toEqual(['proprietor']);
		expect(def.revision).toBe(2);
		expect(def.createdAt).toBe(original.createdAt);
		expect(def.authorActorId).toBe(original.authorActorId);
	});

	it('REJECTS updating a type that does not exist', () => {
		const result = rejected(
			dispatchCommand(
				base(),
				env,
				cmd('content.update-object-type', { id: 'custom:ghost', label: 'Ghost', fields: [] }),
			),
		);
		expect(result.rejection.code).toBe('custom-type-not-found');
	});

	it('REJECTS deleting a type that does not exist', () => {
		const result = rejected(
			dispatchCommand(base(), env, cmd('content.delete-object-type', { id: 'custom:ghost' })),
		);
		expect(result.rejection.code).toBe('custom-type-not-found');
	});
});

describe('CONTENT-005 (custom types) — instances flow through the shared object path', () => {
	const env = makeEnvironment();

	function withTavern(): CoreStateSlice {
		const created = accepted(dispatchCommand(base(), env, cmd('content.define-object-type', TAVERN_DRAFT)));
		return created.nextState;
	}

	it('creates a valid instance of a custom type, persisting the custom subtype envelope key', () => {
		const created = accepted(
			dispatchCommand(
				withTavern(),
				env,
				cmd('content.create-object', {
					subtype: 'custom:tavern',
					title: 'The Prancing Pony',
					fields: { proprietor: 'Barliman', rooms: 6 },
				}),
			),
		);
		const event = created.events[0] as { kind: string; subtype: string; itemId: string };
		expect(event.kind).toBe('content.object-changed');
		expect(event.subtype).toBe('custom:tavern');
		const item = contentItemById(created.nextState.content, event.itemId)!;
		expect(item.kind).toBe('object');
		expect(item.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('custom:tavern');
		expect(item.fields.proprietor).toBe('Barliman');
		expect(item.visibility).toBe('dm-only');
	});

	it('REJECTS an instance missing a required custom field (fail closed, no revision committed)', () => {
		const state = withTavern();
		const before = Object.keys(state.content.items).length;
		const invalid = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.create-object', {
					subtype: 'custom:tavern',
					title: 'Nameless',
					fields: { rooms: 2 },
				}),
			),
		);
		expect(invalid.rejection.code).toBe('object-schema-invalid');
		expect(Object.keys(invalid.nextState.content.items)).toHaveLength(before);
	});

	it('REJECTS an instance carrying a field the custom type does not declare (fail closed)', () => {
		const invalid = rejected(
			dispatchCommand(
				withTavern(),
				env,
				cmd('content.create-object', {
					subtype: 'custom:tavern',
					title: 'Sneaky',
					fields: { proprietor: 'Barliman', secretDoor: true },
				}),
			),
		);
		expect(invalid.rejection.code).toBe('object-schema-invalid');
	});

	it('REJECTS creating an instance of an UNKNOWN custom type (no such definition)', () => {
		const invalid = rejected(
			dispatchCommand(
				base(),
				env,
				cmd('content.create-object', {
					subtype: 'custom:missing',
					title: 'Orphan',
					fields: {},
				}),
			),
		);
		expect(invalid.rejection.code).toBe('object-schema-invalid');
	});

	it('edits an instance of a custom type, re-validating the merged fields', () => {
		const created = accepted(
			dispatchCommand(
				withTavern(),
				env,
				cmd('content.create-object', {
					subtype: 'custom:tavern',
					title: 'The Prancing Pony',
					fields: { proprietor: 'Barliman' },
				}),
			),
		);
		const itemId = (created.events[0] as { itemId: string }).itemId;
		const updated = accepted(
			dispatchCommand(created.nextState, env, cmd('content.update-object', { itemId, fields: { rooms: 8 } })),
		);
		const item = contentItemById(updated.nextState.content, itemId)!;
		expect(item.fields.rooms).toBe(8);
		expect(item.fields.proprietor).toBe('Barliman');
	});

	it('projects a dmOnly custom field out of a non-DM view (fail closed)', () => {
		const registry = buildCustomObjectTypeSchemaRegistry(withTavern().content.customObjectTypes);
		const fields = { proprietor: 'Barliman', rumor: 'A secret cellar' };
		const dmView = projectObjectFieldsForRole('custom:tavern', fields, 'dm', registry);
		expect(dmView.rumor).toBe('A secret cellar');
		const playerView = projectObjectFieldsForRole('custom:tavern', fields, 'player', registry);
		expect(playerView.rumor).toBeUndefined();
		expect(playerView.proprietor).toBe('Barliman');
	});
});

describe('CONTENT-005 (custom types) — delete-with-instances is refused (safer choice)', () => {
	const env = makeEnvironment();

	it('BLOCKS deleting a custom type while a live instance still exists, then allows it once removed', () => {
		const created = accepted(dispatchCommand(base(), env, cmd('content.define-object-type', TAVERN_DRAFT)));
		const withInstance = accepted(
			dispatchCommand(
				created.nextState,
				env,
				cmd('content.create-object', {
					subtype: 'custom:tavern',
					title: 'The Prancing Pony',
					fields: { proprietor: 'Barliman' },
				}),
			),
		);
		const itemId = (withInstance.events[0] as { itemId: string }).itemId;
		expect(countObjectsOfSubtype(withInstance.nextState.content, 'custom:tavern')).toBe(1);

		// Delete is refused fail-closed while the instance lives.
		const blocked = rejected(
			dispatchCommand(withInstance.nextState, env, cmd('content.delete-object-type', { id: 'custom:tavern' })),
		);
		expect(blocked.rejection.code).toBe('custom-type-in-use');
		// The type is still present (no partial delete).
		expect(customObjectTypeById(blocked.nextState.content, 'custom:tavern')).toBeDefined();

		// Soft-delete the instance, then the type deletes cleanly.
		const removed = accepted(
			dispatchCommand(withInstance.nextState, env, cmd('content.remove-item', { itemId })),
		);
		expect(countObjectsOfSubtype(removed.nextState.content, 'custom:tavern')).toBe(0);
		const deleted = accepted(
			dispatchCommand(removed.nextState, env, cmd('content.delete-object-type', { id: 'custom:tavern' })),
		);
		expect(customObjectTypeById(deleted.nextState.content, 'custom:tavern')).toBeUndefined();
		expect((deleted.events[0] as { mutation: string }).mutation).toBe('delete');
	});

	it('REJECTS a non-DM deleting a type', () => {
		const created = accepted(dispatchCommand(base(), env, cmd('content.define-object-type', TAVERN_DRAFT)));
		const asPlayer = rejected(
			dispatchCommand(
				created.nextState,
				env,
				cmd('content.delete-object-type', { id: 'custom:tavern' }, PLAYER_ACTOR.id),
			),
		);
		expect(asPlayer.rejection.code).toBe('actor-not-authorized');
	});
});

describe('CONTENT-005 (custom types) — projection helper resolves custom + built-in registries', () => {
	it('validateObjectFrontmatter validates against a supplied custom registry', () => {
		const registry = buildCustomObjectTypeSchemaRegistry({
			'custom:tavern': buildCustomObjectType(TAVERN_DRAFT as CustomObjectTypeDraft, {
				authorActorId: DM_ACTOR.id,
				now: '2026-01-01T00:00:00.000Z',
			}),
		});
		const ok = validateObjectFrontmatter('custom:tavern', { proprietor: 'Barliman' }, registry);
		expect(ok.valid).toBe(true);
		expect(ok.subtype).toBe('custom:tavern');
		const bad = validateObjectFrontmatter('custom:tavern', {}, registry);
		expect(bad.valid).toBe(false);
	});
});
