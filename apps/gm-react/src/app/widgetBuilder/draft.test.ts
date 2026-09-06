import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	widgetQueryFormulaIdentifier,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import {
	DOCK_PREFERENCE_KEY,
	bumpPatch,
	buildPackage,
	emptyDraft,
	firstBlockedStep,
	generateMigration,
	readPackage,
	slugify,
	validateDraft,
	type WidgetDraft,
} from './draft';

/**
 * RC-WID-2.1 — the builder's draft model.
 *
 * The load-bearing assertion is not that `buildPackage` returns an object with the right keys: it
 * is that the object the builder produces is one the CORE accepts. Every test that matters here
 * therefore runs the real `widget.package.install` / `widget.package.upgrade` reducers over a real
 * campaign state, and reads the result back out of the registry.
 */

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

/** A DM's campaign with a home scene, ready to install a package into and place a widget on. */
function campaign(): { state: CoreStateSlice; run: (command: CoreCommand) => void } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const box = {
		get state() {
			return state;
		},
		run: (command: CoreCommand) => {
			state = accept(dispatchCommand(state, env, command));
		},
	};
	box.run({ type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} });
	return box as { state: CoreStateSlice; run: (command: CoreCommand) => void };
}

/** The story's own acceptance shape: a status-list widget bound to the current combatants. */
function statusListDraft(): WidgetDraft {
	return {
		...emptyDraft(),
		packageId: 'workspace.party-status',
		typeId: 'party-status',
		name: 'Party status',
		description: 'Who is up, who is down.',
		category: 'Combat',
		icon: 'heart',
		template: 'status-list',
		dataQueries: [
			{
				id: 'current-combatants',
				label: 'Current combatants',
				source: 'current-combatants',
				requiredCapability: 'viewer',
				audience: 'shared',
			},
		],
	};
}

