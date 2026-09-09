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

// RC-CLD-2.4 — CROSS-DEVICE MERGE. Two devices hold the same campaign and both change the same scene
// after they last matched. This drives the merge through the real UI end to end: a scene created here
// through the Scenes form is this device's edit, the other device's edit arrives as the decrypted
// cloud operation the transport would hand the core, and the core's comparison has to surface as a
// resolvable conflict on Settings › Sync — not as a silent overwrite, which is what the sync-api's
// first-writer-wins storage did before this story.
//
// The cloud transport itself is not exercised here: an e2e build carries no cloud configuration, so
// there is no sync-api to reach. What is exercised is everything the transport hands over to — the
// core comparison, the durable conflict record, the screen, and the DM's choice.
test.describe('sync: cross-device merge', () => {
	test('a second device’s edit to the same scene becomes a conflict the DM resolves', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);

		await page.goto('/#/scenes', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		// Device A (this one): author a scene through the real create form.
		const sceneName = `Merge Hall ${Date.now()}`;
		await page.fill('#scene-name', sceneName);
		await page.click('button[type="submit"]');
		await page.waitForFunction(
			(name) => Object.values(window.__rt!.state.scenes.scenes).some((s) => s.name === name),
			sceneName,
			{ timeout: 10_000 },
		);

		// Device B: an operation on the SAME scene that this device has never seen, at the revision
		// this device's own edit occupies. That is exactly the shape the pull path decrypts.
		const merged = await page.evaluate(async () => {
			const rt = window.__rt!;
			const ops = rt.state.sync.operations as Array<Record<string, unknown>>;
			const mine = ops[ops.length - 1]!;
			const result = await rt.dispatch({
				type: 'sync.merge-remote',
				actorId: rt.defaultActorId,
				payload: {
					baseRevision: ops.length - 2,
					remoteOperations: [
						{
							id: rt.newId(),
							vaultId: String(mine.vaultId),
							sourceId: 'other-device',
							actorId: String(mine.actorId),
							entityType: String(mine.entityType),
							entityId: String(mine.entityId),
							opType: String(mine.opType),
							path: typeof mine.path === 'string' ? mine.path : undefined,
							value: { name: 'Named on the other device' },
							dependencies: [],
							issuedAt: new Date().toISOString(),
							schemaVersion: 1,
						},
					],
				},
			});
			return {
				status: result.status,
				event: (result.events ?? []).find((e) => e.kind === 'sync.merge-recorded') ?? null,
			};
		});
		expect(merged.status).toBe('accepted');
		expect(merged.event).toMatchObject({ outcome: 'diverged', conflictCount: 1 });

		// The conflict is durable campaign state, so it is on the screen after a real reload.
		await page.goto('/#/settings?tab=sync', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.getByText('Sync conflicts', { exact: true })).toBeVisible();
		const conflicts = page.locator('[data-testid="sync-conflict"]');
		await expect(conflicts).toHaveCount(1);
		await expect(conflicts.first()).toContainText('This device');
		await expect(conflicts.first()).toContainText('Other device');
		await expect(conflicts.first()).toContainText('Named on the other device');

		// The DM chooses a version. That dispatches the same DM-only resolution command every other
		// conflict in the vault uses, so the record closes and the panel empties.
		await conflicts
			.first()
			.getByRole('button', { name: 'Keep the other device’s version' })
			.click();
		await expect(conflicts).toHaveCount(0);
		await expect(page.getByText('Sync conflicts', { exact: true })).toHaveCount(0);

		// And it stays closed across a reload: the resolution is an operation, not screen state.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.locator('[data-testid="sync-conflict"]')).toHaveCount(0);
	});
});
