import { expect, test, type Page } from '@playwright/test';
import { markOnboarded, waitReady } from './_helpers';

// RC-DSN-1.2 — five themes behind one `data-theme` swap, a System choice that maps the device's
// light/dark setting onto parchment/tavern, and a forced-colors fallback that covers all five.

const THEMES = [
	{ id: 'tavern', label: 'Tavern', scheme: 'dark' },
	{ id: 'parchment', label: 'Parchment', scheme: 'light' },
	{ id: 'scholar', label: 'Scholar', scheme: 'light' },
	{ id: 'dungeon', label: 'Dungeon', scheme: 'dark' },
	{ id: 'high-contrast', label: 'High contrast', scheme: 'dark' },
] as const;

const paintedTheme = (page: Page) =>
	page.evaluate(() => document.documentElement.getAttribute('data-theme'));

async function openAppearance(page: Page): Promise<void> {
	await page.goto('/#/settings?tab=appearance', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
}

const themePicker = (page: Page) => page.getByRole('radiogroup', { name: 'Theme', exact: true });

test.describe('themes: five presets and a System choice', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await openAppearance(page);
	});

	test('the picker offers every preset, and each one repaints the app', async ({ page }) => {
		const picker = themePicker(page);
		for (const theme of THEMES) {
			await picker.getByRole('radio', { name: theme.label, exact: true }).click();
			await expect.poll(() => paintedTheme(page)).toBe(theme.id);
			// prepaint.js sets color-scheme inline, and an inline style beats the stylesheet, so every
			// switch has to move it too or native controls stay on the old scheme.
			expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe(
				theme.scheme,
			);
		}
		await expect(picker.getByRole('radio', { name: 'System', exact: true })).toBeVisible();
	});

	test('Scholar and Dungeon survive a reload', async ({ page }) => {
		// prepaint.js allow-lists the names it restores; a theme missing from that list boots as tavern.
		for (const theme of THEMES.filter((t) => t.id === 'scholar' || t.id === 'dungeon')) {
			await themePicker(page).getByRole('radio', { name: theme.label, exact: true }).click();
			await expect.poll(() => paintedTheme(page)).toBe(theme.id);
			await page.reload({ waitUntil: 'domcontentloaded' });
			await waitReady(page);
			expect(await paintedTheme(page)).toBe(theme.id);
			await expect(
				themePicker(page).getByRole('radio', { name: theme.label, exact: true }),
			).toBeChecked();
		}
	});

	test('System paints Parchment on a light device and Tavern on a dark one, live and after a reload', async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await themePicker(page).getByRole('radio', { name: 'System', exact: true }).click();
		await expect.poll(() => paintedTheme(page)).toBe('parchment');

		// The device flips while the app is open.
		await page.emulateMedia({ colorScheme: 'dark' });
		await expect.poll(() => paintedTheme(page)).toBe('tavern');

		// prepaint.js resolves the stored `system` itself, and the picker still shows the choice
		// rather than the preset it happens to paint.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		expect(await paintedTheme(page)).toBe('tavern');
		await expect(
			themePicker(page).getByRole('radio', { name: 'System', exact: true }),
		).toBeChecked();

		await page.emulateMedia({ colorScheme: 'light' });
		await expect.poll(() => paintedTheme(page)).toBe('parchment');
	});

	test('the forced-colors fallback covers all five themes', async ({ page }) => {
		await page.emulateMedia({ forcedColors: 'active' });
		for (const theme of THEMES) {
			await page.evaluate(
				(id) => document.documentElement.setAttribute('data-theme', id),
				theme.id,
			);
			const values = await page.evaluate(() => {
				const style = getComputedStyle(document.documentElement);
				return [
					'--color-bg',
					'--color-border',
					'--color-interactive-focus-ring',
					'--color-tile-note',
				].map((name) => style.getPropertyValue(name).trim());
			});
			expect(values, theme.id).toEqual(['Canvas', 'CanvasText', 'Highlight', 'CanvasText']);
		}
	});
});

