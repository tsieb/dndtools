import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CORE_NAMED_WIDGET_COMMANDS,
	WIDGET_DATA_QUERY_SOURCES,
	WIDGET_INTENT_ROUTES,
	dispatchCommand,
	findHomeScreen,
	type Actor,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { BUILTIN_WIDGET_TYPES } from './builtin';
import {
	BUILTIN_PARITY,
	SHARED_MODULE_USES,
	builtinBodyModules,
	changedFields,
	checkBuiltinParity,
	defaultScreenParityProblems,
	deriveQueryExposure,
	extractBodyUses,
	extractModuleUses,
	intentRoutes,
	publicWidgetCommands,
	type ParityUse,
} from './parity';

/**
 * RC-WID-5.5 — the builder parity gate (`parity.ts`, WIDGETS.md §6.1). Reads the real sources of the
 * builtin bodies and the query-source resolver, and provisions a real vault for the default screens.
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

	it('every builtin read and command is public or a recorded gap', () => {
		expect(check(bodyUses())).toEqual([]);
	});

	it('fails on a deliberately private builtin read', () => {
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
		expect(check(bodyUses(withPrivateRead))).toEqual([
			'notes: uses read:listFactionsForActor, which no descriptor, intent or query source exposes to a GM-built widget',
			'notes: uses state:session.timers, which no descriptor, intent or query source exposes to a GM-built widget',
		]);
	});

	it('fails on a private command, an undeclared route and a stale gap', () => {
		const withPrivateWrites = (name: string) =>
			name === 'CharactersBody'
				? `${readBuiltin(name)}\nconst end = () => runtime.dispatch({ type: 'session.end', actorId });\nconst go = () => { globalThis.location.hash = '#/campaign'; };`
				: readBuiltin(name);
		const declared = {
			...BUILTIN_PARITY,
			search: { ...BUILTIN_PARITY.search, gaps: { 'read:listEncountersForActor': 'stale' } },
		};
		expect(check(bodyUses(withPrivateWrites), declared)).toEqual([
			'characters: uses command:session.end, which no descriptor, intent or query source exposes to a GM-built widget',
			'characters: uses route:/campaign, which no descriptor, intent or query source exposes to a GM-built widget',
			'search: uses read:getSavedSearchesForActor, which no descriptor, intent or query source exposes to a GM-built widget',
			'search: gap read:listEncountersForActor is no longer used; remove it',
		]);
	});

	it('fails on a gap the body no longer needs and on surface it does not use', () => {
		const declared = {
			...BUILTIN_PARITY,
			dice: {
				...BUILTIN_PARITY.dice,
				commands: [...BUILTIN_PARITY.dice.commands, 'timer.start'],
				gaps: { 'read:getDiceHistoryForActor': 'closed already' },
			},
		};
		expect(check(bodyUses(), declared)).toEqual([
			'dice: read:getDiceHistoryForActor is public (query:dice-history); remove its gap entry',
			'dice: declares command timer.start but never dispatches it',
		]);
	});

	it('reports a builtin body with no declared entry', () => {
		const { map: _map, ...declared } = BUILTIN_PARITY;
		expect(check(bodyUses(), declared)).toEqual(['map: has a builtin body but no parity entry']);
	});
});

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

describe('builder parity gate: default screens', () => {
	it('every widget on a shipped default screen round-trips through the builder', () => {
		const { env, state } = provisionedVault();
		expect(findHomeScreen(state.scenes)?.widgets.length).toBeGreaterThan(0);
		expect(defaultScreenParityProblems(state, env, DM.id)).toEqual([]);
	});

	it('fails when a default screen carries a builtin body', () => {
		const { env, state } = provisionedVault();
		const home = findHomeScreen(state.scenes)!;
		const added = dispatchCommand(state, env, {
			type: 'scene.add-widget',
			actorId: DM.id,
			payload: {
				sceneId: home.id,
				widget: {
					type: 'dice',
					version: '1.0.0',
					layout: { x: 0, y: 960, w: 1152, h: 240 },
					configuration: {},
				},
			},
		} as CoreCommand);
		expect(added.status).toBe('accepted');
		if (added.status !== 'accepted') return;
		expect(defaultScreenParityProblems(added.nextState, env, DM.id)).toEqual([
			'dice: draws through a hand-written builtin body the builder cannot express',
		]);
	});

	it('lets the builder add derived fields but not drop or change declared ones', () => {
		const shipped = { style: { tokens: [{ key: 'accent' }] }, configFields: [{ key: 'title' }] };
		expect(changedFields(shipped, { ...shipped, computedFields: [] })).toEqual([]);
		expect(
			changedFields(shipped, { style: { tokens: [] }, configFields: [{ key: 'heading' }] }),
		).toEqual(['/style/tokens', '/configFields/0/key']);
	});

	it('the GM screen board is drawn only by declared builtin bodies', () => {
		const { state } = provisionedVault();
		const board = state.scenes.scenes[state.commandCenter.homeSceneId!]!;
		for (const widget of board.widgets) expect(Object.keys(BUILTIN_PARITY)).toContain(widget.type);
	});
});
