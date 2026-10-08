import { describe, expect, it } from 'vitest';
import { dispatchCommand, evaluateWidgetPackageAuthorTrust } from '@dndtools/core';
import { buildInitialState, DM_ACTOR, PLAYER_ACTOR, makeEnvironment } from '@dndtools/core/testing';
import { buildPackage, readPackage } from './draft';
import { QUICK_RECIPES, quickAudience, quickCommands, quickDraft } from './quickRecipes';
import { validateDraft } from './validate';

describe('RC-WID-5.5 / RC-WID-6.3 recipe parity', () => {
	it.each(QUICK_RECIPES)(
		'$id is an ordinary template: Quick → Full → export → import → export',
		(recipe) => {
			const draft = quickDraft(recipe.id, 'parity');
			expect(validateDraft(draft)).toEqual([]);
			const pkg = buildPackage(draft);
			expect(pkg.widgets[0]!.renderEntrypoint).toMatchObject({
				runtime: 'template',
				template: recipe.preset.template,
			});
			// Full consumes the very same object, then exports buildPackage. The core importer validates
			// the actual JSON and stores it; readPackage proposed does not invent an upgrade version.
			const firstExport = JSON.stringify(pkg);
			const imported = dispatchCommand(
				buildInitialState(DM_ACTOR, PLAYER_ACTOR),
				makeEnvironment(),
				{
					type: 'widget.package.install',
					actorId: DM_ACTOR.id,
					payload: { package: JSON.parse(firstExport) },
				},
			);
			if (imported.status !== 'accepted') throw new Error(JSON.stringify(imported.rejection));
			const full = readPackage(imported.nextState.widgets.packages[pkg.id]!.package, 'proposed');
			expect(JSON.stringify(buildPackage(full))).toBe(firstExport);
			const shared = { ...draft, ...quickAudience(draft, true) };
			expect(shared.dataQueries.every((query) => query.audience === 'shared')).toBe(true);
			const sharedJson = JSON.stringify(buildPackage(shared));
			const sharedImport = dispatchCommand(
				buildInitialState(DM_ACTOR, PLAYER_ACTOR),
				makeEnvironment(),
				{
					type: 'widget.package.install',
					actorId: DM_ACTOR.id,
					payload: { package: JSON.parse(sharedJson) },
				},
			);
			if (sharedImport.status !== 'accepted')
				throw new Error(JSON.stringify(sharedImport.rejection));
			expect(
				JSON.stringify(
					buildPackage(
						readPackage(sharedImport.nextState.widgets.packages[pkg.id]!.package, 'proposed'),
					),
				),
			).toBe(sharedJson);
		},
	);
	it.each(['party', 'counter'])('%s installs enabled without an extra trust question', (id) => {
		const pkg = buildPackage(quickDraft(id, 'trusted'));
		expect(evaluateWidgetPackageAuthorTrust(pkg).eligible).toBe(true);
		const result = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), makeEnvironment(), {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: pkg, authorTrust: true },
		});
		if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
		expect(result.nextState.widgets.packages[pkg.id]!.enabled).toBe(true);
	});
	it('presets are independent and command choices carry the catalogue settings', () => {
		const first = quickDraft('party', 'first');
		first.dataQueries[0]!.audience = 'shared';
		expect(quickDraft('party', 'second').dataQueries[0]!.audience).toBe('dm');
		expect(quickCommands('buttons', [0])).toMatchObject({
			commands: [{ executor: 'roll' }],
			configFields: [{ key: 'formula', default: '1d20' }],
		});
	});
});
