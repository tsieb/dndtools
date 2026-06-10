import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CONTENT_TEMPLATE_PRESETS,
	VAULT_OBJECT_SUBTYPE_KEY,
	contentTemplatePreset,
	dispatchCommand,
	listContentTemplatePresets,
	renderTemplate,
	templatePlaceholders,
	type Actor,
	type CommandResult,
	type ContentTemplate,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';

/**
 * CONTENT-003 — create content FROM TEMPLATES with VARIABLES, STARTER PRESETS, and VALIDATE-BEFORE-WRITE.
 *
 * Tests are the primary evidence. They prove: deterministic variable substitution; the built-in starter
 * presets; that a MISSING REQUIRED variable blocks creation with a validation message (AC1); that a template
 * defaults/never-widens visibility (AC2); and that INVALID generated content is REJECTED, not written
 * (validate-before-write). Template rendering is pure + deterministic.
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

const RECAP = contentTemplatePreset('session-recap')!;
const STATBLOCK = contentTemplatePreset('npc-statblock')!;
const LORE = contentTemplatePreset('location-lore')!;

describe('CONTENT-003 — starter presets', () => {
	it('publishes the built-in starter presets, fail-closed to dm-only unless declared otherwise', () => {
		const summaries = listContentTemplatePresets();
		expect(summaries.length).toBe(CONTENT_TEMPLATE_PRESETS.length);
		const recap = summaries.find((s) => s.id === 'session-recap')!;
		// The recap is the one preset that explicitly declares player-visible; the rest default to dm-only.
		expect(recap.defaultVisibility).toBe('player-visible');
		expect(summaries.find((s) => s.id === 'npc-statblock')!.defaultVisibility).toBe('dm-only');
		expect(summaries.find((s) => s.id === 'location-lore')!.defaultVisibility).toBe('dm-only');
	});

	it('resolves an unknown preset to null (fail closed)', () => {
		expect(contentTemplatePreset('does-not-exist')).toBeNull();
	});

	it('reports the placeholders a template references', () => {
		expect(templatePlaceholders(RECAP).sort()).toEqual(['session', 'summary']);
	});
});

describe('CONTENT-003 — deterministic variable substitution (pure)', () => {
	it('renders the same bytes for the same template + values (determinism)', () => {
		const a = renderTemplate(RECAP, { session: '12', summary: 'The keep fell.' });
		const b = renderTemplate(RECAP, { session: '12', summary: 'The keep fell.' });
		expect(a).toEqual(b);
		expect(a.title).toBe('Session 12 Recap');
		expect(a.body).toContain('# Session 12');
		expect(a.body).toContain('The keep fell.');
		expect(a.valid).toBe(true);
	});

	it('substitutes an OPTIONAL variable default when omitted', () => {
		const render = renderTemplate(LORE, { place: 'Highmoor' });
		expect(render.body).toContain('A location in the frontier.');
		expect(render.valid).toBe(true);
	});

	it('an OPTIONAL value the caller supplies overrides the default', () => {
		const render = renderTemplate(LORE, { place: 'Highmoor', region: 'the Dalelands' });
		expect(render.body).toContain('A location in the Dalelands.');
	});

	it('reports an UNKNOWN supplied variable as advisory (not blocking)', () => {
		const render = renderTemplate(LORE, { place: 'Highmoor', bogus: 'x' });
		expect(render.issues.some((i) => i.code === 'unknown-variable' && i.field === 'bogus')).toBe(true);
		// Advisory only — a valid required set still renders valid.
		expect(render.valid).toBe(true);
	});
});

describe('CONTENT-003 AC1 — a missing required variable blocks creation with a validation message', () => {
	it('renderTemplate fails closed when a required variable is omitted', () => {
		const render = renderTemplate(RECAP, { session: '12' });
		expect(render.valid).toBe(false);
		const issue = render.issues.find((i) => i.code === 'missing-variable' && i.field === 'summary');
		expect(issue).toBeDefined();
		expect(issue!.message).toContain('required');
	});

	it('an empty/whitespace-only required value is treated as missing (fail closed)', () => {
		const render = renderTemplate(RECAP, { session: '12', summary: '   ' });
		expect(render.valid).toBe(false);
		expect(render.issues.some((i) => i.code === 'missing-variable' && i.field === 'summary')).toBe(true);
	});

	it('the create command REJECTS a missing required variable; nothing is written', () => {
		const env = makeEnvironment();
		const state = base();
		const result = rejected(
			dispatchCommand(
				state,
				env,
				cmd('content.create-from-template', { presetId: 'session-recap', variables: { session: '12' } }),
			),
		);
		expect(result.rejection.code).toBe('template-render-invalid');
		expect(result.rejection.issues?.some((i) => i.path === 'summary')).toBe(true);
		// No item created, no op appended.
		expect(Object.keys(result.nextState.content.items)).toHaveLength(0);
		expect(result.nextState.sync.operations).toHaveLength(0);
	});
});

describe('CONTENT-003 AC2 — visibility is explicit or fails closed to dm-only', () => {
	it('a note template defaulting to dm-only creates a dm-only item', () => {
		const env = makeEnvironment();
		const result = accepted(
			dispatchCommand(
				base(),
				env,
				cmd('content.create-from-template', {
					presetId: 'location-lore',
					variables: { place: 'Highmoor' },
				}),
			),
		);
		const item = Object.values(result.nextState.content.items)[0]!;
		expect(item.visibility).toBe('dm-only');
	});

	it('a player-visible template default is honored when created (explicit visibility)', () => {
		const env = makeEnvironment();
		const result = accepted(
			dispatchCommand(
				base(),
				env,
				cmd('content.create-from-template', {
					presetId: 'session-recap',
					variables: { session: '1', summary: 'Begin.' },
				}),
			),
		);
		const item = Object.values(result.nextState.content.items)[0]!;
		expect(item.visibility).toBe('player-visible');
	});

	it('an explicit visibility override is applied', () => {
		const env = makeEnvironment();
		const result = accepted(
			dispatchCommand(
				base(),
				env,
				cmd('content.create-from-template', {
					presetId: 'session-recap',
					variables: { session: '1', summary: 'Begin.' },
					visibility: 'dm-only',
				}),
			),
		);
		const item = Object.values(result.nextState.content.items)[0]!;
		expect(item.visibility).toBe('dm-only');
	});

	it('an UNKNOWN visibility coerces fail-closed to dm-only at the template layer', () => {
		const sneaky: ContentTemplate = {
			...LORE,
			defaultVisibility: 'totally-public' as unknown as ContentTemplate['defaultVisibility'],
		};
		const render = renderTemplate(sneaky, { place: 'X' });
		expect(render.visibility).toBe('dm-only');
	});
});

describe('CONTENT-003 — validate-before-write of the generated content', () => {
	it('REJECTS generated markdown that is invalid (no item written)', () => {
		// A note template whose body produces an unterminated frontmatter block — the EXISTING markdown
		// validator must reject it, so the template never writes invalid content.
		const broken: ContentTemplate = {
			id: 'broken-md',
			name: 'Broken markdown',
			description: 'Generates invalid markdown.',
			kind: 'note',
			variables: [{ name: 'x', label: 'X', required: true }],
			titleTemplate: '{{x}}',
			bodyTemplate: '---\ntitle: {{x}}\nno closing fence',
		};
		const render = renderTemplate(broken, { x: 'oops' });
		expect(render.markdownValidation.valid).toBe(false);
		expect(render.valid).toBe(false);
		expect(render.issues.some((i) => i.code === 'generated-content-invalid')).toBe(true);
	});

	it('an OBJECT template validates the generated frontmatter through the EXISTING schema validator', () => {
		const render = renderTemplate(STATBLOCK, { name: 'Bane' });
		expect(render.kind).toBe('object');
		expect(render.objectValidation).not.toBeNull();
		expect(render.objectValidation!.valid).toBe(true);
		expect(render.valid).toBe(true);
	});

	it('REJECTS an object template whose generated frontmatter declares no registered subtype', () => {
		const noSubtype: ContentTemplate = {
			id: 'no-subtype',
			name: 'No subtype',
			description: 'Object template missing a subtype.',
			kind: 'object',
			variables: [{ name: 'title', label: 'Title', required: true }],
			titleTemplate: '{{title}}',
			bodyTemplate: '---\ntitle: {{title}}\n---\n\nBody.',
		};
		const render = renderTemplate(noSubtype, { title: 'X' });
		expect(render.objectValidation!.valid).toBe(false);
		expect(render.valid).toBe(false);
	});

	it('the create command commits a VALID object template through the existing create-object path', () => {
		const env = makeEnvironment();
		const result = accepted(
			dispatchCommand(
				base(),
				env,
				cmd('content.create-from-template', {
					presetId: 'npc-statblock',
					variables: { name: 'Bane' },
				}),
			),
		);
		const item = Object.values(result.nextState.content.items)[0]!;
		expect(item.kind).toBe('object');
		expect(item.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('handout');
		expect(item.visibility).toBe('dm-only');
		// The durable write went through the existing create-object command (its op type proves the path).
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('content.create-object');
	});

	it('the create command commits a VALID note template through the existing create-item path', () => {
		const env = makeEnvironment();
		const result = accepted(
			dispatchCommand(
				base(),
				env,
				cmd('content.create-from-template', {
					presetId: 'session-recap',
					variables: { session: '1', summary: 'Begin.' },
				}),
			),
		);
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('content.create-item');
	});
});

describe('CONTENT-003 — authoring authority (fail closed)', () => {
	it('rejects an unknown preset id', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, cmd('content.create-from-template', { presetId: 'nope' })),
		);
		expect(result.rejection.code).toBe('template-not-found');
	});

	it('fails closed: a player with no grant cannot create from a template (DM-only authoring)', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(
				base(),
				env,
				cmd(
					'content.create-from-template',
					{ presetId: 'location-lore', variables: { place: 'X' } },
					PLAYER_ACTOR.id,
				),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(Object.keys(result.nextState.content.items)).toHaveLength(0);
	});

	it('fails closed: an observer cannot create from a template', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(
				base(),
				env,
				cmd(
					'content.create-from-template',
					{ presetId: 'location-lore', variables: { place: 'X' } },
					OBSERVER_ACTOR.id,
				),
			),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});
