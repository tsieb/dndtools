import { describe, expect, it } from 'vitest';
import { installPlanItemCount, installPlanKind, planModuleInstall } from './moduleInstall';

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

describe('planModuleInstall', () => {
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
