import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-WID-6.8 — widget settings that exist. Configure… on a counter (the Quick track's "Counter or
// clock" recipe, `counterRecipe` in draft.ts) shows its range and title, and saving them changes the
// tile. A widget that declares no settings says so in the menu, with the reason, and offers Edit
// widget instead; a scene-only widget never carries the dead "Dock preference".

/** Open the GM's board in edit mode. */
async function editBoard(page: Page): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/board');
	await seedFresh(page);
	await page.goto('/#/board');
	await waitReady(page);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await expect(page.getByTestId('scene-board-bounded')).toBeVisible();
}

/** The slice of `src/app/widgetBuilder/draft.ts` the page imports from the dev server. */
interface DraftModule {
	counterRecipe: (name: string, range: { min: number; max: number }) => object;
	emptyDraft: () => object;
	buildPackage: (draft: object) => object;
}

/**
 * Install the package the builder's own draft model builds, trusted on the GM's word as the builder
 * installs a template widget. `recipe` names a draft built in the page from `draft.ts`.
 */
async function installFromDraft(page: Page, recipe: 'counter' | 'bare'): Promise<void> {
	const pkg = await page.evaluate(async (kind) => {
		const path = '/src/app/widgetBuilder/draft.ts';
		const draft = (await import(/* @vite-ignore */ path)) as DraftModule;
		const base =
			kind === 'counter'
				? draft.counterRecipe('Doom clock', { min: 0, max: 6 })
				: {
						...draft.emptyDraft(),
						packageId: 'workspace.plain-list',
						typeId: 'plain-list',
						name: 'Plain list',
						// Picked on the Layout step, but this widget only goes on scenes.
						dockPreference: 'right' as const,
					};
		return draft.buildPackage(base);
	}, recipe);
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const installed = await dispatch(page, {
		type: 'widget.package.install',
		actorId,
		payload: { package: pkg, authorTrust: true },
	});
	expect(installed.status, installed.rejection?.message ?? '').toBe('accepted');
}

/** Place the named widget from the Add gallery and return its frame. */
async function place(page: Page, name: string, type: string): Promise<Locator> {
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page
		.getByTestId('add-widget-gallery')
		.getByRole('button', { name: `Add ${name}`, exact: true })
		.click();
	const ids = () =>
		page.evaluate((widgetType) => {
			const rt = window.__rt!;
			const scene = rt.state.scenes.scenes[rt.state.commandCenter.homeSceneId!]!;
			return scene.widgets.filter((w) => w.type === widgetType).map((w) => w.id);
		}, type);
	await expect.poll(ids).toHaveLength(1);
	const [id] = await ids();
	return page.getByTestId(`widget-${id}`);
}

const openMenu = (frame: Locator) => frame.getByTestId('tile-actions-trigger').click();

/** What the counter tile reads out, as one line of its text: "Count 3 Minimum 0 Maximum 8". */
const readout = (frame: Locator) =>
	frame.getByTestId('widget-template-tracker').evaluate((el) =>
		Array.from(el.querySelectorAll('*'))
			.filter((node) => node.children.length === 0)
			.map((node) => node.textContent?.trim() ?? '')
			.filter(Boolean)
			.join(' '),
	);

test('Configure… on a Quick-track counter shows its range and title, and saving them changes the tile', async ({
	page,
}) => {
	await editBoard(page);
	await installFromDraft(page, 'counter');
	const frame = await place(page, 'Doom clock', 'doom-clock');
	await expect(frame).toHaveAttribute('aria-label', /^Doom clock, /);
	await expect.poll(() => readout(frame)).toBe('Count 0 Minimum 0 Maximum 6');

	await openMenu(frame);
	await page.getByRole('menuitem', { name: 'Configure…', exact: true }).click();
	const configure = page.getByRole('dialog', { name: 'Configure Doom clock', exact: true });
	await expect(configure).toBeVisible();
	const title = configure.getByRole('textbox', { name: 'Title', exact: true });
	const minimum = configure.getByRole('spinbutton', { name: 'Minimum', exact: true });
	const maximum = configure.getByRole('spinbutton', { name: 'Maximum', exact: true });
	const count = configure.getByRole('spinbutton', { name: 'Count', exact: true });
	await expect(title).toHaveValue('');
	await expect(minimum).toHaveValue('0');
	await expect(maximum).toHaveValue('6');
	await expect(count).toHaveValue('0');
	// Every setting it shows is one the tile reads: no dock preference, no second visibility.
	await expect(configure.getByText('Dock preference')).toHaveCount(0);
	await expect(configure.getByRole('combobox')).toHaveCount(0);

	await title.fill('Doom of the Lich');
	await maximum.fill('8');
	await count.fill('3');
	await configure.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(configure).toHaveCount(0);

	// The tile says what was saved: its title, the count and the new range.
	await expect(frame).toHaveAttribute('aria-label', /^Doom of the Lich, /);
	await expect.poll(() => readout(frame)).toBe('Count 3 Minimum 0 Maximum 8');

	// Opened again, the dialog holds what was saved, and a second range edit lands on the tile too.
	await openMenu(frame);
	await page.getByRole('menuitem', { name: 'Configure…', exact: true }).click();
	const again = page.getByRole('dialog', { name: 'Configure Doom of the Lich', exact: true });
	await expect(again.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
		'Doom of the Lich',
	);
	await expect(again.getByRole('spinbutton', { name: 'Maximum', exact: true })).toHaveValue('8');
	await again.getByRole('spinbutton', { name: 'Minimum', exact: true }).fill('2');
	await again.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(again).toHaveCount(0);
	await expect.poll(() => readout(frame)).toBe('Count 3 Minimum 2 Maximum 8');
});

test('a widget with no settings says so with the reason and offers Edit widget instead', async ({
	page,
}) => {
	await editBoard(page);
	await installFromDraft(page, 'bare');
	// Scene-only: the dock preference picked on the Layout step was never written.
	const keys = await page.evaluate(
		() =>
			(
				window.__rt!.state.widgets as {
					packages: Record<
						string,
						{ package: { widgets: { configFields?: { key: string }[] }[] } }
					>;
				}
			).packages['workspace.plain-list']!.package.widgets[0]!.configFields?.map((f) => f.key) ?? [],
	);
	expect(keys).not.toContain('dockPreference');

	const frame = await place(page, 'Plain list', 'plain-list');
	await openMenu(frame);
	const menu = page.getByTestId('tile-actions-menu');
	await expect(menu.getByRole('menuitem', { name: /^Configure…/ })).toHaveCount(0);
	const none = menu.getByRole('menuitem', { name: 'No settings', exact: true });
	await expect(none).toHaveAttribute('aria-disabled', 'true');
	await expect(none).toHaveAccessibleDescription(
		'This widget declares nothing to set. Add settings in Edit widget.',
	);
	await expect(menu.getByRole('menuitem', { name: 'Edit widget', exact: true })).toBeVisible();
	// Pressing the disabled row does nothing: no dialog, the menu stays.
	await none.click({ force: true });
	await expect(page.getByTestId('tile-configure-dialog')).toHaveCount(0);
	await expect(menu).toBeVisible();
});
