import { expect, test, type Page } from '@playwright/test';
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