describe('RC-WID-2.1 widget builder draft', () => {
	it('slugifies a spoken name into an id', () => {
		expect(slugify('Party Status!')).toBe('party-status');
		expect(slugify('  Loot   Ledger ')).toBe('loot-ledger');
		expect(slugify('workspace.Party Status')).toBe('workspace.party-status');
	});

	it('bumps the patch component and leaves a non-semver alone', () => {
		expect(bumpPatch('1.0.0')).toBe('1.0.1');
		expect(bumpPatch('2.7.9')).toBe('2.7.10');
		expect(bumpPatch('draft')).toBe('draft');
	});

	it('builds a package the core installs', () => {
		const box = campaign();
		box.run({
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: buildPackage(statusListDraft()) },
		});
		const record = box.state.widgets.packages['workspace.party-status'];
		expect(record).toBeDefined();
		const definition = record!.package.widgets[0]!;
		expect(definition.type).toBe('party-status');
		expect(definition.renderEntrypoint?.runtime).toBe('template');
		expect(definition.renderEntrypoint?.template).toBe('status-list');
		expect(definition.dataQueries?.[0]?.source).toBe('current-combatants');
		// Fail closed: a fresh install is unreviewed, disabled, and holds no host permission.
		expect(record!.enabled).toBe(false);
		expect(record!.trust.state).toBe('unreviewed');
	});

	it('always declares the dock preference as a display config field', () => {
		const definition = buildPackage({ ...statusListDraft(), dockPreference: 'right' }).widgets[0]!;
		const field = definition.configFields?.find((entry) => entry.key === DOCK_PREFERENCE_KEY);
		expect(field?.group).toBe('display');
		expect(field?.default).toBe('right');
		// It is a real declared key, so the configuration schema knows about it.
		expect(definition.configurationSchema.properties?.[DOCK_PREFERENCE_KEY]?.type).toBe('string');
	});

	it('round-trips an installed package back into a draft', () => {
		const original = statusListDraft();
		const pkg = buildPackage(original);
		const back = readPackage(pkg);
		expect(back.typeId).toBe(original.typeId);
		expect(back.template).toBe(original.template);
		expect(back.dataQueries).toEqual(original.dataQueries);
		expect(back.icon).toBe('heart');
		// Reading an installed package is the start of an EDIT, so the version is pre-bumped and the
		// version it came from is remembered for the migration.
		expect(back.version).toBe('1.0.1');
		expect(back.baseVersion).toBe('1.0.0');
	});

	it('generates no migration until the version moves', () => {
		const draft = readPackage(buildPackage(statusListDraft()));
		expect(generateMigration({ ...draft, version: '1.0.0' })).toBeNull();
		const migration = generateMigration(draft);
		expect(migration).toEqual({
			widgetType: 'party-status',
			fromVersion: '1.0.0',
			toVersion: '1.0.1',
		});
	});

	it('upgrades a placed widget rather than disabling it', () => {
		const box = campaign();
		const first = statusListDraft();
		box.run({
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: buildPackage(first) },
		});
		box.run({
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: first.packageId },
		});
		const sceneId = box.state.commandCenter.homeSceneId as string;
		box.run({
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId,
				widget: {
					type: 'party-status',
					version: '1.0.0',
					layout: { x: 0, y: 0, w: 4, h: 3 },
				},
			},
		});

		// The edit: a new setting, on a new version.
		const edited: WidgetDraft = {
			...readPackage(box.state.widgets.packages[first.packageId]!.package),
			configFields: [
				{
					key: 'showDown',
					label: 'Show downed',
					control: 'toggle',
					group: 'display',
					default: true,
				},
			],
		};
		box.run({
			type: 'widget.package.upgrade',
			actorId: DM_ACTOR.id,
			payload: {
				package: buildPackage(
					edited,
					box.state.widgets.packages[first.packageId]!.package.migrations,
				),
			},
		});

		const placed = box.state.scenes.scenes[sceneId]!.widgets.find(
			(widget) => widget.type === 'party-status',
		);
		expect(placed?.version).toBe('1.0.1');
		expect(placed?.disabled).toBeNull();
		// The new setting arrived with its declared default rather than being left undefined.
		expect(placed?.configuration.showDown).toBe(true);
		expect(box.state.widgets.packages[first.packageId]!.migrationStatus.state).toBe('migrated');
	});

	it('names the step that needs attention', () => {
		const issues = validateDraft({
			...emptyDraft(),
			packageId: 'Not A Slug',
			typeId: '',
			name: '',
			minSize: { width: 900, height: 100 },
		});
		expect(firstBlockedStep(issues)).toBe('identity');
		expect(issues.map((issue) => issue.field)).toContain('name');
		expect(issues.map((issue) => issue.field)).toContain('packageId');
		expect(issues.map((issue) => issue.field)).toContain('minSize.width');
	});

	it('accepts a well-formed draft with no issues', () => {
		expect(validateDraft(statusListDraft())).toEqual([]);
	});

	it('refuses a duplicate config key and a duplicate query id', () => {
		const draft: WidgetDraft = {
			...statusListDraft(),
			dataQueries: [
				...statusListDraft().dataQueries,
				{
					id: 'current-combatants',
					label: 'Again',
					source: 'current-combatants',
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
			configFields: [
				{ key: 'mood', label: 'Mood', control: 'text', group: 'content', default: '' },
				{ key: 'mood', label: 'Mood again', control: 'text', group: 'content', default: '' },
			],
		};
		const fields = validateDraft(draft).map((issue) => issue.field);
		expect(fields).toContain('dataQueries');
		expect(fields).toContain('configFields');
	});

	it('refuses a computed formula that names a query the draft does not declare', () => {
		const base = statusListDraft();
		const issues = validateDraft({
			...base,
			computedFields: [
				{
					id: 'total',
					label: 'Total',
					inputQueryIds: [base.dataQueries[0]!.id],
					valueType: 'number',
					formula: 'nothing_sum + 1',
				},
			],
		});
		expect(issues.map((issue) => issue.field)).toContain('computedFields');
	});

	it('accepts a computed formula over the columns of a declared query', () => {
		const base = statusListDraft();
		const draft: WidgetDraft = {
			...base,
			computedFields: [
				{
					id: 'total',
					label: 'Total',
					inputQueryIds: [base.dataQueries[0]!.id],
					valueType: 'number',
					formula: `round(${widgetQueryFormulaIdentifier(base.dataQueries[0]!.id, 'sum')} / 2)`,
				},
			],
		};
		expect(validateDraft(draft)).toEqual([]);
		// And the core accepts what the builder built from it.
		const box = campaign();
		box.run({
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: buildPackage(draft) },
		});
		const installed = box.state.widgets.packages[draft.packageId]?.package.widgets[0];
		expect(installed?.computedFields?.[0]?.formula).toBe(draft.computedFields[0]!.formula);
	});

	it('refuses a binding without an entity type, and a binding query that reaches for a missing one', () => {
		const base = statusListDraft();
		const issues = validateDraft({
			...base,
			requiredBindings: [
				{
					id: 'subject',
					label: 'Subject',
					entityTypes: [],
					mode: 'read',
					requiredCapability: 'viewer',
				},
			],
			dataQueries: [
				{
					id: 'bound',
					label: 'Bound',
					source: 'binding',
					bindingIds: ['gone'],
					requiredCapability: 'viewer',
					audience: 'shared',
				},
			],
		});
		const fields = issues.map((issue) => issue.field);
		expect(fields).toContain('bindings');
		expect(fields).toContain('dataQueries');
	});

	it('round-trips a binding and its formula through install and back into a draft', () => {
		const base = statusListDraft();
		const draft: WidgetDraft = {
			...base,
			requiredBindings: [
				{
					id: 'subject',
					label: 'Subject',
					entityTypes: ['character', 'npc'],
					mode: 'operate',
					requiredCapability: 'operator',
				},
			],
			optionalBindings: [
				{
					id: 'backdrop',
					label: 'Backdrop',
					entityTypes: ['scene'],
					mode: 'observe',
					requiredCapability: 'viewer',
				},
			],
			computedFields: [
				{
					id: 'total',
					label: 'Total',
					inputQueryIds: [base.dataQueries[0]!.id],
					valueType: 'number',
					formula: widgetQueryFormulaIdentifier(base.dataQueries[0]!.id, 'count'),
				},
			],
		};
		expect(validateDraft(draft)).toEqual([]);
		const reread = readPackage(buildPackage(draft));
		expect(reread.requiredBindings).toEqual(draft.requiredBindings);
		expect(reread.optionalBindings).toEqual(draft.optionalBindings);
		expect(reread.computedFields).toEqual(draft.computedFields);
	});
});
