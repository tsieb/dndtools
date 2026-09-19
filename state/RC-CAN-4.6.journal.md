# RC-CAN-4.6 run journal

- Starting task branch clean. No applicable AGENTS.md or Headroom tools found.
- Verified existing background picker and scene.update-metadata persistence, scene.dock-widget handler and all five dock descriptors. No new core command needed.
- Implementing canvas background/section presentation and inspector docking within owned source paths. Browser fixture will be preserved here, following RC-CAN-4.2's owned-path convention.
- No agents, dispatcher control changes, pushes or promotion.

## Implementation and initial checks

- Backgrounds use the existing parchment/tavern token scopes on a non-interactive backdrop, preserving widget theme and contrast. Grid remains visible in view mode and follows canvas zoom/pan.
- Sections come from the actor-scoped scene query, render beneath widgets with labels, and contribute to the bounded board extent.
- Docking uses existing permission-filtered command descriptors. Effective geometry follows the authored board edges; undocking restores stored free coordinates.
- Empty scene identification uses the current route; bounded home canvas uses its home scene id.
- Initial focused e2e: 2 passed (desktop/mobile). Typecheck/lint found an unexported helper, an event annotation and raw color literals; corrected locally. Final app typecheck, targeted lint and six quality gates passed before the combined browser run.

## Validation and reproduction

- Combined unchanged `canvas.spec.ts` and the fixture below, desktop + mobile Chromium,
  two workers: **84 passed (1.3m)**, exit 0.
- Final source inspection found that docked pointer moves must settle drafts against authored
  coordinates rather than derived dock coordinates. Corrected this and extended the fixture
  to drag a docked tile, check its durable free position, and ensure it returns to its dock.
- Extended fixture on final source: **2 passed (5.4s)**, exit 0.
- Final app typecheck, targeted ESLint, six repository quality gates and documentation check:
  exit 0. Existing advisory file-size warnings only; canvas remains below the 800-line hard limit.
- The existing background picker and metadata handler, dock command and descriptors need no
  changes. Source changes are confined to SceneBoardCanvas.tsx and Inspector.tsx.
- Docking currently dispatches directly, like the inspector's existing fallback move handler;
  it does not add an undo entry. Sections display the existing saved regions, including templates.

Extract this block to `apps/gm-react/tests/e2e/scene-surfaces-temporary.spec.ts`, then run:

```sh
pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/scene-surfaces-temporary.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=2
```

The temporary spec is removed after verification because tests are outside the owned paths.
The complete executable fixture is retained here:

```ts
import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, waitReady } from './_helpers';

test('backgrounds, docks and section bands persist', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	expect(
		(
			await dispatch(page, {
				type: 'scene.create',
				actorId,
				payload: { name: 'Surface fixture', description: '', tags: [], visibility: 'dm-only' },
			})
		).status,
	).toBe('accepted');
	const sceneId = await page.evaluate(
		() =>
			Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === 'Surface fixture')!.id,
	);
	await gotoRoute(page, `/scene/${sceneId}`);
	const board = page.getByTestId('scene-board-canvas');
	// Empty scenes also have their own background, before there is a widget to identify them.
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	const meta = page.getByTestId('scene-meta-panel');
	await meta.getByLabel('Background', { exact: true }).selectOption('parchment');
	await meta.getByRole('button', { name: 'Save details' }).click();
	await expect(board).toHaveAttribute('data-background', 'parchment');
	await expect(page.getByTestId('scene-background')).toHaveCSS(
		'background-color',
		'rgb(243, 235, 221)',
	);
	expect(
		(
			await dispatch(page, {
				type: 'scene.add-widget',
				actorId,
				payload: {
					sceneId,
					widget: {
						type: 'note',
						version: '1.0.0',
						layout: { x: 80, y: 90, w: 260, h: 180 },
						configuration: {},
						localState: {},
						binding: null,
					},
				},
			})
		).status,
	).toBe('accepted');
	const widgetId = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets[0].id,
		sceneId,
	);
	expect(
		(
			await dispatch(page, {
				type: 'scene.set-sections',
				actorId,
				payload: {
					sceneId,
					sections: [
						{
							id: 'surface-section',
							name: 'Encounter notes',
							bounds: { x: 0, y: 0, w: 600, h: 500 },
							widgetInstanceIds: [widgetId],
						},
					],
				},
			})
		).status,
	).toBe('accepted');
	const band = page.getByRole('region', { name: 'Encounter notes', exact: true });
	await expect(band).toBeVisible();
	await expect(band).toHaveCSS('width', '600px');
	await expect(band).toHaveCSS('pointer-events', 'none');
	const tile = page.getByTestId(`widget-${widgetId}`);
	await tile.focus();
	await page.keyboard.press('Enter');
	const inspector = page.getByTestId('widget-inspector');
	await inspector.getByRole('tab', { name: 'Transform', exact: true }).click();
	const dock = inspector.getByLabel('Dock to edge');
	for (const [edge, prop, value] of [
		['left', 'left', '0px'],
		['right', 'left', '340px'],
		['top', 'top', '0px'],
		['bottom', 'top', '320px'],
		['none', 'left', '80px'],
	] as const) {
		await dock.selectOption(edge);
		await expect(tile).toHaveCSS(prop, value);
	}
	await dock.selectOption('bottom');
	await inspector.getByRole('button', { name: 'Close inspector' }).click();
	for (const [background, color] of [
		['paper', 'rgb(255, 255, 255)'],
		['dark', 'rgb(20, 16, 11)'],
		['grid', null],
	] as const) {
		expect(
			(
				await dispatch(page, {
					type: 'scene.update-metadata',
					actorId,
					payload: { sceneId, visualSettings: { background } },
				})
			).status,
		).toBe('accepted');
		await expect(board).toHaveAttribute('data-background', background);
		if (color)
			await expect(page.getByTestId('scene-background')).toHaveCSS('background-color', color);
	}
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(board).toHaveAttribute('data-background', 'grid');
	await expect(band).toBeVisible();
	await expect(tile).toHaveCSS('top', '320px');
	const saved = await page.evaluate(
		(id) => window.__rt!.state.scenes.scenes[id].widgets[0].layout,
		sceneId,
	);
	expect(saved).toMatchObject({ dock: 'bottom', x: 80, y: 90 });
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await tile.focus();
	await page.keyboard.press('Enter');
	await inspector.getByRole('tab', { name: 'Transform', exact: true }).click();
	await dock.selectOption('left');
	await inspector.getByRole('button', { name: 'Close inspector' }).click();
	await meta.getByRole('button', { name: 'Close scene details' }).click();
	const box = (await tile.boundingBox())!;
	await page.mouse.move(box.x + 30, box.y + 50);
	await page.mouse.down();
	await page.mouse.move(box.x + 90, box.y + 50, { steps: 5 });
	await page.mouse.up();
	await expect
		.poll(() =>
			page.evaluate((id) => window.__rt!.state.scenes.scenes[id].widgets[0].layout.x, sceneId),
		)
		.toBe(60);
	await expect(tile).toHaveCSS('left', '0px');
});
```

## Final handoff

- After the draft-settling correction, unchanged canvas movement regressions:
  `pnpm --filter @dndtools/gm-react exec playwright test tests/e2e/canvas.spec.ts --grep 'move|drag|resize' --project=desktop-chromium --project=mobile-chromium --workers=2`:
  **12 passed (15.0s)**, exit 0.
- Prettier and `git diff --check` passed. Temporary fixture removed, exact fixture preserved above.
- Only two owned source paths and this journal are committed. Full integration gates and
  independent review remain with the central operator. No push or promotion performed.
