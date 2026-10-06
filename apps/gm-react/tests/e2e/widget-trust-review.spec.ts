import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/**
 * TRUST REVIEW — RC-WID-1.5. An installed widget package can reach nothing until the DM reviews it.
 * These tests walk that path the way a DM does: open the review sheet of a package that asks for
 * something, allow it (RC-WID-6.7: "Allow and enable" also turns it on), and place it on a scene. A
 * bundled starter that asks for nothing owes no review and installs on.
 *
 * The second test is the one with teeth: a package that asks for the clipboard is told "undeclared"
 * by the sandbox host before the review, and "available" after the DM allows it in the sheet — read
 * from INSIDE the sandboxed frame, which is the only place that proves the grant is real.
 */

const STARTER_NAME = 'Table Roller';
const STARTER_ID = 'starter.table-roller';
const CLIPBOARD_ID = 'workspace.clipwidget';

async function actorId(page: Page): Promise<string> {
	return page.evaluate(() => window.__rt!.defaultActorId);
}

function trustState(page: Page, packageId: string) {
	return page.evaluate((id) => window.__rt!.state.widgets.packages[id]?.trust ?? null, packageId);
}

async function createScene(page: Page, name: string): Promise<string> {
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId: await actorId(page),
		payload: { name, description: '', visibility: 'dm-only', tags: [] },
	});
	expect(created.status, JSON.stringify(created.rejection)).toBe('accepted');
	const id = await page.evaluate(
		(sceneName) =>
			Object.values(window.__rt!.state.scenes.scenes).find((scene) => scene.name === sceneName)
				?.id ?? null,
		name,
	);
	expect(id).toBeTruthy();
	return id!;
}

async function placeWidget(page: Page, sceneId: string, type: string) {
	const added = await dispatch(page, {
		type: 'scene.add-widget',
		actorId: await actorId(page),
		payload: {
			sceneId,
			widget: {
				type,
				version: '1.0.0',
				layout: { x: 40, y: 40, w: 320, h: 200 },
				configuration: {},
				localState: {},
				binding: null,
			},
		},
	});
	expect(added.status, JSON.stringify(added.rejection)).toBe('accepted');
}

/** A custom widget that asks the host for the clipboard and reports the answer it gets. */
const CLIPBOARD_PACKAGE = {
	id: CLIPBOARD_ID,
	version: '1.0.0',
	displayName: 'Clip widget',
	widgets: [
		{
			type: 'clipwidget',
			version: '1.0.0',
			displayName: 'Clip widget',
			author: 'workspace',
			renderEntrypoint: {
				runtime: 'custom-html-js',
				sandbox: 'iframe',
				assetPath: 'widgets/clipwidget/index.html',
				hostApiVersion: 1,
			},
			supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
			defaultSize: { width: 320, height: 200 },
			minSize: { width: 200, height: 120 },
			resizePolicy: 'free',
			requiredBindings: [],
			optionalBindings: [],
			configurationSchema: { type: 'object', additionalProperties: true },
			runtimeStateSchema: { type: 'object', additionalProperties: true },
			capabilitySets: ['manager', 'operator', 'viewer'],
			commands: [],
			events: [],
			hostPermissions: ['clipboard'],
		},
	],
	migrations: [],
	assets: [
		{
			path: 'widgets/clipwidget/index.html',
			kind: 'html',
			entrypoint: true,
			content:
				'<!doctype html><html><body><p data-clipboard>pending</p><script src="./main.js"></script></body></html>',
		},
		{
			path: 'widgets/clipwidget/main.js',
			kind: 'javascript',
			content: `
				var api = window.dndtoolsWidget;
				var out = api.root.querySelector('[data-clipboard]');
				api.requestPermission('clipboard').then(function (answer) {
					out.textContent = 'clipboard: ' + answer.decision;
				});
			`,
		},
	],
	portabilityWarnings: [],
};

