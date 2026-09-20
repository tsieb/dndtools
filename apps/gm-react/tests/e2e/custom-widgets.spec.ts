import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/**
 * CUSTOM WIDGETS — RC-WID-1.3. A `custom-html-js` package is installed, enabled and placed on a scene,
 * and then the sandbox host is asked the questions that matter: does third-party code actually draw,
 * does it see a configuration change, is it refused a capability nobody granted it, and when it throws
 * does the failure stop at its own frame.
 *
 * Everything here goes through the real path — real `widget.package.install`, real `scene.add-widget`,
 * real `scene.configure-widget`, the real render resolver, the real iframe. The assertions are read
 * from INSIDE the sandboxed frame, which is the only place that proves the code ran rather than that a
 * component rendered.
 */

const PACKAGE_ID = 'workspace.torchlight';
const CRASH_PACKAGE_ID = 'workspace.brokenwidget';

/** The widget's own code, written against the documented host API (`window.dndtoolsWidget`). */
const TORCH_JS = `
	var api = window.dndtoolsWidget;
	var state = api.root.querySelector('[data-flame]');
	var permission = api.root.querySelector('[data-clipboard]');
	var command = api.root.querySelector('[data-command]');

	api.onRender(function (props) {
		state.textContent = 'Flame: ' + (props.configuration.flame || 'unlit');
	});
	api.onConfigChanged(function (configuration) {
		state.textContent = 'Flame: ' + (configuration.flame || 'unlit');
	});
	api.requestPermission('clipboard').then(function (answer) {
		permission.textContent = 'clipboard: ' + answer.decision;
	});
	api.dispatch({ commandType: 'torch.burn-the-vault', payload: {} }).then(function (answer) {
		command.textContent = 'command: ' + (answer.accepted ? 'accepted' : 'refused');
	});
`;

