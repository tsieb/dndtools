import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

async function axe(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(results.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await gotoRoute(page, '/');
	await expect(page.getByTestId('home-screen')).toBeVisible();
});

test('Command Center and screen creator overlay are axe clean; keyboard focus returns', async ({
	page,
}) => {
	await axe(page);
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	await gotoRoute(page, '/screens');
	await axe(page);
	const launcher = page.getByTestId('screens-new');
	await launcher.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'New screen' })).toBeVisible();
	await axe(page);
	await page.keyboard.press('Escape');
	await expect(launcher).toBeFocused();
});

test('scene-card failed save retains input, retry persists and editor is axe clean', async ({
	page,
}) => {
	await gotoRoute(page, '/screens');
	await page.locator('#card-title').fill('Lantern bridge');
	await page.evaluate(() => {
		const rt = window.__rt!;
		const dispatch = rt.dispatch.bind(rt);
		rt.dispatch = async (command) => {
			if ((command as { type: string }).type === 'scene-card.create') {
				rt.dispatch = dispatch;
				throw new Error('test storage failure');
			}
			return dispatch(command);
		};
	});
	await page.getByRole('button', { name: 'Create scene card', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('try again');
	await expect(page.locator('#card-title')).toHaveValue('Lantern bridge');
	await page.getByRole('button', { name: 'Create scene card', exact: true }).click();
	await expect(page.locator('#card-title')).toHaveValue('');
	const edit = page.getByRole('button', { name: 'Edit Lantern bridge', exact: true });
	const target = (await edit.boundingBox())!;
	expect(target.height).toBeGreaterThanOrEqual(48);
	expect(target.width).toBeGreaterThanOrEqual(48);
	await edit.click();
	await axe(page);
	await page.reload();
	await expect(page.getByText('Lantern bridge', { exact: true })).toBeVisible();
});

test('read-only preview hides scene-card writes and runtime rejects a write', async ({ page }) => {
	await page.evaluate(() => window.__rt!.enterPreview({ role: 'observer' }));
	await expect(page.getByTestId('home-screen')).toHaveCount(0);
	await axe(page);
	await gotoRoute(page, '/screens');
	await expect(page.locator('#card-title')).toHaveCount(0);
	await expect(page.getByTestId('screens-new')).toHaveCount(0);
	const result = await page.evaluate(() =>
		window.__rt!.dispatch({
			type: 'scene-card.create',
			actorId: window.__rt!.defaultActorId,
			payload: {
				title: 'Forbidden',
				mood: 'rest',
				flavorText: '',
				visibility: 'dm-only',
				heroImage: null,
			},
		}),
	);
	expect(result.status).toBe('rejected');
});

test('large text keeps creator controls reachable', async ({ page }) => {
	await gotoRoute(page, '/screens');
	await page.addStyleTag({ content: 'html { font-size: 200%; }' });
	await page.getByTestId('screens-new').click();
	const cancel = page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true });
	await cancel.scrollIntoViewIfNeeded();
	await expect(cancel).toBeInViewport();
	await cancel.click();
	const title = page.locator('#card-title');
	await title.scrollIntoViewIfNeeded();
	await expect(title).toBeInViewport();
});
