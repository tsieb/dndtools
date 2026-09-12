import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

test('scene tags commit on Enter and on save blur, then survive reload', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	await seedFresh(page);
	await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	const name = 'Tagged primitive scene';
	await page.locator('#scene-name').fill(name);
	const tags = page.locator('#scene-tags');
	await tags.fill('dungeon');
	await tags.press('Enter');
	await expect(page.getByRole('button', { name: 'Remove dungeon', exact: true })).toBeVisible();
	await expect(page.getByTestId('scene-create-feedback')).toHaveText('');
	await tags.fill('dungeon, combat');
	await page.getByRole('button', { name: 'Create scene', exact: true }).click();
	await expect(page.getByTestId('scene-create-feedback')).toContainText(name);
	const readTags = () =>
		page.evaluate(
			(sceneName) =>
				Object.values(window.__rt!.state.scenes.scenes).find((scene) => scene.name === sceneName)
					?.tags,
			name,
		);
	await expect.poll(readTags).toEqual(['dungeon', 'combat']);
	await expect(tags).toHaveValue('');
	await page.reload();
	await waitReady(page);
	await expect.poll(readTags).toEqual(['dungeon', 'combat']);
});
