import { describe, expect, it } from 'vitest';
import {
	classifyWidgetCommand,
	dispatchCommand,
	widgetCommandHasExecutor,
	type CoreCommand,
	type WidgetConfigField,
} from '@dndtools/core';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { configFieldProblems } from './ConfigStep';
import { CATALOG, reconcileCommandAuthority, verbForcesConfigure } from './CommandsStep';
import { buildPackage, emptyDraft } from './draft';
import { firstBlockedStep, validateDraft } from './validate';

/**
 * RC-WID-2.3 — the Config-fields and Commands steps.
 *
 * Two things are worth proving here, and neither is about markup. First, a config field the builder
 * writes must be able to hold its own default: a range that excludes it, or a select whose default
 * names no choice, is a declaration the Inspector could never satisfy. Second, a command's declared
 * capability must agree with how `classifyWidgetCommand` will read its verb — otherwise the package
 * ships a promise the core overrules, and a player is shown a button that is refused on press.
 */

function field(overrides: Partial<WidgetConfigField>): WidgetConfigField {
	return { key: 'setting', label: 'Setting', control: 'text', ...overrides };
}

describe('config field validation', () => {
	it('passes a field whose default sits inside its declared range', () => {
		expect(configFieldProblems(field({ control: 'number', default: 3, min: 0, max: 10 }))).toEqual(
			{},
		);
	});

	it('names a default that falls outside the range', () => {
		expect(
			configFieldProblems(field({ control: 'number', default: 12, min: 0, max: 10 })).default,
		).toBe('builder.config.defaultAboveMax');
		expect(
			configFieldProblems(field({ control: 'number', default: -1, min: 0, max: 10 })).default,
		).toBe('builder.config.defaultBelowMin');
	});

	it('names an inverted range once, rather than blaming the default for it', () => {
		const problems = configFieldProblems(field({ control: 'number', default: 3, min: 10, max: 0 }));
		expect(problems.range).toBe('builder.config.rangeInverted');
		expect(problems.default).toBeUndefined();
	});

	it('asks a select for choices, and for a default that is one of them', () => {
		expect(configFieldProblems(field({ control: 'select', options: [] })).choices).toBe(
			'builder.config.choicesEmpty',
		);
		const options = [
			{ value: 'calm', label: 'Calm' },
			{ value: 'tense', label: 'Tense' },
		];
		expect(
			configFieldProblems(field({ control: 'select', options, default: 'storm' })).default,
		).toBe('builder.config.defaultNotAChoice');
		expect(configFieldProblems(field({ control: 'select', options, default: 'tense' }))).toEqual(
			{},
		);
	});

	it('leaves a text field alone — it has no range to contradict', () => {
		expect(configFieldProblems(field({ control: 'text', default: 'Fog' }))).toEqual({});
	});
});

describe('command catalogue', () => {
	it('declares every templated command with the capability its verb will be given', () => {
		for (const entry of CATALOG) {
			const descriptor = entry.descriptor('fixture');
			const kind = classifyWidgetCommand(descriptor);
			expect(descriptor.type.startsWith('fixture.')).toBe(true);
			expect(descriptor.requiredCapability).toBe(kind === 'configure' ? 'manager' : 'operator');
		}
	});

	it('offers both an operate and a configure half, including a note write', () => {
		const types = CATALOG.map((entry) => entry.descriptor('fixture').type);
		expect(types).toContain('fixture.roll');
		expect(types).toContain('fixture.write-note-line');
		expect(types).toContain('fixture.set-config');
		const kinds = new Set(
			CATALOG.map((entry) => classifyWidgetCommand(entry.descriptor('fixture'))),
		);
		expect([...kinds].sort()).toEqual(['configure', 'operate']);
	});

	it('raises a configure verb declared as operator to manager', () => {
		const declared = {
			type: 'fixture.rename',
			displayName: 'Rename',
			requiredCapability: 'operator' as const,
			payloadSchema: { type: 'object' as const },
			writesTo: 'scene' as const,
		};
		expect(verbForcesConfigure(declared)).toBe(true);
		expect(reconcileCommandAuthority(declared).requiredCapability).toBe('manager');
	});

	it('leaves an operate verb as the author declared it', () => {
		const declared = {
			type: 'fixture.roll',
			displayName: 'Roll',
			requiredCapability: 'operator' as const,
			payloadSchema: { type: 'object' as const },
			writesTo: 'session' as const,
		};
		expect(verbForcesConfigure(declared)).toBe(false);
		expect(reconcileCommandAuthority(declared)).toBe(declared);
	});
});

