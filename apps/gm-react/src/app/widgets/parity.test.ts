import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CORE_NAMED_WIDGET_COMMANDS,
	WIDGET_DATA_QUERY_SOURCES,
	WIDGET_INTENT_ROUTES,
	dispatchCommand,
	findHomeScreen,
	findPackageRecordForWidgetType,
	screenMetaOf,
	widgetPackageForkIdentity,
	type Actor,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { BUILTIN_WIDGET_TYPES } from './builtin';
import {
	BUILTIN_PARITY,
	PARITY_DEBT_LEDGER,
	SHARED_MODULE_USES,
	builderRoundTrip,
	builtinBodyModules,
	builtinOnScreenFinding,
	checkBuiltinParity,
	compareToLedger,
	defaultScreenParityProblems,
	deriveQueryExposure,
	exportedBytes,
	extractBodyUses,
	extractModuleUses,
	intentRoutes,
	privateUseFinding,
	publicWidgetCommands,
	roundTripFinding,
	type ParityUse,
} from './parity';

/**
 * RC-WID-5.5 — the builder parity gate (`parity.ts`, WIDGETS.md §6.1). Reads the real sources of the
 * builtin bodies and the query-source resolver, and provisions a real vault for the default screens.
 * Every finding the checkers report is compared to the exact debt ledger `PARITY_DEBT_LEDGER`.
 */

function readSource(relative: string): string {
	for (const suffix of ['.tsx', '.ts', '/index.ts', '/index.tsx']) {
		try {
			return readFileSync(fileURLToPath(new URL(relative + suffix, import.meta.url)), 'utf8');
		} catch {
			// try the next suffix
		}
	}
	throw new Error(`No module at ${relative}`);
}

const readBuiltin = (name: string) => readSource(`./builtin/${name}`);
const SOURCES = [...WIDGET_DATA_QUERY_SOURCES] as string[];
const exposure = deriveQueryExposure(
	[readSource('./dataEnvironment'), readSource('./homeSources')],
	SOURCES,
);
const bodyModules = builtinBodyModules(readBuiltin('index'));

function bodyUses(readModule: (name: string) => string = readBuiltin) {
	return new Map(
		[...bodyModules].map(([type, module]) => [type, extractBodyUses(module, readModule).uses]),
	);
}

function check(
	bodies: ReadonlyMap<string, ReadonlySet<ParityUse>>,
	declared?: Parameters<typeof checkBuiltinParity>[0]['declared'],
) {
	return checkBuiltinParity({
		bodies,
		exposure,
		publicCommands: publicWidgetCommands(CORE_NAMED_WIDGET_COMMANDS),
		routesByIntent: intentRoutes(WIDGET_INTENT_ROUTES),
		knownSources: SOURCES,
		declared,
	});
}

const DM: Actor = { id: 'dm-1', role: 'dm', displayName: 'Dungeon Master' };

function provisionedVault() {
	const env = makeEnvironment();
	const result = dispatchCommand(buildInitialState(DM) as CoreStateSlice, env, {
		type: 'command-center.ensure-home',
		actorId: DM.id,
		payload: {},
	} as CoreCommand);
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	return { env, state: result.nextState };
}

/** What the default-screen checker reports for a freshly provisioned vault. */
function screenFindings(): string[] {
	const { env, state } = provisionedVault();
	return defaultScreenParityProblems(state, env, DM.id);
}

describe('builder parity gate: the debt ledger', () => {
	it('matches every finding exactly: none unledgered, none stale', () => {
		expect(findHomeScreen(provisionedVault().state.scenes)?.widgets.length).toBeGreaterThan(0);
		expect(compareToLedger([...check(bodyUses()), ...screenFindings()])).toEqual({
			unledgered: [],
			stale: [],
		});
	});

	it('lists each finding once and names the story that repays it', () => {
		const findings = PARITY_DEBT_LEDGER.map((debt) => debt.finding);
		expect(new Set(findings).size).toBe(findings.length);
		for (const debt of PARITY_DEBT_LEDGER)
			expect(debt.repaidBy, debt.finding).toBe(
				debt.finding.endsWith('is not byte-identical') ? 'RC-WID-5.6' : 'RC-WID-5.7',
			);
	});

	it('fails on a ledger entry that no longer reproduces', () => {
		const repaid = privateUseFinding('fixture', 'state:session.timers');
		expect(compareToLedger([], [{ finding: repaid, repaidBy: 'RC-WID-5.7' }])).toEqual({
			unledgered: [],
			stale: [repaid],
		});
	});

	it('fails on a finding a ledger entry for another widget does not cover', () => {
		expect(
			compareToLedger(
				[roundTripFinding('home-hero'), roundTripFinding('home-party')],
				[{ finding: roundTripFinding('home-hero'), repaidBy: 'RC-WID-5.6' }],
			),
		).toEqual({ unledgered: [roundTripFinding('home-party')], stale: [] });
	});
});

