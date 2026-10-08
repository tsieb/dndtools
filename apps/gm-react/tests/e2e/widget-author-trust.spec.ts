import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-WID-6.2 — a GM's own template widget installs enabled and lands on the screen. Both profiles:
// Add → Build your own → name, template, source → Install places the tile on the board, selected,
// focused and announced, without a visit to Extensions. A custom-code build still ends in the trust
// sheet, which now opens over the builder, and the gallery can switch a disabled package on in place.

interface PackageLite {
	enabled: boolean;
	trust: { state: string; basis?: string; reviewedBy: string | null };
}

function packageRecord(page: Page, id: string): Promise<PackageLite | null> {
	return page.evaluate(
		(packageId) =>
			((window.__rt!.state.widgets as { packages: Record<string, PackageLite> }).packages[
				packageId
			] ?? null) as PackageLite | null,
		id,
	);
}

/** Open the GM's board in edit mode; returns the route it settled on (the board is a screen). */
async function editBoard(page: Page): Promise<string> {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board');
	await waitReady(page);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
	return new URL(page.url()).hash;
}

/** The placed copies of a widget type on the home board, by instance id. */
function placed(page: Page, type: string): Promise<string[]> {
	return page.evaluate((widgetType) => {
		const rt = window.__rt!;
		const scene = rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!]!;
		return scene.widgets.filter((w) => w.type === widgetType).map((w) => w.id);
	}, type);
}

/** The single placed copy's frame, once there is exactly one. */
async function placedFrame(page: Page, type: string): Promise<Locator> {
	await expect.poll(() => placed(page, type)).toHaveLength(1);
	const [id] = await placed(page, type);
	return page.getByTestId(`widget-${id}`);
}

/** Every pointer action the GM takes is counted, so the budget is the real one. */
function counter() {
	let clicks = 0;
	return {
		click: async (target: Locator) => {
			clicks += 1;
			await target.click();
		},
		select: async (target: Locator, value: string) => {
			clicks += 1;
			await target.selectOption(value);
		},
		get count() {
			return clicks;
		},
	};
}

const gallery = (page: Page) => page.getByTestId('add-widget-gallery');
const builder = (page: Page) => page.getByRole('dialog', { name: /Widget builder/ });

test('Full builder from Quick still installs and places an author-trusted template', async ({
	page,
}) => {
	const route = await editBoard(page);
	const gm = counter();

	await gm.click(page.getByRole('button', { name: 'Add', exact: true }));
	await gm.click(gallery(page).getByRole('button', { name: 'Build your own' }));
	await gm.click(page.getByTestId('quick-builder').getByRole('button', { name: 'More options' }));
	const dialog = builder(page);
	await gm.click(dialog.getByRole('button', { name: 'Identity', exact: true }));
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Name', { exact: true }).fill('Party HP');
	await gm.click(dialog.getByRole('button', { name: 'Data', exact: true }));
	await gm.select(dialog.getByLabel('Template kind'), 'data-table');
	await gm.click(dialog.getByRole('button', { name: 'Add data query' }));
	await gm.select(dialog.getByLabel('Source'), 'visible-characters');
	await gm.click(dialog.getByRole('button', { name: 'Review', exact: true }));
	await gm.click(dialog.getByRole('button', { name: 'Install widget' }));

	expect(gm.count).toBeLessThanOrEqual(10);
	await expect(dialog).toHaveCount(0);
	// No trust sheet and no Extensions: the board is still the route.
	await expect(page.getByRole('dialog', { name: /^Review / })).toHaveCount(0);
	expect(new URL(page.url()).hash).toBe(route);

	// On the board: a new tile, focused, selected and announced.
	const added = await placedFrame(page, 'party-hp');
	await expect(added).toHaveAttribute('aria-label', /^Party HP, /);
	await expect(added).toBeFocused();
	await expect(added.getByTestId('tile-selection-chip')).toBeVisible();
	await expect(page.getByTestId('add-widget-announcement')).toHaveText('Added Party HP');
	const box = (await added.boundingBox())!;
	const viewport = page.viewportSize()!;
	expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
	expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

	// Trusted on the installing DM's word, with the audit entry to say so.
	const record = await packageRecord(page, 'workspace.party-hp');
	const dmId = await page.evaluate(() => window.__rt!.defaultActorId);
	expect(record).toMatchObject({
		enabled: true,
		trust: { state: 'trusted', basis: 'author', reviewedBy: dmId },
	});
	const audit = await page.evaluate(() =>
		window
			.__rt!.state.sync.operations.filter(
				(op) => op.entityId === 'workspace.party-hp' && op.opType === 'widget.package.review',
			)
			.map((op) => op.value),
	);
	expect(audit).toEqual([expect.objectContaining({ trustState: 'trusted', basis: 'author' })]);
});