describe('what the built package carries', () => {
	it('installs a widget whose config field keeps its range and whose command keeps its authority', () => {
		const env = makeEnvironment();
		const state = buildInitialState(DM_ACTOR);
		const draft = {
			...emptyDraft(),
			name: 'Watch clock',
			packageId: 'workspace.watch-clock',
			typeId: 'watch-clock',
			configFields: [
				{
					key: 'segments',
					label: 'Segments',
					control: 'number' as const,
					group: 'content' as const,
					default: 4,
					min: 1,
					max: 12,
					step: 1,
				},
			],
			commands: [reconcileCommandAuthority(CATALOG[0]!.descriptor('watch-clock'))],
		};
		const command: CoreCommand = {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: buildPackage(draft) },
		};
		const result = dispatchCommand(state, env, command);
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const definition =
			result.nextState.widgets.packages['workspace.watch-clock']!.package.widgets[0]!;
		const segments = definition.configFields?.find((entry) => entry.key === 'segments');
		expect(segments).toMatchObject({ min: 1, max: 12, step: 1, default: 4 });
		// The catalogue's first entry is `roll`, an operate verb: reconciling leaves it alone.
		expect(definition.commands[0]?.requiredCapability).toBe('operator');
	});
});

describe('RC-WID-6.1: only commands something can run', () => {
	it('names an executor on every catalogue entry, so nothing it offers fails at the table', () => {
		for (const entry of CATALOG) {
			expect(widgetCommandHasExecutor(entry.descriptor('fixture')), entry.label).toBe(true);
		}
		const types = CATALOG.map((entry) => entry.descriptor('fixture').type);
		for (const gone of ['fixture.draw', 'fixture.rename', 'fixture.set-duration']) {
			expect(types).not.toContain(gone);
		}
	});

	it('seeds the setting a payload reads (Roll brings a dice formula)', () => {
		const roll = CATALOG.find((entry) => entry.label === 'builder.catalog.roll')!;
		expect(roll.field).toMatchObject({ key: 'formula', default: '1d20' });
		expect(Object.keys(roll.descriptor('fixture').payloadSchema.properties ?? {})).toContain(
			'formula',
		);
	});

	it('flags a blank command on the Commands step, and the core refuses the same package', () => {
		const blank = {
			type: 'watch-clock.action-1',
			displayName: 'Action 1',
			requiredCapability: 'operator' as const,
			payloadSchema: { type: 'object' as const },
			writesTo: 'scene' as const,
		};
		const draft = {
			...emptyDraft(),
			name: 'Watch clock',
			packageId: 'workspace.watch-clock',
			typeId: 'watch-clock',
			template: 'action-panel' as const,
			commands: [blank],
		};
		const issues = validateDraft(draft);
		expect(issues).toContainEqual({
			step: 'commands',
			field: 'commands',
			message: 'builder.issue.commandNoExecutor',
			values: { name: 'Action 1' },
		});
		expect(firstBlockedStep(issues)).toBe('commands');
		const rejected = dispatchCommand(buildInitialState(DM_ACTOR), makeEnvironment(), {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: buildPackage(draft) },
		});
		expect(rejected.status).toBe('rejected');

		// Naming what it runs clears both.
		const fixed = { ...draft, commands: [{ ...blank, executor: 'tick' as const }] };
		expect(validateDraft(fixed).filter((issue) => issue.step === 'commands')).toEqual([]);
		const accepted = dispatchCommand(buildInitialState(DM_ACTOR), makeEnvironment(), {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: buildPackage(fixed) },
		});
		expect(accepted.status).toBe('accepted');
	});

	it('leaves a custom-code widget to its own code', () => {
		const draft = {
			...emptyDraft(),
			runtime: 'custom-html-js' as const,
			commands: [
				{
					type: 'watch-clock.ping',
					displayName: 'Ping',
					requiredCapability: 'operator' as const,
					payloadSchema: { type: 'object' as const },
					writesTo: 'scene' as const,
				},
			],
		};
		expect(
			validateDraft(draft).some((issue) => issue.message === 'builder.issue.commandNoExecutor'),
		).toBe(false);
	});
});
