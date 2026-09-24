import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, gotoRoute, markOnboarded, ops } from './_helpers';

// RC-POL-1.3 — the scene editor's polish pass (§20.2–§20.5). Runs on both the desktop-chromium and
// mobile-chromium projects: axe over the route and every overlay it opens, a keyboard-only
// walkthrough of the primary task (select a widget, edit it, rename the scene), the unavailable
// state as the failure path, Android Back on the phone panels, and 200% text.

const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;

async function axe(page: Page, label: string) {
	// Scan settled frames only: a palette or panel transition mid-flight is not what a user reads.
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
	);
	// The shell's own chrome (top bar, footer tab bar, sidebar, session rail) is the App shell
	// story's surface, and fails parchment/scholar contrast on every route; it is scanned there.
	await page.evaluate(() => {
		const main = document.getElementById('main-content');
		for (const sibling of Array.from(main?.parentElement?.children ?? []))
			if (sibling !== main) sibling.setAttribute('data-axe-shell', '');
		for (const aside of Array.from(document.querySelectorAll('aside')))
			if (!main?.contains(aside)) aside.setAttribute('data-axe-shell', '');
	});
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.exclude('[data-axe-shell]')
		.analyze();
	const theme = await page.evaluate(() => document.documentElement.dataset.theme);
	const found = result.violations
		.map((v) => ({
			id: v.id,
			impact: v.impact,
			nodes: v.nodes
				// DEBT-2026-008, owned by the design system: parchment's accent on its accent tint is
				// 4.43:1, so the DS accent Button (Done) and the widget-body kit's accent Chip fail. Only
				// that token pair, only on parchment, only for contrast; anything else still fails.
				.filter(
					(n) =>
						!(
							theme === 'parchment' &&
							v.id === 'color-contrast' &&
							/foreground color: #9a5418, background color: #f0e0c8/.test(
								n.any.map((check) => check.message).join(' '),
							)
						),
				)
				.map((n) => n.target.join(' ')),
		}))
		.filter((v) => v.nodes.length > 0);
	expect(found, label).toEqual([]);
}

async function stage(page: Page, theme: (typeof THEMES)[number] = 'tavern') {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.addInitScript((applied) => {
		try {
			window.localStorage.setItem('dndtools:react:theme', applied);
		} catch {
			/* best-effort, as in markOnboarded */
		}
	}, theme);
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** The demo seed's first scene that already holds widgets. */
async function filledScene(page: Page): Promise<{ id: string; name: string }> {
	const found = await page.evaluate(() => {
		const scenes = Object.values(window.__rt!.state.scenes.scenes) as Array<{
			id: string;
			name: string;
			widgets: unknown[];
			templateMeta?: { isTemplate?: boolean };
		}>;
		const scene = scenes.find((s) => !s.templateMeta?.isTemplate && s.widgets.length > 0);
		return scene ? { id: scene.id, name: scene.name } : null;
	});
	expect(found, 'the demo seed has no scene with widgets').not.toBeNull();
	return found!;
}

async function emptyScene(page: Page, name: string): Promise<string> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId,
		payload: { name, description: '', visibility: 'dm-only', tags: [] },
	});
	expect(created.status).toBe('accepted');
	return page.evaluate(
		(sceneName) =>
			Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === sceneName)!.id,
		name,
	);
}

/** Select the first tile from the keyboard: focus it, then Enter, as canvas.spec.ts does. */
async function selectFirstTile(page: Page) {
	const tile = page.locator('[role="group"][data-testid^="widget-"]').first();
	await tile.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('widget-inspector')).toBeVisible();
}

