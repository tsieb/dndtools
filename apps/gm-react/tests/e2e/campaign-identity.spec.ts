import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, preferTier, waitReady } from './_helpers';

// RC-UX-6.2 — the campaign has a name and a party. One name, stored in the campaign: onboarding
// writes it, the sidebar chip (the More sheet's campaign row on a phone), the hero and the vault
// switcher read it, and a rename from the switcher moves every one of them. A vault nobody named
// shows "Your campaign" only as a placeholder. The party is added by name in Settings › Players and
// becomes player actors with nothing but a name.

const overlay = (page: Page) => page.locator('[data-fullscreen-overlay="onboarding"]');
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 640;

/** The campaign's stored identity, or null while it has none. */
const storedCampaign = (page: Page) =>
	page.evaluate(
		() => (window.__rt!.state.commandCenter as { campaign?: { name: string } }).campaign ?? null,
	);

/** This document's vault catalog entry name. */
const catalogName = (page: Page) =>
	page.evaluate(() => {
		const raw = localStorage.getItem('dndtools:react:local-vaults-v1');
		const vaults = raw
			? (JSON.parse(raw) as { vaults: { id: string; name: string }[] }).vaults
			: [];
		return vaults.find((vault) => vault.id === window.__rt!.vaultId)?.name ?? null;
	});

async function openSwitcher(page: Page): Promise<Locator> {
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'More', exact: true }).click();
		await page.getByRole('button', { name: /^Local vaults/ }).click();
	} else {
		await page.getByRole('button', { name: 'Local vaults', exact: true }).click();
	}
	const dialog = page.getByRole('dialog', { name: 'Local vaults' });
	await expect(dialog).toBeVisible();
	return dialog;
}

/** The sidebar chip on desktop and tablet, the More sheet's campaign row on a phone. */
async function expectChip(page: Page, name: string): Promise<void> {
	if (isPhone(page)) {
		await page.getByRole('button', { name: 'More', exact: true }).click();
		await expect(page.getByRole('button', { name: /^Local vaults/ })).toContainText(name);
		await page.keyboard.press('Escape');
		await expect(page.getByRole('button', { name: /^Local vaults/ })).toHaveCount(0);
	} else {
		await expect(
			page.getByRole('button', { name: 'Local vaults', exact: true }).getByText(name, {
				exact: true,
			}),
		).toBeVisible();
	}
}

/** The Command Center hero names the campaign while no session is running. */
const hero = (page: Page, name: string) =>
	page.locator('#main-content').getByRole('heading', { level: 2, name, exact: true });

test('the campaign named in onboarding shows everywhere, and a rename from the switcher moves every surface', async ({
	page,
}) => {
	test.setTimeout(90_000);
	await page.goto('/#/');
	await waitReady(page);
	await expect(overlay(page)).toBeVisible();
	await overlay(page).getByLabel('Campaign name').fill('Lantern Coast');
	await overlay(page).getByRole('button', { name: 'Continue', exact: true }).click();
	await overlay(page).getByRole('button', { name: 'Continue', exact: true }).click();
	await overlay(page).getByRole('button', { name: 'Open the Command Center' }).click();
	await expect(overlay(page)).toBeHidden();

	// Stored once, in the campaign, with the system it was named with.
	await expect.poll(() => storedCampaign(page)).toMatchObject({ name: 'Lantern Coast' });
	expect((await storedCampaign(page)) as { systemPackageId: string }).toHaveProperty(
		'systemPackageId',
		await page.evaluate(() => window.__rt!.state.systems.activePackageId),
	);
	await expect(hero(page, 'Lantern Coast')).toBeVisible();
	await expectChip(page, 'Lantern Coast');
	let dialog = await openSwitcher(page);
	await expect(
		dialog.getByRole('button', { name: 'Open Lantern Coast', exact: true }),
	).toBeDisabled();
	expect(await catalogName(page)).toBe('Lantern Coast');

	// Rename from the switcher: the field starts with the name, and every surface follows.
	await dialog.getByRole('button', { name: 'Rename Lantern Coast', exact: true }).click();
	const field = dialog.getByLabel('Rename vault', { exact: true });
	await expect(field).toHaveValue('Lantern Coast');
	await field.fill('Saltreach');
	await dialog.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(dialog.getByRole('button', { name: 'Open Saltreach', exact: true })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	expect(await storedCampaign(page)).toMatchObject({ name: 'Saltreach' });
	await expect(hero(page, 'Saltreach')).toBeVisible();
	await expect(hero(page, 'Lantern Coast')).toHaveCount(0);
	await expectChip(page, 'Saltreach');
	expect(await catalogName(page)).toBe('Saltreach');

	// Durable: a reload reads the same one name back.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(hero(page, 'Saltreach')).toBeVisible();
	await expectChip(page, 'Saltreach');
	dialog = await openSwitcher(page);
	await expect(dialog.getByRole('button', { name: 'Open Saltreach', exact: true })).toBeDisabled();
});

test('a vault from before campaign names opens with "Your campaign" only as a placeholder', async ({
	page,
}) => {
	await markOnboarded(page);
	await gotoRoute(page, '/');
	const before = await page.evaluate(() => window.__rt!.state.sync.operations.length);
	expect(await storedCampaign(page)).toBeNull();
	await expectChip(page, 'Your campaign');

	const dialog = await openSwitcher(page);
	await dialog.getByRole('button', { name: 'Rename Your campaign', exact: true }).click();
	const field = dialog.getByLabel('Rename vault', { exact: true });
	await expect(field).toHaveValue('');
	await expect(field).toHaveAttribute('placeholder', 'Your campaign');
	await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);

	// Opening it stored nothing: no name in the campaign and no operation written for one.
	expect(await storedCampaign(page)).toBeNull();
	expect(
		await page.evaluate(() =>
			window.__rt!.state.sync.operations.filter((op) => op.opType === 'campaign.set-identity'),
		),
	).toEqual([]);
	expect(await page.evaluate(() => window.__rt!.state.sync.operations.length)).toBe(before);
});

