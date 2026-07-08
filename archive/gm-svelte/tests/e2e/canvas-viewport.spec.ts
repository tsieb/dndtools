import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

// UX-CANVAS-001 / UX-CANVAS-014 / UX-CANVAS-016: the spatial canvas viewport — cursor/keyboard/button
// zoom, pan, virtualization, perceived-performance instrumentation, and the no-gesture-only guarantee.
// Runs on BOTH desktop-chromium and mobile-chromium: the viewport must never be desktop-only.

async function freshScenes(page: Page) {
	await page.goto('/scenes/');
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
}

async function openScene(page: Page, name: string) {
	await page.getByTestId('scene-name').fill(name);
	await page.getByTestId('scene-create').click();
	await page.getByTestId('scene-list').getByRole('link', { name }).click();
	await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
	await page.getByTestId('canvas-viewport').waitFor({ state: 'visible' });
}

async function addWidget(
	page: Page,
	isMobile: boolean,
	opts: { type: string; x: number; y: number; w?: number; h?: number; visibility?: string },
) {
	if (isMobile) {
		const toggle = page.getByTestId('toggle-add-widget');
		if (await toggle.isVisible()) await toggle.click();
	}
	await page.getByTestId('widget-type').fill(opts.type);
	await page.getByTestId('widget-version').fill('1.0.0');
	await page.getByTestId('widget-x').fill(String(opts.x));
	await page.getByTestId('widget-y').fill(String(opts.y));
	await page.getByTestId('widget-w').fill(String(opts.w ?? 120));
	await page.getByTestId('widget-h').fill(String(opts.h ?? 80));
	if (opts.visibility) await page.getByTestId('widget-visibility').selectOption(opts.visibility);
	await page.getByTestId('widget-add').click();
}

test.describe('UX-CANVAS viewport, rendering, performance', () => {
	test.beforeEach(async ({ page }) => {
		await freshScenes(page);
	});

	test('on-screen zoom controls and keyboard parity drive the viewport (UX-CANVAS-001/016)', async ({
		page,
	}) => {
		await openScene(page, 'Zoom Scene');

		const zoom = page.getByTestId('canvas-zoom-input');
		// Empty canvas fits to 100% on mount.
		await expect(zoom).toHaveValue('100');

		// Non-gesture on-screen pointer alternatives: +/− step the discrete snap stops.
		await page.getByTestId('canvas-zoom-in').click();
		await expect(zoom).toHaveValue('150');
		await page.getByTestId('canvas-zoom-in').click();
		await expect(zoom).toHaveValue('200');
		await page.getByTestId('canvas-zoom-out').click();
		await expect(zoom).toHaveValue('150');
		await page.getByTestId('canvas-zoom-100').click();
		await expect(zoom).toHaveValue('100');

		// Editable zoom indicator: type a value + Enter.
		await zoom.fill('300');
		await zoom.press('Enter');
		await expect(zoom).toHaveValue('300');

		// Keyboard parity: focus the canvas region and drive zoom with keys.
		await page.getByTestId('canvas-viewport').focus();
		await page.keyboard.press('1'); // 100%
		await expect(zoom).toHaveValue('100');
		await page.keyboard.press('='); // zoom in one stop
		await expect(zoom).toHaveValue('150');
		await page.keyboard.press('-'); // zoom out one stop
		await expect(zoom).toHaveValue('100');
		await page.keyboard.press('2'); // 200%
		await expect(zoom).toHaveValue('200');
		await page.keyboard.press('0'); // zoom-to-fit (empty -> 100%)
		await expect(zoom).toHaveValue('100');
	});

	test('keyboard pan acknowledges as a hot interaction within budget (UX-CANVAS-014)', async ({
		page,
	}) => {
		await openScene(page, 'Pan Scene');
		await page.getByTestId('canvas-diagnostics').locator('summary').click();

		await page.getByTestId('canvas-viewport').focus();
		await page.keyboard.press('ArrowRight'); // keyboard pan (non-gesture alternative)
		await page.keyboard.press('ArrowDown');

		// The hot interaction acknowledged synchronously, well inside the 100 ms budget.
		await expect(page.getByTestId('canvas-perf-ack')).toContainText('≤100ms');
	});

	test('virtualization renders only on-screen tiles and reports a perf readout (UX-CANVAS-014)', async ({
		page,
	}, testInfo) => {
		const isMobile = testInfo.project.name === 'mobile-chromium';
		await openScene(page, 'Perf Scene');

		await addWidget(page, isMobile, { type: 'note', x: 20, y: 20 });
		await addWidget(page, isMobile, { type: 'timer', x: 60, y: 200 });

		// Both tiles render on the spatial canvas.
		await expect(page.locator('[data-testid^="canvas-tile-"]')).toHaveCount(2);

		await page.getByTestId('canvas-diagnostics').locator('summary').click();
		await expect(page.getByTestId('canvas-perf-rendered')).toContainText('/ 2');

		// Skeleton state (perceived performance): the demo toggle puts tiles into the data-pending
		// skeleton, a layout-matched placeholder rather than a spinner.
		await page.getByTestId('canvas-skeleton-toggle').check();
		await expect(page.locator('[data-testid^="canvas-skeleton-"]').first()).toBeVisible();
		await page.getByTestId('canvas-skeleton-toggle').uncheck();

		// Poster-frame degradation engages under sustained jank and shows a calm rendering indicator.
		const poster = page.getByTestId('canvas-poster-frame');
		await expect(poster).toHaveAttribute('data-active', 'false');
		await page.getByTestId('canvas-simulate-jank').click();
		await expect(poster).toHaveAttribute('data-active', 'true');
		await expect(poster).toContainText('rendering');
	});

	test('minimap is profile-appropriate; on-screen zoom alternative exists on every profile (UX-CANVAS-001/016)', async ({
		page,
	}, testInfo) => {
		const isMobile = testInfo.project.name === 'mobile-chromium';
		await openScene(page, 'Minimap Scene');

		// The non-gesture zoom controls are present on EVERY profile (never desktop-only).
		await expect(page.getByTestId('canvas-controls')).toBeVisible();
		await expect(page.getByTestId('canvas-zoom-in')).toBeVisible();
		await expect(page.getByTestId('canvas-zoom-out')).toBeVisible();
		await expect(page.getByTestId('canvas-zoom-fit')).toBeVisible();

		if (isMobile) {
			// Mobile: minimap hidden by default (UX-CANVAS-001 §Minimap).
			await expect(page.getByTestId('canvas-minimap')).toHaveCount(0);
		} else {
			// Desktop: persistent minimap with a draggable viewport rect.
			await expect(page.getByTestId('canvas-minimap')).toBeVisible();
		}

		// Touch-target floor: the zoom buttons meet the 44x44 CSS px minimum (UX-CANVAS-016).
		const box = await page.getByTestId('canvas-zoom-in').boundingBox();
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	});

	test('the canvas region passes axe with no critical/serious violations (UX-CANVAS-015)', async ({
		page,
	}) => {
		await openScene(page, 'Axe Scene');
		const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
		const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
		expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
	});
});