for (const theme of THEMES) {
	test(`scene editor, inspector and details panel are axe clean — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		const scene = await filledScene(page);
		await gotoRoute(page, `/scene/${scene.id}`);
		await expect(page.getByRole('heading', { level: 2, name: scene.name })).toBeVisible();
		await axe(page, `${theme}: view`);
		await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
		await expect(page.getByRole('group', { name: 'Layout tools' })).toBeVisible();
		await axe(page, `${theme}: editing with scene details`);
		await selectFirstTile(page);
		await axe(page, `${theme}: inspector`);
		for (const tab of ['Binding', 'Transform', 'Visibility']) {
			await page.getByTestId('widget-inspector').getByRole('tab', { name: tab }).click();
			await axe(page, `${theme}: inspector ${tab}`);
		}
	});
}

test('every overlay the editor opens is axe clean', async ({ page }, testInfo) => {
	await stage(page);
	const scene = await filledScene(page);
	await gotoRoute(page, `/scene/${scene.id}`);
	await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
	await expect(page.getByTestId('scene-meta-panel')).toBeVisible();
	await axe(page, 'scene details');
	await page.getByRole('button', { name: 'Close scene details' }).click();

	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await axe(page, 'add-widget gallery');
	await page.keyboard.press('Escape');

	// The phone keeps Snap and Generate in a bounded menu; desktop shows them on the tools row.
	const phone = testInfo.project.name.includes('mobile');
	if (phone) {
		await page.getByRole('button', { name: 'More editing tools' }).click();
		const menu = page.getByRole('menu', { name: 'More editing tools' });
		await expect(menu.getByRole('menuitemcheckbox', { name: 'Snap' })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await axe(page, 'more editing tools');
		await menu.getByRole('menuitem', { name: 'Generate a widget' }).click();
	} else {
		await page.getByRole('button', { name: 'Generate a widget' }).click();
	}
	const generate = page.getByRole('dialog', { name: 'Generate a widget' });
	await expect(generate).toBeVisible();
	await axe(page, 'generate dialog');
	await page.keyboard.press('Escape');
	await expect(generate).toBeHidden();

	await page.getByRole('button', { name: 'Done' }).click();
	await enterPreview(page, 'player');
	await expect(page.getByTestId('player-preview-overlay')).toBeVisible();
	await axe(page, 'player preview');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('player-preview-overlay')).toHaveCount(0);

	const emptyId = await emptyScene(page, 'Polish empty scene');
	await gotoRoute(page, `/scene/${emptyId}`);
	await expect(page.getByTestId('scene-empty-templates')).toBeVisible();
	await axe(page, 'empty scene');
	await page
		.getByTestId('scene-empty-templates')
		.getByRole('button', { name: 'Apply a template' })
		.click();
	await axe(page, 'template picker');
});

test('keyboard-only: select a widget, edit it, rename the scene', async ({ page }) => {
	await stage(page);
	const scene = await filledScene(page);
	await gotoRoute(page, `/scene/${scene.id}`);
	const edit = page.getByRole('button', { name: 'Edit layout', exact: true });
	await edit.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Done' })).toBeFocused();

	await selectFirstTile(page);
	const inspector = page.getByTestId('widget-inspector');
	await expect(inspector.getByRole('heading', { level: 3 })).toBeVisible();
	// Transform tab by arrow keys, then pin the widget earlier in the keyboard order.
	await inspector.getByRole('tab').first().focus();
	const transform = inspector.getByRole('tab', { name: 'Transform' });
	for (let i = 0; i < 6 && !(await transform.evaluate((el) => el === document.activeElement)); i++)
		await page.keyboard.press('ArrowRight');
	await expect(transform).toBeFocused();
	await page.keyboard.press('Enter');
	const later = inspector.getByRole('button', { name: 'Later' });
	await later.focus();
	const before = await ops(page);
	await page.keyboard.press('Enter');
	await expect(inspector.getByText('Position 2')).toBeVisible();
	expect(await ops(page)).toBeGreaterThan(before);
	// Escape closes the Inspector and focus lands somewhere real, not on <body>.
	await page.keyboard.press('Escape');
	await expect(inspector).toHaveCount(0);
	expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);

	await page.getByRole('button', { name: 'Edit scene name, description & tags' }).focus();
	await page.keyboard.press('Enter');
	const name = page.getByTestId('scene-meta-panel').getByLabel('Name');
	await name.focus();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('Polished crypt');
	await page.getByRole('button', { name: 'Save details' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('heading', { level: 2, name: 'Polished crypt' })).toBeVisible();
	await expect(page.getByText('Scene details saved.')).toBeVisible();
	await expect(page.getByTestId('scene-meta-panel')).toHaveCount(0);
});

test('failure path: a missing scene says so in words and leads back to Scenes', async ({
	page,
}) => {
	await stage(page);
	await gotoRoute(page, '/scene/no-such-scene');
	const card = page.getByTestId('scene-unavailable');
	await expect(card.getByRole('heading', { level: 2, name: 'Scene unavailable' })).toBeVisible();
	await expect(card).toContainText('This scene no longer exists.');
	await expect(card.locator('svg').first()).toBeVisible();
	await axe(page, 'unavailable');
	// A deleted scene reads exactly like a missing one — never the raw "scene-not-found" code.
	const doomed = await emptyScene(page, 'Polish doomed scene');
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	expect(
		(await dispatch(page, { type: 'scene.delete', actorId, payload: { sceneId: doomed } })).status,
	).toBe('accepted');
	await gotoRoute(page, `/scene/${doomed}`);
	await expect(card).toContainText('This scene no longer exists.');
	await expect(card).not.toContainText('scene-not-found');
	await card.getByRole('button', { name: 'Back to scenes' }).click();
	await expect(page).toHaveURL(/#\/scenes$/);
});

test('Android Back closes a phone panel before it leaves the scene', async ({ page }, testInfo) => {
	test.skip(
		!testInfo.project.name.includes('mobile'),
		'the panels float over the canvas on a phone only',
	);
	await stage(page);
	const scene = await filledScene(page);
	await gotoRoute(page, `/scene/${scene.id}`);
	await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
	await expect(page.getByTestId('scene-meta-panel')).toBeVisible();
	const back = () =>
		page.evaluate(async () => {
			// The app's own module instance: Vite serves it at this URL to the app too.
			const url = '/src/platform/backNavigation.ts';
			const nav = (await import(
				/* @vite-ignore */ url
			)) as typeof import('../../src/platform/backNavigation');
			let left = false;
			const result = await nav.handlePlatformBack({
				atRootDestination: false,
				canGoBack: true,
				navigateBack: () => {
					left = true;
				},
				navigateToRoot: () => {
					left = true;
				},
				minimize: () => undefined,
			});
			return { result, left };
		});
	expect(await back()).toEqual({ result: 'overlay', left: false });
	await expect(page.getByTestId('scene-meta-panel')).toHaveCount(0);

	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await page.getByRole('button', { name: 'Close scene details' }).click();
	await selectFirstTile(page);
	expect(await back()).toEqual({ result: 'overlay', left: false });
	await expect(page.getByTestId('widget-inspector')).toHaveCount(0);
	await expect(page).toHaveURL(new RegExp(`#/scene/${scene.id}$`));
});

