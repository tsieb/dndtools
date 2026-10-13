/** Supplemental 50-widget / 10-binding check against two already-running dev servers.
 * Usage: node scripts/perf/scene-stress.mjs <reference-url> <candidate-url> <output.json>
 * Runs seven alternating pairs at 2x CPU throttle, with one warmup per revision. Both servers must be isolated
 * checkouts of the revisions recorded alongside the output. This does not replace capture.ts.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const requireApp = createRequire(new URL('../../apps/gm-react/package.json', import.meta.url));
const { chromium } = requireApp('@playwright/test');
const [reference, candidate, output] = process.argv.slice(2);
if (!reference || !candidate || !output || reference === candidate) {
	throw new Error('Supply distinct reference and candidate URLs, then an output path');
}
const browser = await chromium.launch();
const results = { reference: [], candidate: [] };
try {
	for (let batch = -1; batch < 7; batch++) {
		const sides = batch % 2 === 0 ? ['reference', 'candidate'] : ['candidate', 'reference'];
		for (const side of sides) {
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			try {
				const page = await context.newPage();
				const cdp = await context.newCDPSession(page);
				await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
				await page.addInitScript(() =>
					window.localStorage.setItem('dndtools:react:onboarded', 'gate'),
				);
				await page.goto(`${side === 'reference' ? reference : candidate}/#/board`);
				await page.waitForFunction(() => {
					const rt = window.__rt;
					return (
						rt?.loaded &&
						rt.state.commandCenter.homeSceneId &&
						document.querySelector('[data-testid^="widget-"]')
					);
				});
				await page.evaluate(async () => {
					const rt = window.__rt;
					const sceneId = rt.state.commandCenter.homeSceneId;
					const dispatch = async (type, payload) => {
						const result = await rt.dispatch({ type, actorId: rt.defaultActorId, payload });
						if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
					};
					const originals = [...rt.state.scenes.scenes[sceneId].widgets];
					if (!originals.length || originals.length > 50)
						throw new Error('Unexpected demo fixture');
					// Demo hydration auto-binds every map tile. Use non-map tiles for the other 40.
					const unbound = originals.filter((widget) => widget.type !== 'map');
					if (!unbound.length) throw new Error('No unbound demo widget types');
					const mapId = Object.keys(rt.state.maps.maps)[0];
					if (!mapId) throw new Error('Demo map absent');
					for (const widget of originals) {
						await dispatch('scene.destroy-widget', { sceneId, widgetInstanceId: widget.id });
					}
					for (let i = 0; i < 50; i++) {
						const source =
							i < 10
								? { type: 'map', version: '1.0.0', configuration: {}, localState: {} }
								: unbound[i % unbound.length];
						await dispatch('scene.add-widget', {
							sceneId,
							widget: {
								type: source.type,
								version: source.version,
								configuration: source.configuration,
								localState: source.localState,
								layout: { x: (i % 5) * 240, y: Math.floor(i / 5) * 180, w: 240, h: 180 },
								binding:
									i < 10
										? {
												source: { entityType: 'map', entityId: mapId },
												mode: 'read',
												requiredCapability: 'viewer',
											}
										: null,
							},
						});
					}
				});
				// Reload the durable fixture: hydration and all 50 rendered tiles are in the interval.
				await page.reload({ waitUntil: 'domcontentloaded' });
				await page
					.waitForFunction(
						() => {
							const rt = window.__rt;
							if (!rt?.loaded) return false;
							const scene = rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId];
							return (
								scene?.widgets.length === 50 &&
								scene.widgets.filter((w) => w.binding).length === 10 &&
								document.querySelectorAll('[data-testid="map-tile"]').length === 10 &&
								document.querySelectorAll(
									'[data-testid="scene-board-bounded"] [data-testid^="widget-"]',
								).length === 50
							);
						},
						undefined,
						{ polling: 'raf', timeout: 30000 },
					)
					.catch(async (error) => {
						const state = await page.evaluate(() => {
							const rt = window.__rt;
							const scene = rt?.state.scenes.scenes[rt?.state.commandCenter.homeSceneId];
							return {
								loaded: rt?.loaded,
								error: rt?.lastError,
								widgets: scene?.widgets.length,
								bindings: scene?.widgets.filter((w) => w.binding).length,
								frames: document.querySelectorAll(
									'[data-testid="scene-board-bounded"] [data-testid^="widget-"]',
								).length,
								maps: document.querySelectorAll('[data-testid="map-tile"]').length,
							};
						});
						throw new Error(`${side} batch ${batch}: ${JSON.stringify(state)}; ${error}`);
					});
				const elapsed = await page.evaluate(async () => {
					await new Promise((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(resolve)),
					);
					return performance.now();
				});
				if (batch >= 0) results[side].push(elapsed);
				console.log(`${side} batch ${batch}: ${elapsed.toFixed(1)} ms`);
			} finally {
				await context.close();
			}
		}
	}
	const median = (values) => [...values].sort((a, b) => a - b)[3];
	const report = {
		fixture:
			'Persisted demo-derived scene: 50 widgets, 10 map tiles with read bindings to an existing map; reload to all 50 mounted tiles plus two animation frames',
		cpuThrottle: 2,
		referenceUrl: reference,
		candidateUrl: candidate,
		samples: results,
		referenceMedianMs: median(results.reference),
		candidateMedianMs: median(results.candidate),
		changePercent: (median(results.candidate) / median(results.reference) - 1) * 100,
	};
	writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser.close();
}
