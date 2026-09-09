import { describe, expect, it } from 'vitest';
import {
	DND5E_SYSTEM_PACKAGE,
	GENERIC_SYSTEM_PACKAGE,
	exportSystemPackageBundle,
} from '@dndtools/core';
import {
	installPlanCommand,
	installPlanItemCount,
	installPlanKind,
	planModuleInstall,
} from './moduleInstall';

/**
 * RC-CLD-4.1 — the marketplace install ROUTER. A listing's payload decides which review flow runs;
 * anything unrecognised is reported, never guessed at.
 */

const NOT_A_PACKAGE = 'This module is not a valid widget package.';

const contentBundle = {
	format: 'dndmodule',
	schemaVersion: 1,
	manifest: {
		kind: 'content-module',
		id: 'sunken-crypt',
		name: 'The Sunken Crypt',
		summary: 'A three-session delve under a drowned chapel.',
		version: '1.0.0',
	},
	payload: {
		format: 'dndtools-content-export',
		version: 1,
		mode: 'portable',
		files: [
			{ path: 'notes/crypt.md', markdown: '# The crypt' },
			{ path: 'notes/chapel.md', markdown: '# The chapel' },
		],
	},
	assets: [],
};

const sceneBundle = {
	...contentBundle,
	manifest: { ...contentBundle.manifest, kind: 'scene-package', id: 'crypt-scenes' },
	payload: {
		format: 'dndtools-scene-package',
		version: 1,
		scenes: [{ id: 'scene-1', name: 'Flooded nave', document: { layers: [] } }],
	},
};

/** RC-SYS-3.4 — a real system-package bundle, built the way the Export panel builds one. */
function systemBundle(): unknown {
	const systems = {
		packages: { [DND5E_SYSTEM_PACKAGE.id]: DND5E_SYSTEM_PACKAGE },
		activePackageId: DND5E_SYSTEM_PACKAGE.id,
		activeWidgetPackageId: null,
		schemaVersion: 1 as const,
	};
	const built = exportSystemPackageBundle(systems, DND5E_SYSTEM_PACKAGE.id);
	if (!built.ok) throw new Error(built.reason);
	return JSON.parse(JSON.stringify(built.bundle));
}

describe('planModuleInstall', () => {
	it('routes a system package to system.define, re-homed into the custom namespace', () => {
		const plan = planModuleInstall(systemBundle(), NOT_A_PACKAGE, {
			packages: { [DND5E_SYSTEM_PACKAGE.id]: DND5E_SYSTEM_PACKAGE },
		});
		expect(plan.kind).toBe('system-package');
		if (plan.kind !== 'system-package') return;
		// The bundle carried a built-in id; installing it under that id would be reverted by the next
		// hydrate, so the plan says what it will really define.
		expect(plan.sourcePackageId).toBe(DND5E_SYSTEM_PACKAGE.id);
		expect(plan.rehomed).toBe(true);
		expect(plan.systemPackage.id).toBe('custom:dnd5e');
		expect(installPlanItemCount(plan)).toBe(1);
		expect(installPlanKind(plan)).toBe('system-package');
		expect(installPlanCommand(plan)).toEqual({
			type: 'system.define',
			payload: { package: plan.systemPackage },
		});
	});

	it('gives an imported system a free id when the vault already holds that one', () => {
		const plan = planModuleInstall(systemBundle(), NOT_A_PACKAGE, {
			packages: {
				[DND5E_SYSTEM_PACKAGE.id]: DND5E_SYSTEM_PACKAGE,
				'custom:dnd5e': { ...GENERIC_SYSTEM_PACKAGE, id: 'custom:dnd5e' },
			},
		});
		expect(plan.kind).toBe('system-package');
		if (plan.kind !== 'system-package') return;
		expect(plan.systemPackage.id).toBe('custom:dnd5e-2');
	});

	it('routes a content module to the transactional import, as {path,text} files', () => {
		const plan = planModuleInstall(contentBundle, NOT_A_PACKAGE);
		expect(plan.kind).toBe('content-module');
		if (plan.kind !== 'content-module') return;
		expect(plan.files).toEqual([
			{ path: 'notes/crypt.md', text: '# The crypt' },
			{ path: 'notes/chapel.md', text: '# The chapel' },
		]);
		expect(installPlanItemCount(plan)).toBe(2);
		expect(installPlanKind(plan)).toBe('content-module');
	});

	it('keeps a legacy bare widget-package payload installable', () => {
		const plan = planModuleInstall(
			{ id: 'starter.table-roller', version: '1.0.0', widgets: [{}, {}] },
			NOT_A_PACKAGE,
		);
		expect(plan.kind).toBe('widget-package');
		if (plan.kind !== 'widget-package') return;
		expect(plan.bundle).toBeNull();
		expect(installPlanItemCount(plan)).toBe(2);
	});

	it('marks a scene package unsupported rather than offering a broken install', () => {
		const plan = planModuleInstall(sceneBundle, NOT_A_PACKAGE);
		expect(plan.kind).toBe('unsupported');
		expect(installPlanKind(plan)).toBe('scene-package');
	});

	it('reports an unreadable payload instead of dispatching a guess', () => {
		expect(planModuleInstall(null, NOT_A_PACKAGE)).toEqual({
			kind: 'not-a-module',
			reason: NOT_A_PACKAGE,
		});
		const broken = planModuleInstall(
			{ ...contentBundle, manifest: { ...contentBundle.manifest, kind: 'system-package' } },
			NOT_A_PACKAGE,
		);
		expect(broken.kind).toBe('not-a-module');
		if (broken.kind === 'not-a-module') expect(broken.reason).toMatch(/system-package/);
		expect(installPlanKind(broken)).toBeNull();
	});
});

describe('installPlanCommand', () => {
	it('sends a content module through the non-destructive transactional import', () => {
		const command = installPlanCommand(planModuleInstall(contentBundle, NOT_A_PACKAGE));
		expect(command).toEqual({
			type: 'content.commit-import',
			payload: {
				sourceKind: 'markdown-archive',
				policy: 'skip',
				files: [
					{ path: 'notes/crypt.md', text: '# The crypt' },
					{ path: 'notes/chapel.md', text: '# The chapel' },
				],
				appliedEntryIds: [],
			},
		});
	});

	it('installs or upgrades a widget package, as the caller found it', () => {
		const plan = planModuleInstall(
			{ id: 'starter.table-roller', version: '1.0.0', widgets: [] },
			NOT_A_PACKAGE,
		);
		expect(installPlanCommand(plan)?.type).toBe('widget.package.install');
		expect(installPlanCommand(plan, { isUpgrade: true })?.type).toBe('widget.package.upgrade');
	});

	it('has no command for a kind this release cannot install', () => {
		expect(installPlanCommand(planModuleInstall(sceneBundle, NOT_A_PACKAGE))).toBeNull();
		expect(installPlanCommand(planModuleInstall(null, NOT_A_PACKAGE))).toBeNull();
	});
});