test('a custom-code build still ends in the trust sheet, which allows and enables in place', async ({
	page,
}) => {
	const route = await editBoard(page);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await gallery(page).getByRole('button', { name: 'Build your own' }).click();
	await page.getByTestId('quick-builder').getByRole('button', { name: 'More options' }).click();
	const dialog = builder(page);
	await dialog.getByRole('button', { name: 'Identity', exact: true }).click();
	await dialog.getByLabel('Name', { exact: true }).fill('Torch card');
	await dialog.getByRole('button', { name: 'Advanced', exact: true }).click();
	await dialog.getByRole('radio', { name: 'Custom HTML and JavaScript' }).click();
	await dialog.getByRole('button', { name: 'Review', exact: true }).click();
	await dialog.getByRole('button', { name: 'Install widget' }).click();

	// Installed on the fail-closed path, and the review sheet is up over the builder.
	const sheet = page.getByRole('dialog', { name: 'Review Torch card' });
	await expect(sheet).toBeVisible();
	await expect(dialog).toBeVisible();
	expect(await packageRecord(page, 'workspace.torch-card')).toMatchObject({
		enabled: false,
		trust: { state: 'unreviewed' },
	});
	expect((await packageRecord(page, 'workspace.torch-card'))!.trust.basis).toBeUndefined();

	// Trusting it there enables it and places it, still without leaving the board.
	await sheet.getByRole('button', { name: 'Allow and enable' }).click();
	await expect(dialog).toHaveCount(0);
	await expect
		.poll(async () => (await packageRecord(page, 'workspace.torch-card'))?.enabled)
		.toBe(true);
	expect((await packageRecord(page, 'workspace.torch-card'))!.trust.state).toBe('trusted');
	await expect(await placedFrame(page, 'torch-card')).toBeFocused();
	await expect(page.getByTestId('add-widget-announcement')).toHaveText('Added Torch card');
	expect(new URL(page.url()).hash).toBe(route);
});

test('the gallery switches a disabled template package on in place; code still needs review', async ({
	page,
}) => {
	await editBoard(page);
	const dmId = await page.evaluate(() => window.__rt!.defaultActorId);
	// Installed the old way (no author trust): unreviewed and off.
	for (const [id, name, runtime] of [
		['workspace.quiet-list', 'Quiet list', 'template'],
		['workspace.code-card', 'Code card', 'custom-html-js'],
	] as const) {
		const widget = {
			type: id.split('.')[1],
			version: '1.0.0',
			displayName: name,
			author: 'user',
			renderEntrypoint:
				runtime === 'template'
					? { runtime, template: 'status-list', hostApiVersion: 1 }
					: { runtime, sandbox: 'iframe', assetPath: 'index.html', hostApiVersion: 1 },
			placement: { surfaces: ['scene'], libraryListed: true },
			supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
			defaultSize: { width: 360, height: 260 },
			minSize: { width: 220, height: 160 },
			resizePolicy: 'free',
			requiredBindings: [],
			optionalBindings: [],
			configurationSchema: { type: 'object', additionalProperties: true },
			runtimeStateSchema: { type: 'object', additionalProperties: true },
			capabilitySets: ['manager', 'operator', 'viewer'],
			commands: [],
			events: [],
			hostPermissions: [],
		};
		const installed = await dispatch(page, {
			type: 'widget.package.install',
			actorId: dmId,
			payload: {
				package: {
					id,
					version: '1.0.0',
					displayName: name,
					widgets: [widget],
					migrations: [],
					assets:
						runtime === 'template'
							? []
							: [{ path: 'index.html', kind: 'html', entrypoint: true, content: '<p>x</p>' }],
					portabilityWarnings: [],
				},
			},
		});
		expect(installed.status, JSON.stringify(installed)).toBe('accepted');
	}

	await page.getByRole('button', { name: 'Add', exact: true }).click();
	const quiet = gallery(page).getByRole('button', { name: 'Add Quiet list', exact: true });
	await expect(quiet).toHaveAttribute('aria-disabled', 'true');
	await expect(
		gallery(page).getByRole('button', { name: 'Enable Code card', exact: true }),
	).toHaveCount(0);

	await gallery(page).getByRole('button', { name: 'Enable Quiet list', exact: true }).click();
	await expect(page.getByTestId('add-widget-announcement')).toHaveText(
		'Quiet list is on. Pick it to add it.',
	);
	await expect(quiet).not.toHaveAttribute('aria-disabled', 'true');
	await expect(quiet).toBeFocused();
	await expect(
		gallery(page).getByRole('button', { name: 'Enable Quiet list', exact: true }),
	).toHaveCount(0);
	expect(await packageRecord(page, 'workspace.quiet-list')).toMatchObject({
		enabled: true,
		trust: { state: 'unreviewed' },
	});

	await quiet.click();
	await expect(await placedFrame(page, 'quiet-list')).toBeFocused();
	await expect(page.getByTestId('add-widget-announcement')).toHaveText('Added Quiet list');
});
