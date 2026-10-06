import { expect, test, type Page } from '@playwright/test';
import '../e2e/_helpers';

// RC-CAN-8.8: the Layouts panel at its 260px width (280px on a phone) with a saved layout and the
// restore line. CAN-15 was its Save button stacked one letter per line; the capture pins the button
// on one line. One theme per tier keeps the PNG budget; the themes are the golden routes' job.
const FIXED_TIME = new Date('2026-03-14T15:30:00Z');

async function stage(page: Page): Promise<void> {
	await page.clock.setFixedTime(FIXED_TIME);
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
			window.localStorage.setItem('dndtools:react:theme', 'tavern');
		} catch {
			/* storage is best-effort here, as in markOnboarded */
		}
		// Ids come from crypto.randomUUID; a counter in v4 shape repeats (see add-panel.spec.ts). It
		// restarts on reload, so this test never reloads after writing.
		let nextId = 0;
		Object.defineProperty(crypto, 'randomUUID', {
			configurable: true,
			value: () => `00000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`,
		});
	});
}

test('Layouts panel — Save on one line, saved layout rows, restore line', async ({ page }) => {
	await stage(page);
	await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
	const frames = page.getByTestId('scene-board-bounded').locator('[data-testid^="widget-"]');
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(frames.first()).toBeVisible();
	await page.getByRole('button', { name: 'Layouts', exact: true }).click();
	const panel = page.getByTestId('board-layouts-panel');
	await page.getByLabel('Layout name').fill('Combat night');
	await page.getByLabel('Layout name').press('Enter');
	await expect(panel.getByRole('button', { name: 'Apply “Combat night”' })).toBeVisible();
	await expect(panel.getByTestId('board-layouts-restore-what')).toBeVisible();
	// A typed name the Save button must sit beside, not under.
	await page.getByLabel('Layout name').fill('Exploration');
	await page.getByLabel('Layout name').blur();

	const width = await panel.evaluate((el) => el.getBoundingClientRect().width);
	expect(width).toBe(page.viewportSize()!.width < 600 ? 280 : 260);
	// Beside the field, not under it, and no taller than it: one line of text.
	const save = (await panel.getByRole('button', { name: 'Save', exact: true }).boundingBox())!;
	const name = (await page.getByLabel('Layout name').boundingBox())!;
	expect(save.x).toBeGreaterThanOrEqual(name.x + name.width);
	expect(save.y).toBeLessThan(name.y + name.height);
	expect(save.height).toBeLessThanOrEqual(name.height + 1);

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'tavern');
	await page.waitForLoadState('networkidle');
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
	await expect(panel).toHaveScreenshot('board-layouts-panel.png');
});
