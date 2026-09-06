import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// SYSTEM PACKAGE PICKER (RC-SYS-3.1) — the Extensions › System tab is the front door to the rules
// system a campaign plays. The gallery lists the packages actually installed in the `systems` slice
// and each card describes what THAT package declares; choosing one opens the pure
// `previewSystemPackageSelect` dry-run and applies through the real `system.select` command. Every
// assertion drives the real UI and then reads the durable slice through `__rt` — never a test id.

const DND5E = 'builtin:dnd5e';
const GENERIC = 'builtin:generic';

/** The campaign's active system package id, straight off the durable slice. */
function activeSystemId(page: Page): Promise<string> {
	return page.evaluate(
		() => (window.__rt!.state.systems as { activePackageId: string }).activePackageId,
	);
}

async function openSystemTab(page: Page): Promise<void> {
	await page.getByRole('tab', { name: 'System' }).click();
	await expect(page.getByText('Choose a system')).not.toHaveCount(0);
}

/**
 * Drive the picker end to end for one package: open its detail, preview the switch, acknowledge the
 * dry-run's drops when it has any, apply, and wait for the slice to carry the new active id.
 */
async function switchTo(page: Page, name: string, expectedId: string): Promise<void> {
	await page
		.getByRole('button', { name: new RegExp(`^${name}`) })
		.first()
		.click();
	await expect(page.getByText('What this package declares')).toBeVisible();

	await page.getByRole('button', { name: 'Preview this system' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText(`Switch to ${name}`).first()).toBeVisible();
	// Nothing has changed yet — the dry-run is a read.
	expect(await activeSystemId(page)).not.toBe(expectedId);

	// RC-SYS-3.2 — a destructive switch is gated behind a TYPED acknowledgment, not a checkbox: the
	// word shown in the dialog's own copy (`extensions.system.select.dropPhrase`).
	const phraseField = dialog.getByLabel(/Type "drop" to confirm/);
	if ((await phraseField.count()) > 0) await phraseField.fill('drop');
	await dialog.getByRole('button', { name: 'Switch system' }).click();

	await page.waitForFunction(
		(id) => (window.__rt!.state.systems as { activePackageId: string }).activePackageId === id,
		expectedId,
		{ timeout: 10_000 },
	);
}

test.describe('system package picker', () => {
	test.beforeEach(async ({ page }) => {
		// Each test wipes the vault and reloads, so the whole file pays the dev server's cold compile
		// in parallel on the first run; 30s is not enough room for that on a loaded machine.
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await waitReady(page);
		await openSystemTab(page);
	});

	test('the gallery describes every installed package and marks the active one', async ({
		page,
	}) => {
		// Both built-ins are seeded by the build, so both are pickable on a fresh vault.
		await expect(page.getByRole('button', { name: /^D&D 5e/ })).toHaveCount(1);
		await expect(page.getByRole('button', { name: /^Generic/ })).toHaveCount(1);

		// The chips are read off the package: 5e declares six attributes, Generic declares none.
		const fivee = page.getByRole('button', { name: /^D&D 5e/ });
		await expect(fivee).toContainText('6 attributes');
		await expect(fivee).toContainText('d20 plus modifier');
		await expect(page.getByRole('button', { name: /^Generic/ })).toContainText('0 attributes');

		// Active-package context, in text and not by colour alone.
		await expect(fivee).toContainText('Active');
		expect(await activeSystemId(page)).toBe(DND5E);

		// The build-your-own entry is present in the gallery.
		await expect(page.getByRole('button', { name: /Build your own/ })).toHaveCount(1);
	});

	test('selects Generic through the dry-run dialog and back', async ({ page }) => {
		expect(await activeSystemId(page)).toBe(DND5E);

		await switchTo(page, 'Generic', GENERIC);
		// The detail view follows the campaign: Generic is what the campaign now runs, so its switch
		// control is replaced by the plain statement of fact.
		await expect(page.getByText('This is the system your campaign is running.')).toBeVisible();

		// …and back. The gallery is one click away from the detail view.
		await page.getByRole('button', { name: 'All systems' }).click();
		await expect(page.getByRole('button', { name: /^Generic/ })).toContainText('Active');
		await expect(page.getByRole('button', { name: /^D&D 5e/ })).toHaveCount(1);

		await switchTo(page, 'D&D 5e', DND5E);
		expect(await activeSystemId(page)).toBe(DND5E);
	});

	// RC-SYS-3.2 — the dry-run dialog's acceptance criterion: a destructive switch is IMPOSSIBLE
	// without the typed acknowledgment, and the typed word alone (no exact click target) is what
	// gates it — a stray click on the Switch button while the field is empty, or filled with the
	// wrong word, must never apply.
	test('destructive switch impossible without the typed acknowledgment', async ({ page }) => {
		await page
			.getByRole('button', { name: /^Generic/ })
			.first()
			.click();
		await page.getByRole('button', { name: 'Preview this system' }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Switch to Generic').first()).toBeVisible();

		const apply = dialog.getByRole('button', { name: 'Switch system' });
		const phraseField = dialog.getByLabel(/Type "drop" to confirm/);
		await expect(phraseField).toBeVisible();

		// Empty field: the switch stays disabled.
		await expect(apply).toBeDisabled();

		// The wrong word does not satisfy it either — a DM skimming and typing "yes" must not slip
		// through.
		await phraseField.fill('yes');
		await expect(apply).toBeDisabled();
		expect(await activeSystemId(page)).toBe(DND5E);

		// The exact word (case-insensitively) opens it, and only then does the switch actually apply.
		await phraseField.fill('DROP');
		await expect(apply).toBeEnabled();
		await apply.click();
		await page.waitForFunction(
			(id) => (window.__rt!.state.systems as { activePackageId: string }).activePackageId === id,
			GENERIC,
			{ timeout: 10_000 },
		);
	});

	// RC-SYS-3.2 — the dialog groups findings under headings and offers a way to back up first.
	test('the dry-run dialog groups findings and links to a backup', async ({ page }) => {
		await page
			.getByRole('button', { name: /^Generic/ })
			.first()
			.click();
		await page.getByRole('button', { name: 'Preview this system' }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Drops')).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Export a backup first' })).toBeVisible();
	});

	// RC-SYS-2.6 — the acceptance criterion for vocabulary everywhere. 5e calls the person running
	// the table the DM; Generic calls them the GM. Neither word is written into a screen: the
	// catalog carries `{gm}` and the ACTIVE package fills it, so the chrome renames itself.
	test('the chrome takes its words from the active package', async ({ page }) => {
		await gotoRoute(page, '/board');
		await waitReady(page);
		await expect(page.getByRole('heading', { level: 1, name: 'DM screen' })).toBeVisible();

		await gotoRoute(page, '/extensions');
		await waitReady(page);
		await openSystemTab(page);
		await switchTo(page, 'Generic', GENERIC);

		await gotoRoute(page, '/board');
		await waitReady(page);
		await expect(page.getByRole('heading', { level: 1, name: 'GM screen' })).toBeVisible();
		// Not just the top bar: the same word reaches the sidebar/rail destination and the safety
		// vocabulary on the surfaces underneath it.
		await expect(page.getByText('DM screen')).toHaveCount(0);
	});

	test('build your own forks the package into the gallery', async ({ page }) => {
		await page.getByRole('button', { name: /Build your own/ }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByText('Fork a system')).toBeVisible();

		const name = dialog.getByRole('textbox').first();
		await name.fill('Table rules');
		await dialog.getByRole('button', { name: 'Create the fork' }).click();

		// A fork is a real, durable package in the `custom:` namespace — not a placeholder.
		await page.waitForFunction(
			() =>
				Object.keys(
					(window.__rt!.state.systems as { packages: Record<string, unknown> }).packages,
				).some((id) => id.startsWith('custom:')),
			null,
			{ timeout: 10_000 },
		);
		// RC-SYS-3.3 — the fork opens straight into the builder, so the gallery is behind it until
		// the DM comes back out.
		const builder = page.locator('[data-fullscreen-overlay="system-builder"]');
		await expect(builder).toBeVisible();
		await builder.getByRole('button', { name: 'Close the builder' }).click();
		await expect(builder).toHaveCount(0);
		await page.getByRole('button', { name: 'All systems' }).click();
		await expect(page.getByRole('button', { name: /^Table rules/ })).toContainText('Forked');
	});

	// RC-SYS-3.3 — the system builder's acceptance path, end to end and through the real UI: fork
	// 5e, rename the person running the table to "Keeper", declare a "Sanity" resource, save it
	// through `system.update`, activate it through the picker's dry-run, and find Sanity on the
	// player's own sheet. Nothing here hand-builds a package payload — the point of the story is
	// that the SCREEN builds one the core accepts.
	test('forks 5e, renames the DM to Keeper, adds Sanity, activates it, and the player sheet shows it', async ({
		page,
	}) => {
		await page.getByRole('button', { name: /Build your own/ }).click();
		const forkDialog = page.getByRole('dialog');
		await forkDialog.getByRole('textbox').first().fill('Keeper rules');
		await forkDialog.getByRole('button', { name: 'Create the fork' }).click();

		// A fork exists to be edited, so it opens straight into the builder.
		const builder = page.locator('[data-fullscreen-overlay="system-builder"]');
		await expect(builder).toBeVisible();

		// ── Identity & vocabulary: the word that renames the whole app.
		await builder.getByLabel('The person running the game').fill('Keeper');

		// ── Resources: a new declaration, with the formula the live preview evaluates.
		await builder.getByRole('button', { name: 'Resources', exact: true }).click();
		await builder.getByRole('button', { name: 'Add a resource' }).click();
		await builder.getByLabel('Name', { exact: true }).last().fill('Sanity');
		await builder.getByLabel('Key', { exact: true }).last().fill('sanity');
		await builder.getByLabel('Maximum', { exact: true }).last().fill('5');
		// The preview is the story's own acceptance detail: level 1/5/10/20, evaluated live.
		await expect(builder.getByText('At levels 1, 5, 10 and 20').last()).toBeVisible();

		// ── Review: the origin is read off the durable fork op, and the JSON is what will be saved.
		await builder.getByRole('button', { name: 'Review', exact: true }).click();
		await expect(builder.getByText('Forked from')).toBeVisible();
		await expect(builder.getByText('D&D 5e', { exact: true })).toBeVisible();
		await expect(builder.getByTestId('system-builder-json')).toContainText('"key": "sanity"');
		await builder.getByRole('button', { name: 'Save the system' }).click();

		// The save is a real `system.update`: the durable slice carries both edits.
		await page.waitForFunction(
			() =>
				Object.values(
					(
						window.__rt!.state.systems as {
							packages: Record<
								string,
								{ id: string; vocabulary: { gameMaster: string }; resources: { key: string }[] }
							>;
						}
					).packages,
				).some(
					(pkg) =>
						pkg.id.startsWith('custom:') &&
						pkg.vocabulary.gameMaster === 'Keeper' &&
						pkg.resources.some((resource) => resource.key === 'sanity'),
				),
			null,
			{ timeout: 10_000 },
		);
		await expect(builder).toHaveCount(0);

		const customId = await page.evaluate(() => {
			const packages = (window.__rt!.state.systems as { packages: Record<string, { id: string }> })
				.packages;
			return Object.keys(packages).find((id) => id.startsWith('custom:'))!;
		});

		// ── Activate it through the picker's dry-run — the builder never switches the campaign.
		await page.getByRole('button', { name: 'All systems' }).click();
		await switchTo(page, 'Keeper rules', customId);

		// The vocabulary reaches the chrome (the RC-SYS-2.6 contract, driven by a DM-authored package).
		await gotoRoute(page, '/board');
		await waitReady(page);
		await expect(page.getByRole('heading', { level: 1, name: 'Keeper screen' })).toBeVisible();

		// ── The player sheet shows Sanity. Adding it to a character is `character.add-system-resource`
		// (RC-SYS-2.2), which has no screen of its own yet — so the setup is dispatched and the
		// ASSERTION is on what the player's own sheet renders.
		const characterIds = await page.evaluate(() => {
			const characters = (
				window.__rt!.state.characters as {
					characters: Record<string, { id: string; kind: string }>;
				}
			).characters;
			return Object.values(characters)
				.filter((character) => character.kind === 'pc')
				.map((character) => character.id);
		});
		expect(characterIds.length).toBeGreaterThan(0);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		for (const characterId of characterIds) {
			const added = await dispatch(page, {
				type: 'character.add-system-resource',
				actorId,
				payload: { characterId, key: 'sanity' },
			});
			expect(added.status, added.rejection?.message ?? '').toBe('accepted');
		}

		await gotoRoute(page, '/player');
		await waitReady(page);
		await page.getByRole('tab', { name: 'Resources' }).click();
		await expect(page.getByText('Sanity', { exact: true })).toBeVisible();
	});
});

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// RC-SYS-3.3 — the builder is a durable authoring workspace, so it carries the same axe floor the
// widget builder does, with every step's controls on screen rather than the empty first step.
test.describe('system builder: accessibility', () => {
	test('the open builder has no critical or serious axe violation', async ({ page }) => {
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/extensions');
		await seedFresh(page);
		await waitReady(page);
		await openSystemTab(page);
		await page.getByRole('button', { name: /Build your own/ }).click();
		const forkDialog = page.getByRole('dialog');
		await forkDialog.getByRole('textbox').first().fill('Keeper rules');
		await forkDialog.getByRole('button', { name: 'Create the fork' }).click();
		const builder = page.locator('[data-fullscreen-overlay="system-builder"]');
		await expect(builder).toBeVisible();

		// Every step's controls, including the ones that only appear for a particular choice: a
		// derived attribute's formula, a dice resource's notation, a rounds-limited condition's
		// count, an enum creature field's choices, and the experience table.
		await builder.getByRole('button', { name: 'Attributes', exact: true }).click();
		await builder.getByRole('button', { name: 'Add an attribute' }).click();
		await builder.getByRole('button', { name: 'Add a skill' }).click();
		await builder.getByRole('button', { name: 'Resources', exact: true }).click();
		await builder.getByRole('button', { name: 'Add a resource' }).click();
		await builder.getByLabel('Shape', { exact: true }).last().selectOption({ value: 'dice' });
		await builder.getByRole('button', { name: 'Conditions', exact: true }).click();
		await builder.getByRole('button', { name: 'Add a condition' }).click();
		await builder
			.getByLabel('Lasts', { exact: true })
			.last()
			.selectOption({ label: 'A number of rounds' });
		await builder.getByRole('button', { name: 'Dice and turns', exact: true }).click();
		await builder.getByRole('button', { name: 'Creature schema', exact: true }).click();
		await builder.getByRole('button', { name: 'Add a field' }).click();
		await builder
			.getByLabel('Holds', { exact: true })
			.last()
			.selectOption({ label: 'One of a list' });
		await builder.getByRole('button', { name: 'Advancement', exact: true }).click();
		await builder.getByRole('button', { name: 'Review', exact: true }).click();

		const results = await new AxeBuilder({ page })
			.withTags(AXE_TAGS)
			.include('[data-fullscreen-overlay="system-builder"]')
			.analyze();
		const blocking = results.violations.filter(
			(violation) => violation.impact === 'critical' || violation.impact === 'serious',
		);
		expect(
			blocking.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(' ')}`),
		).toEqual([]);
	});
});
