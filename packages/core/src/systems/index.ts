/**
 * RC-SYS-1.2 — the built-in `SystemPackage` registry.
 *
 * Packages that ship with the build live here and nowhere else. `hydrateSystemsState` re-seeds
 * every entry on load, so a built-in is always the version the code shipped, never a stale copy a
 * vault happened to save; a DM who wants to change one forks it into the `custom:` namespace.
 *
 * These modules hold DATA ONLY and import their types with `import type`, so nothing in
 * `state/system-package.ts` is needed at load time and the two directories cannot deadlock on
 * module initialisation order.
 */
import type { SystemPackage } from '../state/system-package';
import { DND5E_SYSTEM_PACKAGE, DND5E_SYSTEM_PACKAGE_ID } from './dnd5e';
import { GENERIC_SYSTEM_PACKAGE, GENERIC_SYSTEM_PACKAGE_ID } from './generic';

export {
	DND5E_ABILITY_MODIFIER_FORMULA,
	DND5E_CLASS_HIT_DICE,
	DND5E_CR_XP,
	DND5E_DEFAULT_HIT_DIE,
	DND5E_FULL_CASTER_SLOTS,
	DND5E_LEVEL_CAP,
	DND5E_MAX_SPELL_LEVEL,
	DND5E_PROFICIENCY_BONUS_FORMULA,
	DND5E_SYSTEM_PACKAGE,
	DND5E_SYSTEM_PACKAGE_ID,
	DND5E_XP_THRESHOLDS,
	dnd5eXpForChallengeRating,
} from './dnd5e';
export type { GenericSystemPackageOptions } from './generic';
export {
	GENERIC_APPROACHES,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
	createGenericSystemPackage,
} from './generic';

/** Every package that ships with the build, in the order a system picker should list them. */
export const BUILT_IN_SYSTEM_PACKAGES: readonly SystemPackage[] = Object.freeze([
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
]);

/** The ids of the built-in packages, so callers can tell a shipped package from an authored one. */
export const BUILT_IN_SYSTEM_PACKAGE_IDS: readonly string[] = Object.freeze([
	DND5E_SYSTEM_PACKAGE_ID,
	GENERIC_SYSTEM_PACKAGE_ID,
]);

/** Whether this id names a package that ships with the build. Pure. */
export function isBuiltInSystemPackageId(packageId: string): boolean {
	return BUILT_IN_SYSTEM_PACKAGE_IDS.includes(packageId);
}

/** The built-in package with this id, or `undefined`. Pure. */
export function builtInSystemPackage(packageId: string): SystemPackage | undefined {
	return BUILT_IN_SYSTEM_PACKAGES.find((pkg) => pkg.id === packageId);
}

/* ---- RC-SYS-3.5 — the starter library (samples: installed, never built in) --------------------- */
export {
	PF2E_SAMPLE_SYSTEM_PACKAGE,
	PF2E_SAMPLE_SYSTEM_PACKAGE_ID,
	STARTER_SYSTEM_LIBRARY,
	starterSystemPackage,
} from './samples';
