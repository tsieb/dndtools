import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, waitReady } from './_helpers';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function axe(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
				.map((animation) => animation.finished.catch(() => {})),
		);
	});
	return (await new AxeBuilder({ page }).withTags(tags).analyze()).violations;
}

test('plans: axe, keyboard confirmation, Escape and focus return', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/upgrade');
	await waitReady(page);
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	expect(await axe(page)).toEqual([]);
	const trigger = page.getByRole('button', { name: 'Try Lantern preview' });
	const bounds = await trigger.boundingBox();
	expect(bounds?.height).toBeGreaterThanOrEqual(48);
	const cycleBounds = await page.getByRole('switch').boundingBox();
	expect(cycleBounds?.height).toBeGreaterThanOrEqual(48);
	await trigger.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Try Lantern preview' });
	await expect(dialog).toBeVisible();
	expect(await axe(page)).toEqual([]);
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();
	await page.keyboard.press('Enter');
	const save = page.getByRole('button', { name: 'Save plan choice' });
	for (let i = 0; i < 8 && !(await save.evaluate((el) => el === document.activeElement)); i++) {
		await page.keyboard.press('Tab');
	}
	await expect(save).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(
		page.getByRole('status').filter({ hasText: 'Now on Lantern on this device' }),
	).toBeVisible();
	await page.getByRole('button', { name: 'Switch to Hearth' }).click();
	await expect(page.getByRole('dialog')).toContainText('Hearth');
	expect(await axe(page)).toEqual([]);
});

test('plans: cancelled checkout is announced once and leaves the free plan intact', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/upgrade?checkout=cancelled');
	await waitReady(page);
	await expect(page.getByRole('status').filter({ hasText: /cancelled/i })).toBeVisible();
	await expect(page).toHaveURL(/#\/upgrade$/);
	await expect(page.getByRole('button', { name: 'Try Lantern preview' })).toBeEnabled();
	await page.reload();
	await waitReady(page);
	await expect(page.getByRole('status').filter({ hasText: /cancelled/i })).toHaveCount(0);
});

for (const route of ['privacy', 'terms']) {
	test(`legal ${route}: axe and large text retain reachable navigation`, async ({ page }) => {
		await page.goto(`/#/legal/${route}`);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		expect(await axe(page)).toEqual([]);
		await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
		const footer = page.locator('footer');
		await footer.scrollIntoViewIfNeeded();
		await expect(footer.getByRole('link', { name: 'Back to Lamplight' })).toBeVisible();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
			),
		).toBeLessThanOrEqual(0);
		const sibling = footer.getByRole('link').last();
		await sibling.click();
		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`#/legal/${route}$`));
	});
}

test('plans: large text keeps the comparison scrollable and legal links reachable', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/upgrade');
	await waitReady(page);
	await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
	// Use the table's labelled parent so the assertion follows translated accessible names.
	const comparison = page.getByRole('table').locator('..');
	await comparison.scrollIntoViewIfNeeded();
	await comparison.focus();
	await expect(comparison).toBeFocused();
	expect(await comparison.evaluate((el) => el.scrollWidth >= el.clientWidth)).toBe(true);
	await page.getByRole('link', { name: 'Privacy policy' }).scrollIntoViewIfNeeded();
	await expect(page.getByRole('link', { name: 'Privacy policy' })).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0);
});

test('plans: Spanish card and dialog copy follow the selected locale', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('dndtools:locale', 'es'));
	await markOnboarded(page);
	await gotoRoute(page, '/upgrade');
	await waitReady(page);
	await expect(page.getByText('Local, gratis para siempre', { exact: true })).toBeVisible();
	const trigger = page.getByRole('button').filter({ hasText: /Lantern/ });
	await trigger.click();
	await expect(page.getByRole('dialog')).toContainText('Todo lo incluido en Hearth');
	await expect(page.getByRole('dialog')).toContainText(
		'Restauración manual con la misma clave de bóveda',
	);
});
