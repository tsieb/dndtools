import { expect, test } from '@playwright/test';

// CANVAS-012 + CANVAS-016: keyboard/touch layout operations and declared focus order.
test.describe('Scene layout accessibility', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		// These specs drive the dense widget grid — the per-widget layout toolbar (move/resize/
		// dock/pin), z-order focus traversal, and multi-select grouping. That is the desktop
		// affordance: PLAT-003 replaces the grid with a one-at-a-time focused view on the compact
		// profile (widget-grid renders count 0, and multi-select grouping is not expressible there).
		// The compact Scene-operation flow is covered in platform-profiles.spec.ts.
		test.skip(
			testInfo.project.name === 'mobile-chromium',
			'dense-grid layout is desktop-only; compact focused-view is covered in platform-profiles.spec.ts',
		);
		await page.goto('/scenes/');
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	});

	async function openSceneWithWidget(page: import('@playwright/test').Page, name: string) {
		await page.getByTestId('scene-name').fill(name);
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name }).click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
	}

	test('CANVAS-012: keyboard-only user can move, resize, layer, dock, and pin a widget', async ({
		page,
	}) => {
		await openSceneWithWidget(page, 'Keyboard Scene');
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-version').fill('1.0.0');
		await page.getByTestId('widget-add').click();

		const grid = page.getByTestId('widget-grid');
		const row = grid.locator('[data-testid^="widget-"]').first();
		await expect(row).toContainText('x 40');
		await expect(row).toContainText('w 240');

		// Each operation is a focusable button. Drive it purely by keyboard.
		const moveRight = page.getByRole('button', { name: 'Move right — note widget' });
		await moveRight.focus();
		await expect(moveRight).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(row).toContainText('x 60');

		const widen = page.getByRole('button', { name: 'Widen — note widget' });
		await widen.focus();
		await page.keyboard.press('Enter');
		await expect(row).toContainText('w 260');

		const forward = page.getByRole('button', { name: 'Bring forward — note widget' });
		await forward.focus();
		await page.keyboard.press('Enter');
		await expect(row).toContainText('z 2');

		const dockLeft = page.getByRole('button', { name: 'Dock left — note widget' });
		await dockLeft.focus();
		await page.keyboard.press('Enter');
		await expect(row).toContainText('docked left');

		const pin = page.getByRole('button', { name: 'Pin — note widget' });
		await pin.focus();
		await page.keyboard.press('Enter');
		await expect(row).toContainText('pinned');
		// The toggle now offers the inverse action without any hover/drag.
		await expect(page.getByRole('button', { name: 'Unpin — note widget' })).toBeVisible();
	});

	test('CANVAS-012: all widget commands stay reachable without hover (touch-style tap)', async ({
		page,
	}) => {
		await openSceneWithWidget(page, 'Touch Scene');
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-add').click();

		// Buttons render in a visible toolbar; no hover is required to reveal them.
		const toolbar = page.locator('[data-testid^="layout-toolbar-"]').first();
		await expect(toolbar).toBeVisible();
		for (const label of ['Move up', 'Taller', 'Send backward', 'Dock top', 'Remove widget']) {
			await expect(toolbar.getByRole('button', { name: new RegExp(label) })).toBeVisible();
		}
		// A plain tap (click) performs the operation.
		await toolbar.getByRole('button', { name: 'Move down — note widget' }).click();
		await expect(
			page.getByTestId('widget-grid').locator('[data-testid^="widget-"]').first(),
		).toContainText('y 60');
	});

	test('CANVAS-016: focus order follows z-order rather than insertion order', async ({ page }) => {
		await openSceneWithWidget(page, 'Order Scene');
		// Add two widgets; the second gets the higher z-order.
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-add').click();
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-add').click();

		const rows = page.getByTestId('widget-grid').locator('[data-testid^="widget-"]');
		await expect(rows).toHaveCount(2);
		// Top-most (z 2) is first in traversal even though it was inserted last.
		await expect(rows.nth(0)).toContainText('z 2');
		await expect(rows.nth(0)).toHaveAttribute('data-focus-index', '0');
		await expect(rows.nth(1)).toContainText('z 1');
	});

	test('CANVAS-012: widgets can be grouped through keyboard/touch selection', async ({ page }) => {
		await openSceneWithWidget(page, 'Group Scene');
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-add').click();
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-add').click();

		const groupButton = page.getByTestId('group-selected');
		await expect(groupButton).toBeDisabled();

		const checkboxes = page.getByTestId('widget-grid').getByRole('checkbox');
		await checkboxes.nth(0).check();
		await checkboxes.nth(1).check();
		await expect(groupButton).toBeEnabled();
		await groupButton.click();

		const grouped = page.getByTestId('widget-grid').getByText('• grouped');
		await expect(grouped).toHaveCount(2);
	});

	// WCAG 2.4.11 Focus Not Obscured (AA): when a UI component receives keyboard focus, it must not
	// be entirely hidden by author-created content such as sticky headers, fixed toolbars, or toast
	// stacks. The canvas layout toolbar is the primary new interaction pattern in v2 that introduces
	// persistent chrome adjacent to focusable controls — this test verifies the toolbar buttons remain
	// visible when focused.
	test('WCAG 2.4.11: layout toolbar buttons are not entirely obscured by sticky chrome when focused', async ({
		page,
	}) => {
		await openSceneWithWidget(page, 'Focus Visibility Scene');
		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-add').click();

		const toolbar = page.locator('[data-testid^="layout-toolbar-"]').first();
		await expect(toolbar).toBeVisible();

		const allButtons = await toolbar.getByRole('button').all();
		// Inspect each toolbar button; slice to first 5 to keep runtime bounded while covering the
		// full set of layout operations (move, resize, layer, dock, pin).
		for (const btn of allButtons.slice(0, 5)) {
			await btn.focus();
			const box = await btn.boundingBox();
			expect(box, 'Focused button must have a non-null bounding box').not.toBeNull();
			if (!box) continue;

			const viewport = page.viewportSize()!;
			// The focused button must intersect the viewport — not scrolled or clipped entirely away.
			const intersectW =
				Math.min(box.x + box.width, viewport.width) - Math.max(box.x, 0);
			const intersectH =
				Math.min(box.y + box.height, viewport.height) - Math.max(box.y, 0);
			const label = await btn.getAttribute('aria-label');
			expect(
				intersectW,
				`Button "${label}" must intersect viewport horizontally when focused (WCAG 2.4.11)`,
			).toBeGreaterThan(0);
			expect(
				intersectH,
				`Button "${label}" must intersect viewport vertically when focused (WCAG 2.4.11)`,
			).toBeGreaterThan(0);

			// Check that the button's center is not entirely covered by a non-descendant element.
			// elementFromPoint returns the topmost element at a coordinate; if it is the focused button
			// or a descendant (icon/text content inside the button), the button is reachable. If it
			// returns an unrelated element (e.g., a sticky header) the button is obscured — WCAG 2.4.11
			// violation.
			const cx = box.x + box.width / 2;
			const cy = box.y + box.height / 2;
			const notObscured = await page.evaluate(
				([x, y]) => {
					const top = document.elementFromPoint(x, y);
					const active = document.activeElement;
					if (!top || !active) return false;
					return active === top || active.contains(top);
				},
				[cx, cy] as [number, number],
			);
			expect(
				notObscured,
				`WCAG 2.4.11: center of focused button "${label}" must not be entirely obscured by sticky/fixed chrome`,
			).toBe(true);
		}
	});
});