test.describe('widget trust review', () => {
	test('a package that asks for something is reviewed, then allowed and enabled in one press', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await gotoRoute(page, '/extensions');
		await waitReady(page);

		// 1. A package that asks for the clipboard lands unreviewed and off — the fail-closed state.
		const installed = await dispatch(page, {
			type: 'widget.package.install',
			actorId: await actorId(page),
			payload: { package: CLIPBOARD_PACKAGE },
		});
		expect(installed.status, JSON.stringify(installed.rejection)).toBe('accepted');
		const card = page.getByTestId(`package-card-${CLIPBOARD_ID}`);
		await expect(card).toBeVisible();
		// RC-WID-6.7 — one status per card, and what it asks for in words.
		await expect(card.getByTestId('package-status')).toHaveText('Needs review');
		await expect(card).toContainText('Asks for: Clipboard.');
		expect(await trustState(page, CLIPBOARD_ID)).toMatchObject({ state: 'unreviewed' });

		// 2. The sheet's verdict is one sentence, and its primary turns the widget on.
		await page.getByRole('button', { name: 'Review Clip widget' }).click();
		const sheet = page.getByRole('dialog');
		await expect(sheet.getByText('Review Clip widget')).toBeVisible();
		await expect(sheet.getByTestId('trust-verdict')).toHaveText(
			'It runs its own code, kept apart from the rest of Lamplight, asks for the permissions below and shows your players nothing.',
		);
		await expect(sheet.getByText('Permissions it asks for')).toBeVisible();
		await sheet.getByRole('button', { name: 'Allow and enable' }).click();
		await expect(sheet).toBeHidden();
		await expect.poll(() => trustState(page, CLIPBOARD_ID)).toMatchObject({ state: 'trusted' });
		await expect
			.poll(() =>
				page.evaluate((id) => window.__rt!.state.widgets.packages[id]?.enabled, CLIPBOARD_ID),
			)
			.toBe(true);
		await expect(card.getByTestId('package-status')).toHaveText('Allowed');
		await expect(card.getByRole('switch', { name: 'Enable Clip widget' })).toBeChecked();

		// 3. Nothing else to do: it places and runs.
		const sceneId = await createScene(page, `Review Scene ${Date.now()}`);
		await placeWidget(page, sceneId, 'clipwidget');
		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.locator('iframe[data-widget-sandbox="clipwidget"]')).toBeVisible();
	});

	test('a bundled starter that asks for nothing installs on, with no review owed', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await gotoRoute(page, '/extensions');
		await waitReady(page);

		await page.getByRole('button', { name: `Install ${STARTER_NAME}` }).click();
		const card = page.getByTestId(`package-card-${STARTER_ID}`);
		await expect(card.getByTestId('package-status')).toHaveText('Bundled · no permissions');
		await expect(card.getByRole('switch', { name: `Enable ${STARTER_NAME}` })).toBeChecked();
		// Nobody reviewed it, and the record says so: on, with every permission still denied.
		const record = await page.evaluate(
			(id) => window.__rt!.state.widgets.packages[id] ?? null,
			STARTER_ID,
		);
		expect(record).toMatchObject({ enabled: true, trust: { state: 'unreviewed' } });
		expect(Object.values(record!.trust.hostPermissions).every((d) => d === 'denied')).toBe(true);
	});

	test('allowing a permission in the review sheet is what unlocks it in the sandbox', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		const actor = await actorId(page);

		const installed = await dispatch(page, {
			type: 'widget.package.install',
			actorId: actor,
			payload: { package: CLIPBOARD_PACKAGE },
		});
		expect(installed.status, JSON.stringify(installed.rejection)).toBe('accepted');
		const enabled = await dispatch(page, {
			type: 'widget.package.enable',
			actorId: actor,
			payload: { packageId: CLIPBOARD_ID },
		});
		expect(enabled.status, JSON.stringify(enabled.rejection)).toBe('accepted');

		const sceneId = await createScene(page, `Clip Scene ${Date.now()}`);
		await placeWidget(page, sceneId, 'clipwidget');

		// Before any review the host tells the widget the capability is not available to it.
		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(
			page.frameLocator('iframe[data-widget-sandbox="clipwidget"]').locator('[data-clipboard]'),
		).toHaveText('clipboard: undeclared');

		// The DM reviews it and allows the clipboard.
		await gotoRoute(page, '/extensions');
		await waitReady(page);
		await page.getByRole('button', { name: 'Review Clip widget' }).click();
		const sheet = page.getByRole('dialog');
		await expect(sheet.getByText('Clipboard', { exact: true })).toBeVisible();
		await expect(sheet.getByRole('radiogroup', { name: 'Clipboard permission' })).toBeVisible();
		await sheet
			.getByRole('radiogroup', { name: 'Clipboard permission' })
			.getByRole('radio', { name: 'Allow' })
			.click();
		await sheet.getByRole('button', { name: 'Allow and enable' }).click();
		await expect(sheet).toBeHidden();
		expect(await trustState(page, CLIPBOARD_ID)).toMatchObject({
			state: 'trusted',
			hostPermissions: expect.objectContaining({ clipboard: 'approved' }),
		});

		// Back on the scene the same widget is now granted the capability it asked for.
		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(
			page.frameLocator('iframe[data-widget-sandbox="clipwidget"]').locator('[data-clipboard]'),
		).toHaveText('clipboard: available');
	});
});

// The review sheet is an overlay over /extensions, so the route-driven axe gate never opens it. It
// gets the same treatment here as the widget builder does: same tags, same blocking impacts.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('widget trust review: accessibility', () => {
	test('the open review sheet has no critical or serious axe violation', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await gotoRoute(page, '/extensions');
		await waitReady(page);
		await page.getByRole('button', { name: `Install ${STARTER_NAME}` }).click();
		await page.getByRole('button', { name: `Review ${STARTER_NAME}` }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		const results = await new AxeBuilder({ page })
			.withTags(AXE_TAGS)
			.include('[role="dialog"]')
			.analyze();
		const blocking = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);
		expect(
			blocking.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`),
		).toEqual([]);
	});
});
