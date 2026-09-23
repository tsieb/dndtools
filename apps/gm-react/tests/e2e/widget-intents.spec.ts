import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * WIDGET INTENTS — RC-WID-5.1. A widget can take its viewer somewhere without writing anything:
 * open a character, start "New map". Two paths, both through the real stack:
 *
 * 1. A DM builds an action panel in the widget builder, declares "Open character" (pointed at a
 *    character through the builder's own picker) and "New map", installs it, and presses both on a
 *    live scene. The first lands on that character; the second lands on the atlas with the map
 *    creation form already open — the same creation flow the home hub and ⌘K use.
 * 2. A custom widget whose trust review DENIED `navigate` asks the host to start "New map". The host
 *    drops the request (the viewer stays where they were), the frame is told why, and the refusal is
 *    in the host's audit log.
 */

interface IntentLite {
	id: string;
	kind: string;
	entityKind?: string;
	target?: string;
	targetId?: string;
}

async function actorId(page: Page): Promise<string> {
	return page.evaluate(() => window.__rt!.defaultActorId);
}

async function createScene(page: Page, name: string): Promise<string> {
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId: await actorId(page),
		payload: { name, description: '', visibility: 'dm-only', tags: [] },
	});
	expect(created.status, created.rejection?.message ?? '').toBe('accepted');
	const id = await page.evaluate(
		(sceneName) =>
			Object.values(window.__rt!.state.scenes.scenes).find((scene) => scene.name === sceneName)
				?.id ?? null,
		name,
	);
	expect(id).toBeTruthy();
	return id!;
}

async function placeWidget(page: Page, sceneId: string, type: string): Promise<string> {
	const added = await dispatch(page, {
		type: 'scene.add-widget',
		actorId: await actorId(page),
		payload: {
			sceneId,
			widget: {
				type,
				version: '1.0.0',
				layout: { x: 40, y: 40, w: 360, h: 240 },
				configuration: {},
				localState: {},
				binding: null,
			},
		},
	});
	expect(added.status, added.rejection?.message ?? '').toBe('accepted');
	const id = await page.evaluate(
		([scene, widgetType]) =>
			(
				window.__rt!.state.scenes.scenes[scene!]!.widgets as Array<{ id: string; type: string }>
			).find((widget) => widget.type === widgetType)?.id ?? null,
		[sceneId, type] as const,
	);
	expect(id).toBeTruthy();
	return id!;
}

