import { describe, expect, it } from 'vitest';
import { dispatchCommand, type WidgetIntentDescriptor } from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { buildPackage, emptyDraft, readPackage, validateIntents, type WidgetDraft } from './draft';
import { applyDraftDiff, diffDrafts } from './draftDiff';
import { INTENT_CATALOG, uniqueIntentId } from './vocabulary';

/**
 * RC-WID-5.1 — the builder's "Open and create" section.
 *
 * Every catalogue seed has to be a descriptor the core installs (the schema is strict, so a seed
 * that drifted from it would be refused on Review), and the step has to name the two problems the
 * core does not: a template open button with nothing to open, and a custom widget that declares
 * intents without asking for `navigate`, whose every request the host would drop.
 */

function launcherDraft(overrides: Partial<WidgetDraft> = {}): WidgetDraft {
	return {
		...emptyDraft(),
		packageId: 'workspace.table-launcher',
		typeId: 'table-launcher',
		name: 'Table launcher',
		template: 'action-panel',
		...overrides,
	};
}

const openCharacter: WidgetIntentDescriptor = {
	id: 'open-character',
	displayName: 'Open character',
	kind: 'open-entity',
	entityKind: 'character',
	targetId: 'character-1',
};

describe('RC-WID-5.1 builder intents', () => {
	it('installs every catalogue seed through the core and reads it back', () => {
		const intents = INTENT_CATALOG.map((entry) =>
			entry.seed.kind === 'open-entity' || entry.seed.kind === 'open-screen'
				? { ...entry.seed, targetId: 'target-1' }
				: entry.seed,
		);
		const draft = launcherDraft({ intents });
		const env = makeEnvironment();
		const result = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: buildPackage(draft) },
		});
		expect(result.status === 'rejected' ? result.rejection : null).toBeNull();
		expect(readPackage(buildPackage(draft)).intents).toEqual(intents);
	});

	it('leaves `intents` out of a package that declares none', () => {
		expect('intents' in buildPackage(launcherDraft()).widgets[0]!).toBe(false);
	});

	it('suffixes a repeated seed id until it is unique', () => {
		expect(uniqueIntentId('open-character', [])).toBe('open-character');
		expect(uniqueIntentId('open-character', [openCharacter])).toBe('open-character-2');
		expect(
			uniqueIntentId('open-character', [
				openCharacter,
				{ ...openCharacter, id: 'open-character-2' },
			]),
		).toBe('open-character-3');
	});

	it('has nothing to say about a template whose open button carries its target', () => {
		expect(validateIntents(launcherDraft({ intents: [openCharacter] }))).toEqual([]);
	});

	it('names a template open button with nothing to open, and an empty label', () => {
		const { targetId: _target, ...untargeted } = openCharacter as WidgetIntentDescriptor & {
			targetId?: string;
		};
		const issues = validateIntents(
			launcherDraft({
				intents: [
					untargeted as WidgetIntentDescriptor,
					{ id: 'new-map', displayName: ' ', kind: 'create', target: 'map' },
				],
			}),
		);
		expect(issues.map((issue) => issue.message)).toEqual([
			'builder.issue.intentTarget',
			'builder.issue.intentName',
		]);
		expect(issues.every((issue) => issue.step === 'commands' && issue.field === 'intents')).toBe(
			true,
		);
	});

	it('lets custom code choose the target, but not without `navigate`', () => {
		const { targetId: _target, ...untargeted } = openCharacter as WidgetIntentDescriptor & {
			targetId?: string;
		};
		const custom = launcherDraft({
			runtime: 'custom-html-js',
			intents: [untargeted as WidgetIntentDescriptor],
		});
		expect(validateIntents(custom).map((issue) => issue.message)).toEqual([
			'builder.issue.intentsNeedNavigate',
		]);
		expect(validateIntents({ ...custom, hostPermissions: ['navigate'] })).toEqual([]);
	});

	it('diffs an intent by its destination, so a target-only change can be reviewed and applied', () => {
		const openQuest: WidgetIntentDescriptor = {
			id: 'open-quest',
			displayName: 'Open quest',
			kind: 'open-entity',
			entityKind: 'quest',
			targetId: 'quest-1',
		};
		const before = launcherDraft({ intents: [openQuest] });
		const after = launcherDraft({ intents: [{ ...openQuest, targetId: 'quest-2' }] });
		const diffs = diffDrafts(before, after);
		expect(diffs).toEqual([
			{
				field: 'intents',
				label: 'builder.intents.title',
				before: 'Open quest → quest quest-1',
				after: 'Open quest → quest quest-2',
			},
		]);
		expect(applyDraftDiff(before, after, ['intents']).intents).toEqual(after.intents);

		// Same label, different kind: still a change.
		const retargeted = launcherDraft({
			intents: [{ id: 'open-quest', displayName: 'Open quest', kind: 'create', target: 'map' }],
		});
		expect(diffDrafts(before, retargeted)[0]?.after).toBe('Open quest → new map');
		// Same descriptor in a fresh array: no change.
		expect(diffDrafts(before, launcherDraft({ intents: [{ ...openQuest }] }))).toEqual([]);
	});
});
