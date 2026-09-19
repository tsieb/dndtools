import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import type { CoreCommand } from '@dndtools/core';
import type { SceneRuntime } from '../../src/runtime/SceneRuntime';
import { gotoRoute, markOnboarded } from './_helpers';

// Opt-in because timing a browser while the full functional suite runs in parallel measures
// contention, not the scene budget. Run on both profiles with --workers=1.
test('scene-first-render with 50 widgets and 10 active bindings', async ({ page }, testInfo) => {
	test.skip(process.env.DNDTOOLS_VAULT_PERF !== '1', 'Dedicated performance capture only');
	test.setTimeout(120_000);
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await expect(
		page.locator('[data-testid="scene-board-bounded"] [data-testid^="widget-"]').first(),
	).toBeVisible();
	const fixture = await page.evaluate(async () => {
		const rt = window.__rt as unknown as SceneRuntime;
		const sceneId = rt.state.commandCenter.homeSceneId!;
		const original = rt.state.scenes.scenes[sceneId].widgets;
		const map = original.find((widget) => widget.type === 'map' && widget.binding);
		const dice = original.find((widget) => widget.type === 'dice' && !widget.binding);
		if (!map || !dice) throw new Error('The seeded fixture requires a bound map and dice');
		const source = map.binding!.source;
		if (source.entityType !== 'map' || !rt.state.maps.maps[source.entityId]) {
			throw new Error('The map binding must resolve to a persisted map');
		}
		const accept = async (command: CoreCommand) => {
			const result = await rt.dispatch(command);
			if (result.status !== 'accepted') throw new Error(result.rejection.message);
		};
		for (const widget of original) {
			await accept({
				type: 'scene.destroy-widget',
				actorId: rt.defaultActorId,
				payload: { sceneId, widgetInstanceId: widget.id },
			});
		}
		for (let i = 0; i < 50; i++) {
			const template = i < 10 ? map : dice;
			await accept({
				type: 'scene.add-widget',
				actorId: rt.defaultActorId,
				payload: {
					sceneId,
					widget: {
						type: template.type,
						version: template.version,
						layout: {
							x: (i % 5) * 300,
							y: Math.floor(i / 5) * 300,
							w: 280,
							h: 280,
						},
						configuration: template.configuration,
						localState: template.localState,
						binding: template.binding,
					},
				},
			});
		}
		const widgets = rt.state.scenes.scenes[sceneId].widgets;
		return {
			sceneId,
			widgetCount: widgets.length,
			bindingCount: widgets.filter((widget) => widget.binding).length,
		};
	});
	expect(fixture.widgetCount).toBe(50);
	expect(fixture.bindingCount).toBe(10);
	const samples: number[] = [];
	// Discard one reload to warm the Vite module graph. Each sample then boots a new document
	// against the persisted fixture, including IndexedDB hydration and the local-vault lookup.
	for (let repetition = -1; repetition < 3; repetition++) {
		await page.reload({ waitUntil: 'domcontentloaded' });
		await page.waitForFunction(
			() => {
				const rt = window.__rt as unknown as SceneRuntime | undefined;
				if (!rt?.loaded) return false;
				const id = rt.state.commandCenter.homeSceneId;
				if (!id) return false;
				const widgets = rt.state.scenes.scenes[id].widgets;
				return (
					widgets.length === 50 &&
					widgets.filter((widget) => widget.binding).length === 10 &&
					document.querySelectorAll('[data-testid="scene-board-bounded"] [data-testid^="widget-"]')
						.length === 50 &&
					document.querySelectorAll('[data-testid="scene-board-bounded"] [data-testid="map-tile"]')
						.length === 10
				);
			},
			undefined,
			{ polling: 'raf' },
		);
		const duration = await page.evaluate(
			() =>
				new Promise<number>((resolve) => {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())));
				}),
		);
		if (repetition >= 0) samples.push(duration);
	}
	const evidence = {
		budgetId: 'scene-first-render',
		targetMs: 1500,
		fixture: '50 widgets (10 bound maps, 40 dice widgets) / 10 active bindings',
		profile: testInfo.project.name,
		viewport: page.viewportSize(),
		commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
		worktreeStatus: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
		samples,
		maximumMs: Math.max(...samples),
	};
	await testInfo.attach('scene-first-render.json', {
		body: JSON.stringify(evidence, null, 2),
		contentType: 'application/json',
	});
	console.log(JSON.stringify(evidence));
	expect(evidence.maximumMs).toBeLessThanOrEqual(evidence.targetMs);
});
