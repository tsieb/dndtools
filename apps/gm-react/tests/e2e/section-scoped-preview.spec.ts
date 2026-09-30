import { expect, test, type Page } from '@playwright/test';
import { exitPreview, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-ENG-10.2 — a preview never shows a widget outside the previewed actor's sections. The board
// view-model used to be built from the RAW scene, so previewing a shared screen as a player limited
// to one section still put the other section's widget titles in the DOM — under the scene editor's
// preview overlay, where nobody could see them but the accessibility tree and the page source could.
// Here a shared screen has two sections; "Demo Player" is assigned only the Dock.

const DOCK = 'Dock notice ENG-10.2';
const CELLAR = 'Cellar secret ENG-10.2';
const PLAYER = 'actor-player';

async function seedSectionedScreen(page: Page): Promise<string> {
	return page.evaluate(
		async ({ dock, cellar, player }) => {
			const rt = window.__rt!;
			const dmId = rt.defaultActorId;
			const run = async (command: Record<string, unknown>) => {
				const result = await rt.dispatch(command);
				if (result.status !== 'accepted') {
					throw new Error(
						`${String(command.type)} was ${result.status}: ${JSON.stringify(result)}`,
					);
				}
			};
			const name = 'Harbor sections';
			await run({
				type: 'scene.create',
				actorId: dmId,
				payload: { name, description: '', visibility: 'player-visible', tags: [] },
			});
			const scene = Object.values(rt.state.scenes.scenes).find((s) => s.name === name);
			if (!scene) throw new Error(`scene ${name} was not created`);
			const add = (title: string, x: number) =>
				run({
					type: 'scene.add-widget',
					actorId: dmId,
					payload: {
						sceneId: scene.id,
						widget: {
							type: 'note',
							version: '1.0.0',
							layout: { x, y: 48, w: 260, h: 180 },
							configuration: { visibility: 'player-visible', title },
							localState: {},
							binding: null,
						},
					},
				});
			await add(dock, 48);
			await add(cellar, 340);
			const [dockId, cellarId] = rt.state.scenes.scenes[scene.id]!.widgets.map((w) => w.id);
			await run({
				type: 'scene.set-sections',
				actorId: dmId,
				payload: {
					sceneId: scene.id,
					sections: [
						{
							id: 'section-dock',
							name: 'Dock',
							bounds: { x: 0, y: 0, w: 320, h: 260 },
							widgetInstanceIds: [dockId],
						},
						{
							id: 'section-cellar',
							name: 'Cellar',
							bounds: { x: 320, y: 0, w: 320, h: 260 },
							widgetInstanceIds: [cellarId],
						},
					],
				},
			});
			await run({
				type: 'scene.update-metadata',
				actorId: dmId,
				payload: {
					sceneId: scene.id,
					playerViewAssignments: [{ playerActorId: player, sectionIds: ['section-dock'] }],
				},
			});
			return scene.id;
		},
		{ dock: DOCK, cellar: CELLAR, player: PLAYER },
	);
}

async function previewAsSectionPlayer(page: Page): Promise<void> {
	await page.evaluate(
		(id) => window.__rt!.enterPreview({ role: 'player', playerActorId: id }),
		PLAYER,
	);
	await page.waitForFunction((id) => window.__rt?.preview?.actorId === id, PLAYER, {
		timeout: 5_000,
	});
}

/** Neither the page source nor the accessibility tree may carry the out-of-section title. */
async function expectNoCellar(page: Page): Promise<void> {
	expect(await page.content()).not.toContain(CELLAR);
	expect(await page.locator('body').ariaSnapshot()).not.toContain(CELLAR);
}

test.describe('previews stay inside the previewed actor’s sections', () => {
	test('a section-scoped player preview of a shared screen never carries the other section’s widget', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		const sceneId = await seedSectionedScreen(page);

		// The scene editor: the preview overlay lists the Dock tile and nothing of the Cellar — not
		// even on the inert canvas underneath it.
		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByRole('heading', { name: 'Harbor sections' })).toBeVisible();
		await previewAsSectionPlayer(page);
		const overlay = page.getByTestId('player-preview-overlay');
		await expect(overlay).toBeVisible();
		await expect(overlay).toHaveAttribute('data-read-actor', PLAYER);
		await expect(overlay).toContainText(DOCK);
		await expectNoCellar(page);
		await exitPreview(page);

		// The screen route, previewed the same way.
		await gotoRoute(page, `/screen/${sceneId}`);
		await previewAsSectionPlayer(page);
		await expect(page.locator('main')).toBeVisible();
		await expectNoCellar(page);
		await exitPreview(page);

		// The DM's own edit view still lists every widget.
		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		const stage = page.getByTestId('scene-editor-stage');
		await expect(stage).toContainText(DOCK);
		await expect(stage).toContainText(CELLAR);
	});
});
