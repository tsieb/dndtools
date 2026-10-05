import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/knowledge');
	await seedFresh(page);
	await page.goto('/#/knowledge');
	await waitReady(page);
});

test('capture focuses the body and flushes a sub-second departure', async ({ page }) => {
	const title = `Quick capture ${Date.now()}`;
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	const titleField = page.getByPlaceholder('New note title…');
	await expect(titleField).toBeFocused();
	await titleField.fill(title);
	await titleField.press('Enter');
	const body = page.getByRole('textbox', { name: 'Note body', exact: true });
	await expect(body).toBeFocused();
	const url = page.url();
	await expect(page.getByLabel('Preview', { exact: true })).toHaveCount(0);
	const prose = 'First line captured immediately.\nSecond line must survive too.';
	await body.fill(prose);
	// No debounce wait: the very next browser action leaves the route.
	await page.evaluate(() => {
		window.location.hash = '/knowledge';
	});
	await expect(body).toHaveCount(0);
	await page.evaluate((target) => {
		window.location.hash = new URL(target).hash;
	}, url);
	await expect(page.locator('.knowledge-prose')).toContainText('Second line must survive too.');
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await expect(body).toBeFocused();
	await expect(body).toHaveValue(prose);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	await page.reload();
	await waitReady(page);
	await expect(page.locator('.knowledge-prose')).toContainText('Second line must survive too.');
});

test('visibility flushes and failed navigation keeps the draft unless discarded', async ({
	page,
}) => {
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.getByPlaceholder('New note title…').fill('Lifecycle capture');
	await page.getByPlaceholder('New note title…').press('Enter');
	const body = page.getByRole('textbox', { name: 'Note body', exact: true });
	await body.fill('Hidden draft');
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
	await page.evaluate(() => {
		const runtime = window.__rt!;
		const dispatch = runtime.dispatch.bind(runtime);
		runtime.dispatch = async (command) => {
			if (command.type === 'content.update-item') throw new Error('Storage unavailable');
			return dispatch(command);
		};
	});
	await body.fill('Unsaved draft after storage failure');
	page.once('dialog', (dialog) => dialog.dismiss());
	await page.getByRole('button', { name: 'Notes', exact: true }).click();
	await expect(body).toHaveValue('Unsaved draft after storage failure');
	await expect(page.getByRole('alert')).toBeVisible();
});

test('navigation drains edits made while a save is in flight', async ({ page }) => {
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.getByPlaceholder('New note title…').fill('Concurrent capture');
	await page.getByPlaceholder('New note title…').press('Enter');
	const body = page.getByRole('textbox', { name: 'Note body', exact: true });
	await expect(body).toBeFocused();
	const url = page.url();
	await page.evaluate(() => {
		const runtime = window.__rt!;
		const dispatch = runtime.dispatch.bind(runtime);
		runtime.dispatch = async (command) => {
			if (command.type === 'content.update-item')
				await new Promise((resolve) => setTimeout(resolve, 250));
			return dispatch(command);
		};
	});
	await body.fill('First draft');
	await page.evaluate(() => {
		window.dispatchEvent(new Event('beforeunload'));
	});
	await body.fill('First draft and the last paragraph');
	await page.getByRole('button', { name: 'Notes', exact: true }).click();
	await expect(body).toHaveCount(0);
	await page.evaluate((target) => {
		window.location.hash = new URL(target).hash;
	}, url);
	await expect(page.locator('.knowledge-prose')).toHaveText('First draft and the last paragraph');
	await page.reload();
	await waitReady(page);
	await expect(page.locator('.knowledge-prose')).toHaveText('First draft and the last paragraph');
});

test('confirmed deletion discards a pending draft without a leave warning', async ({ page }) => {
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.getByPlaceholder('New note title…').fill('Delete pending capture');
	await page.getByPlaceholder('New note title…').press('Enter');
	const body = page.getByRole('textbox', { name: 'Note body', exact: true });
	await body.fill('Discard this draft when deleting');
	const prompts: string[] = [];
	page.on('dialog', async (dialog) => {
		prompts.push(dialog.message());
		await dialog.dismiss();
	});
	await page.getByRole('button', { name: 'More note actions', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(body).toHaveCount(0);
	await expect(page.getByRole('status').filter({ hasText: 'deleted' })).toBeVisible();
	expect(prompts).toEqual([]);
});

for (const delay of [0, 250]) {
	test(`actual reload recovers the full pending draft with ${delay}ms writes`, async ({ page }) => {
		await page.getByRole('button', { name: 'New note', exact: true }).first().click();
		await page.getByPlaceholder('New note title…').fill('Reload capture');
		await page.getByPlaceholder('New note title…').press('Enter');
		const body = page.getByRole('textbox', { name: 'Note body', exact: true });
		await expect(body).toBeFocused();
		await page.evaluate((ms) => {
			const runtime = window.__rt!;
			const dispatch = runtime.dispatch.bind(runtime);
			runtime.dispatch = async (command) => {
				if (command.type === 'content.update-item' && ms)
					await new Promise((resolve) => setTimeout(resolve, ms));
				return dispatch(command);
			};
		}, delay);
		const prose = 'Full pending paragraph.\nThe final line survives document destruction.';
		await body.fill(prose);
		await page.reload();
		await waitReady(page);
		// Recovery opens the draft; if the core write won the race, open the saved note.
		await expect(body.or(page.getByRole('button', { name: 'Edit', exact: true }))).toBeVisible();
		if (await page.getByRole('button', { name: 'Edit', exact: true }).count())
			await page.getByRole('button', { name: 'Edit', exact: true }).click();
		await expect(body).toHaveValue(prose);
		await expect(body).toBeFocused();
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
		await page.reload();
		await waitReady(page);
		await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
		await expect(page.locator('.knowledge-prose')).toContainText(
			'The final line survives document destruction.',
		);
	});
}

test('recovered drafts preserve conflict detection and can be discarded', async ({ page }) => {
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await page.getByPlaceholder('New note title…').fill('Conflict recovery');
	await page.getByPlaceholder('New note title…').press('Enter');
	const body = page.getByRole('textbox', { name: 'Note body', exact: true });
	await body.fill('Recovered local draft');
	// Simulate another author advancing the durable note before this document is destroyed.
	await page.evaluate(async () => {
		const runtime = window.__rt!;
		const key = Object.keys(localStorage).find((entry) => entry.startsWith('note-draft:'))!;
		const [, , itemId] = JSON.parse(key.slice('note-draft:'.length));
		const draft = JSON.parse(localStorage.getItem(key)!);
		await runtime.dispatch({
			type: 'content.update-item',
			actorId: runtime.defaultActorId,
			payload: {
				itemId,
				title: 'Conflict recovery',
				body: 'Other author version',
				baseRevision: draft.baseRevision,
			},
		});
		// Leave flushing cannot succeed, so the draft must survive separately from that version.
		runtime.dispatch = async () => {
			throw new Error('Storage unavailable');
		};
	});
	page.on('dialog', (dialog) => dialog.accept());
	await page.reload();
	await waitReady(page);
	await expect(body).toHaveValue('Recovered local draft');
	await expect(page.getByRole('button', { name: 'Keep my version', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await page.reload();
	await waitReady(page);
	await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
	await expect(page.locator('.knowledge-prose')).toHaveText('Other author version');
});
