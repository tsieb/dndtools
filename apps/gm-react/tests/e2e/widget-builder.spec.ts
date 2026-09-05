import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// WIDGET BUILDER — RC-WID-2.1. Extensions → Plugins → "Build a widget" opens a full-screen overlay
// that walks a definition step by step and, on Review, dispatches the REAL `widget.package.install`.
// The assertions read raw `__rt.state.widgets` AND drive the real UI: nothing here hand-builds a
// package payload, because the point of the story is that the SCREEN builds one the core accepts.
//
// The acceptance path: build a `status-list` widget bound to current combatants, install it, enable
// it from the same panel, and place it on a scene through the scene editor's own Add panel.

const PACKAGE_ID = 'workspace.party-status';

interface PackageLite {
	enabled: boolean;
	removedAt: string | null;
	trust: { state: string };
	package: {
		id: string;
		version: string;
		displayName: string;
		widgets: Array<{
			type: string;
			renderEntrypoint?: { runtime: string; template?: string };
			dataQueries?: Array<{ id: string; source: string; audience: string }>;
			placement?: { surfaces: string[]; libraryListed: boolean };
			supportedProfiles: string[];
		}>;
	};
}

function installedPackage(page: Page, id: string): Promise<PackageLite | null> {
	return page.evaluate((packageId) => {
		const packages = (window.__rt!.state.widgets as { packages: Record<string, PackageLite> })
			.packages;
		return packages[packageId] ?? null;
	}, id);
}

/** Open the builder overlay from the Plugins panel, on a freshly seeded vault. */
async function openBuilder(page: Page) {
	await markOnboarded(page);
	await gotoRoute(page, '/extensions');
	await seedFresh(page);
	await page.getByRole('button', { name: 'Build a widget' }).click();
	const dialog = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(dialog).toBeVisible();
	return dialog;
}

/** The narrow layout folds the three panes behind a switch; pick one when it is present. */
async function showPane(page: Page, label: 'Edit' | 'Preview' | 'Definition') {
	const seg = page.getByRole('radiogroup', { name: 'Builder pane' });
	if (await seg.isVisible().catch(() => false)) {
		await seg.getByRole('radio', { name: label }).click();
	}
}

