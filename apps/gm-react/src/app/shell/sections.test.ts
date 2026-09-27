import { describe, expect, it } from 'vitest';
import { DEFAULT_SCREEN_META, dispatchCommand } from '@dndtools/core';
import { buildInitialState, DM_ACTOR, PLAYER_ACTOR, makeEnvironment } from '@dndtools/core/testing';
import { sectionPath } from './sections';

describe('Run default screen destinations', () => {
	it.each([
		['home', 'command-center'],
		['board', 'gm-screen'],
		['session', 'session'],
	])('resolves %s by stable origin, not by name or pin', (section, key) => {
		const result = dispatchCommand(buildInitialState(), makeEnvironment(), {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'My renamed screen', visibility: 'dm-only' },
		});
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		const state = result.nextState;
		const screen = Object.values(state.scenes.scenes)[0]!;
		screen.screen = {
			...DEFAULT_SCREEN_META,
			origin: { kind: 'default', sourceSceneId: null, defaultKey: key, at: '2026-09-26T00:00:00Z' },
		};
		expect(sectionPath(section, state, DM_ACTOR.id)).toBe(`/screen/${screen.id}`);
		expect(sectionPath(section, state, PLAYER_ACTOR.id)).not.toBe(`/screen/${screen.id}`);
		expect(sectionPath('characters', state, DM_ACTOR.id)).toBe('/characters');
	});
	it('retains aliases before default provisioning', () => {
		const state = buildInitialState();
		expect(sectionPath('home', state, DM_ACTOR.id)).toBe('/');
		expect(sectionPath('board', state, DM_ACTOR.id)).toBe('/board');
		expect(sectionPath('session', state, DM_ACTOR.id)).toBe('/session');
	});
});