function widgetPackage(options: {
	id: string;
	type: string;
	displayName: string;
	javascript: string;
	markup: string;
}) {
	const base = `widgets/${options.type}`;
	return {
		id: options.id,
		version: '1.0.0',
		displayName: options.displayName,
		widgets: [
			{
				type: options.type,
				version: '1.0.0',
				displayName: options.displayName,
				author: 'workspace',
				description: 'A custom widget that runs in the sandbox.',
				placement: { surfaces: ['scene'], libraryListed: true },
				renderEntrypoint: {
					runtime: 'custom-html-js',
					sandbox: 'iframe',
					assetPath: `${base}/index.html`,
					hostApiVersion: 1,
				},
				style: {
					isolation: 'iframe-document',
					stylesheetAssetPaths: [`${base}/styles.css`],
					capabilities: ['css-variables', 'host-theme-tokens'],
					tokens: [{ name: 'flame', value: '#e0b06f' }],
				},
				supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
				defaultSize: { width: 320, height: 200 },
				minSize: { width: 200, height: 120 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				configurationSchema: { type: 'object', additionalProperties: true },
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [],
				events: [],
				hostPermissions: [],
			},
		],
		migrations: [],
		assets: [
			{
				path: `${base}/index.html`,
				kind: 'html',
				entrypoint: true,
				content: `<!doctype html><html><head><link rel="stylesheet" href="./styles.css" /></head><body>${options.markup}<script src="./main.js"></script></body></html>`,
			},
			{
				path: `${base}/styles.css`,
				kind: 'css',
				content: 'p { margin: 0; color: var(--widget-flame); }',
			},
			{ path: `${base}/main.js`, kind: 'javascript', content: options.javascript },
		],
		portabilityWarnings: [],
	};
}

const TORCH_PACKAGE = widgetPackage({
	id: PACKAGE_ID,
	type: 'torchlight',
	displayName: 'Torchlight',
	javascript: TORCH_JS,
	markup: '<p data-flame>Unlit</p><p data-clipboard>pending</p><p data-command>pending</p>',
});

const CRASH_PACKAGE = widgetPackage({
	id: CRASH_PACKAGE_ID,
	type: 'brokenwidget',
	displayName: 'Broken widget',
	javascript: 'throw new Error("this widget is broken");',
	markup: '<p data-broken>Never drawn</p>',
});

async function actorId(page: Page): Promise<string> {
	return page.evaluate(() => window.__rt!.defaultActorId);
}

/** Install + enable a package through the real commands, and fail loudly if the core refuses. */
async function installAndEnable(page: Page, pkg: unknown, id: string) {
	const actor = await actorId(page);
	const installed = await dispatch(page, {
		type: 'widget.package.install',
		actorId: actor,
		payload: { package: pkg },
	});
	expect(installed.status, JSON.stringify(installed.rejection)).toBe('accepted');
	const enabled = await dispatch(page, {
		type: 'widget.package.enable',
		actorId: actor,
		payload: { packageId: id },
	});
	expect(enabled.status, JSON.stringify(enabled.rejection)).toBe('accepted');
}

/** Create a scene and return its id. */
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

async function placeWidget(page: Page, sceneId: string, type: string, x: number) {
	const added = await dispatch(page, {
		type: 'scene.add-widget',
		actorId: await actorId(page),
		payload: {
			sceneId,
			widget: {
				type,
				version: '1.0.0',
				layout: { x, y: 40, w: 320, h: 200 },
				configuration: {},
				localState: {},
				binding: null,
			},
		},
	});
	expect(added.status, JSON.stringify(added.rejection)).toBe('accepted');
}

/** The widget instance id for a placed type on a scene. */
function instanceId(page: Page, sceneId: string, type: string): Promise<string | null> {
	return page.evaluate(
		([scene, widgetType]) =>
			(
				window.__rt!.state.scenes.scenes[scene!]!.widgets as Array<{ id: string; type: string }>
			).find((widget) => widget.type === widgetType)?.id ?? null,
		[sceneId, type] as const,
	);
}

async function openScene(page: Page): Promise<string> {
	await markOnboarded(page);
	await gotoRoute(page, '/scenes');
	await seedFresh(page);
	return actorId(page);
}

test.describe('custom widgets: the sandbox host', () => {
	test('runs third-party code, forwards a config change, refuses an ungranted capability', async ({
		page,
	}) => {
		await openScene(page);
		await installAndEnable(page, TORCH_PACKAGE, PACKAGE_ID);
		const sceneId = await createScene(page, `Torch Scene ${Date.now()}`);
		await placeWidget(page, sceneId, 'torchlight', 40);

		await gotoRoute(page, `/scene/${sceneId}`);
		const frame = page.locator('iframe[data-widget-sandbox="torchlight"]');
		await expect(frame).toBeVisible();
		// The frame is created with the ONE sandbox token, and never with allow-same-origin.
		await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');

		const inside = page.frameLocator('iframe[data-widget-sandbox="torchlight"]');

		// 1. The package's own code ran and drew from the props the host sent.
		await expect(inside.locator('[data-flame]')).toHaveText('Flame: unlit');

		// 2. Clipboard is refused, because nothing has reviewed this package — the state every install
		//    starts in. The widget is TOLD so; it does not get a capability that silently fails later.
		await expect(inside.locator('[data-clipboard]')).toHaveText('clipboard: undeclared');

		// 3. A command the definition does not declare never reaches the core.
		await expect(inside.locator('[data-command]')).toHaveText('command: refused');

		// 4. A configuration change dispatched through the core reaches the running frame.
		const widgetInstanceId = await instanceId(page, sceneId, 'torchlight');
		const configured = await dispatch(page, {
			type: 'scene.configure-widget',
			actorId: await actorId(page),
			payload: { sceneId, widgetInstanceId, configuration: { flame: 'lit' } },
		});
		expect(configured.status, JSON.stringify(configured.rejection)).toBe('accepted');
		await expect(inside.locator('[data-flame]')).toHaveText('Flame: lit');

		// 5. The frame reported its content height back to the host, which applied it.
		await expect.poll(() => frame.getAttribute('data-content-height')).toMatch(/^\d+$/);
	});

	test('a widget that throws is isolated: its neighbour and the scene keep working', async ({
		page,
	}) => {
		await openScene(page);
		await installAndEnable(page, TORCH_PACKAGE, PACKAGE_ID);
		await installAndEnable(page, CRASH_PACKAGE, CRASH_PACKAGE_ID);
		const sceneId = await createScene(page, `Crash Scene ${Date.now()}`);
		await placeWidget(page, sceneId, 'torchlight', 40);
		await placeWidget(page, sceneId, 'brokenwidget', 420);

		await gotoRoute(page, `/scene/${sceneId}`);

		// The broken widget collapses to the "disabled, preserved" card...
		await expect(page.getByTestId('widget-placeholder')).toHaveCount(1);
		await expect(page.getByTestId('widget-placeholder')).toContainText('Disabled, preserved');
		await expect(page.getByTestId('widget-placeholder')).toContainText(
			'Other widgets and your session are unaffected.',
		);
		// ...its neighbour keeps drawing...
		await expect(
			page.frameLocator('iframe[data-widget-sandbox="torchlight"]').locator('[data-flame]'),
		).toHaveText('Flame: unlit');
		// ...and nothing was lost: both instances are still on the scene in the core.
		expect(
			await page.evaluate((id) => window.__rt!.state.scenes.scenes[id!]!.widgets.length, sceneId),
		).toBe(2);
	});

	test('the placeholder is what a package with no code shows, not an empty frame', async ({
		page,
	}) => {
		await openScene(page);
		const codeless = widgetPackage({
			id: 'workspace.codeless',
			type: 'codeless',
			displayName: 'Codeless',
			javascript: '',
			markup: '<p>Nothing runs here</p>',
		});
		// Strip the script the package claims to ship: the entrypoint names a file that is not there.
		codeless.assets = codeless.assets.filter((asset) => !asset.path.endsWith('main.js'));
		await installAndEnable(page, codeless, 'workspace.codeless');
		const sceneId = await createScene(page, `Codeless Scene ${Date.now()}`);
		await placeWidget(page, sceneId, 'codeless', 40);

		await gotoRoute(page, `/scene/${sceneId}`);
		await expect(page.getByTestId('widget-placeholder')).toContainText(
			'This widget package ships no code to run.',
		);
		await expect(page.locator('iframe[data-widget-sandbox]')).toHaveCount(0);
		await waitReady(page);
	});
});

test('keyboard resize and handle presets persist the declared widget sizes', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await openScene(page);
	await installAndEnable(page, TORCH_PACKAGE, PACKAGE_ID);
	const sceneId = await createScene(page, 'Resize scene');
	await placeWidget(page, sceneId, 'torchlight', 40);
	const id = await instanceId(page, sceneId, 'torchlight');
	await gotoRoute(page, `/scene/${sceneId}`);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	const tile = page.getByTestId(`widget-${id}`);
	await tile.focus();
	await tile.press('Enter');
	const handle = tile.getByRole('button', { name: 'Resize Torchlight', exact: true });
	await handle.focus();
	await handle.press('ArrowRight');
	await expect(tile).toHaveCSS('width', '340px');
	await handle.press('ArrowDown');
	await expect(tile).toHaveCSS('height', '220px');
	const announcement = page.getByTestId('canvas-resize-announcement');
	await expect(announcement).toHaveAttribute('aria-live', 'polite');
	await expect(announcement).toHaveAttribute('aria-atomic', 'true');
	await expect(announcement).toHaveText('Torchlight, size 340 by 220');
	await handle.press('Escape');
	await expect(tile).toBeFocused();
	await tile.press('Shift+ArrowLeft');
	await expect(tile).toHaveCSS('width', '320px');
	// A custom size starts at S; further clicks cycle M, L, S.
	await handle.click();
	await expect(tile).toHaveCSS('width', '200px');
	await expect(tile).toHaveCSS('height', '120px');
	await handle.press('ArrowLeft');
	await handle.press('ArrowUp');
	await expect(tile).toHaveCSS('width', '200px');
	await expect(tile).toHaveCSS('height', '120px');
	await handle.click();
	await expect(tile).toHaveCSS('width', '320px');
	await expect(tile).toHaveCSS('height', '200px');
	await handle.click();
	await expect(tile).toHaveCSS('width', '480px');
	await expect(tile).toHaveCSS('height', '300px');
	await handle.click();
	await expect(tile).toHaveCSS('width', '200px');
	// A drag commits its geometry and must not also activate the click preset.
	const bounds = await handle.boundingBox();
	expect(bounds).toBeTruthy();
	await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
	await page.mouse.down();
	await page.mouse.move(bounds!.x + bounds!.width / 2 + 40, bounds!.y + bounds!.height / 2 + 40, {
		steps: 4,
	});
	await page.mouse.up();
	await expect(tile).toHaveCSS('width', '240px');
	await expect(tile).toHaveCSS('height', '160px');
	// Enter is the keyboard equivalent of activating the preset button.
	await handle.press('Enter');
	await expect(tile).toHaveCSS('width', '200px');
	await page.reload();
	await waitReady(page);
	await expect(tile).toHaveCSS('width', '200px');
	await expect(tile).toHaveCSS('height', '120px');
});

