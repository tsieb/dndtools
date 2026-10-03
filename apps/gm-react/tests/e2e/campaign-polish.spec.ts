import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, exitPreview, gotoRoute, markOnboarded } from './_helpers';

async function axe(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter((a) => a.effect?.getTiming().iterations !== Infinity)
				.map((a) => a.finished.catch(() => undefined)),
		);
	});
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(result.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/campaign');
});

test('Story tabs, editors, calendar and relationship dialog are axe clean', async ({ page }) => {
	await axe(page);
	await page.getByRole('button', { name: 'Create the first quest' }).click();
	await axe(page);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Create the first quest' })).toBeFocused();
	for (const name of ['NPCs', 'Factions', 'Timeline']) {
		await page.getByRole('tab', { name, exact: true }).click();
		await axe(page);
	}
	await page.getByRole('tab', { name: 'Factions' }).click();
	await page.getByRole('button', { name: 'New faction', exact: true }).click();
	await axe(page);
	await gotoRoute(page, '/campaign/calendar');
	await axe(page);
	await page.getByRole('button', { name: 'New calendar', exact: true }).click();
	await axe(page);
	await gotoRoute(page, '/campaign/relationships');
	await axe(page);
	const from = page.getByLabel('From', { exact: true });
	const to = page.getByLabel('To', { exact: true });
	await from.selectOption({ index: 1 });
	await to.selectOption({ index: 2 });
	await page.getByLabel('Relationship', { exact: true }).fill('knows');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Relationship added.', { exact: true })).toBeVisible();
	await axe(page);
	await page
		.getByRole('button', { name: /^Remove:/ })
		.first()
		.click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await axe(page);
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('button', { name: /^Remove:/ }).first()).toBeFocused();
});

test('keyboard quest creation retains the draft after a failed save and recovers', async ({
	page,
}) => {
	const create = page.getByRole('button', { name: 'Create the first quest' });
	await create.focus();
	await page.keyboard.press('Enter');
	const title = page.getByLabel('Title', { exact: true });
	await expect(title).toBeFocused();
	await title.fill('The lantern road');
	// Exercise the runtime's thrown persistence boundary without modifying durable state.
	await page.evaluate(() => {
		const rt = window.__rt!;
		const dispatch = rt.dispatch.bind(rt);
		rt.dispatch = async (command) => {
			if (command.type === 'content.create-object') {
				rt.dispatch = dispatch;
				throw new Error('Storage unavailable');
			}
			return dispatch(command);
		};
	});
	await title.press('Enter');
	await expect(page.getByRole('alert')).toContainText('Check storage space and try again.');
	await expect(title).toHaveValue('The lantern road');
	await expect(page.getByRole('button', { name: 'Create quest', exact: true })).toBeEnabled();
	await axe(page);
	await title.press('Enter');
	await expect(page.getByText('Created “The lantern road”', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'New quest', exact: true })).toBeFocused();
	await expect(page.getByRole('heading', { name: 'The lantern road', exact: true })).toBeVisible();
	await axe(page);
});

test('faction save and cancel return focus to the mounted launcher', async ({ page }) => {
	await page.getByRole('tab', { name: 'Factions', exact: true }).click();
	const launcher = page.getByRole('button', { name: 'New faction', exact: true });
	await launcher.focus();
	await page.keyboard.press('Enter');
	await page.getByLabel('Name', { exact: true }).fill('Lantern keepers');
	await page.getByRole('button', { name: 'Create faction', exact: true }).click();
	await expect(launcher).toBeFocused();
	await expect(page.getByRole('heading', { name: 'Lantern keepers', exact: true })).toBeVisible();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(launcher).toBeFocused();
});

test('large text keeps the Story editor reachable', async ({ page }) => {
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await page.getByRole('button', { name: 'Create the first quest' }).click();
	await page.getByLabel('Title', { exact: true }).fill('Large text quest');
	await page.getByRole('button', { name: 'Create quest', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Large text quest', exact: true })).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth,
	);
	expect(overflow).toBe(false);
});

test('player preview hides authoring and rejects a Story mutation', async ({ page }) => {
	await enterPreview(page, 'player');
	await expect(page.getByRole('button', { name: /Create the first quest|New quest/ })).toHaveCount(
		0,
	);
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-object',
		actorId,
		payload: {
			subtype: 'quest',
			title: 'Blocked preview quest',
			fields: { title: 'Blocked preview quest', status: 'active', objectives: [] },
			body: '',
			visibility: 'player-visible',
		},
	});
	expect(result.status).toBe('rejected');
	expect(result.rejection?.message).toMatch(/read.only/i);
	await exitPreview(page);
	await expect(page.getByRole('heading', { name: 'Blocked preview quest' })).toHaveCount(0);
});
