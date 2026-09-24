import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, gotoRoute, markOnboarded, ops } from './_helpers';

// The core's own actor reads run in the page, loaded through the dev server: Node cannot import the
// core's system-sample JSON without an import attribute, and the page already has the real modules.
const CORE_ENTRY = `/@fs${resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/core/src/index.ts')}`;

// RC-POL-1.14 — the Extensions polish pass (Plugins, Compendium, Object types, System, Theme studio
// and the builder / review overlays they open). Every tab and overlay is scanned with the full axe
// tag set and must come back with NO violations at all, on both profiles. The Open5e API is cut off
// for every test so the Compendium's offline path (the bundled SRD) is what renders, as it would on
// a table with no network.

async function axe(page: Page) {
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(result.violations).toEqual([]);
}

async function openTab(page: Page, name: string) {
	await page.getByRole('tab', { name, exact: true }).click();
	await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
		'aria-selected',
		'true',
	);
}

/** Offline compendium, no matter what the host's network is doing. */
async function cutOpen5e(page: Page) {
	await page.route('https://api.open5e.com/**', (route) => route.abort('internetdisconnected'));
}

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await markOnboarded(page);
	await cutOpen5e(page);
	await gotoRoute(page, '/extensions');
	await expect(page.getByRole('tab', { name: 'Plugins', exact: true })).toBeVisible();
});

test('Plugins: keyboard install, a remove confirm that names the package, and axe-clean overlays', async ({
	page,
}) => {
	await axe(page);

	// Keyboard-only primary task: install a bundled starter, then back out of removing it.
	const install = page.getByRole('button', { name: 'Install Table Roller', exact: true });
	await install.focus();
	await page.keyboard.press('Enter');
	const card = page.getByTestId('package-card-starter.table-roller');
	await expect(card).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: /Table Roller/ })).not.toHaveCount(0);

	const remove = card.getByRole('button', { name: 'Remove Table Roller', exact: true });
	await remove.focus();
	await page.keyboard.press('Enter');
	const confirm = card.getByRole('button', { name: 'Yes, remove Table Roller', exact: true });
	await expect(confirm).toBeFocused();
	await axe(page);
	const before = await ops(page);
	await page.keyboard.press('Tab');
	await expect(card.getByRole('button', { name: 'Keep', exact: true })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(remove).toBeVisible();
	expect(await ops(page)).toBe(before);
	expect(
		await page.evaluate(
			() => window.__rt!.state.widgets.packages['starter.table-roller']?.removedAt ?? null,
		),
	).toBeNull();

	// The trust review sheet opened from the card.
	await card.getByRole('button', { name: 'Review Table Roller', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: /Review Table Roller/ });
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Trust package', exact: true })).toBeVisible();
	await axe(page);
	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);

	// The widget builder overlay, and focus back on the button that opened it.
	const build = page.getByRole('button', { name: 'Build a widget', exact: true });
	await build.click();
	const builder = page.getByRole('dialog', { name: /Widget builder/ });
	await expect(builder).toBeVisible();
	await expect(builder.getByRole('navigation', { name: /steps/i })).toBeVisible();
	await axe(page);
	await page.keyboard.press('Escape');
	await expect(builder).toHaveCount(0);
	await expect(build).toBeFocused();
});

test('Compendium: loading is announced, the offline fallback says so, and a failed source list can be retried', async ({
	page,
}) => {
	// Hold the first search so the loading state is on screen long enough to scan.
	await page.unroute('https://api.open5e.com/**');
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('https://api.open5e.com/**', async (route) => {
		await held;
		await route.abort('internetdisconnected');
	});
	await openTab(page, 'Compendium');
	await expect(page.getByRole('status').filter({ hasText: 'Loading results' })).toBeVisible();
	await axe(page);
	release();

	await expect(page.getByText('Offline — bundled SRD')).toBeVisible();
	const first = page.getByRole('button', { name: /^Select / }).first();
	await first.click();
	await expect(first).toHaveAttribute('aria-pressed', 'true');
	await axe(page);

	// Failure path: the Open5e document list is unreachable, and the panel says what to do.
	await page.getByRole('button', { name: 'Other sources…', exact: true }).click();
	const failure = page.getByRole('alert').filter({ hasText: 'could not be reached' });
	await expect(failure).toBeVisible();
	await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
	await axe(page);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(failure).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Other sources…', exact: true })).toBeVisible();
});