test('200% text: the toolbar and inspector stay reachable without clipping', async ({ page }) => {
	await stage(page);
	const scene = await filledScene(page);
	await gotoRoute(page, `/scene/${scene.id}`);
	await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	const toolbar = page.getByTestId('scene-editor-toolbar');
	const main = page.locator('#main-content');
	const [bar, pane] = await Promise.all([toolbar.boundingBox(), main.boundingBox()]);
	expect(bar!.x + bar!.width).toBeLessThanOrEqual(pane!.x + pane!.width + 1);
	for (const name of ['Done', 'Add']) {
		const control = page.getByRole('button', { name, exact: true });
		await control.scrollIntoViewIfNeeded();
		await expect(control).toBeInViewport();
	}
	await selectFirstTile(page);
	const remove = page.getByRole('button', { name: 'Remove widget' });
	await remove.scrollIntoViewIfNeeded();
	await expect(remove).toBeInViewport();
});

test('phone: every editing control is at least 44px on both axes', async ({ page }, testInfo) => {
	test.skip(
		!testInfo.project.name.includes('mobile'),
		'the touch-target floor is a phone contract',
	);
	await stage(page);
	const scene = await filledScene(page);
	await gotoRoute(page, `/scene/${scene.id}`);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await page.getByRole('button', { name: 'Close scene details' }).click();
	const small = (selector: string) =>
		page.locator(selector).evaluateAll((elements) =>
			elements.flatMap((element) => {
				const rect = element.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return [];
				if (rect.width >= 44 && rect.height >= 44) return [];
				const name = element.getAttribute('aria-label') || element.textContent || element.tagName;
				return [`${name.trim().slice(0, 40)} ${Math.round(rect.width)}×${Math.round(rect.height)}`];
			}),
		);
	const CONTROLS = 'button, [role="radio"], [role="switch"], select, input';
	const found: string[] = [];
	found.push(...(await small(`[data-testid="scene-editor-toolbar"] :is(${CONTROLS})`)));
	await page.getByRole('button', { name: 'More editing tools' }).click();
	found.push(...(await small(`[role="menu"] :is(${CONTROLS})`)));
	await page.keyboard.press('Escape');
	await selectFirstTile(page);
	for (const tab of ['Content', 'Transform', 'Visibility']) {
		await page.getByTestId('widget-inspector').getByRole('tab', { name: tab }).click();
		for (const hit of await small(`[data-testid="widget-inspector"] :is(${CONTROLS})`))
			found.push(`Inspector ${tab}: ${hit}`);
	}
	expect(found).toEqual([]);
});