test('bounded board resize announces the width its columns allow', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await openScene(page);
	await installAndEnable(page, TORCH_PACKAGE, PACKAGE_ID);
	await gotoRoute(page, '/board');
	await expect
		.poll(() => page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId))
		.toBeTruthy();
	const sceneId = await page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId!);
	// The board's right bound is x=792, so a 320-wide tile at x=472 already touches it.
	await placeWidget(page, sceneId, 'torchlight', 472);
	const id = await instanceId(page, sceneId, 'torchlight');
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	const tile = page.getByTestId(`widget-${id}`);
	await tile.focus();
	await tile.press('Enter');
	const handle = tile.getByRole('button', { name: 'Resize Torchlight', exact: true });
	const announcement = page.getByTestId('canvas-resize-announcement');
	await handle.focus();
	await handle.press('ArrowRight');
	await expect(announcement).toHaveText('Torchlight, size 320 by 200');
	await expect(tile).toHaveCSS('width', '320px');
	// The large preset (480 wide) is clamped to the bound as well.
	await handle.press('Enter');
	await expect(announcement).toHaveText('Torchlight, size 320 by 300');
	await expect(tile).toHaveCSS('height', '300px');
	await expect(tile).toHaveCSS('width', '320px');
	// A drag past the edge neither paints nor announces a width the board refuses.
	const bounds = await handle.boundingBox();
	expect(bounds).toBeTruthy();
	await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
	await page.mouse.down();
	await page.mouse.move(bounds!.x + bounds!.width / 2 + 60, bounds!.y + bounds!.height / 2, {
		steps: 4,
	});
	await expect(tile).toHaveCSS('width', '320px');
	await page.mouse.up();
	await expect(announcement).toHaveText('Torchlight, size 320 by 300');
	await expect(tile).toHaveCSS('width', '320px');
	await expect
		.poll(() =>
			page.evaluate(
				([scene, widget]) =>
					window.__rt!.state.scenes.scenes[scene!]!.widgets.find((w) => w.id === widget)?.layout.w,
				[sceneId, id] as const,
			),
		)
		.toBe(320);
});

