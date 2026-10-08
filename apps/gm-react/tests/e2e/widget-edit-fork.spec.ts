import { builderStep } from './_widget-builder';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * RC-WID-6.6 — DRAFTS SURVIVE, AND EVERY TILE CAN BECOME YOURS.
 *
 * Acceptance, driven through the real UI on both profiles:
 *  - Escape on a dirty builder draft asks Keep or Discard; kept, reopening the builder resumes it
 *    (also after leaving the screen that opened it), and discarded it is gone.
 *  - "Edit widget" on a placed Torchlight starter copies it into a user package and moves the tile
 *    onto it, opens the builder on Advanced (custom code), a code edit saves as that new user package,
 *    and the tile draws the change. Closed without saving, the tile goes back to Torchlight and the
 *    copy is reused next time. The starter itself is untouched.
 */

interface PackageLite {
	enabled: boolean;
	removedAt: string | null;
	trust: { state: string };
	package: {
		id: string;
		version: string;
		authoring?: {
			source: string;
			forkedFrom?: { packageId: string; version: string; widgetType: string };
		};
		widgets: Array<{ type: string; renderEntrypoint?: { runtime: string } }>;
		assets: Array<{ path: string; content?: string }>;
	};
}

function packageRecord(page: Page, id: string): Promise<PackageLite | null> {
	return page.evaluate(
		(packageId) =>
			(window.__rt!.state.widgets as { packages: Record<string, PackageLite> }).packages[
				packageId
			] ?? null,
		id,
	);
}

async function accept(page: Page, command: Record<string, unknown>) {
	const result = await dispatch(page, command);
	expect(result.status, `${command.type}: ${JSON.stringify(result.rejection)}`).toBe('accepted');
}

test.describe('widget builder drafts (RC-WID-6.6)', () => {
	test('Escape on a dirty draft asks Keep or Discard, and reopening resumes a kept one', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		const opener = page.getByRole('button', { name: 'Build a widget', exact: true });
		const builder = page.getByRole('dialog', { name: /Widget builder/ });
		const keep = page.getByRole('dialog', { name: 'Keep this draft?' });
		const resume = page.getByRole('dialog', { name: 'Resume your draft?' });

		// An untouched builder closes on Escape without a question.
		await opener.click();
		await expect(builder).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(builder).toHaveCount(0);
		await expect(keep).toHaveCount(0);

		await opener.click();
		await builder.getByLabel('Name', { exact: true }).fill('Lantern list');
		await builderStep(builder, 'Data');
		await page.keyboard.press('Escape');
		await expect(keep).toBeVisible();
		await expect(keep).toContainText('Lantern list');
		// Escape on the question means "not yet": back in the builder, the work intact.
		await page.keyboard.press('Escape');
		await expect(keep).toHaveCount(0);
		await expect(builder).toBeVisible();
		await expect(builder.getByRole('button', { name: /Step 3 of 8.*Data/ })).toBeVisible();

		await page.keyboard.press('Escape');
		await keep.getByRole('button', { name: 'Keep draft', exact: true }).click();
		await expect(builder).toHaveCount(0);
		await expect(opener).toBeFocused();
		const packageIds = () =>
			page.evaluate(() => Object.keys(window.__rt!.state.widgets.packages).sort());
		const before = await packageIds();

		// Kept beyond the screen that opened it: leave Extensions in the app and come back.
		await page.evaluate(() => {
			window.location.hash = '#/scenes';
		});
		await expect(opener).toHaveCount(0);
		await page.evaluate(() => {
			window.location.hash = '#/extensions';
		});
		await opener.click();
		await expect(resume).toBeVisible();
		await expect(resume).toContainText('Lantern list');
		await resume.getByRole('button', { name: 'Resume draft', exact: true }).click();
		await expect(resume).toHaveCount(0);
		// Answered, focus is in the builder, not lost behind it.
		await expect(builder).toBeFocused();
		await expect(builder.getByRole('button', { name: /Step 3 of 8.*Data/ })).toBeVisible();
		await builderStep(builder, 'Identity');
		await expect(builder.getByLabel('Name', { exact: true })).toHaveValue('Lantern list');
		// Keeping a draft installs nothing.
		expect(await packageIds()).toEqual(before);

		// Discarded, it is gone: the next builder starts empty with no question.
		await page.keyboard.press('Escape');
		await keep.getByRole('button', { name: 'Discard draft', exact: true }).click();
		await expect(builder).toHaveCount(0);
		await opener.click();
		await expect(builder).toBeVisible();
		await expect(resume).toHaveCount(0);
		await expect(builder.getByLabel('Name', { exact: true })).toHaveValue('');
	});
});

