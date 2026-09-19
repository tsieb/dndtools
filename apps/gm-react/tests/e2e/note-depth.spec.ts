import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded } from './_helpers';

// RC-CAN-2.3 — note tile depth levels.
//
// The Inspector's Depth select moves a note between title, summary and full, and a 2,000-line note
// tile renders and updates inside the `widget-update` budget. The budget number is READ FROM THE
// PERF REGISTRY SOURCE, as collab.spec.ts does for its own budget, so this test cannot pass against
// a number nobody maintains. It is read from the file rather than imported because a Playwright spec
// runs as plain ESM, where `@dndtools/core`'s JSON system packages need import attributes Node lacks.
const WIDGET_UPDATE_BUDGET_MS = (() => {
	const registry = readFileSync(
		fileURLToPath(
			new URL('../../../../packages/core/src/perf/budget-registry.ts', import.meta.url),
		),
		'utf8',
	);
	const entry = registry.slice(registry.indexOf("id: 'widget-update'"));
	const target = /kind: 'latency-ms-p95'[^}]*?target: (\d+)/.exec(entry.slice(0, 600));
	if (!target) throw new Error('the widget-update latency budget is not declared');
	return Number(target[1]);
})();

/** The fields of a scene widget these tests read; `_helpers` types only `id` and `layout`. */
interface NoteInstance {
	id: string;
	type: string;
	configuration: Record<string, unknown>;
}

interface RuntimeSeam {
	defaultActorId: string;
	state: { scenes: { scenes: Record<string, { widgets: NoteInstance[] }> } };
	dispatch: (command: unknown) => Promise<{ status: string; rejection?: { message?: string } }>;
}

/** A fresh scene holding one note placed through the real Add panel, left in edit mode. */
async function sceneWithNote(page: Page): Promise<{ sceneId: string; widgetId: string }> {
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	const sceneName = `Note Depth ${Date.now()}`;
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
	});
	expect(created.status).toBe('accepted');
	const sceneId = await page.evaluate(
		(name) =>
			Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
		sceneName,
	);
	expect(sceneId).toBeTruthy();

	await gotoRoute(page, `/scene/${sceneId}`);
	await page.getByRole('button', { name: 'Edit layout' }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	// The entry's name is "Note" plus its description; `\b` keeps the Notes entry out of the match.
	await page
		.getByTestId('scene-add-widget-panel')
		.getByRole('button', { name: /^Note\b/ })
		.click();
	const handle = await page.waitForFunction(
		(id) => {
			const rt = window.__rt as unknown as RuntimeSeam;
			return rt.state.scenes.scenes[id]?.widgets.find((w) => w.type === 'note')?.id ?? null;
		},
		sceneId!,
		{ timeout: 10_000 },
	);
	return { sceneId: sceneId!, widgetId: (await handle.jsonValue()) as string };
}

function configureNote(
	page: Page,
	ids: { sceneId: string; widgetId: string },
	patch: Record<string, unknown>,
) {
	return page.evaluate(
		({ sceneId, widgetId, patch }) => {
			const rt = window.__rt as unknown as RuntimeSeam;
			const widget = rt.state.scenes.scenes[sceneId]!.widgets.find((w) => w.id === widgetId)!;
			return rt.dispatch({
				type: 'scene.configure-widget',
				actorId: rt.defaultActorId,
				payload: {
					sceneId,
					widgetInstanceId: widgetId,
					configuration: { ...widget.configuration, ...patch },
				},
			});
		},
		{ ...ids, patch },
	);
}