/*
 * THE WIDGET ACCESSIBILITY CONTRACT — RC-WID-4.4 (docs/architecture/WIDGETS.md §3.1).
 *
 * Every builtin type is placed on a real scene and on the GM Screen's own board, the table is made
 * live with a fight running, and axe reads the result on both profiles. The keyboard test then walks
 * the page with Tab alone, no clicks and no `focus()`, and drives every operate command a builtin
 * DECLARES; the list is read from the definitions, so a new declared command without a keyboard
 * route fails here. The last test proves the sandbox host tells a frame the host's contrast state.
 */

/** The axe tag set the release gate runs (`a11y-axe-gate.spec.ts`), WCAG 2.2 AA included. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

/** A tile's value readout: a polite live region (`builtin/live.tsx`), not the canvas's `status`. */
const LIVE_REGION = '[aria-live="polite"]';

/**
 * The packages the system widgets ship in. Every type in them is drawn by a builtin body, and
 * `builtin-bodies.test.tsx` fails if the two lists ever disagree, so this IS "every builtin type".
 */
const SYSTEM_PACKAGE_IDS = ['system.scene-widgets', 'system.command-center-widgets'];

/** The operate commands the keyboard test knows how to drive, by the control that runs each one. */
const KEYBOARD_DRIVEN = [
	'dice.roll',
	'timer.advance',
	'timer.pause',
	'timer.reset',
	'timer.resume',
	'timer.start',
];

