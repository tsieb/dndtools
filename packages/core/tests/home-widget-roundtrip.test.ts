import { describe, expect, it } from 'vitest';
import {
	HOME_WIDGET_TYPES,
	dispatchCommand,
	exportWidgetPackage,
	findPackageRecordForWidgetType,
	widgetPackageForkIdentity,
} from '../src';
import { buildInitialState, DM_ACTOR, makeEnvironment } from '../src/testing/fixtures';

describe('RC-WID-5.6 shipped home package bytes', () => {
	it.each(HOME_WIDGET_TYPES)('%s survives export/import/export unchanged', (type) => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const record = findPackageRecordForWidgetType(state.widgets, type)!;
		const identity = widgetPackageForkIdentity(state.widgets, type);
		const forked = dispatchCommand(state, env, {
			type: 'widget.package.fork',
			actorId: DM_ACTOR.id,
			payload: { packageId: record.package.id, widgetType: type },
		});
		if (forked.status !== 'accepted') throw new Error(forked.rejection.message);
		const exported = exportWidgetPackage(forked.nextState.widgets, env, identity.packageId);
		if ('kind' in exported) throw new Error('Cannot export fork');
		const bytes = JSON.stringify(exported.package, null, '\t');
		const imported = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: JSON.parse(bytes) },
		});
		if (imported.status !== 'accepted') throw new Error(imported.rejection.message);
		const again = exportWidgetPackage(imported.nextState.widgets, env, identity.packageId);
		if ('kind' in again) throw new Error('Cannot export imported package');
		expect(JSON.stringify(again.package, null, '\t')).toBe(bytes);
		// Importing a copy cannot rewrite the shipped source or any existing board.
		expect(imported.nextState.widgets.packages[record.package.id]).toEqual(record);
		expect(imported.nextState.scenes).toEqual(state.scenes);
	});
});