describe('builder parity gate: builtin bodies', () => {
	it('finds a body module for every builtin type', () => {
		expect([...bodyModules.keys()].sort()).toEqual([...BUILTIN_WIDGET_TYPES].sort());
	});

	it('reads every query source from the resolver', () => {
		expect([...exposure.keys()].sort()).toEqual([...SOURCES].sort());
		// Anchors: if the resolver is restructured and the scan stops seeing inside it, these fail
		// before every body turns into a gap.
		expect(exposure.get('current-combatants')?.reads).toContain('getCombatTrackerForActor');
		expect(exposure.get('session-state')?.paths).toContain('session.workflow');
		expect(exposure.get('table-scenes')?.reads).toContain('isDefaultScreen');
	});

	it('imports only classified modules outside builtin/', () => {
		for (const [type, module] of bodyModules)
			expect(extractBodyUses(module, readBuiltin).unknownShared, type).toEqual([]);
	});

	it('declares exactly what each shared module takes from the core', () => {
		for (const [specifier, exports] of Object.entries(SHARED_MODULE_USES)) {
			const declared = new Set(Object.values(exports).flat());
			const found = extractModuleUses(readBuiltin(specifier));
			expect([...found].sort(), specifier).toEqual([...declared].sort());
		}
	});

	it('fails on a deliberately private builtin read that is not ledgered', () => {
		const withPrivateRead = (name: string) =>
			name === 'NotesBody'
				? readBuiltin(name).replace(
						'export function NotesBody',
						[
							"import { listFactionsForActor } from '@dndtools/core';",
							'const leak = () => [listFactionsForActor, runtime.state.session.timers];',
							'export function NotesBody',
						].join('\n'),
					)
				: readBuiltin(name);
		expect(compareToLedger([...check(bodyUses(withPrivateRead)), ...screenFindings()])).toEqual({
			unledgered: [
				privateUseFinding('notes', 'read:listFactionsForActor'),
				privateUseFinding('notes', 'state:session.timers'),
			],
			stale: [],
		});
	});

	it.each([
		'const s = runtime.state;',
		'let s; s = runtime.state;',
		'const { state: s } = runtime;',
		'const s = runtime["state"];',
		'const r = runtime; const { state: s } = r;',
	])('fails on an unledgered private read through an alias: %s', (alias) => {
		const withAliasedRead = (name: string) =>
			name === 'NotesBody'
				? readBuiltin(name).replace(
						'const runtime = useRuntime();',
						`const runtime = useRuntime(); ${alias} const hidden = s.session.timers;`,
					)
				: readBuiltin(name);
		expect(
			compareToLedger([...check(bodyUses(withAliasedRead)), ...screenFindings()]).unledgered,
		).toEqual([privateUseFinding('notes', 'state:session.timers')]);
	});

	it('fails on a private command and an undeclared route', () => {
		const withPrivateWrites = (name: string) =>
			name === 'CharactersBody'
				? `${readBuiltin(name)}\nconst end = () => runtime.dispatch({ type: 'session.end', actorId });\nconst go = () => { globalThis.location.hash = '#/campaign'; };`
				: readBuiltin(name);
		expect(
			check(bodyUses(withPrivateWrites)).filter((problem) => problem.startsWith('characters:')),
		).toEqual([
			privateUseFinding('characters', 'command:session.end'),
			privateUseFinding('characters', 'route:/campaign'),
		]);
	});

	it('fails on declared surface the body does not use', () => {
		const declared = {
			...BUILTIN_PARITY,
			dice: { ...BUILTIN_PARITY.dice, commands: [...BUILTIN_PARITY.dice.commands, 'timer.start'] },
		};
		expect(check(bodyUses(), declared).filter((problem) => problem.startsWith('dice:'))).toEqual([
			'dice: declares command timer.start but never dispatches it',
		]);
	});

	it('reports a builtin body with no declared entry', () => {
		const { map: _map, ...declared } = BUILTIN_PARITY;
		expect(check(bodyUses(), declared)).toContain('map: has a builtin body but no parity entry');
	});
});

