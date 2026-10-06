import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, gotoRoute, markOnboarded, seedFresh } from './_helpers';

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
 * 3. A player (the DM's "view as player" preview) follows an "Open quest" intent to a player-visible
 *    quest. A player has no quest editor to land in, so the Story page scrolls to that quest's card,
 *    focuses it and marks it current.
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

async function createScene(
	page: Page,
	name: string,
	visibility: 'dm-only' | 'player-visible' = 'dm-only',
): Promise<string> {
	const created = await dispatch(page, {
		type: 'scene.create',
		actorId: await actorId(page),
		payload: { name, description: '', visibility, tags: [] },
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

		// RC-WID-6.2 — a template with no permission installs trusted and already on.
		await expect(page.getByRole('switch', { name: 'Enable Table launcher' })).toBeChecked();
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

	for (const intentName of ['New scene', 'New screen']) {
		test(`a builder-made action panel starts the ${intentName} creation dialog`, async ({
			page,
		}) => {
			await markOnboarded(page);
			await gotoRoute(page, '/extensions');
			await seedFresh(page);
			await page.getByRole('button', { name: 'Build a widget' }).click();
			const builder = page.getByRole('dialog', { name: /Widget builder/ });
			await builder.getByLabel('Name', { exact: true }).fill('Screen launcher');
			await builder.getByRole('button', { name: 'Data', exact: true }).click();
			await builder.getByLabel('Template kind').selectOption('action-panel');
			await builder.getByRole('button', { name: 'Commands', exact: true }).click();
			await builder.getByRole('button', { name: intentName, exact: true }).click();
			await builder.getByRole('button', { name: 'Review', exact: true }).click();
			await builder.getByRole('button', { name: 'Install widget' }).click();
			await expect(builder).toHaveCount(0);
			// RC-WID-6.2 — a template with no permission installs trusted and already on.
			await expect(page.getByRole('switch', { name: 'Enable Screen launcher' })).toBeChecked();
			await expect
				.poll(() =>
					page.evaluate(
						() =>
							window.__rt!.state.widgets.packages['workspace.screen-launcher']?.enabled ?? false,
					),
				)
				.toBe(true);

			const sceneId = await createScene(page, 'Launcher screen');
			const widgetId = await placeWidget(page, sceneId, 'screen-launcher');
			await gotoRoute(page, `/scene/${sceneId}`);
			await page
				.getByTestId(`widget-${widgetId}`)
				.getByRole('button', { name: intentName, exact: true })
				.click();
			await expect(page).toHaveURL(/#\/scenes$/);
			const creation = page.getByRole('dialog', { name: 'New screen', exact: true });
			await expect(creation).toBeVisible();
			await creation
				.getByRole('textbox', { name: 'Name', exact: true })
				.fill('Created from intent');
			await creation.getByRole('button', { name: 'Create screen', exact: true }).click();
			await expect(creation).toHaveCount(0);
			await expect
				.poll(() =>
					page.evaluate(() =>
						Object.values(window.__rt!.state.scenes.scenes).some(
							(screen) => screen.name === 'Created from intent',
						),
					),
				)
				.toBe(true);
		});
	}

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

	test('a player following an "Open quest" intent lands on that quest', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/campaign');
		await seedFresh(page);

		// Enough player-visible quests that the requested one starts well below the fold.
		const dm = await actorId(page);
		const titles = Array.from({ length: 30 }, (_, i) => `Thread ${String(i + 1).padStart(2, '0')}`);
		for (const title of titles) {
			const result = await dispatch(page, {
				type: 'content.create-object',
				actorId: dm,
				payload: {
					subtype: 'quest',
					title,
					fields: { title, status: 'active', objectives: [] },
					body: 'A thread for the table.',
					visibility: 'player-visible',
				},
			});
			expect(result.status, result.rejection?.message ?? '').toBe('accepted');
		}
		// The Story page's own order decides which quest is furthest down: target the last card it
		// renders and keep the first one to prove the page actually moved.
		await gotoRoute(page, '/campaign');
		const threads = page.locator('[data-quest-id]').filter({ hasText: /Thread \d\d/ });
		await expect(threads).toHaveCount(titles.length);
		const rendered = await threads.evaluateAll((cards) =>
			cards.map((card) => card.getAttribute('data-quest-id')!),
		);
		const firstId = rendered[0]!;
		const targetId = rendered[rendered.length - 1]!;
		const targetTitle = await page.evaluate(
			(id) =>
				(window.__rt!.state.content as { items: Record<string, { title: string }> }).items[id]
					?.title ?? null,
			targetId,
		);
		expect(targetTitle).toMatch(/^Thread \d\d$/);

		const packageId = 'workspace.quest-launcher';
		const pkg = {
			id: packageId,
			version: '1.0.0',
			displayName: 'Quest launcher',
			widgets: [
				{
					type: 'quest-launcher',
					version: '1.0.0',
					displayName: 'Quest launcher',
					author: 'workspace',
					placement: { surfaces: ['scene'], libraryListed: true },
					renderEntrypoint: { runtime: 'template', template: 'action-panel', hostApiVersion: 1 },
					supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
					defaultSize: { width: 320, height: 200 },
					minSize: { width: 200, height: 120 },
					resizePolicy: 'free',
					requiredBindings: [],
					optionalBindings: [],
					configurationSchema: { type: 'object', additionalProperties: true },
					capabilitySets: ['manager', 'operator', 'viewer'],
					commands: [],
					intents: [
						{
							id: 'open-quest',
							displayName: 'Open quest',
							kind: 'open-entity',
							entityKind: 'quest',
							targetId,
						},
					],
					events: [],
					hostPermissions: [],
				},
			],
			migrations: [],
			assets: [],
			portabilityWarnings: [],
		};
		for (const command of [
			{ type: 'widget.package.install', payload: { package: pkg } },
			{ type: 'widget.package.review', payload: { packageId, trustState: 'trusted' } },
			{ type: 'widget.package.enable', payload: { packageId } },
		]) {
			const result = await dispatch(page, { ...command, actorId: dm });
			expect(result.status, `${command.type}: ${result.rejection?.message ?? ''}`).toBe('accepted');
		}
		const sceneId = await createScene(page, `Quest Scene ${Date.now()}`, 'player-visible');
		const widgetId = await placeWidget(page, sceneId, 'quest-launcher');

		await enterPreview(page, 'player');
		await gotoRoute(page, `/scene/${sceneId}`);
		// The panel re-resolves the intent for the previewed player before drawing it. The scene
		// editor's preview overlay sits over the live board on purpose (the DM is looking, not
		// operating), so the press is delivered to the button itself: what is under test is the
		// destination handoff, with the player as the reading actor.
		const button = page
			.getByTestId(`widget-${widgetId}`)
			.getByRole('button', { name: 'Open quest', exact: true });
		await expect(button).toHaveCount(1);
		await button.dispatchEvent('click');

		await expect(page).toHaveURL(/#\/campaign$/);
		expect(await page.evaluate(() => window.__rt!.preview?.role)).toBe('player');
		const card = page.locator(`[data-quest-id="${targetId}"]`);
		await expect(card).toHaveAttribute('aria-current', 'true');
		await expect(card).toBeFocused();
		await expect(card).toBeInViewport();
		await expect(card).toContainText(targetTitle!);
		// A player gets no editor, and only the requested quest is marked.
		await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
		await expect(page.locator('[data-quest-id][aria-current="true"]')).toHaveCount(1);
		await expect(page.locator(`[data-quest-id="${firstId}"]`)).not.toBeInViewport();
	});
});