function builtinTypes(page: Page): Promise<string[]> {
	return page.evaluate(
		(ids) =>
			ids.flatMap(
				(id) => window.__rt!.state.widgets.packages[id]?.package.widgets.map((w) => w.type) ?? [],
			),
		SYSTEM_PACKAGE_IDS,
	);
}

/** Every command a builtin declares for an `operator` — the operate half of the verb split. */
function declaredOperateCommands(page: Page): Promise<string[]> {
	return page.evaluate(
		(ids) =>
			ids
				.flatMap((id) => window.__rt!.state.widgets.packages[id]?.package.widgets ?? [])
				.flatMap((definition) => definition.commands)
				.filter((command) => command.requiredCapability === 'operator')
				.map((command) => command.type)
				.sort(),
		SYSTEM_PACKAGE_IDS,
	);
}

async function createMap(page: Page, name: string): Promise<string> {
	const created = await dispatch(page, {
		type: 'map.create',
		actorId: await actorId(page),
		payload: { name, visibility: 'dm-only' },
	});
	expect(created.status, JSON.stringify(created.rejection)).toBe('accepted');
	const event = created.events?.find((e) => e.kind === 'map.created') as
		| { mapId?: string }
		| undefined;
	expect(event?.mapId).toBeTruthy();
	return event!.mapId!;
}

/**
 * Put one instance of each type on a scene, on a grid that never overlaps. The map is bound to a
 * real map so its tile draws the real canvas and its controls, not the "No map linked" line.
 */
async function placeTypes(
	page: Page,
	sceneId: string,
	types: readonly string[],
	grid: { x: number; y: number; columns: number; w: number; h: number; gutter: number },
) {
	const actor = await actorId(page);
	const mapId = types.includes('map') ? await createMap(page, `Contract Map ${Date.now()}`) : null;
	for (const [index, type] of types.entries()) {
		const added = await dispatch(page, {
			type: 'scene.add-widget',
			actorId: actor,
			payload: {
				sceneId,
				widget: {
					type,
					version: '1.0.0',
					layout: {
						x: grid.x + (index % grid.columns) * (grid.w + grid.gutter),
						y: grid.y + Math.floor(index / grid.columns) * (grid.h + grid.gutter),
						w: grid.w,
						h: grid.h,
					},
					configuration: {},
					localState: {},
					binding:
						type === 'map' && mapId
							? {
									source: { entityType: 'map', entityId: mapId },
									mode: 'read',
									requiredCapability: 'viewer',
								}
							: null,
				},
			},
		});
		expect(added.status, `${type}: ${JSON.stringify(added.rejection)}`).toBe('accepted');
	}
}

/** Go live on the scene and start a fight: the state the DM actually runs the table in. */
async function runTheTable(page: Page, sceneId: string) {
	const actor = await actorId(page);
	const live = await dispatch(page, {
		type: 'session.set-workflow',
		actorId: actor,
		payload: { workflow: 'active', activeSceneId: sceneId },
	});
	expect(live.status, JSON.stringify(live.rejection)).toBe('accepted');
	const fight = await dispatch(page, {
		type: 'combat.start',
		actorId: actor,
		payload: {
			combatants: [
				{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
				{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14 },
			],
		},
	});
	expect(fight.status, JSON.stringify(fight.rejection)).toBe('accepted');
}

/** Every placed widget's contents are one region, and every region has a name. */
async function expectLabelledRegions(page: Page, count: number) {
	const regions = page.locator('section[data-widget-region]');
	await expect(regions).toHaveCount(count);
	const names = await regions.evaluateAll((els) =>
		els.map((el) => el.getAttribute('aria-label')?.trim() ?? ''),
	);
	expect(names.filter((name) => name === '')).toEqual([]);
	expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(count);
}

/**
 * The release gate's bar for the page (no critical or serious violation anywhere), and a stricter
 * one for what this story owns: nothing at ANY impact inside a widget region.
 */
async function expectAxeClean(page: Page, where: string) {
	// Let lazy chunks and the map canvas settle before contrast is measured.
	await page.waitForTimeout(400);
	const wholePage = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
	const blocking = wholePage.violations
		.filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
		.flatMap((violation) =>
			violation.nodes.map((node) => `[${violation.impact}] ${violation.id} — ${node.target}`),
		);
	expect(blocking, `blocking axe violations on ${where}`).toEqual([]);

	const widgets = await new AxeBuilder({ page })
		.withTags(AXE_TAGS)
		.include('section[data-widget-region]')
		.analyze();
	const inside = widgets.violations.flatMap((violation) =>
		violation.nodes.map((node) => `[${violation.impact}] ${violation.id} — ${node.target}`),
	);
	expect(inside, `axe violations inside widget regions on ${where}`).toEqual([]);
}

/**
 * Press Tab (or Shift+Tab) until `target` holds focus — the only way a keyboard user gets there.
 * Wraps round the page if it has to, and fails if the control is not in the tab order at all.
 */
async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab') {
	for (let presses = 0; presses < 400; presses += 1) {
		if (await target.evaluate((el) => el === document.activeElement)) return;
		await page.keyboard.press(key);
	}
	throw new Error(`${key} never reached ${target}`);
}

