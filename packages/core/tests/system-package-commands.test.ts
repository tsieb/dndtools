/**
 * RC-SYS-1.3 — the SYSTEM PACKAGE commands (`system.select`, `.define`, `.update`, `.delete`,
 * `.fork`) and the `previewSystemPackageSelect` dry-run that gates the select.
 *
 * What these tests pin down, in the order the story asks for it: DM-ONLY AUTHORITY on all five;
 * FAIL-CLOSED validation (an unknown key, a built-in target, a rename, a duplicate id); FORK copies
 * deeply and re-ids; SELECT migrates the active id and refuses to strand character data without an
 * explicit acknowledgment; and REPLAY DETERMINISM — the same command sequence over the same
 * environment yields the same state and the same operation log.
 */
import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CUSTOM_SYSTEM_PACKAGE_ID_PATTERN,
	DND5E_SYSTEM_PACKAGE,
	DND5E_SYSTEM_PACKAGE_ID,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
	buildQuickCreatedCharacter,
	dispatchCommand,
	ensureCharacterProficiencies,
	ensureCharacterResources,
	previewSystemPackageSelect,
	upsertCharacter,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type ClassResource,
	type CoreStateSlice,
	type SkillProficiencyLevel,
	type SystemPackage,
} from '../src';

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function rejection(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected, got accepted');
	return result;
}

function baseState(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
}

/** A minimal but complete DM-authored package, valid against the strict schema. */
function customPackage(overrides: Partial<SystemPackage> = {}): SystemPackage {
	return {
		id: 'custom:hearthlight',
		version: '1.0.0',
		displayName: 'Hearthlight',
		summary: 'A small homebrew system for testing.',
		vocabulary: {
			gameMaster: 'Host',
			player: 'Guest',
			character: 'Hero',
			ability: 'knack',
			abilityPlural: 'knacks',
			levelUpVerb: 'grow',
			levelNoun: 'tier',
			hitPoints: 'vigour',
			session: 'evening',
			campaign: 'chronicle',
		},
		attributes: [
			{
				key: 'strength',
				label: 'Strength',
				abbreviation: 'STR',
				derivation: { kind: 'modifier', formula: 'floor((score-10)/2)' },
			},
			{ key: 'grit', label: 'Grit', abbreviation: 'GRT', derivation: { kind: 'none' } },
		],
		resources: [
			{
				key: 'ki',
				label: 'Ki points',
				kind: 'pool',
				maxFormula: 'level',
				recovery: 'short',
				diceNotation: null,
			},
		],
		conditions: [
			{
				key: 'prone',
				label: 'Prone',
				icon: 'arrow-down',
				severity: 'minor',
				defaultDuration: 'until-removed',
				defaultRounds: null,
				maxStacks: null,
			},
		],
		dice: {
			model: 'd20-plus-modifier',
			notation: '1d20',
			advantage: 'roll-twice-take-best',
			successThreshold: null,
			crit: { naturalHigh: 20, naturalLow: 1, effect: 'double-dice' },
		},
		turnModel: { kind: 'initiative', initiativeFormula: 'modifier' },
		creatureSchema: [{ key: 'name', label: 'Name', type: 'string', required: true, options: null }],
		advancement: { model: 'milestone', levelCap: 10, xpThresholds: [] },
		skills: [{ key: 'athletics', label: 'Athletics', attribute: 'strength' }],
		derived: [],
		...overrides,
	};
}

/** Install a package straight onto the slice (the state a define would have produced). */
function withPackage(state: CoreStateSlice, pkg: SystemPackage): CoreStateSlice {
	return {
		...state,
		systems: { ...state.systems, packages: { ...state.systems.packages, [pkg.id]: pkg } },
	};
}

