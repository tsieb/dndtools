import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded } from './_helpers';

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/');
});

test('route, palette failure, help and nested shortcuts are axe clean', async ({ page }) => {
	const clean = async () => {
		await page.evaluate(async () => {
			await Promise.all(
				document
					.getAnimations()
					.filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
					.map((animation) => animation.finished.catch(() => undefined)),
			);
		});
		const result = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
			.analyze();
		expect(result.violations).toEqual([]);
	};
	await clean();
	await page.keyboard.press('Control+k');
	const input = page.getByRole('combobox');
	await expect(input).toBeFocused();
	await clean();
	await input.fill('zzzz-no-such-command');
	await expect(page.getByText('No matches')).toBeVisible();
	await clean();
	await input.fill('Help');
	await page.getByRole('option', { name: 'Help', exact: true }).waitFor();
	await page.getByRole('combobox').press('Enter');
	const help = page.getByRole('dialog', { name: 'Help', exact: true });
	await expect(help).toBeVisible();
	await clean();
	// The user guides come first in Help, so the keyboard walk tabs forward to the shortcut trigger.
	const trigger = help.getByRole('button', { name: 'Keyboard shortcuts' });
	for (
		let step = 0;
		step < 20 && !(await trigger.evaluate((el) => el === document.activeElement));
		step++
	) {
		await page.keyboard.press('Tab');
	}
	await expect(trigger).toBeFocused();
	await page.keyboard.press('Enter');
	const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
	await expect(shortcuts).toBeVisible();
	await clean();
	await page.keyboard.press('Escape');
	await expect(shortcuts).toHaveCount(0);
	await expect(trigger).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(help).toHaveCount(0);
});

test('shortcut rows remain reachable with 200% text', async ({ page }) => {
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await page.keyboard.press('?');
	const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
	await expect(dialog).toBeVisible();
	const rows = dialog.locator('dl > div');
	for (const row of await rows.all()) {
		await row.scrollIntoViewIfNeeded();
		expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	}
	await dialog.getByRole('button', { name: 'Done' }).click();
	await expect(dialog).toHaveCount(0);
});

test('player preview uses actor reads and offers no create launchers', async ({ page }) => {
	await page.evaluate(() => window.__rt!.enterPreview({ role: 'player' }));
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Command palette' });
	await palette.getByRole('combobox').fill('>');
	await expect(palette.getByText('No matches')).toBeVisible();
	await expect(palette.getByRole('option', { disabled: false })).toHaveCount(0);
	const result = await page.evaluate(async () => {
		const runtime = window.__rt!;
		const response = await runtime.dispatch({
			type: 'scene-card.advance',
			actorId: runtime.defaultActorId,
			payload: {},
		});
		return {
			actor: runtime.state.permissions.actors[runtime.defaultActorId]?.role,
			status: response.status,
		};
	});
	expect(result).toEqual({ actor: 'player', status: 'rejected' });
});

test('release-note load failure recovers on retry without leaving help', async ({ page }) => {
	await page.route(/CHANGELOG\.md/, (route) => route.abort('failed'));
	await page.keyboard.press('Control+k');
	await page.getByRole('combobox').fill('Help');
	await page.getByRole('option', { name: 'Help', exact: true }).waitFor();
	await page.getByRole('combobox').press('Enter');
	const help = page.getByRole('dialog', { name: 'Help', exact: true });
	await expect(help.getByText('Release notes couldn’t load. Try again.')).toBeVisible();
	await page.unroute(/CHANGELOG\.md/);
	await help.getByRole('button', { name: 'Retry' }).click();
	await expect(help.getByText(/Version /)).toBeVisible();
	await help.getByRole('button', { name: 'Keyboard shortcuts' }).click();
	await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});