describe('builder parity gate: default screens', () => {
	it('fails when a default screen gains a builtin body', () => {
		const { env, state } = provisionedVault();
		const home = findHomeScreen(state.scenes)!;
		const added = dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM.id,
			payload: {
				sceneId: home.id,
				widget: {
					type: 'note',
					version: '1.0.0',
					layout: { x: 0, y: 960, w: 1152, h: 240 },
					configuration: {},
				},
			},
		} as CoreCommand);
		expect(added.status).toBe('accepted');
		if (added.status !== 'accepted') return;
		const findings = [
			...check(bodyUses()),
			...defaultScreenParityProblems(added.nextState, env, DM.id),
		];
		expect(compareToLedger(findings).unledgered).toEqual([builtinOnScreenFinding('note')]);
	});

	it('rejects a builtin injected into the fresh GM board with null origin', () => {
		const { env, state } = provisionedVault();
		const board = state.scenes.scenes[state.commandCenter.homeSceneId!]!;
		expect(screenMetaOf(board).origin ?? null).toBeNull();
		expect(board.widgets.length).toBeGreaterThan(0);
		board.widgets = [{ ...board.widgets[0]!, type: 'search', version: '1.0.0' }];
		expect(defaultScreenParityProblems(state, env, DM.id)).toContain(
			builtinOnScreenFinding('search'),
		);
	});

	it('compares the original export to the first builder round trip, unnormalised', () => {
		const { env, state } = provisionedVault();
		const record = findPackageRecordForWidgetType(state.widgets, 'home-hero')!;
		const identity = widgetPackageForkIdentity(state.widgets, 'home-hero');
		const forked = dispatchCommand(state, env, {
			type: 'widget.package.fork',
			actorId: DM.id,
			payload: { packageId: record.package.id, widgetType: 'home-hero' },
		} as CoreCommand);
		if (forked.status !== 'accepted') throw new Error(forked.rejection.message);
		const original = exportedBytes(forked.nextState, env, identity.packageId)!;
		// Build a stable fixture, then inject a field lost on the first import. Production
		// home definitions may already be stable after RC-WID-5.6 repays their ledger entries.
		const first = builderRoundTrip(state, env, DM.id, original).bytes!;
		expect(builderRoundTrip(state, env, DM.id, first).bytes).toBe(first);
		const probe = JSON.parse(first) as {
			widgets: { style?: { cssVariables?: Record<string, string> } }[];
		};
		const widget = probe.widgets[0]!;
		widget.style = {
			...widget.style,
			cssVariables: { ...widget.style?.cssVariables, '--widget-parity-probe': 'lost' },
		};
		const withProbe = JSON.stringify(probe, null, '\t');
		expect(builderRoundTrip(state, env, DM.id, withProbe).bytes).not.toBe(withProbe);
	});
});

it.each([
	'const state = runtime.state; const privateTimers = state.session.timers;',
	'const state = runtime.state; const session = state.session; const timers = session.timers;',
	'const { session: { timers } } = runtime.state;',
	'const state = runtime.state; const timers = state["session"]["timers"];',
])('detects private state through aliases: %s', (source) => {
	expect(extractModuleUses(source)).toContain('state:session.timers');
});

it.each([
	['let s = runtime.state.maps; s = runtime.state.session; s.timers;', 'state:<ambiguous-alias>'],
	['const { ...s } = runtime.state; s.session.timers;', 'state:<rest-alias>'],
	['let s; ({ state: s } = runtime); s.session.timers;', 'state:<unsupported-assignment>'],
	['const s = runtime[key]; s.session.timers;', 'state:<dynamic-runtime-member>'],
])('rejects unsupported or ambiguous state aliases: %s', (source, finding) => {
	expect(extractModuleUses(source)).toContain(finding);
});
