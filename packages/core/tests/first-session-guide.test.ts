import { describe, expect, it } from 'vitest';
import {
	FIRST_SESSION_ROW_IDS,
	dispatchCommand,
	findHomeScreen,
	resolveFirstSessionGuide,
	resolveOnboarding,
	wantsFirstSessionGuide,
	type CoreCommand,
	type CoreStateSlice,
	type FirstSessionRowId,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * RC-UX-6.3 — the first-session guide. Every row completes from durable state, through the same
 * commands the app's own flows dispatch, and never from a click on the guide.
 */

type Env = ReturnType<typeof makeEnvironment>;

function run(state: CoreStateSlice, env: Env, command: Omit<CoreCommand, 'actorId'>) {
	const result = dispatchCommand(state, env, { actorId: DM_ACTOR.id, ...command } as CoreCommand);
	if (result.status !== 'accepted')
		throw new Error(`${command.type} rejected: ${result.rejection.message}`);
	return result.nextState;
}

function doneRows(state: CoreStateSlice): FirstSessionRowId[] {
	return resolveFirstSessionGuide(state, DM_ACTOR.id)
		.rows.filter((row) => row.done)
		.map((row) => row.id);
}

/**
 * A fresh vault after the Command Center opened it: `ensure-home` provisions the home screen, then,
 * because the vault was fresh before that, the page places the guide with the view's own `restore`.
 */
function freshHome(env: Env, ...extra: (typeof PLAYER_ACTOR)[]) {
	const empty = buildInitialState(DM_ACTOR, ...extra);
	expect(wantsFirstSessionGuide(empty)).toBe(true);
	const provisioned = run(empty, env, { type: 'command-center.ensure-home', payload: {} });
	const place = resolveFirstSessionGuide(provisioned, DM_ACTOR.id).restore;
	return place ? run(provisioned, env, place) : provisioned;
}

/** A table scene the DM can go live on. */
function withScreen(state: CoreStateSlice, env: Env, name = 'The ferry') {
	const next = run(state, env, { type: 'scene.create', payload: { name } });
	const scene = Object.values(next.scenes.scenes).find((entry) => entry.name === name)!;
	return { state: next, sceneId: scene.id };
}

describe('RC-UX-6.3 the first-session guide: an empty vault', () => {
	it('lists the six rows in first-evening order, all open, each with a reason and a link', () => {
		const env = makeEnvironment();
		for (const state of [buildInitialState(DM_ACTOR), freshHome(env)]) {
			const guide = resolveFirstSessionGuide(state, DM_ACTOR.id);
			expect(guide.rows.map((row) => row.id)).toEqual([...FIRST_SESSION_ROW_IDS]);
			expect(guide.rows.map((row) => row.id)).toEqual([
				'name-campaign',
				'add-party',
				'map-or-note',
				'screen-from-template',
				'standby-session',
				'open-table',
			]);
			expect(guide.done).toBe(0);
			expect(guide.complete).toBe(false);
			for (const row of guide.rows) {
				expect(row.done, row.id).toBe(false);
				// One sentence: a single full stop, at the end.
				expect(row.why.trim(), row.id).toMatch(/^[^.]+\.$/);
				expect(row.links.length, row.id).toBeGreaterThan(0);
			}
		}
	});

	it('the provisioned home screen and the default screens do not count as an authored screen', () => {
		const env = makeEnvironment();
		let state = freshHome(env);
		state = run(state, env, { type: 'command-center.ensure-home', payload: { screen: 'session' } });
		expect(doneRows(state)).toEqual([]);
	});

	it('links each row to its existing flow through an intent the DM may follow', () => {
		const guide = resolveFirstSessionGuide(freshHome(makeEnvironment()), DM_ACTOR.id);
		const links = Object.fromEntries(
			guide.rows.map((row) => [
				row.id,
				row.links.map((link) =>
					link.kind === 'onboarding'
						? 'onboarding'
						: `${link.destination.path} ${JSON.stringify(link.destination.state)}`,
				),
			]),
		);
		expect(links).toEqual({
			'name-campaign': ['onboarding'],
			'add-party': ['/settings?tab=players null', '/characters null'],
			'map-or-note': ['/atlas {"create":true}', '/knowledge {"create":true}'],
			'screen-from-template': ['/scenes {"createScreen":true}'],
			'standby-session': ['/session null'],
			'open-table': ['/session null', '/settings?tab=players null'],
		});
	});

	it('is the campaign owner’s: a player gets the rows with nothing to follow and no commands', () => {
		const env = makeEnvironment();
		const state = freshHome(env, PLAYER_ACTOR);
		const guide = resolveFirstSessionGuide(state, PLAYER_ACTOR.id);
		expect(guide.canSetup).toBe(false);
		expect(guide.rows.every((row) => row.links.length === 0)).toBe(true);
		expect(guide.dismiss).toBeNull();
		expect(guide.restore).toBeNull();
		expect(resolveFirstSessionGuide(state, DM_ACTOR.id).canSetup).toBe(true);
	});
});

describe('RC-UX-6.3 the first-session guide: each row completes from state', () => {
	it('name the campaign: done once the campaign has a name', () => {
		const env = makeEnvironment();
		const state = run(freshHome(env), env, {
			type: 'campaign.set-identity',
			payload: { name: 'The Drowned Coast' },
		});
		expect(doneRows(state)).toEqual(['name-campaign']);
	});

	it('add the party: done with a player seat', () => {
		const env = makeEnvironment();
		const state = run(freshHome(env), env, {
			type: 'permission.add-players',
			payload: { displayNames: ['Ana', 'Bo'] },
		});
		expect(doneRows(state)).toEqual(['add-party']);
	});

	it('add the party: done with an imported player character', () => {
		const env = makeEnvironment();
		const state = freshHome(env);
		const npc = run(state, env, {
			type: 'character.quick-create',
			payload: { kind: 'npc', name: 'Mira' },
		});
		// An NPC is not the party.
		expect(doneRows(npc)).toEqual([]);
		const [id, character] = Object.entries(npc.characters.characters)[0]!;
		const imported: CoreStateSlice = {
			...npc,
			characters: {
				...npc.characters,
				characters: { [id]: { ...character, kind: 'pc' } as typeof character },
			},
		};
		expect(doneRows(imported)).toEqual(['add-party']);
	});

	it('an observer or co-DM seat is not the party', () => {
		const env = makeEnvironment();
		const state = freshHome(env, { id: 'actor-observer', role: 'observer', displayName: 'Obs' });
		expect(doneRows(state)).toEqual([]);
	});

	it('add a map or a note: either one completes it; a deleted note does not', () => {
		const env = makeEnvironment();
		const home = freshHome(env);
		expect(doneRows(run(home, env, { type: 'map.create', payload: { name: 'Keep' } }))).toEqual([
			'map-or-note',
		]);
		const noted = run(home, env, {
			type: 'content.create-item',
			payload: { kind: 'note', title: 'Rumours', body: 'The ferryman lies.' },
		});
		expect(doneRows(noted)).toEqual(['map-or-note']);
		const noteId = Object.keys(noted.content.items)[0]!;
		const deleted = run(noted, env, { type: 'content.remove-item', payload: { itemId: noteId } });
		expect(doneRows(deleted)).toEqual([]);
	});

	it('build a screen: an authored screen completes it; a template or a deleted screen does not', () => {
		const env = makeEnvironment();
		const home = freshHome(env);
		const template = run(home, env, {
			type: 'scene.create',
			payload: { name: 'Tavern template', asTemplate: true },
		});
		expect(doneRows(template)).toEqual([]);
		const templateId = Object.values(template.scenes.scenes).find(
			(scene) => scene.name === 'Tavern template',
		)!.id;
		const instantiated = run(template, env, {
			type: 'scene.instantiate-template',
			payload: { templateSceneId: templateId, newSceneName: 'The Gilded Eel' },
		});
		expect(doneRows(instantiated)).toEqual(['screen-from-template']);
		const screenId = Object.values(instantiated.scenes.scenes).find(
			(scene) => scene.name === 'The Gilded Eel',
		)!.id;
		const deleted = run(instantiated, env, {
			type: 'scene.delete',
			payload: { sceneId: screenId },
		});
		expect(doneRows(deleted)).toEqual([]);
	});

	it('run a session in Standby: a roll or a combatant completes it, and ending a session keeps it', () => {
		const env = makeEnvironment();
		const home = freshHome(env);
		expect(home.session.workflow).toBe('idle');
		const rolled = run(home, env, { type: 'dice.roll', payload: { expression: '1d20' } });
		expect(doneRows(rolled)).toEqual(['standby-session']);
		const fought = run(home, env, {
			type: 'combat.start',
			payload: { combatants: [{ kind: 'monster', name: 'Wolf', maxHp: 11, ac: 13 }] },
		});
		expect(fought.session.workflow).toBe('idle');
		expect(doneRows(fought)).toEqual(['standby-session']);
		// Ending that fight clears the tracker; its log keeps the trace, so the row stays done.
		const ended = run(fought, env, { type: 'combat.end', payload: {} });
		expect(doneRows(ended)).toEqual(['standby-session']);
	});

	it('open the table: going live completes it, and it stays done once the session is archived', () => {
		const env = makeEnvironment();
		const { state, sceneId } = withScreen(freshHome(env), env);
		const live = run(state, env, {
			type: 'session.set-workflow',
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		expect(doneRows(live)).toEqual(['screen-from-template', 'open-table']);
		// Recap archives the live session; back in Standby the archive is the trace.
		const recap = run(live, env, { type: 'session.set-workflow', payload: { workflow: 'recap' } });
		const standby = run(recap, env, {
			type: 'session.set-workflow',
			payload: { workflow: 'idle' },
		});
		expect(standby.session.workflow).toBe('idle');
		expect(doneRows(standby)).toContain('open-table');
	});

	it('open the table: Prep is not live', () => {
		const env = makeEnvironment();
		const prep = run(freshHome(env), env, {
			type: 'session.set-workflow',
			payload: { workflow: 'prep' },
		});
		expect(doneRows(prep)).toEqual([]);
	});
});

describe('RC-UX-6.3 the first-session guide: partial and complete vaults', () => {
	function partial(env: Env) {
		let state = freshHome(env);
		state = run(state, env, { type: 'campaign.set-identity', payload: { name: 'Saltmarsh' } });
		state = run(state, env, { type: 'map.create', payload: { name: 'Harbour' } });
		return state;
	}

	it('a partial vault reports exactly what it holds, in progress', () => {
		const env = makeEnvironment();
		const state = partial(env);
		const guide = resolveFirstSessionGuide(state, DM_ACTOR.id);
		expect(doneRows(state)).toEqual(['name-campaign', 'map-or-note']);
		expect(guide.done).toBe(2);
		expect(guide.complete).toBe(false);
		const onboarding = resolveOnboarding(state, DM_ACTOR.id);
		expect(onboarding.status).toBe('in-progress');
		expect(onboarding.steps.map((step) => [step.id, step.done])).toEqual(
			guide.rows.map((row) => [row.id, row.done]),
		);
	});

	it('a vault that did all six is complete, and onboarding says so', () => {
		const env = makeEnvironment();
		let state = partial(env);
		state = run(state, env, { type: 'permission.add-players', payload: { displayNames: ['Ana'] } });
		const screen = withScreen(state, env);
		state = run(screen.state, env, { type: 'dice.roll', payload: { expression: '1d20' } });
		state = run(state, env, {
			type: 'session.set-workflow',
			payload: { workflow: 'active', activeSceneId: screen.sceneId },
		});
		const guide = resolveFirstSessionGuide(state, DM_ACTOR.id);
		expect(guide.done).toBe(6);
		expect(guide.complete).toBe(true);
		expect(resolveOnboarding(state, DM_ACTOR.id).status).toBe('complete');
	});
});

describe('RC-UX-6.3 the guide on the home screen', () => {
	it('is wanted only in a fresh vault, and ensure-home alone never places it', () => {
		const env = makeEnvironment();
		expect(wantsFirstSessionGuide(buildInitialState(DM_ACTOR))).toBe(true);
		const bare = run(buildInitialState(DM_ACTOR), env, {
			type: 'command-center.ensure-home',
			payload: {},
		});
		// Provisioned: no longer fresh, and the home screen is the five parts until the page adds it.
		expect(wantsFirstSessionGuide(bare)).toBe(false);
		expect(resolveFirstSessionGuide(bare, DM_ACTOR.id).placedWidgetId).toBeNull();
		const { state } = withScreen(buildInitialState(DM_ACTOR), env);
		expect(wantsFirstSessionGuide(state)).toBe(false);
		const provisioned = run(state, env, { type: 'command-center.ensure-home', payload: {} });
		expect(findHomeScreen(provisioned.scenes)!.widgets.map((widget) => widget.type)).not.toContain(
			'getting-started',
		);
		expect(resolveFirstSessionGuide(provisioned, DM_ACTOR.id).placedWidgetId).toBeNull();
	});

	it('dismiss removes it from the home screen; restore puts one back first in reading order', () => {
		const env = makeEnvironment();
		const home = freshHome(env);
		const guide = resolveFirstSessionGuide(home, DM_ACTOR.id);
		const first = [...findHomeScreen(home.scenes)!.widgets].sort(
			(a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x,
		)[0]!;
		expect(first.type).toBe('getting-started');
		expect(guide.placedWidgetId).toBe(first.id);
		expect(guide.restore).toBeNull();

		const dismissed = run(home, env, guide.dismiss!);
		const afterDismiss = resolveFirstSessionGuide(dismissed, DM_ACTOR.id);
		expect(afterDismiss.placedWidgetId).toBeNull();
		expect(afterDismiss.dismiss).toBeNull();
		expect(
			findHomeScreen(dismissed.scenes)!.widgets.some((widget) => widget.type === 'getting-started'),
		).toBe(false);
		// Dismissing hides the guide; it does not tick anything.
		expect(afterDismiss.done).toBe(0);

		const restored = run(dismissed, env, afterDismiss.restore!);
		const screen = findHomeScreen(restored.scenes)!;
		const top = [...screen.widgets].sort(
			(a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x,
		);
		expect(top[0]!.type).toBe('getting-started');
		expect(top[0]!.configuration).toEqual({ presentation: 'bare' });
		expect(resolveFirstSessionGuide(restored, DM_ACTOR.id).placedWidgetId).toBe(top[0]!.id);
	});

	it('restore also works on a home screen that never had the guide', () => {
		const env = makeEnvironment();
		const { state } = withScreen(buildInitialState(DM_ACTOR), env);
		const provisioned = run(state, env, { type: 'command-center.ensure-home', payload: {} });
		const restore = resolveFirstSessionGuide(provisioned, DM_ACTOR.id).restore;
		expect(restore).not.toBeNull();
		const restored = run(provisioned, env, restore!);
		expect(resolveFirstSessionGuide(restored, DM_ACTOR.id).placedWidgetId).not.toBeNull();
	});

	it('has nothing to restore into before the home screen exists', () => {
		expect(resolveFirstSessionGuide(buildInitialState(DM_ACTOR), DM_ACTOR.id).restore).toBeNull();
	});
});
