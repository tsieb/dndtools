import { expect, test, type Page } from '@playwright/test';

/**
 * SYNC-001 — local-first, zero-network core workflows.
 *
 * ADR-014 ships the v2 app as a static SPA running the Processing Core in the browser over a local
 * IndexedDB adapter, with no server-owned state and no cloud transport. So a user can open, read,
 * search, edit, and run core vault/session workflows with ZERO NETWORK for content already on the
 * device (Architecture Contract 2 Local-First Invariant). Network loss never blocks local command
 * execution.
 *
 * Each test loads the route online, then puts the browser CONTEXT OFFLINE (`context.setOffline(true)`)
 * and runs a core edit → read → search workflow ON THAT ROUTE, asserting every step succeeds offline.
 * (The static-preview document fetch IS the network in this harness, so the tests stay on one route
 * per workflow and assert the in-page local-first behavior rather than a hard document reload; a real
 * installed/cached app serves the shell from cache.)
 *
 * The surfaces are presentation-equivalent across profiles, so the same testids run on BOTH projects
 * (desktop-chromium AND mobile-chromium).
 */

async function freshAt(page: Page, route: string, readyTestId: string) {
	await page.goto(route);
	await page.getByTestId(readyTestId).waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId(readyTestId).waitFor({ state: 'visible' });
}

test.describe('SYNC-001 zero-network core workflow', () => {
	test('a Scene create (edit) → list (read) workflow succeeds entirely offline', async ({
		page,
		context,
	}) => {
		// Load + seed the vault online first (the content is now "on the device").
		await freshAt(page, '/scenes/', 'scene-name');
		await page.getByTestId('scene-name').fill('Offline Lair');
		await page.getByTestId('scene-create').click();
		await expect(page.getByTestId('scene-list').getByText('Offline Lair')).toBeVisible();

		// Go OFFLINE — the device now has no network. Core workflows must keep working.
		await context.setOffline(true);
		try {
			// EDIT — a durable local write while offline is accepted into the local store, and the
			// command lifecycle reports success only after the local write commits.
			await page.getByTestId('scene-name').fill('Offline Encounter');
			await page.getByTestId('scene-create').click();
			const lifecycle = page.getByTestId('create-lifecycle');
			await expect(lifecycle).toHaveAttribute('data-status', 'success');

			// READ — both the seeded and the offline-written Scene are present in the local list.
			await expect(page.getByTestId('scene-list').getByText('Offline Lair')).toBeVisible();
			await expect(page.getByTestId('scene-list').getByText('Offline Encounter')).toBeVisible();
		} finally {
			await context.setOffline(false);
		}
	});

	test('a note create → edit → save → search workflow succeeds entirely offline', async ({
		page,
		context,
	}) => {
		await freshAt(page, '/knowledge/', 'knowledge-view');

		await context.setOffline(true);
		try {
			// EDIT — create + edit + save a note while offline (durable local write).
			await page.getByTestId('note-new-title').fill('Offline Session Log');
			await page.getByTestId('note-new-visibility').selectOption('dm-only');
			await page.getByTestId('note-create').click();
			await expect(page.getByTestId('note-editor')).toContainText('Editing: Offline Session Log');
			await page.getByTestId('note-body').fill('The party explores the cavern.');
			await expect(page.getByTestId('note-validation-ok')).toBeVisible();
			await page.getByTestId('note-save').click();
			await expect(page.getByTestId('note-save-status-value')).toHaveText('success');

			// SEARCH + READ — the local content index serves the note offline.
			await page.getByTestId('notes-search').fill('Offline');
			await expect(page.getByTestId('notes-list')).toContainText('Offline Session Log');
		} finally {
			await context.setOffline(false);
		}
	});
});
