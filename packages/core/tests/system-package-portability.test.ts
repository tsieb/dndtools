/**
 * RC-SYS-3.4 — a system package travelling as a `.dndmodule` bundle: export it, parse it back as an
 * untrusted file, import it, and define it.
 *
 * The round trip is the story's acceptance. What these tests pin down is that the trip is LOSSLESS
 * for the package's body, and HONEST about its id: an imported package always lands in the `custom:`
 * namespace under a free id, because built-in ids are re-seeded from the build on every load and an
 * install must add a system rather than overwrite one the DM already has.
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
	DND5E_SYSTEM_PACKAGE_ID,
	GENERIC_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE_ID,
	dispatchCommand,
	exportSystemPackageBundle,
	importSystemPackageFromBundle,
	parseModuleBundle,
	systemPackageModuleId,
	type CoreStateSlice,
	type ModuleBundle,
	type SystemPackage,
} from '../src';

function baseState(): CoreStateSlice {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
}

/** A DM-authored package: the built-in Generic body under a `custom:` id, as a fork would produce. */
function customPackage(id = 'custom:hearthlight'): SystemPackage {
	return { ...structuredClone(GENERIC_SYSTEM_PACKAGE), id, displayName: 'Hearthlight' };
}

function withPackage(state: CoreStateSlice, pkg: SystemPackage): CoreStateSlice {
	return {
		...state,
		systems: { ...state.systems, packages: { ...state.systems.packages, [pkg.id]: pkg } },
	};
}

/** Export, then read the file back the way an install does: as untrusted JSON, re-parsed. */
function roundTripBundle(state: CoreStateSlice, packageId: string): ModuleBundle {
	const built = exportSystemPackageBundle(state.systems, packageId);
	if (!built.ok) throw new Error(`export failed: ${built.reason}`);
	const overTheWire: unknown = JSON.parse(JSON.stringify(built.bundle));
	const parsed = parseModuleBundle(overTheWire);
	if (!parsed.ok) throw new Error(`re-parse failed: ${parsed.reason}`);
	return parsed.bundle;
}

describe('RC-SYS-3.4 system package export/import', () => {
	it('exports a bundle whose manifest describes the package it carries', () => {
		const state = withPackage(baseState(), customPackage());
		const built = exportSystemPackageBundle(state.systems, 'custom:hearthlight');
		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(built.bundle.manifest.kind).toBe('system-package');
		// The manifest alphabet has no colon, so the namespace separator ships as a hyphen.
		expect(built.bundle.manifest.id).toBe('custom-hearthlight');
		expect(built.bundle.manifest.name).toBe('Hearthlight');
		expect(built.bundle.manifest.version).toBe(GENERIC_SYSTEM_PACKAGE.version);
		expect(built.bundle.manifest.systems).toEqual(['custom:hearthlight']);
		expect(built.bundle.assets).toEqual([]);
	});

	it('round-trips a DM-authored package unchanged, id included', () => {
		const source = customPackage();
		const state = withPackage(baseState(), source);
		const bundle = roundTripBundle(state, source.id);
		const imported = importSystemPackageFromBundle(bundle, { packages: {} });
		expect(imported.ok).toBe(true);
		if (!imported.ok) return;
		expect(imported.import.rehomed).toBe(false);
		expect(imported.import.sourcePackageId).toBe(source.id);
		expect(imported.import.package).toEqual(source);
	});

	it('re-homes a built-in package into the custom namespace, body unchanged', () => {
		const state = baseState();
		const bundle = roundTripBundle(state, GENERIC_SYSTEM_PACKAGE_ID);
		const imported = importSystemPackageFromBundle(bundle, state.systems);
		expect(imported.ok).toBe(true);
		if (!imported.ok) return;
		expect(imported.import.rehomed).toBe(true);
		expect(imported.import.sourcePackageId).toBe(GENERIC_SYSTEM_PACKAGE_ID);
		expect(imported.import.package.id).toBe('custom:generic');
		expect(CUSTOM_SYSTEM_PACKAGE_ID_PATTERN.test(imported.import.package.id)).toBe(true);
		expect({ ...imported.import.package, id: GENERIC_SYSTEM_PACKAGE_ID }).toEqual(
			state.systems.packages[GENERIC_SYSTEM_PACKAGE_ID],
		);
	});

	it('installs under a free id rather than overwriting a package already in the vault', () => {
		const first = baseState();
		const bundle = roundTripBundle(first, GENERIC_SYSTEM_PACKAGE_ID);
		const once = importSystemPackageFromBundle(bundle, first.systems);
		expect(once.ok).toBe(true);
		if (!once.ok) return;
		const after = withPackage(first, once.import.package);
		const twice = importSystemPackageFromBundle(bundle, after.systems);
		expect(twice.ok).toBe(true);
		if (!twice.ok) return;
		expect(twice.import.package.id).not.toBe(once.import.package.id);
		expect(CUSTOM_SYSTEM_PACKAGE_ID_PATTERN.test(twice.import.package.id)).toBe(true);
	});

	it('an imported package is definable verbatim through system.define', () => {
		const state = baseState();
		const bundle = roundTripBundle(state, DND5E_SYSTEM_PACKAGE_ID);
		const imported = importSystemPackageFromBundle(bundle, state.systems);
		expect(imported.ok).toBe(true);
		if (!imported.ok) return;
		const result = dispatchCommand(state, makeEnvironment(), {
			type: 'system.define',
			actorId: DM_ACTOR.id,
			payload: { package: imported.import.package },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		expect(result.nextState.systems.packages[imported.import.package.id]).toEqual(
			imported.import.package,
		);
		// Defining an imported system does not switch the campaign onto it: selecting is a separate,
		// dry-run-gated decision (RC-SYS-1.3).
		expect(result.nextState.systems.activePackageId).toBe(state.systems.activePackageId);
	});

	it('refuses to export a system the campaign does not have', () => {
		const built = exportSystemPackageBundle(baseState().systems, 'custom:nothing-here');
		expect(built.ok).toBe(false);
		if (built.ok) return;
		expect(built.reason).toContain('not installed');
	});

	it('refuses a bundle that is not a system package', () => {
		const state = withPackage(baseState(), customPackage());
		const bundle = roundTripBundle(state, 'custom:hearthlight');
		const wrongKind: ModuleBundle = {
			...bundle,
			manifest: { ...bundle.manifest, kind: 'scene-package' },
		};
		const imported = importSystemPackageFromBundle(wrongKind, { packages: {} });
		expect(imported.ok).toBe(false);
	});

	it('folds any package id into the manifest alphabet', () => {
		expect(systemPackageModuleId('custom:my-system')).toBe('custom-my-system');
		expect(systemPackageModuleId(DND5E_SYSTEM_PACKAGE_ID)).toBe('builtin-dnd5e');
		expect(systemPackageModuleId('::')).toBe('system-package');
	});
});
