import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	contentTemplatePreset,
	dispatchCommand,
	ensureUserContentTemplateMap,
	ensureVaultContentState,
	isUserContentTemplateId,
	listContentTemplates,
	resolveContentTemplate,
	validateUserContentTemplate,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';

/**
 * RC-KNW-1.3 — DM-authored CONTENT TEMPLATES: durability, the reserved `user:` namespace, the
 * fail-closed draft validator, and creating a real note from a saved template through the SAME
 * `content.create-from-template` path a built-in starter preset uses.
 */

function base(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
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

const DRAFT = {
	id: 'user:tavern',
	name: 'Tavern',
	description: 'A tavern with a rumour table.',
	variables: [
		{ name: 'tavern', label: 'Tavern name', required: true },
		{ name: 'town', label: 'Town', required: false, defaultValue: 'Greenest' },
	],
	titleTemplate: '{{tavern}}',
	bodyTemplate: '# {{tavern}}\n\nA tavern in {{town}}.\n\n## Rumours\n\n- \n',
};

describe('RC-KNW-1.3 — the roadmap starter set', () => {
	it('ships a note preset for each of location, NPC, faction, session log and quest', () => {
		const ids = listContentTemplates({}).map((row) => row.id);
		for (const id of [
			'session-recap',
			'npc-statblock',
			'location-lore',
			'faction-brief',
			'quest-outline',
		]) {
			expect(ids).toContain(id);
		}
		// Every preset renders to valid content once its required variables are supplied.
		expect(contentTemplatePreset('faction-brief')!.kind).toBe('note');
		expect(contentTemplatePreset('quest-outline')!.defaultVisibility).toBe('dm-only');
	});
});

describe('RC-KNW-1.3 — draft validation (fail closed before any write)', () => {
	it('accepts a well-formed draft', () => {
		expect(validateUserContentTemplate(DRAFT).valid).toBe(true);
	});

	it('rejects an id outside the reserved user: namespace so a template can never shadow a preset', () => {
		const result = validateUserContentTemplate({ ...DRAFT, id: 'session-recap' });
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain('id-invalid');
		expect(isUserContentTemplateId('session-recap')).toBe(false);
		expect(isUserContentTemplateId('user:tavern')).toBe(true);
	});

	it('rejects a placeholder the draft never declares (a silent hole in the generated note)', () => {
		const result = validateUserContentTemplate({
			...DRAFT,
			bodyTemplate: 'A tavern run by {{owner}}.',
		});
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.code === 'variable-undeclared')!;
		expect(issue.message).toContain('owner');
	});

	it('rejects a duplicated variable and a missing name/title/body', () => {
		const dup = validateUserContentTemplate({
			...DRAFT,
			variables: [...DRAFT.variables, { name: 'tavern', label: 'Again', required: false }],
		});
		expect(dup.issues.map((i) => i.code)).toContain('variable-duplicate');
		const empty = validateUserContentTemplate({ ...DRAFT, name: '  ', titleTemplate: '' });
		expect(empty.issues.map((i) => i.code)).toEqual(
			expect.arrayContaining(['name-invalid', 'title-invalid']),
		);
	});
});