test.describe('Edit widget on a tile (RC-WID-6.6)', () => {
	test('"Edit widget" on the Torchlight starter saves a code edit as a new user package and the tile shows it', async ({
		page,
	}) => {
		test.setTimeout(90_000);
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await gotoRoute(page, '/extensions');
		await page.getByRole('button', { name: 'Install Torchlight' }).click();
		await expect(page.getByTestId('package-card-starter.torchlight')).toBeVisible();
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		await accept(page, {
			type: 'widget.package.review',
			actorId,
			payload: { packageId: 'starter.torchlight', trustState: 'trusted' },
		});
		await accept(page, {
			type: 'widget.package.enable',
			actorId,
			payload: { packageId: 'starter.torchlight' },
		});
		await accept(page, {
			type: 'scene.create',
			actorId,
			payload: { name: 'Torch shelf', description: '', visibility: 'dm-only', tags: [] },
		});
		const sceneId = (await page.evaluate(
			() =>
				Object.values(window.__rt!.state.scenes.scenes).find(
					(scene) => scene.name === 'Torch shelf',
				)?.id ?? null,
		))!;
		await accept(page, {
			type: 'scene.add-widget',
			actorId,
			payload: {
				sceneId,
				widget: {
					type: 'torchlight',
					version: '1.0.0',
					layout: { x: 40, y: 40, w: 320, h: 260 },
					configuration: {},
					localState: {},
					binding: null,
				},
			},
		});
		const widgetId = await page.evaluate(
			(id) => window.__rt!.state.scenes.scenes[id]!.widgets[0]!.id,
			sceneId,
		);
		const starterBefore = await packageRecord(page, 'starter.torchlight');

		const tileType = () =>
			page.evaluate(
				([id, widget]) =>
					window.__rt!.state.scenes.scenes[id]!.widgets.find((w) => w.id === widget)?.type,
				[sceneId, widgetId],
			);
		const packageIds = () =>
			page.evaluate(() => Object.keys(window.__rt!.state.widgets.packages).sort());

		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		const tile = page.getByTestId(`widget-${widgetId}`);
		const editWidget = async () => {
			await tile.getByTestId('tile-actions-trigger').click();
			await page.getByRole('menuitem', { name: 'Edit widget', exact: true }).click();
		};
		const builder = page.getByRole('dialog', { name: /Widget builder/ });

		// Closed without saving, the tile goes back to Torchlight; the copy waits, unplaced.
		await editWidget();
		await expect(builder).toBeVisible();
		await expect.poll(tileType).toBe('torchlight-copy');
		await page.keyboard.press('Escape');
		await expect(builder).toHaveCount(0);
		await expect.poll(tileType).toBe('torchlight');
		const afterFirstCopy = await packageIds();
		expect(afterFirstCopy).toContain('user.torchlight');

		// The second edit reuses that copy rather than making another.
		await editWidget();

		// The starter's copy is a package of the GM's own, off until it is saved: custom code is
		// never trusted on the GM's word (RC-WID-6.2). The tile is on it, "disabled, preserved".
		await expect(builder).toBeVisible();
		await expect.poll(tileType).toBe('torchlight-copy');
		expect(await packageIds()).toEqual(afterFirstCopy);
		await expect(builder.getByRole('button', { name: /Step 7 of 8.*Advanced/ })).toBeVisible();
		const copy = (await packageRecord(page, 'user.torchlight'))!;
		expect(copy.package.authoring).toMatchObject({
			source: 'user-authored',
			forkedFrom: { packageId: 'starter.torchlight', version: '1.0.0', widgetType: 'torchlight' },
		});
		expect(copy.trust.state).toBe('unreviewed');
		expect(copy.enabled).toBe(false);

		// The code edit: the pause button's words, in the markup editor.
		const code = builder.getByTestId('widget-builder-code');
		const markup = await code.inputValue();
		expect(markup).toContain('Pause flicker');
		await code.fill(markup.replace('Pause flicker', 'Hold the flame'));
		await builderStep(builder, 'Review');
		await builder.getByRole('button', { name: 'Save new version', exact: true }).click();
		await expect(builder).toHaveCount(0);

		// Saved as the new user package, turned on, and the placed tile still on it.
		await expect
			.poll(async () => (await packageRecord(page, 'user.torchlight'))?.package.version)
			.toBe('1.0.1');
		const saved = (await packageRecord(page, 'user.torchlight'))!;
		expect(saved.enabled).toBe(true);
		expect(saved.package.authoring?.source).toBe('user-authored');
		expect(saved.package.authoring?.forkedFrom?.packageId).toBe('starter.torchlight');
		expect(saved.package.widgets[0]!.type).toBe('torchlight-copy');
		expect(await tileType()).toBe('torchlight-copy');
		// The starter is exactly as it was.
		expect(await packageRecord(page, 'starter.torchlight')).toEqual(starterBefore);

		// The tile draws the edit: the copy's own code, running in its sandbox.
		const frame = page.frameLocator(
			`[data-testid="widget-${widgetId}"] iframe[data-widget-sandbox="torchlight-copy"]`,
		);
		await expect(frame.getByRole('button', { name: 'Hold the flame' })).toBeVisible();
		// Its stylesheet and script came along: the script draws the reading, the meter is styled.
		await expect(frame.locator('[data-reading]')).toContainText('of 10');
	});
});
