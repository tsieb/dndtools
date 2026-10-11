import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitReady } from './_helpers';

const dialogSelector = '[data-fullscreen-overlay="onboarding"]';

test('rejected save retains choices, announces recovery, and retries', async ({ page }) => {
	await page.goto('/#/');
	await waitReady(page);
	const dialog = page.locator(dialogSelector);
	await dialog.getByLabel('Campaign name').fill('Lantern Coast');
	await dialog.getByLabel('Game system').selectOption({ label: 'Generic' });
	await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
	await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
	await page.evaluate(() => {
		const runtime = window.__rt!;
		const dispatch = runtime.dispatch.bind(runtime);
		runtime.dispatch = async (command) => {
			if (command.type !== 'system.select') return dispatch(command);
			await new Promise((resolve) => setTimeout(resolve, 500));
			runtime.dispatch = dispatch;
			throw new Error('Save unavailable');
		};
	});
	await dialog.getByRole('button', { name: 'Open the Command Center' }).click();
	await expect(dialog.getByRole('status')).toContainText('Saving campaign');
	await expect(dialog.locator('[data-onboarding-content]')).toHaveAttribute('inert', '');
	await expect(dialog.getByRole('status')).toContainText('Setup could not be saved. Try again.');
	await expect(dialog).toContainText('Lantern Coast');
	expect((await new AxeBuilder({ page }).include(dialogSelector).analyze()).violations).toEqual([]);
	await dialog.getByRole('button', { name: 'Open the Command Center' }).click();
	await expect(dialog).toBeHidden();
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('keyboard setup, focus wrapping, and 200% text keep actions reachable', async ({ page }) => {
	await page.goto('/#/');
	await waitReady(page);
	const dialog = page.locator(dialogSelector);
	await expect(dialog.locator('[data-onboarding-content]')).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(dialog.getByLabel('Campaign name')).toBeFocused();
	await page.keyboard.type('Keyboard Coast');
	await page.keyboard.press('Tab');
	await expect(dialog.getByLabel('Game system')).toBeFocused();
	await page.keyboard.press('Tab'); // Backup & history link
	await page.keyboard.press('Tab');
	await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Tab');
	await expect(dialog.getByRole('radio', { name: /Standard/ })).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByRole('radio', { name: /Expert/ })).toBeChecked();
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await dialog.getByRole('radio', { name: 'Cloud-Enhanced', exact: true }).check();
	const bounds = await dialog
		.getByRole('radio', { name: 'Cloud-Enhanced', exact: true })
		.locator('..')
		.boundingBox();
	expect(bounds!.height).toBeGreaterThanOrEqual(48);
	await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
	await page.keyboard.press('Shift+Tab');
	await expect(dialog.getByRole('button', { name: 'Open the Command Center' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(dialog.getByRole('button', { name: 'Skip setup' })).toBeFocused();
	expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
	await page.keyboard.press('Shift+Tab');
	await page.keyboard.press('Enter');
	await expect(dialog).toBeHidden();
});

test('player preview hides setup and blocks its campaign command', async ({ page }) => {
	await page.goto('/#/');
	await waitReady(page);
	await page.evaluate(() => window.__rt!.enterPreview({ role: 'player' }));
	await expect(page.locator(dialogSelector)).toBeHidden();
	const result = await page.evaluate(() =>
		window.__rt!.dispatch({
			type: 'system.select',
			actorId: window.__rt!.defaultActorId,
			payload: { packageId: 'generic' },
		}),
	);
	expect(result.status).not.toBe('accepted');
});

test('Spanish system rejection explains how to recover', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('dndtools:locale', 'es'));
	await page.goto('/#/');
	await waitReady(page);
	const dialog = page.locator(dialogSelector);
	await dialog.locator('#campaign-name').fill('Costa de faroles');
	await dialog.locator('#campaign-system').selectOption({ label: 'Generic' });
	await dialog.locator('footer button').last().click();
	await dialog.locator('footer button').last().click();
	await page.evaluate(() => {
		const runtime = window.__rt!;
		const dispatch = runtime.dispatch.bind(runtime);
		runtime.dispatch = async (command) => {
			if (command.type !== 'system.select') return dispatch(command);
			runtime.dispatch = dispatch;
			return {
				status: 'rejected',
				rejection: { code: 'actor-not-authorized', message: 'Unavailable' },
				nextState: runtime.state,
			};
		};
	});
	await dialog.locator('footer button').last().click();
	await expect(dialog.getByRole('status')).toContainText(
		'Inténtalo de nuevo o vuelve atrás y elige otro sistema.',
	);
	expect((await new AxeBuilder({ page }).include(dialogSelector).analyze()).violations).toEqual([]);
	await dialog.locator('footer button').last().click();
	await expect(dialog).toBeHidden();
});