// One swatch per semantic token, painted by the real stylesheet under the theme prepaint.js restored
// from storage. There is no text and no shadow on the board, so its pixels do not depend on the
// host's font rasteriser, and a baseline written on one Linux host matches the Ubuntu CI runner.
const SWATCH_ROWS: string[][] = [
	[
		'--color-bg',
		'--color-surface',
		'--color-surface-raised',
		'--color-surface-overlay',
		'--color-surface-sunken',
		'--color-surface-alt',
	],
	[
		'--color-border',
		'--color-border-strong',
		'--color-border-focus',
		'--color-interactive-focus-ring',
		'--color-accent-border',
	],
	[
		'--color-text-primary',
		'--color-text-secondary',
		'--color-text-tertiary',
		'--color-text-inverse',
		'--color-text-link',
		'--color-text-link-visited',
	],
	[
		'--color-accent',
		'--color-accent-hover',
		'--color-accent-active',
		'--color-accent-subtle',
		'--color-accent-foreground',
	],
	[
		'--color-status-success',
		'--color-status-success-text',
		'--color-status-success-subtle',
		'--color-status-warning',
		'--color-status-warning-text',
		'--color-status-warning-subtle',
	],
	[
		'--color-status-error',
		'--color-status-error-text',
		'--color-status-error-subtle',
		'--color-status-error-foreground',
		'--color-status-info',
		'--color-status-info-text',
		'--color-status-info-subtle',
	],
	[
		'--color-dm-only-badge',
		'--color-dm-only-subtle',
		'--color-hidden-content-stripe',
		'--color-interactive-hover',
		'--color-interactive-selected',
		'--color-interactive-disabled',
		'--color-interactive-disabled-bg',
	],
	[
		'--color-tile-note',
		'--color-tile-combat',
		'--color-tile-encounter',
		'--color-tile-dice',
		'--color-tile-generator',
		'--color-tile-handout',
		'--color-tile-timer',
		'--color-tile-calendar',
		'--color-tile-map',
		'--color-tile-character',
		'--color-tile-audio',
		'--color-tile-reference',
	],
	[
		'--map-canvas-bg',
		'--map-fog-fill',
		'--color-route',
		'--layer-water',
		'--layer-terrain',
		'--layer-poi',
		'--layer-dm',
	],
];

test.describe('themes: visual snapshot per theme', () => {
	for (const theme of THEMES) {
		test(`${theme.id} swatch board`, async ({ page }, testInfo) => {
			test.skip(
				testInfo.project.name !== 'desktop-chromium',
				'the swatch board has no responsive layout, so one baseline per theme is enough',
			);
			await markOnboarded(page);
			await page.addInitScript((id) => {
				window.localStorage.setItem('dndtools:react:theme', id);
			}, theme.id);
			await openAppearance(page);
			expect(await paintedTheme(page)).toBe(theme.id);

			await page.evaluate((rows) => {
				const board = document.createElement('div');
				board.id = 'theme-swatch-board';
				board.setAttribute('aria-hidden', 'true');
				Object.assign(board.style, {
					position: 'fixed',
					left: '0',
					top: '0',
					zIndex: '2147483647',
					display: 'flex',
					flexDirection: 'column',
					gap: '4px',
					padding: '8px',
					background: 'var(--color-bg)',
				});
				for (const row of rows) {
					const line = document.createElement('div');
					Object.assign(line.style, { display: 'flex', gap: '4px' });
					for (const token of row) {
						const cell = document.createElement('div');
						Object.assign(cell.style, {
							width: '24px',
							height: '24px',
							background: `var(${token})`,
						});
						line.append(cell);
					}
					board.append(line);
				}
				document.body.append(board);
			}, SWATCH_ROWS);

			// Exact pixels: the default per-pixel threshold would let a small hex change through.
			await expect(page.locator('#theme-swatch-board')).toHaveScreenshot(`theme-${theme.id}.png`, {
				animations: 'disabled',
				threshold: 0,
				maxDiffPixels: 0,
			});
		});
	}
});