function timerState(page: Page, widgetId: string) {
	return page.evaluate((id) => {
		const timer = window.__rt!.state.session.timers[id];
		return timer ? { status: timer.status, durationSeconds: timer.durationSeconds } : null;
	}, widgetId);
}

function combatTurn(page: Page): Promise<number> {
	return page.evaluate(() => window.__rt!.state.session.combat.turn);
}

test.describe('widget accessibility contract', () => {
	test('axe is clean on /scene/:id with every builtin type placed and the table live', async ({
		page,
	}) => {
		await openScene(page);
		// Duplicate default titles must remain distinguishable as landmarks.
		const types = [...(await builtinTypes(page)), 'note', 'note'];
		expect(types.length).toBeGreaterThan(15);
		const sceneId = await createScene(page, `Contract Scene ${Date.now()}`);
		await placeTypes(page, sceneId, types, {
			x: 40,
			y: 40,
			columns: 4,
			w: 340,
			h: 260,
			gutter: 24,
		});
		await runTheTable(page, sceneId);

		await gotoRoute(page, `/scene/${sceneId}`);
		await expectLabelledRegions(page, types.length);
		await expectAxeClean(page, '/scene/:id');
	});

	test('axe is clean on /board with every builtin type placed and the table live', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/board');
		await seedFresh(page);
		await gotoRoute(page, '/board');
		// The board materialises its home scene after it mounts (`command-center.ensure-home`).
		await page.waitForFunction(() => {
			const state = window.__rt!.state;
			const id = state.commandCenter.homeSceneId;
			return id !== null && (state.scenes.scenes[id]?.widgets.length ?? 0) > 0;
		});
		const home = await page.evaluate(() => {
			const state = window.__rt!.state;
			const id = state.commandCenter.homeSceneId;
			const widgets = id ? state.scenes.scenes[id]!.widgets : [];
			return {
				id,
				types: widgets.map((widget) => widget.type),
				bottom: Math.max(0, ...widgets.map((widget) => widget.layout.y + widget.layout.h)),
			};
		});
		expect(home.id, 'the GM Screen has no home scene').toBeTruthy();
		const missing = [
			...(await builtinTypes(page)).filter((type) => !home.types.includes(type)),
			'note',
			'note',
		];
		// The board's own three-column grid (`board-helpers.ts`), below what the seed already placed.
		await placeTypes(page, home.id!, missing, {
			x: 24,
			y: home.bottom + 24,
			columns: 3,
			w: 240,
			h: 200,
			gutter: 24,
		});
		await runTheTable(page, home.id!);

		await gotoRoute(page, '/board');
		await expectLabelledRegions(page, home.types.length + missing.length);
		await expectAxeClean(page, '/board');
	});

	test('compact initiative preserves its value region through the combat lifecycle', async ({
		page,
		isMobile,
	}) => {
		test.skip(!isMobile, 'The compact tracker is the phone renderer.');
		await openScene(page);
		const actor = await actorId(page);
		const command = async (type: string, payload: Record<string, unknown>) => {
			const result = await dispatch(page, { type, actorId: actor, payload });
			expect(result.status, JSON.stringify(result.rejection)).toBe('accepted');
		};
		const sceneId = await createScene(page, `Initiative lifecycle ${Date.now()}`);
		await command('session.set-workflow', { workflow: 'active', activeSceneId: sceneId });
		await placeWidget(page, sceneId, 'initiative-tracker', 40);
		const id = (await instanceId(page, sceneId, 'initiative-tracker'))!;
		await gotoRoute(page, `/scene/${sceneId}`);
		const value = page.getByTestId(`widget-${id}`).locator(LIVE_REGION).first();
		await expect(value).toContainText('No combat running');
		const original = await value.elementHandle();
		const idleText = await value.textContent();
		const expectSameRegion = async () => {
			expect(await value.evaluate((node, before) => node === before, original)).toBe(true);
			await expect(value).toHaveAttribute('aria-atomic', 'true');
		};
		await runTheTable(page, sceneId);
		await expect(value).toContainText('Turn 1');
		await expectSameRegion();
		await command('combat.end', {});
		await expect(value).toHaveText(idleText!);
		await expectSameRegion();
		await runTheTable(page, sceneId);
		await expect(value).toContainText('Turn 1');
		await expectSameRegion();
		const combatants = await page.evaluate(() =>
			Object.keys(window.__rt!.state.session.combat.combatants),
		);
		expect(combatants).toHaveLength(2);
		for (const combatantId of combatants) {
			await command('combat.remove-combatant', { combatantId });
		}
		await expect(value).toHaveText(idleText!);
		await expectSameRegion();
	});

	test('atlas keeps the same live region through its first and last map', async ({ page }) => {
		await openScene(page);
		const actor = await actorId(page);
		const removeMap = async (mapId: string) => {
			const result = await dispatch(page, {
				type: 'map.delete',
				actorId: actor,
				payload: { mapId, force: true },
			});
			expect(result.status, JSON.stringify(result.rejection)).toBe('accepted');
		};
		const maps = await page.evaluate(() => Object.keys(window.__rt!.state.maps.maps));
		for (const id of maps) await removeMap(id);
		const sceneId = await createScene(page, `Empty atlas ${Date.now()}`);
		await placeWidget(page, sceneId, 'atlas', 40);
		const id = (await instanceId(page, sceneId, 'atlas'))!;
		await gotoRoute(page, `/scene/${sceneId}`);
		const live = page.getByTestId(`widget-${id}`).locator(LIVE_REGION);
		await expect(live).toHaveCount(1);
		const emptyText = await live.textContent();
		const original = await live.elementHandle();
		const mapId = await createMap(page, 'First map');
		await expect(live).toContainText('Maps1');
		expect(await live.evaluate((node, before) => node === before, original)).toBe(true);
		await removeMap(mapId);
		await expect(live).toHaveText(emptyText!);
		expect(await live.evaluate((node, before) => node === before, original)).toBe(true);
	});

	test('every declared operate command runs from the keyboard alone', async ({ page }) => {
		await openScene(page);
		// The test drives exactly what the builtins declare: a new operate command fails it here.
		expect(await declaredOperateCommands(page)).toEqual(KEYBOARD_DRIVEN);

		const sceneId = await createScene(page, `Keyboard Scene ${Date.now()}`);
		await placeTypes(page, sceneId, ['dice', 'timer', 'initiative-tracker'], {
			x: 40,
			y: 40,
			columns: 3,
			w: 300,
			h: 220,
			gutter: 24,
		});
		await runTheTable(page, sceneId);
		const diceId = (await instanceId(page, sceneId, 'dice'))!;
		const timerId = (await instanceId(page, sceneId, 'timer'))!;
		const initiativeId = (await instanceId(page, sceneId, 'initiative-tracker'))!;

		await gotoRoute(page, `/scene/${sceneId}`);
		const dice = page.getByTestId(`widget-${diceId}`);
		const timer = page.getByTestId(`widget-${timerId}`);
		const initiative = page.getByTestId(`widget-${initiativeId}`);
		await expect(timer).toBeVisible();

		// dice.roll — and the result is announced through the tile's live region.
		await tabTo(page, dice.getByRole('button', { name: /^Roll / }));
		await page.keyboard.press('Enter');
		await expect(dice.getByRole('status')).toContainText('Last result for 1d20');

		// timer.start, then timer.pause with Space: the transport keeps focus as its command changes.
		await tabTo(page, timer.getByRole('button', { name: /^Start \d+-second timer$/ }));
		await page.keyboard.press('Enter');
		await expect(timer.getByRole('button', { name: 'Pause', exact: true })).toBeFocused();
		await expect(timer.locator(LIVE_REGION)).toContainText('Running');
		await page.keyboard.press('Space');
		const resume = timer.getByRole('button', { name: 'Resume', exact: true });
		await expect(resume).toBeFocused();
		await expect(timer.locator(LIVE_REGION)).toContainText('Paused');

		// timer.advance — paused, so the added minute is exact.
		const paused = await timerState(page, timerId);
		await tabTo(page, timer.getByRole('button', { name: 'Add 60 seconds to the timer' }));
		await page.keyboard.press('Enter');
		await expect
			.poll(async () => (await timerState(page, timerId))?.durationSeconds)
			.toBe((paused?.durationSeconds ?? 0) + 60);

		await expect(timer.locator(LIVE_REGION)).toContainText(
			(await timer.getByRole('timer').textContent())!.trim(),
		);

		// timer.resume, reached going back the way a keyboard user would.
		await tabTo(page, resume, 'Shift+Tab');
		await page.keyboard.press('Enter');
		await expect(timer.locator(LIVE_REGION)).toContainText('Running');

		// Running adjustments announce the new value even without an urgency transition.
		const beforeAdvance = await timer.locator(LIVE_REGION).textContent();
		await tabTo(page, timer.getByRole('button', { name: 'Add 60 seconds to the timer' }));
		await page.keyboard.press('Enter');
		await expect(timer.locator(LIVE_REGION)).not.toHaveText(beforeAdvance!);
		const spoken = await timer.locator(LIVE_REGION).textContent();
		await page.waitForTimeout(1200);
		await expect(timer.locator(LIVE_REGION)).toHaveText(spoken!);

		// timer.reset — and focus lands on the transport, not on <body>.
		await tabTo(page, timer.getByRole('button', { name: 'Reset', exact: true }));
		await page.keyboard.press('Enter');
		const start = timer.getByRole('button', { name: /^Start \d+-second timer$/ });
		await expect(start).toBeFocused();

		// The initiative tile's own control: not a declared widget command, but its operate control.
		const turn = await combatTurn(page);
		await tabTo(page, initiative.getByRole('button', { name: 'Next turn', exact: true }));
		await page.keyboard.press('Enter');
		await expect.poll(() => combatTurn(page)).not.toBe(turn);
		// The desk tile names the new turn; the phone tile gives its place in the order.
		await expect(initiative.locator(LIVE_REGION).first()).toContainText(/Reed Stalker|Turn 2/);
	});

	test('the host tells every frame its contrast state, and again when it changes', async ({
		page,
	}) => {
		await openScene(page);
		const probe = widgetPackage({
			id: 'workspace.contrastprobe',
			type: 'contrastprobe',
			displayName: 'Contrast probe',
			javascript: `
				var out = window.dndtoolsWidget.root.querySelector('[data-contrast]');
				var root = getComputedStyle(document.documentElement);
				out.textContent =
					'forced: ' + root.getPropertyValue('--host-forced-colors').trim() +
					' · high contrast: ' + root.getPropertyValue('--host-high-contrast').trim();
			`,
			markup: '<p data-contrast>pending</p>',
		});
		// No `host-theme-tokens`: the contrast state is sent to every frame, not only themed ones.
		probe.widgets[0]!.style.capabilities = ['css-variables'];
		await installAndEnable(page, probe, 'workspace.contrastprobe');
		const sceneId = await createScene(page, `Contrast Scene ${Date.now()}`);
		await placeWidget(page, sceneId, 'contrastprobe', 40);

		await gotoRoute(page, `/scene/${sceneId}`);
		const readout = page
			.frameLocator('iframe[data-widget-sandbox="contrastprobe"]')
			.locator('[data-contrast]');
		await expect(readout).toHaveText('forced: none · high contrast: off');

		// The OS forcing colours reaches a frame that was already running.
		await page.emulateMedia({ forcedColors: 'active' });
		await expect(readout).toHaveText('forced: active · high contrast: on');

		// So does the app's own high-contrast theme, which a frame could never see for itself.
		await page.emulateMedia({ forcedColors: 'none' });
		await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'high-contrast'));
		await expect(readout).toHaveText('forced: none · high contrast: on');
	});
});