test.describe('note tile depth levels', () => {
	test('the Inspector toggles a note between title, summary and full', async ({ page }) => {
		const ids = await sceneWithNote(page);
		const configured = await configureNote(page, ids, {
			heading: 'Harbour watch',
			body: 'The tide bell rang twice.\n\nA second paragraph for the full note.\n\n## Later\nThe ship left at dawn.',
		});
		expect(configured.status).toBe('accepted');

		const tile = page.getByTestId(`widget-${ids.widgetId}`);
		const badge = tile.getByTestId('note-depth-badge');
		await expect(badge).toHaveText('Depth: Full note');
		await expect(tile).toContainText('The ship left at dawn.');

		// Enter on a focused frame selects it and opens the Inspector.
		await tile.focus();
		await page.keyboard.press('Enter');
		const depth = page.getByTestId('widget-inspector').getByLabel('Depth', { exact: true });
		await expect(depth).toHaveValue('full');

		await depth.selectOption('summary');
		await expect(badge).toHaveText('Depth: Summary');
		await expect(tile).toContainText('The tide bell rang twice.');
		await expect(tile).not.toContainText('A second paragraph');

		await depth.selectOption('title');
		await expect(badge).toHaveText('Depth: Title only');
		await expect(tile).toContainText('Harbour watch');
		await expect(tile).not.toContainText('The tide bell');
		// The depth is the core's configuration, not local component state.
		await expect
			.poll(() =>
				page.evaluate(
					({ sceneId, widgetId }) =>
						(window.__rt as unknown as RuntimeSeam).state.scenes.scenes[sceneId]!.widgets.find(
							(w) => w.id === widgetId,
						)?.configuration.depth,
					ids,
				),
			)
			.toBe('title');

		await depth.selectOption('full');
		await expect(badge).toHaveText('Depth: Full note');
		await expect(tile).toContainText('The ship left at dawn.');

		// The badge is an edit-mode aid: leaving edit mode drops it and keeps the depth.
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect(badge).toHaveCount(0);
		await expect(tile.locator('[data-note-depth="full"]')).toHaveCount(1);
	});

	test('a 2,000-line note tile renders and updates inside the widget-update budget', async ({
		page,
	}) => {
		const ids = await sceneWithNote(page);
		// View mode: the board a DM runs the session from, and what a projected table sees.
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		const tile = page.getByTestId(`widget-${ids.widgetId}`);
		await expect(tile).toBeVisible();

		// Sample 0 is the empty tile becoming a 2,000-line note (the first render); every later sample
		// rewrites the body's first line, so the markdown really re-renders rather than hitting a memo.
		// Each sample runs from the dispatch to the painted frame that shows the new text, the same
		// accepted-command → repaint span `scripts/perf/capture.ts` measures for this budget.
		//
		// Lines are kept short (~45 KB a body) on purpose. Every configure op carries the whole body and
		// the runtime persists them, and 25 ops of a ~120 KB body cross the 5 MB `persistFullState`
		// boundary before the samples finish. Render cost follows the line count, not the line length.
		const samples = await page.evaluate(
			async ({ sceneId, widgetId, runs, lines }) => {
				const rt = window.__rt as unknown as RuntimeSeam;
				const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
				const body = (first: string) => {
					const out = [first];
					for (let i = 1; i < lines - 1; i += 1) {
						if (i % 20 === 0) out.push(`## Section ${i / 20 + 1}`);
						else if (i % 20 === 19) out.push('');
						else if (i % 20 === 7) out.push(`- Watch ${i}: **quiet**`);
						else out.push(`Line ${i + 1}: lamps trimmed.`);
					}
					out.push('End of the harbour log.');
					return out.join('\n');
				};
				const out: number[] = [];
				for (let i = 0; i < runs; i += 1) {
					const marker = `Watch log entry ${i + 1}.`;
					const text = body(marker);
					const widget = rt.state.scenes.scenes[sceneId]!.widgets.find((w) => w.id === widgetId)!;
					const started = performance.now();
					const res = await rt.dispatch({
						type: 'scene.configure-widget',
						actorId: rt.defaultActorId,
						payload: {
							sceneId,
							widgetInstanceId: widgetId,
							configuration: {
								...widget.configuration,
								heading: 'Harbour log',
								depth: 'full',
								body: text,
							},
						},
					});
					if (res.status !== 'accepted') throw new Error(res.rejection?.message ?? res.status);
					const frame = () => document.querySelector(`[data-testid="widget-${widgetId}"]`);
					for (let f = 0; f < 240 && !frame()?.textContent?.includes(marker); f += 1) {
						await nextFrame();
					}
					await nextFrame();
					if (!frame()?.textContent?.includes(marker)) throw new Error(`${marker} never painted`);
					out.push(Math.round((performance.now() - started) * 1000) / 1000);
				}
				return out;
			},
			{ ...ids, runs: 25, lines: 2000 },
		);

		const sorted = [...samples].sort((a, b) => a - b);
		const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
		test.info().annotations.push({
			type: 'perf',
			description: `note tile 2,000 lines: first render ${samples[0]}ms, p95 ${p95}ms, max ${sorted.at(-1)}ms over ${samples.length} samples; widget-update budget ${WIDGET_UPDATE_BUDGET_MS}ms`,
		});
		expect(p95, `p95 of ${JSON.stringify(samples)}`).toBeLessThanOrEqual(WIDGET_UPDATE_BUDGET_MS);

		// It is fast because it is windowed: the note's 2,000 lines are not all in the DOM.
		const region = tile.getByTestId('note-scroll-region');
		const windows = region.locator('[data-note-chunk]');
		const total = await windows.count();
		expect(total).toBeGreaterThanOrEqual(10);
		expect(await region.locator('[data-note-chunk][data-mounted="true"]').count()).toBeLessThan(
			total,
		);
		await expect(tile).not.toContainText('End of the harbour log.');

		// Scrolling reaches the end: each window mounts as its sentinel comes near the viewport.
		await expect
			.poll(
				async () => {
					await region.evaluate((el) => {
						el.scrollTop = el.scrollHeight;
					});
					return (await region.textContent())?.includes('End of the harbour log.') ?? false;
				},
				{ timeout: 15_000 },
			)
			.toBe(true);
		expect(await region.locator('[data-note-chunk][data-mounted="true"]').count()).toBeLessThan(
			total,
		);
	});
});
