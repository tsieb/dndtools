import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

async function open(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/extensions');
	await seedFresh(page);
	await page.getByRole('button', { name: 'Build a widget' }).click();
	return page.getByRole('dialog', { name: /Widget builder/ });
}
async function inViewport(page: Page, target: Locator) {
	const box = await target.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.y).toBeGreaterThanOrEqual(0);
	expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('eight steps stay accessible and phone navigation finishes a real install', async ({
	page,
}) => {
	const dialog = await open(page);
	await expect(dialog.getByTestId('widget-builder-json')).toHaveCount(0);
	await expect(dialog.getByLabel('Package id')).toBeHidden();
	await dialog.getByLabel('Name', { exact: true }).fill('Phone finished');
	const mobile = page.viewportSize()!.width < 1025;
	if (mobile) {
		await expect(dialog.getByTestId('widget-builder-steps')).toHaveCount(0);
		await expect(dialog.getByTestId('builder-preview-strip')).toBeVisible();
		await dialog.getByRole('button', { name: /Step 1 of 8/ }).click();
		await expect(dialog.getByTestId('widget-builder-steps')).toBeVisible();
		await dialog.getByRole('button', { name: 'Identity', exact: true }).click();
		await expect(dialog.getByTestId('widget-builder-steps')).toHaveCount(0);
	}
	const initialViewport = page.viewportSize()!;
	for (let index = 1; index <= 8; index++) {
		if (mobile && index === 3) await page.setViewportSize({ ...initialViewport, height: 500 });
		if (mobile && index === 5) await page.setViewportSize(initialViewport);
		await expect(
			dialog.getByRole('button', { name: new RegExp(`Step ${index} of 8`) }),
		).toBeVisible();
		const results = await new AxeBuilder({ page })
			.include('[data-fullscreen-overlay="widget-builder"]')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
			.analyze();
		expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
		const action = dialog
			.getByTestId('builder-footer')
			.getByRole('button', { name: index === 8 ? 'Install widget' : 'Next', exact: true });
		await inViewport(page, action);
		await action.click();
	}
	await expect(dialog).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(() => window.__rt!.state.widgets.packages['workspace.phone-finished']?.enabled),
		)
		.toBe(true);
});

test('Name reaches Next within twelve real tabs', async ({ page }) => {
	test.skip(page.viewportSize()!.width < 1025, 'Desktop keyboard acceptance');
	const dialog = await open(page);
	const name = dialog.getByLabel('Name', { exact: true });
	await name.fill('Keyboard finished');
	await name.focus();
	const next = dialog.getByRole('button', { name: 'Next', exact: true });
	let reached = false;
	for (let tabs = 1; tabs <= 12; tabs++) {
		await page.keyboard.press('Tab');
		if (await next.evaluate((node) => node === document.activeElement)) {
			reached = true;
			break;
		}
	}
	expect(reached).toBe(true);
});

test('closed identity derives ids and Definition survives reload with Select all', async ({
	page,
}) => {
	const dialog = await open(page);
	const name = dialog.getByLabel('Name', { exact: true });
	await name.fill('First name');
	await dialog.locator('summary').filter({ hasText: 'Advanced identity' }).click();
	await expect(dialog.getByLabel('Package id')).toHaveValue('workspace.first-name');
	await dialog.locator('summary').filter({ hasText: 'Advanced identity' }).click();
	await name.fill('Second name');
	await dialog.getByRole('button', { name: 'Definition', exact: true }).click();
	const json = dialog.getByTestId('widget-builder-json');
	await expect(json).toContainText('workspace.second-name');
	await dialog.getByRole('button', { name: 'Select all', exact: true }).click();
	expect(
		await json.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart),
	).toBeGreaterThan(100);
	await page.reload();
	await page.getByRole('button', { name: 'Build a widget' }).click();
	const resume = page
		.getByRole('dialog')
		.filter({ has: page.getByRole('button', { name: /Start over/ }) });
	if (await resume.count()) await resume.getByRole('button', { name: /Start over/ }).click();
	await expect(page.getByTestId('widget-builder-json')).toBeVisible();
});

test('size and runtime controls disclose on demand and retain changes', async ({ page }) => {
	const dialog = await open(page);
	await dialog.getByLabel('Name', { exact: true }).fill('Sized widget');
	await dialog.getByRole('button', { name: /Change size/ }).click();
	await expect(dialog.getByLabel('Default width', { exact: true })).toBeVisible();
	await dialog.getByLabel('Default width', { exact: true }).fill('340');
	await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await dialog.getByLabel('Template kind').selectOption('chart');
	const sizeChip = dialog.getByRole('button', { name: /Change size/ }).first();
	await expect(sizeChip).toContainText('340');
	for (let index = 0; index < 3; index++)
		await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(dialog.getByRole('button', { name: 'Add style token' })).toBeHidden();
	await dialog.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(dialog.getByRole('radiogroup', { name: 'How it draws' })).toBeHidden();
	await dialog.locator('details > summary').click();
	await dialog.getByRole('radio', { name: 'Custom HTML and JavaScript' }).click();
	await expect(dialog.getByTestId('widget-builder-code')).toBeVisible();
	await dialog
		.getByTestId('builder-footer')
		.getByRole('button', { name: 'Back', exact: true })
		.click();
	await expect(dialog.getByRole('button', { name: 'Add style token' })).toBeVisible();
});
