import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, ops, seedFresh, waitReady } from './_helpers';

// SYNC — local-first persistence + op-log growth. A real UI action (the Scenes create form) flows
// through the runtime's single dispatch choke point, appends to the durable op-log, and the change
// survives a full reload round-trip against real IndexedDB (Dexie DB `dndtools-v2`).

test.describe('sync: local-first op-log persistence', () => {
	test('a UI-authored scene grows the op-log and survives reload', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);

		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const sceneName = `Sync Crypt ${Date.now()}`;
		const before = await ops(page);
		expect(before).toBeGreaterThanOrEqual(0);

		// Real UI action: fill the create form and submit (no __rt.dispatch shortcut).
		await page.fill('#scene-name', sceneName);
		await page.click('button[type="submit"]');

		// The command reached Core state...
		await page.waitForFunction(
			(name) => Object.values(window.__rt!.state.scenes.scenes).some((s) => s.name === name),
			sceneName,
			{ timeout: 10_000 },
		);
		const after = await ops(page);
		expect(after).toBeGreaterThan(before);

		// ...and it survives a real reload (persistFullState round-trip).
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const persisted = await page.evaluate(
			(name) => Object.values(window.__rt!.state.scenes.scenes).some((s) => s.name === name),
			sceneName,
		);
		expect(persisted).toBe(true);
		expect(await ops(page)).toBeGreaterThanOrEqual(after);
	});
});
