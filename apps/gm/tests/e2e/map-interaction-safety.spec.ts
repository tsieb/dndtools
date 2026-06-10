import { expect, test, type Page } from '@playwright/test';

/**
 * MAP-015 — map control interaction safety.
 *
 * A POI popover (expanded profile) / sheet (compact profile) must stay open through every
 * INTERNAL interaction — pointer transit from the marker into the control, hover-out,
 * scrolling, pressing an action inside, and focus landing on a child action — and dismiss
 * ONLY on a genuine dismiss intent: explicit Close, Escape, a true outside pointerdown, or
 * selecting another POI. The dismissal policy lives in the Processing-Core reducer; these
 * specs prove the visible behavior on BOTH projects (desktop-chromium AND mobile-chromium).
 *
 * The Pixel 5 project (mobile-chromium, touch) renders the control as a bottom sheet; the
 * desktop project renders an anchored popover. Both share the same testids and the same
 * engagement rules, so the bulk of the suite runs unchanged on both — only the
 * presentation-shape assertion is profile-scoped.
 */

async function openMapWithPois(page: Page) {
	// Western Reaches is player-visible and carries two regions (North Road, Storm Coast).
	await page.goto('/atlas/');
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.goto('/atlas/?map=map-western-reaches');
	await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
	await page.getByTestId('poi-list').waitFor({ state: 'visible' });
}

test.describe('MAP-015 a POI control opens and is keyboard/pointer/touch reachable', () => {
	test('opening a POI shows its actions without requiring hover', async ({ page }) => {
		await openMapWithPois(page);
		const trigger = page.getByTestId('poi-trigger-region-coast');
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');
		// A plain click/tap opens the control — no hover needed.
		await trigger.click();
		const surface = page.getByTestId('poi-surface-region-coast');
		await expect(surface).toBeVisible();
		await expect(trigger).toHaveAttribute('aria-expanded', 'true');
		// Every action inside the control is reachable without hover.
		await expect(page.getByTestId('poi-focus-region-coast')).toBeVisible();
		await expect(page.getByTestId('poi-open-region-coast')).toBeVisible();
		await expect(page.getByTestId('poi-close-region-coast')).toBeVisible();
	});

	test('the control presents as a popover on desktop and a sheet on compact', async ({
		page,
	}, testInfo) => {
		await openMapWithPois(page);
		await page.getByTestId('poi-trigger-region-coast').click();
		const surface = page.getByTestId('poi-surface-region-coast');
		const expected = testInfo.project.name === 'mobile-chromium' ? 'sheet' : 'popover';
		await expect(surface).toHaveAttribute('data-presentation', expected);
	});

	test('focus moves into the control on open (a11y)', async ({ page }) => {
		await openMapWithPois(page);
		await page.getByTestId('poi-trigger-region-coast').click();
		await expect(page.getByTestId('poi-surface-region-coast')).toBeVisible();
		// The first focusable element in the control receives focus.
		await expect(page.getByTestId('poi-close-region-coast')).toBeFocused();
	});
});

test.describe('MAP-015 internal interactions never dismiss the control', () => {
	test('AC1: moving the pointer from the trigger into the control keeps it open', async ({
		page,
	}) => {
		await openMapWithPois(page);
		const trigger = page.getByTestId('poi-trigger-region-coast');
		await trigger.hover();
		await trigger.click();
		const surface = page.getByTestId('poi-surface-region-coast');
		await expect(surface).toBeVisible();
		// Hover into the surface (the marker→popover transit) — it must stay open.
		await surface.hover();
		await page.getByTestId('poi-focus-region-coast').hover();
		await expect(surface).toBeVisible();
	});

	test('AC2: pressing an action inside the control executes it and keeps the control open', async ({
		page,
	}) => {
		await openMapWithPois(page);
		await page.getByTestId('poi-trigger-region-coast').click();
		const surface = page.getByTestId('poi-surface-region-coast');
		await expect(surface).toBeVisible();
		// Press an action INSIDE — the underlying map handlers must not close the control.
		await page.getByTestId('poi-focus-region-coast').click();
		// The action executed (viewport focus updated) and the control is still open.
		await expect(page.getByTestId('viewport-focus')).toContainText('region-coast');
		await expect(surface).toBeVisible();
	});

	test('hover-out / pointer leaving the control does NOT dismiss it', async ({ page }) => {
		await openMapWithPois(page);
		await page.getByTestId('poi-trigger-region-coast').click();
		const surface = page.getByTestId('poi-surface-region-coast');
		await expect(surface).toBeVisible();
		await surface.hover();
		// Move the pointer well away from the control: it must remain open (no hover requirement).
		await page.getByTestId('map-name').hover();
		await expect(surface).toBeVisible();
	});

	test('scrolling / focusing a child action does NOT dismiss it', async ({ page }) => {
		await openMapWithPois(page);
		await page.getByTestId('poi-trigger-region-coast').click();
		const surface = page.getByTestId('poi-surface-region-coast');
		await expect(surface).toBeVisible();
		// Mouse-wheel over the control (map pan/zoom under it) — must not dismiss.
		await surface.hover();
		await page.mouse.wheel(0, 200);
		await expect(surface).toBeVisible();
		// Move focus to a child action (keyboard) — must not dismiss.
		await page.getByTestId('poi-open-region-coast').focus();
		await expect(surface).toBeVisible();
		await expect(page.getByTestId('poi-open-region-coast')).toBeFocused();
	});
});

test.describe('MAP-015 genuine dismiss intents close the control and restore focus', () => {
	test('the explicit Close action dismisses and restores focus to the trigger', async ({
		page,
	}) => {
		await openMapWithPois(page);
		const trigger = page.getByTestId('poi-trigger-region-coast');
		await trigger.click();
		await expect(page.getByTestId('poi-surface-region-coast')).toBeVisible();
		await page.getByTestId('poi-close-region-coast').click();
		await expect(page.getByTestId('poi-surface-region-coast')).toHaveCount(0);
		// Focus returns to the trigger that opened it (a11y).
		await expect(trigger).toBeFocused();
		await expect(trigger).toHaveAttribute('aria-expanded', 'false');
	});

	test('Escape dismisses the control and restores focus', async ({ page }) => {
		await openMapWithPois(page);
		const trigger = page.getByTestId('poi-trigger-region-coast');
		await trigger.click();
		await expect(page.getByTestId('poi-surface-region-coast')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('poi-surface-region-coast')).toHaveCount(0);
		await expect(trigger).toBeFocused();
	});

	test('a true outside pointerdown dismisses the control', async ({ page }) => {
		await openMapWithPois(page);
		await page.getByTestId('poi-trigger-region-coast').click();
		await expect(page.getByTestId('poi-surface-region-coast')).toBeVisible();
		// Press outside the control (on the viewport heading): a genuine dismiss intent.
		await page.getByTestId('map-name').click();
		await expect(page.getByTestId('poi-surface-region-coast')).toHaveCount(0);
	});

	test('selecting another POI switches the control instead of leaving both open', async ({
		page,
	}) => {
		await openMapWithPois(page);
		await page.getByTestId('poi-trigger-region-coast').click();
		await expect(page.getByTestId('poi-surface-region-coast')).toBeVisible();
		// Open a different POI: the first control closes and the new one opens (a single
		// active control), with focus moving into the new control rather than back to the page.
		await page.getByTestId('poi-trigger-region-north-road').click();
		await expect(page.getByTestId('poi-surface-region-coast')).toHaveCount(0);
		await expect(page.getByTestId('poi-surface-region-north-road')).toBeVisible();
	});
});