/** A character carrying the given ability score, condition, class resource and skill proficiency. */
function withCharacter(
	state: CoreStateSlice,
	options: {
		id?: string;
		attributes?: Record<string, number>;
		conditions?: string[];
		classResources?: string[];
		skills?: string[];
	} = {},
): CoreStateSlice {
	const character = buildQuickCreatedCharacter(
		{
			kind: 'npc',
			name: 'Test character',
			attributes: options.attributes ?? {},
			combat: { conditions: options.conditions ?? [] },
		},
		{
			id: options.id ?? 'char-1',
			createdBy: DM_ACTOR.id,
			now: '2026-06-03T12:00:00.000Z',
			attackIds: () => 'attack-1',
		},
	);
	const classResources: Record<string, ClassResource> = Object.fromEntries(
		(options.classResources ?? []).map((key) => [
			key,
			{ id: key, name: key, max: 3, expended: 0, recharge: 'long' as const },
		]),
	);
	const skills: Record<string, SkillProficiencyLevel> = Object.fromEntries(
		(options.skills ?? []).map((key) => [key, 'proficient' as const]),
	);
	return {
		...state,
		characters: upsertCharacter(state.characters, {
			...character,
			...(Object.keys(classResources).length > 0
				? { resources: { ...ensureCharacterResources(undefined), classResources } }
				: {}),
			...(Object.keys(skills).length > 0
				? { proficiencies: { ...ensureCharacterProficiencies(undefined), skills } }
				: {}),
		}),
	};
}

function command(type: CoreCommand['type'], actorId: string, payload: unknown): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

function run(
	state: CoreStateSlice,
	type: CoreCommand['type'],
	actorId: string,
	payload: unknown,
	env: CoreEnvironment = makeEnvironment(),
): CommandResult {
	return dispatchCommand(state, env, command(type, actorId, payload));
}

// --- Authority ------------------------------------------------------------------------------------

describe('RC-SYS-1.3 authority', () => {
	const cases: Array<[CoreCommand['type'], unknown]> = [
		['system.select', { packageId: GENERIC_SYSTEM_PACKAGE_ID }],
		['system.define', { package: customPackage() }],
		['system.update', { packageId: 'custom:hearthlight', package: customPackage() }],
		['system.delete', { packageId: 'custom:hearthlight' }],
		['system.fork', { sourcePackageId: DND5E_SYSTEM_PACKAGE_ID }],
	];

	for (const [type, payload] of cases) {
		it(`refuses ${type} from a player`, () => {
			const result = run(baseState(), type, PLAYER_ACTOR.id, payload);
			expect(rejection(result).rejection.code).toBe('actor-not-authorized');
		});

		it(`refuses ${type} from an observer`, () => {
			const result = run(baseState(), type, OBSERVER_ACTOR.id, payload);
			expect(rejection(result).rejection.code).toBe('actor-not-authorized');
		});

		it(`refuses ${type} from an unregistered actor`, () => {
			// The dispatch-level observer gate treats an unknown id as the least-privileged ceiling, so
			// it never reaches the handler's own `unknown-actor` check. Either way: fail closed.
			const result = run(baseState(), type, 'actor-ghost', payload);
			expect(rejection(result).rejection.code).toBe('actor-not-authorized');
		});
	}

	it('leaves the slice untouched when a command is refused', () => {
		const state = baseState();
		const result = run(state, 'system.define', PLAYER_ACTOR.id, { package: customPackage() });
		expect(rejection(result).nextState.systems).toBe(state.systems);
	});
});

// --- The select dry-run ---------------------------------------------------------------------------