test.describe('widget intents: open and create', () => {
	test('a builder-made action panel opens a character and starts "New map"', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);

		const characterName = `Mirabel the Ferrier ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'character.quick-create',
			actorId: await actorId(page),
			payload: { kind: 'npc', name: characterName, visibility: 'player-visible' },
		});
		expect(created.status, created.rejection?.message ?? '').toBe('accepted');
		const characterId = await page.evaluate(
			(name) =>
				Object.values(window.__rt!.state.characters.characters).find(
					(character) => character.name === name,
				)?.id ?? null,
			characterName,
		);
		expect(characterId).toBeTruthy();

		// ── Build it in the real builder: an action panel with two intents.
		await page.getByRole('button', { name: 'Build a widget' }).click();
		const dialog = page.getByRole('dialog', { name: /Widget builder/ });
		await expect(dialog).toBeVisible();
		await dialog.getByLabel('Name', { exact: true }).fill('Table launcher');
		await dialog.getByRole('button', { name: 'Data', exact: true }).click();
		await dialog.getByLabel('Template kind').selectOption('action-panel');

		await dialog.getByRole('button', { name: 'Commands', exact: true }).click();
		await dialog.getByRole('button', { name: 'Open a character', exact: true }).click();
		await dialog.getByRole('button', { name: 'New map', exact: true }).click();
		// A create intent is declared once; the chip says so rather than adding a second.
		await expect(
			dialog.getByRole('button', { name: 'New map — added', exact: true }),
		).toBeDisabled();
		await dialog.getByLabel('Opens', { exact: true }).selectOption({ label: characterName });

		await dialog.getByRole('button', { name: 'Review', exact: true }).click();
		await dialog.getByRole('button', { name: 'Install widget' }).click();
		await expect(dialog).toHaveCount(0);

		const intents = await page.evaluate(
			() =>
				(
					window.__rt!.state.widgets.packages['workspace.table-launcher']?.package.widgets[0] as
						| { intents?: IntentLite[] }
						| undefined
				)?.intents ?? null,
		);
		expect(intents).toEqual([
			{
				id: 'open-character',
				displayName: 'Open character',
				kind: 'open-entity',
				entityKind: 'character',
				targetId: characterId,
			},
			{ id: 'new-map', displayName: 'New map', kind: 'create', target: 'map' },
		]);

		await page.getByRole('switch', { name: 'Enable Table launcher' }).click();
		await expect
			.poll(() =>
				page.evaluate(
					() => window.__rt!.state.widgets.packages['workspace.table-launcher']?.enabled ?? false,
				),
			)
			.toBe(true);

		// ── Press both on a live scene.
		const sceneId = await createScene(page, `Launcher Scene ${Date.now()}`);
		const widgetId = await placeWidget(page, sceneId, 'table-launcher');
		await gotoRoute(page, `/scene/${sceneId}`);
		const panel = page.getByTestId(`widget-${widgetId}`);
		await panel.getByRole('button', { name: 'Open character', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`#/characters/${characterId}$`));
		await expect(page.getByText(characterName).first()).toBeVisible();

		await gotoRoute(page, `/scene/${sceneId}`);
		await page
			.getByTestId(`widget-${widgetId}`)
			.getByRole('button', { name: 'New map', exact: true })
			.click();
		await expect(page).toHaveURL(/#\/atlas$/);
		// The existing creation flow opened on arrival: the map form's name field is waiting.
		await expect(page.getByPlaceholder('e.g. Sunless Citadel')).toBeVisible();
	});

	test("a denied custom widget's intent is dropped and audited", async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);

		const packageId = 'workspace.sneaky-launcher';
		const base = 'widgets/sneaky-launcher';
		const pkg = {
			id: packageId,
			version: '1.0.0',
			displayName: 'Sneaky launcher',
			widgets: [
				{
					type: 'sneaky-launcher',
					version: '1.0.0',
					displayName: 'Sneaky launcher',
					author: 'workspace',
					placement: { surfaces: ['scene'], libraryListed: true },
					renderEntrypoint: {
						runtime: 'custom-html-js',
						sandbox: 'iframe',
						assetPath: `${base}/index.html`,
						hostApiVersion: 1,
					},
					style: { isolation: 'iframe-document', capabilities: ['css-variables'] },
					supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
					defaultSize: { width: 320, height: 200 },
					minSize: { width: 200, height: 120 },
					resizePolicy: 'free',
					requiredBindings: [],
					optionalBindings: [],
					configurationSchema: { type: 'object', additionalProperties: true },
					capabilitySets: ['manager', 'operator', 'viewer'],
					commands: [],
					intents: [{ id: 'new-map', displayName: 'New map', kind: 'create', target: 'map' }],
					events: [],
					hostPermissions: ['navigate'],
				},
			],
			migrations: [],
			assets: [
				{
					path: `${base}/index.html`,
					kind: 'html',
					entrypoint: true,
					content: `<!doctype html><html><body><p data-navigate>pending</p><script src="./main.js"></script></body></html>`,
				},
				{
					path: `${base}/main.js`,
					kind: 'javascript',
					content: `
						var api = window.dndtoolsWidget;
						var out = api.root.querySelector('[data-navigate]');
						api.navigate('new-map').then(function (answer) {
							out.textContent = 'navigate: ' + answer.decision;
						});
					`,
				},
			],
			portabilityWarnings: [],
		};

		const actor = await actorId(page);
		for (const command of [
			{ type: 'widget.package.install', payload: { package: pkg } },
			// Trust review looks at the request and says no to `navigate`, explicitly.
			{
				type: 'widget.package.review',
				payload: { packageId, trustState: 'trusted', hostPermissions: { navigate: 'denied' } },
			},
			{ type: 'widget.package.enable', payload: { packageId } },
		]) {
			const result = await dispatch(page, { ...command, actorId: actor });
			expect(result.status, `${command.type}: ${result.rejection?.message ?? ''}`).toBe('accepted');
		}
		expect(
			await page.evaluate(
				(id) => window.__rt!.state.widgets.packages[id]?.trust.hostPermissions.navigate,
				packageId,
			),
		).toBe('denied');

		const sceneId = await createScene(page, `Sneaky Scene ${Date.now()}`);
		const widgetId = await placeWidget(page, sceneId, 'sneaky-launcher');
		await gotoRoute(page, `/scene/${sceneId}`);

		// The frame asked; the host refused and told it why.
		const inside = page.frameLocator('iframe[data-widget-sandbox="sneaky-launcher"]');
		await expect(inside.locator('[data-navigate]')).toHaveText('navigate: permission-denied');
		// Dropped: nobody moved, and the frame's drop count went up.
		await expect(page).toHaveURL(new RegExp(`#/scene/${sceneId}$`));
		await expect(page.locator('iframe[data-widget-sandbox="sneaky-launcher"]')).toHaveAttribute(
			'data-dropped-intents',
			'1',
		);
		await expect(page.getByPlaceholder('e.g. Sunless Citadel')).toHaveCount(0);

		// Audited: the host log holds the refusal, naming the declared intent and nothing else.
		const audit = await page.evaluate(
			() =>
				(
					window as unknown as {
						__widgetHostAudit?: () => ReadonlyArray<Record<string, unknown>>;
					}
				).__widgetHostAudit?.() ?? null,
		);
		expect(audit).not.toBeNull();
		expect(audit).toContainEqual(
			expect.objectContaining({
				widgetInstanceId: widgetId,
				intentId: 'new-map',
				intentKind: 'create',
				decision: 'permission-denied',
			}),
		);
	});
});