test('two party names added in Settings › Players become two player actors with no email stored', async ({
	page,
}) => {
	await markOnboarded(page);
	await preferTier(page);
	await gotoRoute(page, '/settings?tab=players');
	const before = await page.evaluate(() => Object.keys(window.__rt!.state.permissions.actors));

	const names = page.getByLabel('Player names', { exact: true });
	await names.fill('Ada Quill, Brannoc');
	await page.getByRole('button', { name: 'Add players', exact: true }).click();
	await expect(page.getByRole('status').filter({ hasText: '2 players added.' })).not.toHaveCount(0);
	await expect(names).toHaveValue('');

	const added = await page.evaluate(
		(known) =>
			Object.values(window.__rt!.state.permissions.actors).filter(
				(actor) => !known.includes(actor.id),
			),
		before,
	);
	expect(added.map((actor) => actor.displayName).sort()).toEqual(['Ada Quill', 'Brannoc']);
	for (const actor of added) {
		expect(actor.role).toBe('player');
		expect(Object.keys(actor).sort()).toEqual(['displayName', 'id', 'role']);
	}
	expect(
		await page.evaluate(() => JSON.stringify(window.__rt!.state.permissions).includes('@')),
	).toBe(false);
	expect(await page.evaluate(() => localStorage.getItem('dndtools:react:invites'))).toBeNull();

	// The roster lists them, each with a role picker like any other player.
	await expect(page.getByLabel('Role for Ada Quill', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Role for Brannoc', { exact: true })).toBeVisible();

	// An email address is refused, and nothing is added for it.
	await names.fill('ada@example.com');
	await page.getByRole('button', { name: 'Add players', exact: true }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Enter player names only, not email addresses.' }),
	).not.toHaveCount(0);
	expect(await page.evaluate(() => Object.keys(window.__rt!.state.permissions.actors).length)).toBe(
		before.length + 2,
	);

	// The "view as" switcher offers them as specific players (on a phone it sits in Table controls).
	if (isPhone(page))
		await page.getByRole('button', { name: 'Table controls', exact: true }).click();
	await page.getByRole('button', { name: 'Preview as another role' }).first().click();
	await expect(page.getByRole('menuitemradio', { name: 'Ada Quill' })).toBeVisible();
	await expect(page.getByRole('menuitemradio', { name: 'Brannoc' })).toBeVisible();
	await page.keyboard.press('Escape');

	// Durable across a reload.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(page.getByLabel('Role for Brannoc', { exact: true })).toBeVisible();

	// The Command Center hero draws them as avatars beside the party's PCs, with no character made.
	await gotoRoute(page, '/');
	const heroCard = page.getByTestId('widget-template-hero');
	await expect(heroCard.getByRole('img', { name: 'Ada Quill', exact: true })).toBeVisible();
	await expect(heroCard.getByRole('img', { name: 'Brannoc', exact: true })).toBeVisible();
});