test.describe('widget builder: build, install, place', () => {
	test('builds a status-list widget bound to current combatants and places it on a scene', async ({
		page,
	}) => {
		const dialog = await openBuilder(page);

		// ── Identity: the name drives both ids until they are edited by hand.
		await dialog.getByLabel('Name', { exact: true }).fill('Party status');
		await expect(dialog.getByLabel('Package id')).toHaveValue(PACKAGE_ID);
		await expect(dialog.getByLabel('Widget type id')).toHaveValue('party-status');

		// ── Data: the default template kind is the status list; bind it to the current combatants.
		await dialog.getByRole('button', { name: 'Data', exact: true }).click();
		await expect(dialog.getByLabel('Template kind')).toHaveValue('status-list');
		await dialog.getByRole('button', { name: 'Add data query' }).click();
		await expect(dialog.getByLabel('Source')).toHaveValue('current-combatants');

		// ── The preview draws through the real render path, and the JSON pane shows the definition.
		await showPane(page, 'Preview');
		await expect(dialog.getByTestId('widget-builder-preview')).toBeVisible();
		await showPane(page, 'Definition');
		const json = dialog.getByTestId('widget-builder-json');
		await expect(json).toHaveValue(/"template": "status-list"/);
		await expect(json).toHaveValue(/"source": "current-combatants"/);
		// It is a record of the draft, not an editing surface.
		await expect(json).toHaveAttribute('readonly', '');

		// ── Review installs it. The overlay closes on success.
		await showPane(page, 'Edit');
		await dialog.getByRole('button', { name: 'Review', exact: true }).click();
		await dialog.getByRole('button', { name: 'Install widget' }).click();
		await expect(dialog).toHaveCount(0);

		const record = await installedPackage(page, PACKAGE_ID);
		expect(record).not.toBeNull();
		expect(record!.package.displayName).toBe('Party status');
		const definition = record!.package.widgets[0]!;
		expect(definition.type).toBe('party-status');
		expect(definition.renderEntrypoint?.runtime).toBe('template');
		expect(definition.renderEntrypoint?.template).toBe('status-list');
		expect(definition.dataQueries?.[0]?.source).toBe('current-combatants');
		expect(definition.placement?.surfaces).toContain('scene');
		// Fail closed: a package the DM just wrote is still unreviewed and disabled.
		expect(record!.enabled).toBe(false);
		expect(record!.trust.state).toBe('unreviewed');

		// ── Enable it from the same panel, through the real switch.
		await page.getByRole('switch', { name: 'Enable Party status' }).click();
		await expect.poll(async () => (await installedPackage(page, PACKAGE_ID))?.enabled).toBe(true);

		// ── Place it on a scene through the scene editor's own Add panel.
		const sceneName = `Builder Scene ${Date.now()}`;
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name: sceneName, description: '', visibility: 'dm-only', tags: [] },
		});
		expect(created.status).toBe('accepted');
		const sceneId = await page.evaluate(
			(name) =>
				Object.values(window.__rt!.state.scenes.scenes).find((s) => s.name === name)?.id ?? null,
			sceneName,
		);
		expect(sceneId).toBeTruthy();

		await gotoRoute(page, `/scene/${sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText('Add widget', { exact: true })).toBeVisible();
		await page
			.getByTestId('scene-add-widget-panel')
			.getByRole('button', { name: /Party status/ })
			.click();

		await expect
			.poll(() =>
				page.evaluate(
					(id) =>
						window.__rt!.state.scenes.scenes[id!]!.widgets.filter(
							(w) => (w as { type: string }).type === 'party-status',
						).length,
					sceneId,
				),
			)
			.toBe(1);
	});

	test('names the step that still needs attention instead of installing', async ({ page }) => {
		const dialog = await openBuilder(page);
		// Straight to Review with nothing filled in: the install button is unavailable and the
		// blocking steps are listed by name.
		await dialog.getByRole('button', { name: 'Review', exact: true }).click();
		await expect(dialog.getByRole('button', { name: 'Install widget' })).toBeDisabled();
		await expect(dialog.getByText('Give the widget a name.')).toBeVisible();
		await dialog.getByRole('button', { name: 'Go to Identity' }).first().click();
		await expect(dialog.getByLabel('Name', { exact: true })).toBeVisible();
		expect(await installedPackage(page, PACKAGE_ID)).toBeNull();
	});

	test('closes on Escape and returns focus to the control that opened it', async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		const opener = page.getByRole('button', { name: 'Build a widget' });
		await opener.click();
		const dialog = page.getByRole('dialog', { name: /Widget builder/ });
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await waitReady(page);
		await expect(opener).toBeFocused();
	});
});

// The builder is a durable authoring workspace but it is an OVERLAY, not a route, so the
// route-driven axe gate (`a11y-axe-gate.spec.ts`) never reaches it. It gets the same treatment
// here: the same tag set, the same blocking impacts, and no known-violation register to hide in.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('widget builder: accessibility', () => {
	test('the open builder has no critical or serious axe violation', async ({ page }) => {
		const dialog = await openBuilder(page);
		await dialog.getByLabel('Name', { exact: true }).fill('Party status');
		await dialog.getByRole('button', { name: 'Data', exact: true }).click();
		await dialog.getByRole('button', { name: 'Add data query' }).click();

		const results = await new AxeBuilder({ page })
			.withTags(AXE_TAGS)
			.include('[data-fullscreen-overlay="widget-builder"]')
			.analyze();
		const blocking = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);
		expect(
			blocking.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`),
		).toEqual([]);
	});
});
