import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { markOnboarded, waitReady } from './_helpers';

// RC-DSN-3.1 — the DEV-only illustration gallery draws every key exactly once and meets the same
// axe bar as the a11y gate routes (no critical or serious violations).
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test('illustration gallery draws every key once, accessibly', async ({ page }) => {
	await markOnboarded(page);
	await page.goto('/#/__illustrations', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Empty-state illustrations' }),
	).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: '24 keys' })).toBeVisible();

	const drawings = page.locator('svg[data-illustration]');
	await expect(drawings).toHaveCount(24);
	const keys = await drawings.evaluateAll((nodes) =>
		nodes.map((node) => node.getAttribute('data-illustration')),
	);
	expect(new Set(keys).size).toBe(keys.length);
	await expect(drawings.first()).toBeVisible();
	expect(await drawings.first().evaluate((node) => node.getBoundingClientRect().width)).toBe(160);

	const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
	const blocking = results.violations.filter(
		(violation) => violation.impact === 'critical' || violation.impact === 'serious',
	);
	expect(blocking.map((violation) => violation.id)).toEqual([]);
});
