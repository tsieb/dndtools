import { expect, test } from '@playwright/test';
import { createScreenInLibrary, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// The tag field commits a tag on Enter, and commits the text still in the field when focus leaves it
// for Save. Since RC-CAN-7.3 tags are edited from a screen's card in the Screens library (the old
// `/scenes` create form is gone), so this drives that editor.
test('scene tags commit on Enter and on save blur, then survive reload', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/screens');
	await seedFresh(page);
	await page.goto('/#/screens', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	const name = 'Tagged primitive scene';
	await createScreenInLibrary(page, name);
	await page.waitForURL((url) => url.hash.startsWith('#/screen/'), { timeout: 10_000 });
	const sceneId = await page.evaluate(
		(sceneName) =>
			Object.values(window.__rt!.state.scenes.scenes).find((scene) => scene.name === sceneName)!.id,
		name,
	);

	await gotoRoute(page, '/screens');
	const card = page.getByTestId(`screen-card-${sceneId}`);
	await card.getByRole('button', { name: `Rename ${name}` }).click();
	const tags = card.locator(`#screen-meta-${sceneId}-tags`);
	await tags.fill('dungeon');
	await tags.press('Enter');
	await expect(card.getByRole('button', { name: 'Remove dungeon', exact: true })).toBeVisible();
	await tags.fill('dungeon, combat');
	await card.getByRole('button', { name: 'Save details', exact: true }).click();
	const readTags = () =>
		page.evaluate(
			(sceneName) =>
				Object.values(window.__rt!.state.scenes.scenes).find((scene) => scene.name === sceneName)
					?.tags,
			name,
		);
	await expect.poll(readTags).toEqual(['dungeon', 'combat']);
	// Saving closed the editor; the card shows the committed tags.
	await expect(card.getByTestId('screen-meta-editor')).toHaveCount(0);
	await expect(card.getByText('combat', { exact: true })).toBeVisible();
	await page.reload();
	await waitReady(page);
	await expect.poll(readTags).toEqual(['dungeon', 'combat']);
});
