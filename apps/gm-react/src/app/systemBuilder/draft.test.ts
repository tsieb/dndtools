import { describe, expect, it } from 'vitest';
import { DND5E_SYSTEM_PACKAGE, type SyncOperation } from '@dndtools/core';
import {
	PREVIEW_LEVELS,
	buildPackage,
	draftFromPackage,
	firstBlockedStep,
	forkOriginId,
	issuesForPath,
	nextKey,
	newResource,
	previewFormula,
	previewProficiency,
	stepForPath,
	validateDraft,
	type SystemDraft,
} from './draft';

/**
 * RC-SYS-3.3 — the system builder's model. Everything here is the part of the builder a DM's
 * mistakes actually land on, so it is asserted without a DOM: what the core would reject, which
 * step owns it, and what a formula evaluates to before it is ever saved.
 */

const t = (key: string) => key;

function fork(): SystemDraft {
	return { ...draftFromPackage(DND5E_SYSTEM_PACKAGE), id: 'custom:keeper', displayName: 'Keeper' };
}

describe('the draft round-trips a real package', () => {
	it('forks a built-in without changing anything the schema cares about', () => {
		const draft = fork();
		expect(validateDraft(draft)).toEqual([]);
		expect(buildPackage(draft).attributes).toEqual(DND5E_SYSTEM_PACKAGE.attributes);
	});

	it('trims the free text so two systems cannot differ by a space', () => {
		const draft = { ...fork(), displayName: '  Keeper  ', summary: ' Horror. ', version: ' 1.0 ' };
		const built = buildPackage(draft);
		expect(built.displayName).toBe('Keeper');
		expect(built.summary).toBe('Horror.');
		expect(built.version).toBe('1.0');
	});

	it('is a copy — editing the draft cannot reach the built-in package', () => {
		const draft = fork();
		draft.attributes[0]!.label = 'Mangled';
		expect(DND5E_SYSTEM_PACKAGE.attributes[0]!.label).not.toBe('Mangled');
	});
});

describe('validation is the core schema, attributed to a step', () => {
	it('routes each zod path to the step that can fix it', () => {
		expect(stepForPath(['vocabulary', 'gameMaster'])).toBe('identity');
		expect(stepForPath(['resources', 2, 'maxFormula'])).toBe('resources');
		expect(stepForPath(['turnModel', 'initiativeFormula'])).toBe('dice');
		expect(stepForPath(['creatureSchema', 0, 'options'])).toBe('creature');
	});

	it('refuses a resource whose formula reads an identifier the site does not supply', () => {
		const draft = fork();
		const issues = validateDraft({
			...draft,
			resources: [...draft.resources, { ...newResource(draft.resources), maxFormula: 'sanity' }],
		});
		const path = `resources.${draft.resources.length}.maxFormula`;
		expect(issues.some((issue) => issue.path === path)).toBe(true);
		expect(firstBlockedStep(issues)).toBe('resources');
		expect(issuesForPath(issues, path, t)).toBeTruthy();
	});

	it('refuses a skill keyed off an attribute the package does not declare', () => {
		const draft = fork();
		const issues = validateDraft({
			...draft,
			skills: [{ key: 'sanity-check', label: 'Sanity check', attribute: 'nope' }],
		});
		expect(issues.some((issue) => issue.path === 'skills.0.attribute')).toBe(true);
		expect(firstBlockedStep(issues)).toBe('attributes');
	});

	it('catches the duplicate key the schema cannot see, and localizes its wording', () => {
		const draft = fork();
		const duplicate = { ...draft.resources[0]!, label: 'A second one' };
		const issues = validateDraft({ ...draft, resources: [...draft.resources, duplicate] });
		const found = issues.find((issue) => issue.path.endsWith('.key'));
		expect(found?.messageKey).toBe('systemBuilder.issue.duplicateKey');
		expect(found?.values).toEqual({ key: draft.resources[0]!.key });
	});

	it('reports a clean draft as having no blocked step', () => {
		expect(firstBlockedStep(validateDraft(fork()))).toBeNull();
	});
});

describe('the live formula preview', () => {
	it('evaluates a formula at each preview level through the core evaluator', () => {
		const rows = previewFormula('level + modifier');
		expect(rows.map((row) => row.level)).toEqual([...PREVIEW_LEVELS]);
		expect(rows.map((row) => row.value)).toEqual([4, 8, 13, 23]);
		expect(rows.every((row) => row.message === null)).toBe(true);
	});

	it('binds proficiency to the level being previewed, not to a constant', () => {
		expect(previewFormula('proficiency').map((row) => row.value)).toEqual([2, 3, 4, 6]);
		expect(previewProficiency(1)).toBe(2);
		expect(previewProficiency(20)).toBe(6);
	});

	it('reports the evaluator’s own complaint instead of a number', () => {
		const rows = previewFormula('level / 0');
		expect(rows[0]!.value).toBeNull();
		expect(rows[0]!.message).toBeTruthy();
	});
});

describe('row factories and provenance', () => {
	it('mints a key that is not already taken', () => {
		expect(nextKey('resource', [])).toBe('resource');
		expect(nextKey('resource', [{ key: 'resource' }])).toBe('resource-2');
		expect(nextKey('resource', [{ key: 'resource' }, { key: 'resource-2' }])).toBe('resource-3');
	});

	it('reads the fork origin off the durable operation log', () => {
		const op = (entityId: string, sourcePackageId: string, id: string): SyncOperation => ({
			id,
			vaultId: 'v',
			sourceId: 's',
			actorId: 'dm',
			entityType: 'system-package',
			entityId,
			opType: 'system.fork',
			value: { sourcePackageId },
			dependencies: [],
			issuedAt: '2026-01-01T00:00:00.000Z',
			schemaVersion: 1,
		});
		const log = [
			op('custom:keeper', 'builtin:generic', 'op-1'),
			op('custom:other', 'builtin:dnd5e', 'op-2'),
			op('custom:keeper', 'builtin:dnd5e', 'op-3'),
		];
		// The most recent fork of that id wins.
		expect(forkOriginId(log, 'custom:keeper')).toBe('builtin:dnd5e');
		expect(forkOriginId(log, 'custom:never-forked')).toBeNull();
	});
});
