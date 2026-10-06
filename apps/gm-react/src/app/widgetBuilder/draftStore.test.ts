import { describe, expect, it } from 'vitest';
import {
	TORCHLIGHT_STARTER,
	dispatchCommand,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import {
	MAX_STORED_DRAFTS,
	buildPackage,
	draftStorageKey,
	editStepFor,
	emptyDraft,
	isDraftDirty,
	readPackage,
	readStoredDraft,
	removeStoredDraft,
	resumeDraft,
	widgetEditTarget,
	writeStoredDraft,
	type StoredWidgetDraft,
	type WidgetDraft,
} from './draft';

/**
 * RC-WID-6.6 — drafts survive, and every tile can become yours.
 *
 * The builder keeps a changed draft in device preferences under the package id it opened on, until
 * it is installed or discarded. These are the pure halves: the stored value's read, write and
 * removal (with its cap and its tolerance of a value it did not write), the dirty check the Keep or
 * Discard question hangs on, and the choice "Edit widget" makes for a tile.
 */

function named(name: string, overrides: Partial<WidgetDraft> = {}): WidgetDraft {
	return { ...emptyDraft(), name, packageId: `workspace.${name}`, typeId: name, ...overrides };
}

function entry(draft: WidgetDraft, savedAt: string): StoredWidgetDraft {
	return { draft, step: 'data', savedAt };
}

describe('RC-WID-6.6 kept drafts', () => {
	it('keeps a draft under its package id and reads back exactly that draft', () => {
		const draft = named('torch', { description: 'Half written', dataQueries: [] });
		const raw = writeStoredDraft(null, 'workspace.torch', {
			draft,
			step: 'advanced',
			savedAt: '2026-10-06T10:00:00.000Z',
		});
		expect(readStoredDraft(raw, 'workspace.torch')).toEqual({
			draft,
			step: 'advanced',
			savedAt: '2026-10-06T10:00:00.000Z',
		});
		// Another package's builder never resumes into this one.
		expect(readStoredDraft(raw, 'workspace.other')).toBeNull();
		// A brand-new widget keeps its draft under the empty key.
		expect(draftStorageKey(undefined)).toBe('');
		expect(draftStorageKey('workspace.torch')).toBe('workspace.torch');
	});

	it('replaces a package draft in place and removes it once installed or discarded', () => {
		let raw = writeStoredDraft(null, 'a', entry(named('a'), '2026-10-06T10:00:00.000Z'));
		raw = writeStoredDraft(raw, 'b', entry(named('b'), '2026-10-06T10:01:00.000Z'));
		raw = writeStoredDraft(
			raw,
			'a',
			entry(named('a', { description: 'v2' }), '2026-10-06T10:02:00.000Z'),
		);
		expect(readStoredDraft(raw, 'a')!.draft.description).toBe('v2');
		const withoutA = removeStoredDraft(raw, 'a');
		expect(readStoredDraft(withoutA, 'a')).toBeNull();
		expect(readStoredDraft(withoutA, 'b')).not.toBeNull();
		// The last draft gone, nothing is left to store: the caller removes the preference.
		expect(removeStoredDraft(withoutA, 'b')).toBeNull();
	});

	it(`keeps at most ${MAX_STORED_DRAFTS} drafts, dropping the oldest first`, () => {
		let raw: string | null = null;
		for (let i = 0; i <= MAX_STORED_DRAFTS; i += 1) {
			const savedAt = `2026-10-06T10:${String(i).padStart(2, '0')}:00.000Z`;
			raw = writeStoredDraft(raw, `p${i}`, entry(named(`p${i}`), savedAt));
		}
		expect(Object.keys(JSON.parse(raw!))).toHaveLength(MAX_STORED_DRAFTS);
		expect(readStoredDraft(raw, 'p0')).toBeNull();
		expect(readStoredDraft(raw, `p${MAX_STORED_DRAFTS}`)).not.toBeNull();
	});

	it('reads a value it did not write as no draft, and a stale draft over fresh defaults', () => {
		expect(readStoredDraft('not json', '')).toBeNull();
		expect(readStoredDraft('[]', '')).toBeNull();
		expect(
			readStoredDraft(JSON.stringify({ '': { draft: 'x', step: 'data', savedAt: 'now' } }), ''),
		).toBeNull();
		expect(
			readStoredDraft(JSON.stringify({ '': { draft: {}, step: 'nowhere', savedAt: 'now' } }), ''),
		).toBeNull();
		// A draft from an older build: a field of the wrong shape falls back, a missing one defaults.
		const stale = { name: 'Old', dataQueries: 'not a list', customCode: null, futureField: 1 };
		const read = readStoredDraft(
			JSON.stringify({ '': { draft: stale, step: 'identity', savedAt: 'now' } }),
			'',
		)!;
		expect(read.draft).toEqual({ ...emptyDraft(), name: 'Old' });
		// Writing over a corrupt value starts a fresh store rather than throwing.
		expect(
			readStoredDraft(writeStoredDraft('{', 'a', entry(named('a'), 'now')), 'a'),
		).not.toBeNull();
	});

	it('a kept draft survives the round trip through build and read with no change', () => {
		const draft = readPackage(TORCHLIGHT_STARTER.build());
		const raw = writeStoredDraft(null, 'starter.torchlight', entry(draft, 'now'));
		const back = readStoredDraft(raw, 'starter.torchlight')!.draft;
		expect(isDraftDirty(draft, back)).toBe(false);
		expect(buildPackage(back)).toEqual(buildPackage(draft));
	});

	it('resumes a kept edit on top of the version installed now', () => {
		const kept = { ...readPackage(TORCHLIGHT_STARTER.build()), name: 'My torch' };
		// Same base: carried on exactly.
		expect(resumeDraft(readPackage(TORCHLIGHT_STARTER.build()), kept)).toBe(kept);
		// The package moved to 1.0.3 meanwhile: the edit is kept, the version identity is today's.
		const moved = readPackage({ ...TORCHLIGHT_STARTER.build(), version: '1.0.3' });
		expect(resumeDraft(moved, kept)).toMatchObject({
			name: 'My torch',
			version: '1.0.4',
			baseVersion: '1.0.3',
		});
	});

	it('is dirty only when the content moved, whatever order its keys are in', () => {
		const base = named('torch');
		expect(isDraftDirty(base, { ...base })).toBe(false);
		const reordered = Object.fromEntries(Object.entries(base).reverse()) as unknown as WidgetDraft;
		expect(isDraftDirty(base, reordered)).toBe(false);
		expect(isDraftDirty(base, { ...base, name: 'Torch!' })).toBe(true);
		expect(isDraftDirty(base, { ...base, customCode: { ...base.customCode, js: 'x' } })).toBe(true);
	});

	it("reads a starter's own files into the three editors, and builds them back runnable", () => {
		const starter = TORCHLIGHT_STARTER.build();
		const file = (path: string) => starter.assets.find((asset) => asset.path === path)!.content!;
		const { customCode } = readPackage(starter);
		// Its stylesheet and script sit under widgets/torchlight/, not at the builder's root paths.
		expect(customCode.css).toBe(file('widgets/torchlight/styles.css'));
		expect(customCode.js).toBe(file('widgets/torchlight/main.js'));
		// The markup is the body, without the link and script the builder's document adds back.
		expect(customCode.html).toContain('data-torch');
		expect(customCode.html).not.toMatch(/<script|<link|<body|<!doctype/i);

		const built = buildPackage(readPackage(starter));
		const entry = built.assets.find((asset) => asset.entrypoint)!.content!;
		expect(entry.match(/<script src="\.\/main\.js"><\/script>/g)).toHaveLength(1);
		expect(entry.match(/<link rel="stylesheet" href="\.\/styles\.css" \/>/g)).toHaveLength(1);
		expect(built.assets.find((asset) => asset.path === 'main.js')!.content).toBe(
			file('widgets/torchlight/main.js'),
		);
		// And a package this builder wrote still reads back exactly.
		expect(readPackage(built).customCode).toEqual(customCode);
	});

	it('opens a tile edit on Data, or on Advanced for custom code', () => {
		expect(editStepFor(emptyDraft())).toBe('data');
		expect(editStepFor(readPackage(TORCHLIGHT_STARTER.build()))).toBe('advanced');
	});
});

describe('RC-WID-6.6 what "Edit widget" opens', () => {
	function vault() {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const run = (command: Omit<CoreCommand, 'actorId'>) => {
			const result = dispatchCommand(state, env, {
				...command,
				actorId: DM_ACTOR.id,
			} as CoreCommand);
			if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
			state = result.nextState;
		};
		return {
			run,
			get state(): CoreStateSlice {
				return state;
			},
		};
	}

	it('copies a starter, reuses an unplaced copy, and edits the GM own package in place', () => {
		const v = vault();
		v.run({
			type: 'widget.package.install',
			payload: { package: TORCHLIGHT_STARTER.build() },
		} as never);
		const first = widgetEditTarget(v.state, 'torchlight');
		expect(first).toMatchObject({ kind: 'fork', name: 'Torchlight' });

		v.run({
			type: 'widget.package.fork',
			payload: { packageId: 'starter.torchlight', widgetType: 'torchlight' },
		} as never);
		// The copy waits unplaced (it is off until saved): the next edit reuses it, so its draft resumes.
		const again = widgetEditTarget(v.state, 'torchlight');
		expect(again?.kind).toBe('copy');
		expect(again && again.kind !== 'fork' && again.record.package.id).toBe('user.torchlight');

		// The copy itself is the GM's own package.
		expect(widgetEditTarget(v.state, 'torchlight-copy')?.kind).toBe('own');
	});

	it('offers nothing for a built-in widget or a removed package', () => {
		const v = vault();
		const builtin = Object.values(v.state.widgets.packages)
			.flatMap((record) => record.package.widgets)
			.find((widget) => widget.renderEntrypoint?.runtime === 'builtin')!;
		expect(widgetEditTarget(v.state, builtin.type)).toBeNull();
		expect(widgetEditTarget(v.state, 'nothing-declares-this')).toBeNull();

		const own = buildPackage(named('mine'));
		v.run({ type: 'widget.package.install', payload: { package: own } } as never);
		expect(widgetEditTarget(v.state, 'mine')?.kind).toBe('own');
		v.run({ type: 'widget.package.remove', payload: { packageId: own.id } } as never);
		expect(widgetEditTarget(v.state, 'mine')).toBeNull();
	});
});
