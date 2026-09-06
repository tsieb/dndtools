import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	STARTER_WIDGET_LIBRARY,
	dispatchCommand,
	findStarterWidget,
	listWidgetLibrary,
	type CommandResult,
	type CoreStateSlice,
	type StarterWidgetEntry,
} from '../src';

/**
 * RC-WID-1.6 — the bundled starter library.
 *
 * The invariants these tests protect:
 *   - every starter survives the REAL install pipeline (schema + package diagnostics), because a
 *     starter that cannot install is a button in the widget manager that can only ever fail;
 *   - a starter is placeable: reviewed and enabled, it appears in the DM's widget library and can be
 *     added to a scene;
 *   - it is functional rather than a shell — it renders through a declared template or a sandboxed
 *     entrypoint, over declared data queries, config fields or commands;
 *   - exactly one starter ships CODE, and none of them asks for a host permission.
 */

const env = makeEnvironment();

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	expect(result.status, JSON.stringify(result)).toBe('accepted');
	if (result.status !== 'accepted') throw new Error('expected accepted');
	return result;
}

/** Install → review as trusted → enable, exactly as the widget manager does it. */
function enable(entry: StarterWidgetEntry): CoreStateSlice {
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	state = accepted(
		dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: entry.build() },
		}),
	).nextState;
	state = accepted(
		dispatchCommand(state, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId: entry.packageId, trustState: 'trusted' },
		}),
	).nextState;
	return accepted(
		dispatchCommand(state, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: entry.packageId },
		}),
	).nextState;
}

describe('RC-WID-1.6: the starter library ships seven real packages', () => {
	it('lists seven starters with unique package ids and widget types', () => {
		expect(STARTER_WIDGET_LIBRARY).toHaveLength(7);
		const ids = STARTER_WIDGET_LIBRARY.map((entry) => entry.packageId);
		const types = STARTER_WIDGET_LIBRARY.map((entry) => entry.widgetType);
		expect(new Set(ids).size).toBe(7);
		expect(new Set(types).size).toBe(7);
		expect(findStarterWidget('starter.table-roller')?.name).toBe('Table Roller');
		expect(findStarterWidget('starter.nothing-like-this')).toBeNull();
	});

	it.each(STARTER_WIDGET_LIBRARY.map((entry) => [entry.packageId, entry] as const))(
		'%s installs, is reviewable, enables and is placeable',
		(_id, entry) => {
			const state = enable(entry);
			const record = state.widgets.packages[entry.packageId];
			expect(record?.enabled).toBe(true);
			expect(record?.trust.state).toBe('trusted');
			// Provenance is first-party, not model output: the scaffolder's `generated` stamp is
			// replaced, so the review sheet does not misreport where a bundled package came from.
			expect(record?.package.authoring?.source).toBe('workspace');

			const library = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
				profileId: 'desktop',
			});
			const listed = library.find((candidate) => candidate.type === entry.widgetType);
			expect(listed, `${entry.widgetType} is not in the widget library`).toBeDefined();
			expect(listed?.availability.available).toBe(true);

			const scene = accepted(
				dispatchCommand(state, env, {
					type: 'scene.create',
					actorId: DM_ACTOR.id,
					payload: { name: 'Starters', visibility: 'player-visible' },
				}),
			).nextState;
			const sceneId = Object.keys(scene.scenes.scenes)[0]!;
			const placed = accepted(
				dispatchCommand(scene, env, {
					type: 'scene.add-widget',
					actorId: DM_ACTOR.id,
					payload: {
						sceneId,
						widget: {
							type: entry.widgetType,
							version: '1.0.0',
							layout: { x: 10, y: 20, w: 300, h: 220 },
							configuration: {},
							binding: null,
						},
					},
				}),
			).nextState;
			expect(placed.scenes.scenes[sceneId]?.widgets.some((w) => w.type === entry.widgetType)).toBe(
				true,
			);
		},
	);

	it.each(STARTER_WIDGET_LIBRARY.map((entry) => [entry.packageId, entry] as const))(
		'%s renders through a declared entrypoint and has something to show',
		(_id, entry) => {
			const widget = entry.build().widgets[0]!;
			const entrypoint = widget.renderEntrypoint;
			expect(entrypoint).toBeDefined();
			if (entry.shipsCode) {
				expect(entrypoint?.runtime).toBe('custom-html-js');
				expect(entrypoint?.sandbox).toBe('iframe');
			} else {
				expect(entrypoint?.runtime).toBe('template');
				expect(entrypoint?.template).toBeDefined();
			}
			// Not a shell: it declares data to read, settings to render, or a command to run.
			const substance =
				(widget.dataQueries?.length ?? 0) +
				(widget.configFields?.length ?? 0) +
				widget.commands.length;
			expect(substance).toBeGreaterThan(0);
			// Nothing bundled asks for the clipboard, the filesystem or the network.
			expect(widget.hostPermissions).toEqual([]);
			expect(widget.placement?.libraryListed).toBe(true);
			expect(widget.placement?.surfaces).toContain('scene');
		},
	);

	it('ships code in exactly one starter, and only inside the sandbox', () => {
		const coded = STARTER_WIDGET_LIBRARY.filter((entry) => entry.shipsCode);
		expect(coded.map((entry) => entry.packageId)).toEqual(['starter.torchlight']);
		for (const entry of STARTER_WIDGET_LIBRARY) {
			const pkg = entry.build();
			expect(pkg.assets.length > 0).toBe(entry.shipsCode);
		}
		const torch = coded[0]!.build();
		// The flicker is a CSS animation the sandbox document installs, and reduced motion turns it
		// off — motion is never the only carrier of the reading.
		const css = torch.assets.find((asset) => asset.kind === 'css')?.content ?? '';
		expect(css).toContain('prefers-reduced-motion');
		const js = torch.assets.find((asset) => asset.kind === 'javascript')?.content ?? '';
		expect(js).toContain('dndtoolsWidget');
	});

	it('gives Table Roller a real dice command whose payload the configuration supplies', () => {
		const widget = findStarterWidget('starter.table-roller')!.build().widgets[0]!;
		const command = widget.commands.find((candidate) => candidate.type === 'dice.roll');
		expect(command?.requiredCapability).toBe('operator');
		expect(command?.payloadSchema.required).toContain('expression');
		// Every key the command requires is a config field the DM can actually set.
		const keys = new Set(widget.configFields?.map((field) => field.key));
		for (const required of command?.payloadSchema.required ?? []) {
			expect(keys.has(required), `no config field supplies ${required}`).toBe(true);
		}
	});

	it('declares the loot ledger write through a command it also declares', () => {
		const widget = findStarterWidget('starter.loot-ledger')!.build().widgets[0]!;
		const write = widget.outputWrites?.[0];
		expect(write?.requiresConfirmation).toBe(true);
		expect(widget.commands.map((command) => command.type)).toContain(write?.commandType);
	});
});