describe('RC-SYS-1.3 previewSystemPackageSelect', () => {
	it('reports an unknown target as unavailable rather than an empty preview', () => {
		const preview = previewSystemPackageSelect(
			baseState().systems,
			baseState().characters,
			'custom:nope',
		);
		expect(preview).toEqual({
			kind: 'unavailable',
			toPackageId: 'custom:nope',
			reason: 'package-not-found',
		});
	});

	it('reports the already-active package as unavailable', () => {
		const state = baseState();
		const preview = previewSystemPackageSelect(
			state.systems,
			state.characters,
			DND5E_SYSTEM_PACKAGE_ID,
		);
		expect(preview.kind).toBe('unavailable');
		if (preview.kind === 'unavailable') expect(preview.reason).toBe('already-active');
	});

	it('classifies every attribute, resource, condition and skill of the active package', () => {
		const state = baseState();
		const preview = previewSystemPackageSelect(
			state.systems,
			state.characters,
			GENERIC_SYSTEM_PACKAGE_ID,
		);
		if (preview.kind !== 'available') throw new Error('expected an available preview');
		const expected =
			DND5E_SYSTEM_PACKAGE.attributes.length +
			DND5E_SYSTEM_PACKAGE.resources.length +
			DND5E_SYSTEM_PACKAGE.conditions.length +
			DND5E_SYSTEM_PACKAGE.skills.length;
		expect(preview.findings).toHaveLength(expected);
		expect(preview.fromPackageId).toBe(DND5E_SYSTEM_PACKAGE_ID);
		expect(new Set(preview.findings.map((f) => f.category))).toEqual(
			new Set(['attribute', 'resource', 'condition', 'skill']),
		);
	});

	it('is clean when no character carries data behind a dropped key', () => {
		const state = baseState();
		const preview = previewSystemPackageSelect(
			state.systems,
			state.characters,
			GENERIC_SYSTEM_PACKAGE_ID,
		);
		if (preview.kind !== 'available') throw new Error('expected an available preview');
		expect(preview.findings.some((f) => f.effect === 'drop')).toBe(true);
		expect(preview.destructive).toBe(false);
		expect(preview.clean).toBe(true);
		expect(preview.droppedInstanceCount).toBe(0);
	});

	it('counts the characters behind a dropped attribute', () => {
		const state = withCharacter(
			withCharacter(baseState(), { id: 'char-1', attributes: { strength: 14 } }),
			{ id: 'char-2', attributes: { strength: 9 } },
		);
		const preview = previewSystemPackageSelect(
			state.systems,
			state.characters,
			GENERIC_SYSTEM_PACKAGE_ID,
		);
		if (preview.kind !== 'available') throw new Error('expected an available preview');
		const strength = preview.findings.find(
			(f) => f.category === 'attribute' && f.key === 'strength',
		);
		expect(strength?.effect).toBe('drop');
		expect(strength?.instanceCount).toBe(2);
		expect(preview.destructive).toBe(true);
		expect(preview.clean).toBe(false);
	});

	it('counts the characters behind a dropped condition and class resource', () => {
		const state = withCharacter(baseState(), {
			conditions: ['Prone'],
			classResources: ['ki'],
		});
		const preview = previewSystemPackageSelect(
			state.systems,
			state.characters,
			GENERIC_SYSTEM_PACKAGE_ID,
		);
		if (preview.kind !== 'available') throw new Error('expected an available preview');
		expect(
			preview.findings.find((f) => f.category === 'condition' && f.key === 'prone')?.instanceCount,
		).toBe(1);
		expect(
			preview.findings.find((f) => f.category === 'resource' && f.key === 'ki')?.instanceCount,
		).toBe(1);
	});

	it('counts the characters behind a dropped skill', () => {
		const state = withCharacter(baseState(), { skills: ['athletics'] });
		const preview = previewSystemPackageSelect(
			state.systems,
			state.characters,
			GENERIC_SYSTEM_PACKAGE_ID,
		);
		if (preview.kind !== 'available') throw new Error('expected an available preview');
		expect(
			preview.findings.find((f) => f.category === 'skill' && f.key === 'athletics')?.instanceCount,
		).toBe(1);
	});

	it('keeps a key the target declares identically and remaps one it defines differently', () => {
		const relabelled = customPackage({
			id: 'custom:relabelled',
			attributes: [
				{
					key: 'strength',
					label: 'Might',
					abbreviation: 'MGT',
					derivation: { kind: 'modifier', formula: 'floor((score-10)/2)' },
				},
			],
			skills: [{ key: 'athletics', label: 'Athletics', attribute: 'strength' }],
		});
		const state = withPackage(baseState(), relabelled);
		const preview = previewSystemPackageSelect(
			state.systems,
			state.characters,
			'custom:relabelled',
		);
		if (preview.kind !== 'available') throw new Error('expected an available preview');
		expect(preview.findings.find((f) => f.key === 'strength')?.effect).toBe('remap');
		expect(
			preview.findings.find((f) => f.category === 'skill' && f.key === 'athletics')?.effect,
		).toBe('keep');
	});

	it('is deterministic: two runs over the same state produce identical findings', () => {
		const state = withCharacter(baseState(), { conditions: ['prone'] });
		const first = previewSystemPackageSelect(
			state.systems,
			state.characters,
			GENERIC_SYSTEM_PACKAGE_ID,
		);
		const second = previewSystemPackageSelect(
			state.systems,
			state.characters,
			GENERIC_SYSTEM_PACKAGE_ID,
		);
		expect(first).toEqual(second);
	});
});

// --- system.select --------------------------------------------------------------------------------