describe('RC-KNW-1.3 — save / delete commands', () => {
	it('saves a template durably, defaulting visibility closed to dm-only', () => {
		const state = base();
		const result = accepted(
			dispatchCommand(state, makeEnvironment(), cmd('content.save-template', DRAFT)),
		);
		const stored = result.nextState.content!.userTemplates['user:tavern']!;
		expect(stored.name).toBe('Tavern');
		expect(stored.defaultVisibility).toBe('dm-only');
		expect(stored.revision).toBe(1);
		expect(stored.authorActorId).toBe(DM_ACTOR.id);
		expect(result.events[0]).toMatchObject({ kind: 'content.template-changed', mutation: 'save' });
		expect(result.operationIds.length).toBe(1);
	});

	it('re-saving the same id bumps the revision and keeps createdAt', () => {
		const env = makeEnvironment();
		const first = accepted(dispatchCommand(base(), env, cmd('content.save-template', DRAFT)));
		const second = accepted(
			dispatchCommand(
				first.nextState,
				env,
				cmd('content.save-template', { ...DRAFT, name: 'Inn' }),
			),
		);
		const before = first.nextState.content!.userTemplates['user:tavern']!;
		const after = second.nextState.content!.userTemplates['user:tavern']!;
		expect(after.revision).toBe(2);
		expect(after.name).toBe('Inn');
		expect(after.createdAt).toBe(before.createdAt);
		expect(second.events[0]).toMatchObject({ mutation: 'update' });
	});

	it('refuses a non-DM author (vault-level authoring)', () => {
		const result = rejected(
			dispatchCommand(
				base(),
				makeEnvironment(),
				cmd('content.save-template', DRAFT, PLAYER_ACTOR.id),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('refuses an invalid draft and writes nothing', () => {
		const state = base();
		const result = rejected(
			dispatchCommand(
				state,
				makeEnvironment(),
				cmd('content.save-template', { ...DRAFT, id: 'tavern' }),
			),
		);
		expect(result.rejection.code).toBe('content-template-invalid');
		expect(Object.keys(result.nextState.content!.userTemplates)).toEqual([]);
	});

	it('deletes only a template the DM authored — a built-in preset is code, not data', () => {
		const env = makeEnvironment();
		const saved = accepted(dispatchCommand(base(), env, cmd('content.save-template', DRAFT)));
		const preset = rejected(
			dispatchCommand(
				saved.nextState,
				env,
				cmd('content.delete-template', { templateId: 'location-lore' }),
			),
		);
		expect(preset.rejection.code).toBe('content-template-not-deletable');

		const missing = rejected(
			dispatchCommand(
				saved.nextState,
				env,
				cmd('content.delete-template', { templateId: 'user:none' }),
			),
		);
		expect(missing.rejection.code).toBe('content-template-not-found');

		const gone = accepted(
			dispatchCommand(
				saved.nextState,
				env,
				cmd('content.delete-template', { templateId: 'user:tavern' }),
			),
		);
		expect(gone.nextState.content!.userTemplates['user:tavern']).toBeUndefined();
		expect(gone.events[0]).toMatchObject({ mutation: 'delete' });
	});
});

describe('RC-KNW-1.3 — creating from a saved template', () => {
	it('creates a real note through the same create-from-template path a preset uses', () => {
		const env = makeEnvironment();
		const saved = accepted(dispatchCommand(base(), env, cmd('content.save-template', DRAFT)));
		const created = accepted(
			dispatchCommand(
				saved.nextState,
				env,
				cmd('content.create-from-template', {
					presetId: 'user:tavern',
					variables: { tavern: 'The Bent Nail' },
				}),
			),
		);
		const note = Object.values(created.nextState.content!.items).find(
			(item) => item.title === 'The Bent Nail',
		)!;
		expect(note.kind).toBe('note');
		// The optional variable fell back to its declared default; visibility stayed dm-only.
		expect(note.body).toContain('A tavern in Greenest.');
		expect(note.visibility).toBe('dm-only');
	});

	it('blocks creation when a required variable is missing, writing nothing', () => {
		const env = makeEnvironment();
		const saved = accepted(dispatchCommand(base(), env, cmd('content.save-template', DRAFT)));
		const before = Object.keys(saved.nextState.content!.items).length;
		const result = rejected(
			dispatchCommand(
				saved.nextState,
				env,
				cmd('content.create-from-template', { presetId: 'user:tavern', variables: {} }),
			),
		);
		expect(result.rejection.code).toBe('template-render-invalid');
		expect(Object.keys(result.nextState.content!.items).length).toBe(before);
	});

	it('still rejects an id that is neither a preset nor a saved template', () => {
		const result = rejected(
			dispatchCommand(
				base(),
				makeEnvironment(),
				cmd('content.create-from-template', { presetId: 'user:nope', variables: {} }),
			),
		);
		expect(result.rejection.code).toBe('template-not-found');
	});
});

describe('RC-KNW-1.3 — hydration is tolerant and fail closed', () => {
	it('restores a content document persisted before user templates existed', () => {
		const hydrated = ensureVaultContentState({
			calendars: {},
			items: {},
			savedSearches: {},
			customObjectTypes: {},
			schemaVersion: 1,
		} as never);
		expect(hydrated.userTemplates).toEqual({});
	});

	it('drops a malformed or hostile persisted record rather than trusting it', () => {
		const map = ensureUserContentTemplateMap({
			good: {
				id: 'user:ok',
				name: 'Ok',
				description: '',
				kind: 'note',
				variables: [],
				titleTemplate: 'Ok',
				bodyTemplate: 'Body',
				defaultVisibility: 'dm-only',
				authorActorId: 'a',
				createdAt: 't',
				updatedAt: 't',
				revision: 1,
				schemaVersion: 1,
			},
			shadow: { id: 'session-recap', name: 'Evil', titleTemplate: 'x', bodyTemplate: 'y' },
			hole: {
				id: 'user:hole',
				name: 'Hole',
				titleTemplate: '{{never}}',
				bodyTemplate: 'x',
				variables: [],
			},
			junk: 'not an object',
		});
		expect(Object.keys(map)).toEqual(['user:ok']);
		// A dropped record cannot be resolved, so it can never render into a note.
		expect(resolveContentTemplate(map, 'user:hole')).toBeNull();
		// A preset id still resolves to the preset, never to a persisted impostor.
		expect(resolveContentTemplate(map, 'session-recap')!.name).toBe('Session recap');
	});

	it('a widened visibility on a persisted record normalizes, it does not widen', () => {
		const map = ensureUserContentTemplateMap({
			one: {
				id: 'user:vis',
				name: 'Vis',
				titleTemplate: 'T',
				bodyTemplate: 'B',
				variables: [],
				defaultVisibility: 'everyone',
				authorActorId: 'a',
				createdAt: 't',
				updatedAt: 't',
				revision: 1,
			},
		});
		expect(map['user:vis']!.defaultVisibility).toBe('dm-only');
	});
});
