/**
 * RC-SYS-1.4 — the actor-scoped read of the active system package.
 *
 * Both roles must resolve the SAME rules content (vocabulary, attributes, conditions, …) since a
 * player's character sheet reads from the same package the DM authors from. Only the DM-only
 * catalog listing (which packages are installed) may differ by role — that is what these tests
 * pin down as the no-leak evidence.
 */
import { describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE_ID,
	EMPTY_SYSTEMS_STATE,
	GENERIC_SYSTEM_PACKAGE_ID,
	getActiveSystemForActor,
	resolveVocabulary,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildPermissionState,
} from '../src/testing/fixtures';

describe('getActiveSystemForActor', () => {
	it('gives the DM the active package plus every installed package id', () => {
		const permissions = buildPermissionState(DM_ACTOR);
		const view = getActiveSystemForActor(EMPTY_SYSTEMS_STATE, permissions, DM_ACTOR.id);

		expect(view.activePackage.id).toBe(DND5E_SYSTEM_PACKAGE_ID);
		expect(view.installedPackageIds).toEqual(
			[...new Set([DND5E_SYSTEM_PACKAGE_ID, GENERIC_SYSTEM_PACKAGE_ID])].sort(),
		);
	});

	it('gives a player the same active package but an empty catalog (fail closed, no leak)', () => {
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const view = getActiveSystemForActor(EMPTY_SYSTEMS_STATE, permissions, PLAYER_ACTOR.id);

		expect(view.activePackage).toEqual(
			getActiveSystemForActor(EMPTY_SYSTEMS_STATE, permissions, DM_ACTOR.id).activePackage,
		);
		expect(view.installedPackageIds).toEqual([]);
	});

	it('gives an observer an empty catalog too (only dm/co-dm carry authoring visibility)', () => {
		const permissions = buildPermissionState(DM_ACTOR, OBSERVER_ACTOR);
		const view = getActiveSystemForActor(EMPTY_SYSTEMS_STATE, permissions, OBSERVER_ACTOR.id);

		expect(view.installedPackageIds).toEqual([]);
	});

	it('fails closed for an unknown actor id (treated as the lowest-privilege role)', () => {
		const permissions = buildPermissionState(DM_ACTOR);
		const view = getActiveSystemForActor(EMPTY_SYSTEMS_STATE, permissions, 'actor-unknown');

		expect(view.installedPackageIds).toEqual([]);
	});

	it('never returns a shared reference into the state slice (defensive clone)', () => {
		const permissions = buildPermissionState(DM_ACTOR);
		const view = getActiveSystemForActor(EMPTY_SYSTEMS_STATE, permissions, DM_ACTOR.id);

		expect(view.activePackage).not.toBe(EMPTY_SYSTEMS_STATE.packages[DND5E_SYSTEM_PACKAGE_ID]);
	});
});

describe('resolveVocabulary', () => {
	it('resolves the active package vocabulary identically for the DM and a player', () => {
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);

		const dmVocabulary = resolveVocabulary(EMPTY_SYSTEMS_STATE, permissions, DM_ACTOR.id);
		const playerVocabulary = resolveVocabulary(EMPTY_SYSTEMS_STATE, permissions, PLAYER_ACTOR.id);

		expect(dmVocabulary).toEqual(playerVocabulary);
		expect(dmVocabulary.character).toBeTruthy();
	});

	it('matches the active package vocabulary directly', () => {
		const permissions = buildPermissionState(DM_ACTOR);
		const view = getActiveSystemForActor(EMPTY_SYSTEMS_STATE, permissions, DM_ACTOR.id);

		expect(resolveVocabulary(EMPTY_SYSTEMS_STATE, permissions, DM_ACTOR.id)).toEqual(
			view.activePackage.vocabulary,
		);
	});
});