test('Object types, System and Theme studio are axe clean with their dialogs open', async ({
	page,
}) => {
	await openTab(page, 'Object types');
	await axe(page);
	await page.getByLabel('Custom type label').fill('Guild');
	await page.getByRole('button', { name: 'Define type', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Edit Guild', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'New', exact: true }).click();
	const instance = page.getByRole('dialog', { name: 'New Guild' });
	await expect(instance).toBeVisible();
	await axe(page);
	await instance.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(instance).toHaveCount(0);
	// The inline delete confirm names the type and takes focus from the trigger it replaces.
	await page.getByRole('button', { name: 'Delete Guild', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Yes, delete Guild', exact: true })).toBeFocused();
	await axe(page);
	await page.getByRole('button', { name: 'Keep', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Delete Guild', exact: true })).toBeVisible();

	await openTab(page, 'System');
	await axe(page);
	const other = await page.evaluate(() => {
		const systems = window.__rt!.state.systems as unknown as {
			activePackageId: string;
			packages: Record<string, { id: string; displayName: string }>;
		};
		return (
			Object.values(systems.packages).find((pkg) => pkg.id !== systems.activePackageId)
				?.displayName ?? null
		);
	});
	expect(other, 'the fresh vault ships more than one system package').not.toBeNull();
	await page
		.getByRole('button', { name: new RegExp(other!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
		.first()
		.click();
	await expect(page.getByRole('button', { name: 'All systems', exact: true })).toBeVisible();
	await axe(page);
	await page.getByRole('button', { name: 'Preview this system', exact: true }).click();
	const select = page.getByRole('dialog', { name: `Switch to ${other}` });
	await expect(select).toBeVisible();
	await axe(page);
	await select.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('button', { name: 'Copy and customize', exact: true }).click();
	const fork = page.getByRole('dialog', { name: 'Copy a system' });
	await expect(fork).toBeVisible();
	await axe(page);
	await fork.getByRole('button', { name: 'Cancel', exact: true }).click();

	await openTab(page, 'Theme studio');
	await axe(page);
});

test('large text keeps the Plugins actions reachable', async ({ page }) => {
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	const build = page.getByRole('button', { name: 'Build a widget', exact: true });
	await build.scrollIntoViewIfNeeded();
	await expect(build).toBeInViewport();
	const install = page.getByRole('button', { name: 'Install Table Roller', exact: true });
	await install.scrollIntoViewIfNeeded();
	await expect(install).toBeInViewport();
	// Nothing on the tab forces the page wider than the viewport.
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow).toBeLessThanOrEqual(1);
});

test('player projection: DM-only custom fields never reach a player, and preview-as-player is read-only', async ({
	page,
}) => {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const typeId = `custom:secret-society-${Date.now()}`;
	const defined = await dispatch(page, {
		type: 'content.define-object-type',
		actorId,
		payload: {
			id: typeId,
			label: 'Secret society',
			fields: [
				{ key: 'motto', type: 'string' },
				{ key: 'truePurpose', type: 'string', dmOnly: true },
			],
		},
	});
	expect(defined.status).toBe('accepted');
	const created = await dispatch(page, {
		type: 'content.create-object',
		actorId,
		payload: {
			subtype: typeId,
			title: 'The Lantern Club',
			fields: { motto: 'Light the way', truePurpose: 'Hoard the lamps' },
		},
	});
	expect(created.status).toBe('accepted');

	const read = await page.evaluate(
		async ({ entry, subtype }) => {
			const core = await import(/* @vite-ignore */ entry);
			const rt = window.__rt!;
			const content = rt.state.content as unknown as {
				items: Record<string, { id: string; title: string; fields: Record<string, unknown> }>;
				customObjectTypes: unknown;
			};
			const item = Object.values(content.items).find((i) => i.title === 'The Lantern Club')!;
			const visible = core
				.getContentItemsForActor(rt.state.content, rt.state.permissions, 'actor-player')
				.some((view: { id: string }) => view.id === item.id);
			const registry = core.buildCustomObjectTypeSchemaRegistry(content.customObjectTypes);
			return {
				visible,
				dm: core.projectObjectFieldsForRole(subtype, item.fields, 'dm', registry),
				player: core.projectObjectFieldsForRole(subtype, item.fields, 'player', registry),
			};
		},
		{ entry: CORE_ENTRY, subtype: typeId },
	);
	// A new custom object is dm-only until the DM shares it: the player's read omits it entirely.
	expect(read.visible).toBe(false);
	// And once shared, the player's projection of its fields drops the DM-only one.
	expect(read.dm).toHaveProperty('truePurpose', 'Hoard the lamps');
	expect(read.player).toHaveProperty('motto', 'Light the way');
	expect(read.player).not.toHaveProperty('truePurpose');

	// Preview as a player: every write control on the surface is disabled, and the panels say why.
	await enterPreview(page, 'player');
	await expect(page.getByRole('note').filter({ hasText: 'Managing packages is' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Build a widget', exact: true })).toBeDisabled();
	await expect(
		page.getByRole('button', { name: 'Install Table Roller', exact: true }),
	).toBeDisabled();
	await openTab(page, 'Object types');
	await expect(page.getByRole('note').filter({ hasText: 'Exit preview' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Define type', exact: true })).toBeDisabled();
	await openTab(page, 'Compendium');
	await expect(page.getByText('Offline — bundled SRD')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Import / }).first()).toBeDisabled();
});

test('every tab meets text contrast in all five themes', async ({ page }) => {
	// Two known exceptions, both outside this surface and both parchment token pairs owned by the
	// design system (recorded for the DS lane in the RC-POL-1.14 journal): the DS SystemPackageCard's
	// "Active" chip draws --color-accent on --color-accent-subtle (4.43:1), and the Theme studio's
	// preview sample exists to show DS components (HPBar, Badge, VisibilityChip) exactly as the theme
	// draws them, tertiary text included. This surface no longer uses accent badges or tertiary text
	// itself. Everything else must pass in every theme.
	const dsActiveChip = (theme: string, tab: string, summary: string | undefined) =>
		theme === 'parchment' &&
		tab === 'System' &&
		/foreground color: #9a5418, background color: #f0e0c8/.test(summary ?? '');
	for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
		await page.evaluate((value) => {
			document.documentElement.dataset.theme = value;
		}, theme);
		for (const tab of ['Plugins', 'Compendium', 'Object types', 'System', 'Theme studio']) {
			await openTab(page, tab);
			if (tab === 'Compendium') await expect(page.getByText('Offline — bundled SRD')).toBeVisible();
			const result = await new AxeBuilder({ page })
				.include('#main-content')
				.exclude('[data-testid="theme-preview-sample"]')
				.withRules(['color-contrast'])
				.analyze();
			expect(
				result.violations.flatMap((v) =>
					v.nodes
						.filter((n) => !dsActiveChip(theme, tab, n.failureSummary))
						.map((n) => `${theme}/${tab}: ${n.target} ${n.failureSummary}`),
				),
			).toEqual([]);
		}
	}
});
