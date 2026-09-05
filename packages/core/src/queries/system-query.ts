import { hasDmAuthority } from '../state/permission-state';
import type { PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import {
	activeSystemPackage,
	cloneSystemPackage,
	type SystemPackage,
	type SystemVocabulary,
	type SystemsState,
} from '../state/system-package';

/**
 * RC-SYS-1.4 — the actor-scoped read of the active SYSTEM PACKAGE (Contract 3: the core decides
 * what a player sees, never the UI).
 *
 * The active package's RULES CONTENT (vocabulary, attributes, resources, conditions, dice, turn
 * model, advancement, skills, derived values) drives every player's character sheet and MUST reach
 * a player identically to how it reaches the DM — hiding it would break the game. What is DM-only
 * is the AUTHORING VIEW of the catalog: which other packages are installed (built-in and any
 * DM-authored/forked ones not currently active). That list is DM-authored configuration exactly
 * like the widget library and audio library (Contract 3), so a non-DM actor gets it EMPTY —
 * fail-closed, no leak of homebrew-in-progress or disabled packages.
 *
 * Pure + deterministic over plain state. No GUI, no storage, no clock.
 */

/** The actor-scoped read of `SystemsState`: the active package plus the DM-only catalog listing. */
export interface SystemActorView {
	/** The active package's full rules content — identical for every role. */
	activePackage: SystemPackage;
	/**
	 * DM-only: every installed package id (built-in + custom), sorted. Empty for a non-DM actor —
	 * the catalog is DM-authored configuration; a player only ever needs the ACTIVE package.
	 */
	installedPackageIds: readonly string[];
}

/**
 * The active SystemPackage for this actor (RC-SYS-1.4). The DM additionally sees the full catalog
 * of installed package ids for the system picker's authoring UI; a non-DM actor sees an empty
 * catalog list (fail closed — the DM's other/draft packages never leak to a player).
 */
export function getActiveSystemForActor(
	state: SystemsState,
	permissions: PermissionState,
	actorId: string,
): SystemActorView {
	const activePackage = cloneSystemPackage(activeSystemPackage(state));
	const actor = getActor(permissions, actorId);
	if (!hasDmAuthority(actor?.role)) {
		return { activePackage, installedPackageIds: [] };
	}
	return {
		activePackage,
		installedPackageIds: Object.keys(state.packages).sort(),
	};
}

/**
 * The words the interface should use for this actor (system/dice/spell/level-up terminology, …).
 * Vocabulary is part of the active package's rules content, so it resolves identically for every
 * role — a player reads the same "spell" or "power" the DM does.
 */
export function resolveVocabulary(
	state: SystemsState,
	permissions: PermissionState,
	actorId: string,
): SystemVocabulary {
	return getActiveSystemForActor(state, permissions, actorId).activePackage.vocabulary;
}