describe('RC-SYS-1.3 system.select', () => {
	it('migrates the active package id and emits system.changed', () => {
		const state = baseState();
		const result = accept(
			run(state, 'system.select', DM_ACTOR.id, { packageId: GENERIC_SYSTEM_PACKAGE_ID }),
		);
		expect(result.nextState.systems.activePackageId).toBe(GENERIC_SYSTEM_PACKAGE_ID);
		expect(result.events).toEqual([
			{
				kind: 'system.changed',
				mutation: 'selected',
				packageId: GENERIC_SYSTEM_PACKAGE_ID,
				activePackageId: GENERIC_SYSTEM_PACKAGE_ID,
				actorId: DM_ACTOR.id,
			},
		]);
		expect(result.operationIds).toHaveLength(1);
	});

	it('records the select in the operation log under the system-package entity', () => {
		const state = baseState();
		const result = accept(
			run(state, 'system.select', DM_ACTOR.id, { packageId: GENERIC_SYSTEM_PACKAGE_ID }),
		);
		const op = result.nextState.sync.operations.at(-1);
		expect(op?.entityType).toBe('system-package');
		expect(op?.opType).toBe('system.select');
		expect(op?.path).toBe('activePackageId');
	});

	it('leaves the widget-package bridge field alone', () => {
		const state = baseState();
		const result = accept(
			run(state, 'system.select', DM_ACTOR.id, { packageId: GENERIC_SYSTEM_PACKAGE_ID }),
		);
		expect(result.nextState.systems.activeWidgetPackageId).toBe(
			state.systems.activeWidgetPackageId,
		);
	});

	it('is an idempotent no-op when the target is already active', () => {
		const state = baseState();
		const result = accept(
			run(state, 'system.select', DM_ACTOR.id, { packageId: DND5E_SYSTEM_PACKAGE_ID }),
		);
		expect(result.nextState).toBe(state);
		expect(result.events).toEqual([]);
		expect(result.operationIds).toEqual([]);
	});

	it('refuses an uninstalled package', () => {
		const result = run(baseState(), 'system.select', DM_ACTOR.id, { packageId: 'custom:ghost' });
		expect(rejection(result).rejection.code).toBe('package-not-found');
	});

	it('refuses an unknown key in the payload (fail closed)', () => {
		const result = run(baseState(), 'system.select', DM_ACTOR.id, {
			packageId: GENERIC_SYSTEM_PACKAGE_ID,
			force: true,
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('refuses a destructive select without an acknowledgment', () => {
		const state = withCharacter(baseState(), { conditions: ['prone'] });
		const result = run(state, 'system.select', DM_ACTOR.id, {
			packageId: GENERIC_SYSTEM_PACKAGE_ID,
		});
		const rejected = rejection(result);
		expect(rejected.rejection.code).toBe('system-select-loss-unacknowledged');
		expect(rejected.rejection.issues?.length).toBeGreaterThan(0);
		expect(rejected.nextState.systems.activePackageId).toBe(DND5E_SYSTEM_PACKAGE_ID);
	});

	it('applies a destructive select once the loss is acknowledged', () => {
		const state = withCharacter(baseState(), { conditions: ['prone'] });
		const result = accept(
			run(state, 'system.select', DM_ACTOR.id, {
				packageId: GENERIC_SYSTEM_PACKAGE_ID,
				acknowledgeLoss: true,
			}),
		);
		expect(result.nextState.systems.activePackageId).toBe(GENERIC_SYSTEM_PACKAGE_ID);
		const op = result.nextState.sync.operations.at(-1);
		expect((op?.value as { acknowledgedLoss: boolean }).acknowledgedLoss).toBe(true);
		expect((op?.value as { droppedInstanceCount: number }).droppedInstanceCount).toBeGreaterThan(0);
	});

	it('never deletes character data when a system is selected away from', () => {
		const state = withCharacter(baseState(), { conditions: ['prone'] });
		const result = accept(
			run(state, 'system.select', DM_ACTOR.id, {
				packageId: GENERIC_SYSTEM_PACKAGE_ID,
				acknowledgeLoss: true,
			}),
		);
		expect(result.nextState.characters).toEqual(state.characters);
	});
});

// --- system.define --------------------------------------------------------------------------------

describe('RC-SYS-1.3 system.define', () => {
	it('installs a DM-authored package without making it active', () => {
		const state = baseState();
		const result = accept(run(state, 'system.define', DM_ACTOR.id, { package: customPackage() }));
		expect(result.nextState.systems.packages['custom:hearthlight']?.displayName).toBe(
			'Hearthlight',
		);
		expect(result.nextState.systems.activePackageId).toBe(DND5E_SYSTEM_PACKAGE_ID);
		expect(result.events[0]).toMatchObject({ kind: 'system.changed', mutation: 'defined' });
	});

	it('refuses an id outside the custom namespace', () => {
		const result = run(baseState(), 'system.define', DM_ACTOR.id, {
			package: customPackage({ id: 'system.dnd5e' }),
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('refuses an id that is already installed', () => {
		const state = withPackage(baseState(), customPackage());
		const result = run(state, 'system.define', DM_ACTOR.id, { package: customPackage() });
		expect(rejection(result).rejection.code).toBe('system-package-exists');
	});

	it('refuses a package carrying an unknown key', () => {
		const result = run(baseState(), 'system.define', DM_ACTOR.id, {
			package: { ...customPackage(), houseRules: true },
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('refuses a package whose formula does not parse', () => {
		const result = run(baseState(), 'system.define', DM_ACTOR.id, {
			package: customPackage({
				attributes: [
					{
						key: 'strength',
						label: 'Strength',
						abbreviation: 'STR',
						derivation: { kind: 'modifier', formula: 'floor((score-10)/' },
					},
				],
			}),
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('refuses a package whose skill keys off an attribute it does not declare', () => {
		const result = run(baseState(), 'system.define', DM_ACTOR.id, {
			package: customPackage({
				skills: [{ key: 'athletics', label: 'Athletics', attribute: 'wisdom' }],
			}),
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('stores a copy, so a later mutation of the caller input cannot reach the slice', () => {
		const pkg = customPackage();
		const result = accept(run(baseState(), 'system.define', DM_ACTOR.id, { package: pkg }));
		const stored = result.nextState.systems.packages['custom:hearthlight'];
		expect(stored).not.toBe(pkg);
		expect(stored?.attributes).not.toBe(pkg.attributes);
	});
});

// --- system.update --------------------------------------------------------------------------------

describe('RC-SYS-1.3 system.update', () => {
	it('replaces a DM-authored package body', () => {
		const state = withPackage(baseState(), customPackage());
		const result = accept(
			run(state, 'system.update', DM_ACTOR.id, {
				packageId: 'custom:hearthlight',
				package: customPackage({ displayName: 'Hearthlight Revised', version: '2.0.0' }),
			}),
		);
		expect(result.nextState.systems.packages['custom:hearthlight']?.displayName).toBe(
			'Hearthlight Revised',
		);
		expect(result.events[0]).toMatchObject({ mutation: 'updated' });
	});

	it('refuses to update a built-in package', () => {
		const result = run(baseState(), 'system.update', DM_ACTOR.id, {
			packageId: DND5E_SYSTEM_PACKAGE_ID,
			package: { ...DND5E_SYSTEM_PACKAGE, displayName: 'Mine now' },
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('refuses to update a package that is not installed', () => {
		const result = run(baseState(), 'system.update', DM_ACTOR.id, {
			packageId: 'custom:hearthlight',
			package: customPackage(),
		});
		expect(rejection(result).rejection.code).toBe('package-not-found');
	});

	it('refuses a body whose id does not match the target (no silent rename)', () => {
		const state = withPackage(baseState(), customPackage());
		const result = run(state, 'system.update', DM_ACTOR.id, {
			packageId: 'custom:hearthlight',
			package: customPackage({ id: 'custom:renamed' }),
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('leaves the active package id alone', () => {
		const state = withPackage(baseState(), customPackage());
		const result = accept(
			run(state, 'system.update', DM_ACTOR.id, {
				packageId: 'custom:hearthlight',
				package: customPackage({ version: '1.1.0' }),
			}),
		);
		expect(result.nextState.systems.activePackageId).toBe(DND5E_SYSTEM_PACKAGE_ID);
	});
});

// --- system.delete --------------------------------------------------------------------------------

describe('RC-SYS-1.3 system.delete', () => {
	it('removes a DM-authored package that is neither active nor in use', () => {
		const state = withPackage(baseState(), customPackage());
		const result = accept(
			run(state, 'system.delete', DM_ACTOR.id, { packageId: 'custom:hearthlight' }),
		);
		expect(result.nextState.systems.packages['custom:hearthlight']).toBeUndefined();
		expect(result.events[0]).toMatchObject({ mutation: 'deleted' });
	});

	it('refuses to delete a built-in package', () => {
		const result = run(baseState(), 'system.delete', DM_ACTOR.id, {
			packageId: GENERIC_SYSTEM_PACKAGE_ID,
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('refuses to delete a package that is not installed', () => {
		const result = run(baseState(), 'system.delete', DM_ACTOR.id, {
			packageId: 'custom:ghost',
		});
		expect(rejection(result).rejection.code).toBe('package-not-found');
	});

	it('refuses to delete the active package', () => {
		const base = withPackage(baseState(), customPackage());
		const state: CoreStateSlice = {
			...base,
			systems: { ...base.systems, activePackageId: 'custom:hearthlight' },
		};
		const result = run(state, 'system.delete', DM_ACTOR.id, { packageId: 'custom:hearthlight' });
		const rejected = rejection(result);
		expect(rejected.rejection.code).toBe('invalid-state');
		expect(rejected.rejection.message).toContain('Select another system first');
	});

	it('refuses to delete a package whose resource a character still carries', () => {
		const state = withCharacter(withPackage(baseState(), customPackage()), {
			classResources: ['ki'],
		});
		const result = run(state, 'system.delete', DM_ACTOR.id, { packageId: 'custom:hearthlight' });
		const rejected = rejection(result);
		expect(rejected.rejection.code).toBe('invalid-state');
		expect(rejected.rejection.issues).toEqual([
			{ path: 'resources.ki', message: '1 character(s) carry ki.' },
		]);
	});

	it('allows the delete once no character carries the package resource', () => {
		const state = withCharacter(withPackage(baseState(), customPackage()), {
			classResources: ['rage'],
		});
		const result = accept(
			run(state, 'system.delete', DM_ACTOR.id, { packageId: 'custom:hearthlight' }),
		);
		expect(result.nextState.systems.packages['custom:hearthlight']).toBeUndefined();
	});
});

// --- system.fork ----------------------------------------------------------------------------------

describe('RC-SYS-1.3 system.fork', () => {
	it('copies a built-in package under a new custom id', () => {
		const result = accept(
			run(baseState(), 'system.fork', DM_ACTOR.id, {
				sourcePackageId: DND5E_SYSTEM_PACKAGE_ID,
				packageId: 'custom:my-5e',
			}),
		);
		const fork = result.nextState.systems.packages['custom:my-5e'];
		expect(fork?.id).toBe('custom:my-5e');
		expect(fork?.attributes).toEqual(DND5E_SYSTEM_PACKAGE.attributes);
		expect(fork?.conditions).toEqual(DND5E_SYSTEM_PACKAGE.conditions);
		expect(result.events[0]).toMatchObject({ mutation: 'forked', packageId: 'custom:my-5e' });
	});

	it('deep-copies, so editing the fork can never reach the source package', () => {
		const result = accept(
			run(baseState(), 'system.fork', DM_ACTOR.id, {
				sourcePackageId: DND5E_SYSTEM_PACKAGE_ID,
				packageId: 'custom:my-5e',
			}),
		);
		const fork = result.nextState.systems.packages['custom:my-5e'];
		expect(fork?.attributes).not.toBe(DND5E_SYSTEM_PACKAGE.attributes);
		expect(fork?.vocabulary).not.toBe(DND5E_SYSTEM_PACKAGE.vocabulary);
		expect(result.nextState.systems.packages[DND5E_SYSTEM_PACKAGE_ID]).toEqual(
			DND5E_SYSTEM_PACKAGE,
		);
	});

	it('names the copy after its source when no display name is given', () => {
		const result = accept(
			run(baseState(), 'system.fork', DM_ACTOR.id, {
				sourcePackageId: GENERIC_SYSTEM_PACKAGE_ID,
				packageId: 'custom:my-generic',
			}),
		);
		expect(result.nextState.systems.packages['custom:my-generic']?.displayName).toBe(
			`${GENERIC_SYSTEM_PACKAGE.displayName} (copy)`,
		);
	});

	it('takes the supplied display name when one is given', () => {
		const result = accept(
			run(baseState(), 'system.fork', DM_ACTOR.id, {
				sourcePackageId: GENERIC_SYSTEM_PACKAGE_ID,
				packageId: 'custom:my-generic',
				displayName: 'Hearthlight',
			}),
		);
		expect(result.nextState.systems.packages['custom:my-generic']?.displayName).toBe('Hearthlight');
	});

	it('mints a custom-namespace id from the environment when none is supplied', () => {
		const result = accept(
			run(baseState(), 'system.fork', DM_ACTOR.id, {
				sourcePackageId: DND5E_SYSTEM_PACKAGE_ID,
			}),
		);
		const forkId = Object.keys(result.nextState.systems.packages).find((id) =>
			id.startsWith('custom:'),
		);
		expect(forkId).toBeDefined();
		expect(CUSTOM_SYSTEM_PACKAGE_ID_PATTERN.test(forkId ?? '')).toBe(true);
	});

	it('refuses to fork a package that is not installed', () => {
		const result = run(baseState(), 'system.fork', DM_ACTOR.id, {
			sourcePackageId: 'custom:ghost',
		});
		expect(rejection(result).rejection.code).toBe('package-not-found');
	});

	it('refuses a target id outside the custom namespace', () => {
		const result = run(baseState(), 'system.fork', DM_ACTOR.id, {
			sourcePackageId: DND5E_SYSTEM_PACKAGE_ID,
			packageId: 'system.dnd5e-mine',
		});
		expect(rejection(result).rejection.code).toBe('invalid-payload');
	});

	it('refuses a target id that already exists', () => {
		const state = withPackage(baseState(), customPackage());
		const result = run(state, 'system.fork', DM_ACTOR.id, {
			sourcePackageId: DND5E_SYSTEM_PACKAGE_ID,
			packageId: 'custom:hearthlight',
		});
		expect(rejection(result).rejection.code).toBe('system-package-exists');
	});

	it('does not make the fork active', () => {
		const result = accept(
			run(baseState(), 'system.fork', DM_ACTOR.id, {
				sourcePackageId: GENERIC_SYSTEM_PACKAGE_ID,
				packageId: 'custom:my-generic',
			}),
		);
		expect(result.nextState.systems.activePackageId).toBe(DND5E_SYSTEM_PACKAGE_ID);
	});

	it('produces a fork that passes the define validation it would face on import', () => {
		const forked = accept(
			run(baseState(), 'system.fork', DM_ACTOR.id, {
				sourcePackageId: DND5E_SYSTEM_PACKAGE_ID,
				packageId: 'custom:my-5e',
			}),
		).nextState.systems.packages['custom:my-5e'];
		const redefined = accept(run(baseState(), 'system.define', DM_ACTOR.id, { package: forked }));
		expect(redefined.nextState.systems.packages['custom:my-5e']).toEqual(forked);
	});
});

// --- Replay determinism ----------------------------------------------------------------------------

describe('RC-SYS-1.3 replay determinism', () => {
	function replay(): CoreStateSlice {
		const env = makeEnvironment();
		let state = baseState();
		state = accept(
			dispatchCommand(
				state,
				env,
				command('system.fork', DM_ACTOR.id, {
					sourcePackageId: DND5E_SYSTEM_PACKAGE_ID,
				}),
			),
		).nextState;
		state = accept(
			dispatchCommand(
				state,
				env,
				command('system.define', DM_ACTOR.id, { package: customPackage() }),
			),
		).nextState;
		state = accept(
			dispatchCommand(
				state,
				env,
				command('system.update', DM_ACTOR.id, {
					packageId: 'custom:hearthlight',
					package: customPackage({ version: '1.1.0' }),
				}),
			),
		).nextState;
		state = accept(
			dispatchCommand(
				state,
				env,
				command('system.select', DM_ACTOR.id, { packageId: 'custom:hearthlight' }),
			),
		).nextState;
		return state;
	}

	it('produces an identical slice for an identical command sequence', () => {
		expect(replay().systems).toEqual(replay().systems);
	});

	it('produces an identical operation log for an identical command sequence', () => {
		expect(replay().sync.operations).toEqual(replay().sync.operations);
	});

	it('records one operation per accepted mutation, in command order', () => {
		const ops = replay().sync.operations;
		expect(ops.map((op) => op.opType)).toEqual([
			'system.fork',
			'system.define',
			'system.update',
			'system.select',
		]);
	});

	it('ends the sequence with the DM-authored system active', () => {
		expect(replay().systems.activePackageId).toBe('custom:hearthlight');
	});
});
