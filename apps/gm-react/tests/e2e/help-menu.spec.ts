import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-UX-6.1 — every Help trigger (top bar on desktop and rail, footer on phone) opens the shell's
// one Help dialog at full size, on both projects, even from inside a transformed launcher.
const TRIGGER_TIERS = [
	{ tier: 'desktop top bar', size: { width: 1280, height: 800 } },
	{ tier: 'rail top bar', size: { width: 834, height: 1112 } },
	{ tier: 'phone footer', size: { width: 393, height: 851 } },
] as const;

const GUIDE_TITLES = [
	'Getting started',
	'Screens',
	'Running a session',
	'Characters',
	'Maps',
	'Notes',
	'Settings',
	'Widgets & builders',
	'Systems',
	'Remote play',
	'Privacy modes',
	'Android/desktop install',
];

test.describe('help menu', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
	});

	for (const { tier, size } of TRIGGER_TIERS) {
		test(`opens full-size from the ${tier} Help trigger with Getting started, guides and What's new`, async ({
			page,
		}) => {
			await page.setViewportSize(size);
			const trigger = page.getByRole('button', { name: 'Help', exact: true });
			await expect(trigger).toHaveCount(1);
			// RC-UX-6.6 (ONB-10) — the word Help is on screen, not only in the accessible name.
			await expect(trigger).toHaveText('Help');
			await expect(page.getByTestId('whats-new-badge')).toHaveCount(0);
			// Reproduce the ONB-1 trap: a transformed ancestor becomes the fixed scrim's containing block.
			await trigger.evaluate((el) => {
				const chrome = el.closest('header') ?? el.parentElement!.parentElement!;
				chrome.style.transform = 'translateZ(0)';
			});
			await trigger.click();

			const dialog = page.getByRole('dialog', { name: 'Help' });
			await expect(dialog).toBeVisible();
			await expect(page.getByRole('dialog')).toHaveCount(1);
			await expect
				.poll(async () => (await dialog.boundingBox())?.height ?? 0)
				.toBeGreaterThanOrEqual(320);
			const scrim = await dialog.evaluate((panel) => {
				const rect = panel.parentElement!.getBoundingClientRect();
				return {
					height: rect.height,
					width: rect.width,
					parent: panel.parentElement!.parentElement!.tagName,
				};
			});
			expect(scrim.parent).toBe('BODY');
			expect(scrim).toMatchObject(size);

			await expect(dialog.getByRole('heading', { name: 'Getting started' })).toBeVisible();
			await expect(dialog.getByText(/of \d+ set up/)).toBeVisible();
			for (const title of GUIDE_TITLES) {
				const guide = dialog.getByRole('button', { name: title, exact: true });
				await guide.scrollIntoViewIfNeeded();
				await expect(guide).toBeVisible();
			}
			const whatsNew = dialog.getByRole('heading', { name: "What's new" });
			await whatsNew.scrollIntoViewIfNeeded();
			await expect(whatsNew).toBeVisible();

			// Let the DS entry animation settle so axe samples the resting dialog, not the fading scrim.
			await dialog.evaluate((panel) =>
				Promise.all(
					panel
						.parentElement!.getAnimations({ subtree: true })
						.filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? 1))
						.map((animation) => animation.finished),
				),
			);
			const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
			expect(results.violations).toEqual([]);
		});
	}

	test('opens the keyboard shortcuts overlay from within the Help menu', async ({ page }) => {
		await page.getByRole('button', { name: 'Help', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Help' });
		await dialog.getByRole('button', { name: 'Keyboard shortcuts' }).click();

		await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
	});

	// RC-UX-6.6 — the unseen release is a "New" chip on the What's new row, not a dot on the trigger.
	test("the What's new chip shows once, on the What's new row", async ({ page }) => {
		const trigger = page.getByRole('button', { name: 'Help', exact: true });
		await trigger.click();
		const dialog = page.getByRole('dialog', { name: 'Help' });
		const whatsNew = dialog.getByRole('region', { name: "What's new" });
		await whatsNew.scrollIntoViewIfNeeded();
		await expect(whatsNew.getByText('New', { exact: true })).toBeVisible();
		// The block reads as plain prose: a version line and its notes, never a code span.
		await expect(whatsNew.getByText(/^Version \d/)).toBeVisible();
		expect(await whatsNew.innerText()).not.toContain('`');
		await dialog.getByRole('button', { name: 'Close' }).click();

		await trigger.click();
		await expect(
			page.getByRole('dialog', { name: 'Help' }).getByTestId('whats-new-chip'),
		).toHaveCount(0);
	});

	// RC-UX-6.6 acceptance — a lost GM on /session finds Help by its visible name and lands on the
	// guide for that screen, with every other topic one level up.
	test('opened from /session, Help lands on Running a session', async ({ page }) => {
		await gotoRoute(page, '/session');
		const trigger = page.getByRole('button', { name: 'Help', exact: true });
		await expect(trigger).toHaveText('Help');
		await trigger.click();

		const guide = page.getByRole('dialog', { name: 'Running a session' });
		await expect(guide).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(1);
		const body = guide.locator('article');
		await expect(body).toContainText('Start session');
		await expect(body.getByText('Implementation references')).toHaveCount(0);
		// The phone reads the touch twin of the keyboard copy (ONB-17); larger screens read the keys.
		const phone = (page.viewportSize()?.width ?? 1280) <= 640;
		if (phone) {
			await expect(body).toContainText('Table controls');
			expect(await body.innerText()).not.toMatch(/⌘|Ctrl/);
		} else {
			await expect(body).toContainText('Ctrl+Shift+S');
			await expect(body).not.toContainText('Table controls');
		}

		await guide.evaluate((panel) =>
			Promise.all(
				panel
					.parentElement!.getAnimations({ subtree: true })
					.filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? 1))
					.map((animation) => animation.finished),
			),
		);
		const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
		expect(results.violations).toEqual([]);

		await guide.getByRole('button', { name: 'All help topics' }).click();
		const menu = page.getByRole('dialog', { name: 'Help' });
		await expect(menu).toBeVisible();
		await expect(
			menu.getByRole('button', { name: 'Running a session', exact: true }),
		).toBeVisible();

		// Escape closes Help from the guide too, and the next open lands on the route's guide again.
		await menu.getByRole('button', { name: 'Settings', exact: true }).click();
		await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await trigger.click();
		await expect(page.getByRole('dialog', { name: 'Running a session' })).toBeVisible();
	});
});
