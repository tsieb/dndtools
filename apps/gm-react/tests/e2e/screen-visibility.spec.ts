import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, installFakeLan, waitReady } from './_helpers';

/**
 * RC-ENG-8.16 (RC-ENG-8.3 finding B2-2) — a GM can let players see a screen they made. Every new
 * screen is created GM-only and the core never puts a GM-only scene on the table, so before Scene
 * details said who can see a screen, only a seeded scene could ever be shown. This walks the real
 * path on a fresh vault: a screen from a template, shared in Scene details, a session started on
 * it, and a player who joins over the fake LAN sees it on their stage.
 */

const NAME = 'Harbour table';

/** A fresh profile: onboarding opens over an empty vault; Escape leaves it. */
async function freshVault(page: Page) {
	await page.goto('/#/');
	await waitReady(page);
	const onboarding = page.locator('[data-fullscreen-overlay="onboarding"]');
	await expect(onboarding).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(onboarding).toBeHidden();
}

/** New screen from a template, as the first-session guide's row opens it. Every new screen is GM-only. */
async function createScreen(page: Page, name: string) {
	await gotoRoute(page, '/screens');
	await page.getByRole('button', { name: 'New screen', exact: true }).first().click();
	const dialog = page.getByRole('dialog', { name: 'New screen' });
	await dialog.getByRole('radio', { name: 'Combat scene', exact: true }).click();
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
	await dialog.getByRole('button', { name: 'Create screen', exact: true }).click();
	await page.waitForURL((url) => url.hash.startsWith('#/screen/'), { timeout: 10_000 });
	const created = await sceneOf(page, name);
	expect(created?.visibility, 'a new screen starts GM-only').toBe('dm-only');
	return created!;
}

/** The top bar's "Preview as" menu: inline from rail up, inside Table controls on a phone. */
async function previewAnyPlayer(page: Page) {
	const tableControls = page.getByRole('button', { name: 'Table controls' });
	if (await tableControls.isVisible()) await tableControls.click();
	await page.getByRole('button', { name: 'Preview as another role' }).click();
	await page.getByRole('menuitemradio', { name: 'Any player', exact: true }).click();
}

async function sceneOf(page: Page, name: string) {
	return page.evaluate(
		(wanted) =>
			Object.values(window.__rt!.state.scenes.scenes)
				.filter((scene) => scene.name === wanted && !scene.deletedAt)
				.map((scene) => ({ id: scene.id, visibility: scene.visibility }))[0] ?? null,
		name,
	);
}

test('a screen made from a template can be shared and a joined player sees it', async ({
	page,
	browser,
}, testInfo) => {
	test.setTimeout(180_000);
	const peers: Page[] = [];
	await installFakeLan(page, peers);

	await freshVault(page);
	const created = await createScreen(page, NAME);

	// Scene details says who can see it; sharing it is one choice and Save.
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
	const details = page.getByTestId('scene-meta-panel');
	const who = details.getByLabel('Who can see this screen');
	await expect(who).toHaveValue('dm-only');
	await who.selectOption('shared');
	await details.getByRole('button', { name: 'Save details' }).click();
	await expect(details).toHaveCount(0);
	await expect.poll(async () => (await sceneOf(page, NAME))?.visibility).toBe('shared');
	await page.getByRole('button', { name: 'Done', exact: true }).click();

	// Start a session on it: the table box is offered and on, not disabled.
	await gotoRoute(page, '/session');
	await page.getByRole('button', { name: 'Start session', exact: true }).first().click();
	const start = page.getByRole('dialog', { name: 'Start a session' });
	await start.getByLabel('Scene', { exact: true }).selectOption(created!.id);
	const show = start.getByRole('checkbox', { name: `Show ${NAME} to the table` });
	await expect(show).toBeEnabled();
	await expect(show).toBeChecked();
	await start.getByRole('button', { name: 'Start session', exact: true }).click();
	await expect(start).toBeHidden();
	await expect(page.getByText('Players see nothing yet')).toHaveCount(0);

	// A player joins over the fake LAN and their stage names the shared screen. The party is added
	// the way onboarding's party step adds it (by name), which the skipped onboarding did not.
	const playerId = await page.evaluate(async () => {
		const rt = window.__rt!;
		await rt.dispatch({
			type: 'permission.add-players',
			actorId: rt.defaultActorId,
			payload: { displayNames: ['Mira'] },
		});
		return rt.actors.find((actor) => actor.role === 'player')!.id;
	});
	const offer = await page.evaluate(async (actorId) => {
		const path = '/src/net/SessionHost.ts';
		const { SessionHost } = await import(path);
		const host = new SessionHost(window.__rt, 'screen-visibility-lan');
		Object.assign(window, { visibilityHost: host });
		const invitation = await host.invite(actorId);
		return invitation.offerCode as string;
	}, playerId);
	const context = await browser.newContext({
		viewport: page.viewportSize(),
		isMobile: testInfo.project.name === 'mobile-chromium',
		hasTouch: testInfo.project.name === 'mobile-chromium',
	});
	try {
		const player = await context.newPage();
		await installFakeLan(player, peers);
		await player.addInitScript(() => localStorage.setItem('dndtools:react:vault-choice', 'fresh'));
		await player.goto(new URL('/#/play', page.url()).href);
		await player.getByRole('button', { name: 'Join a table' }).click();
		const join = player.getByRole('dialog', { name: 'Join a table' });
		await join.getByLabel('Invite code from your DM').fill(offer);
		await join.getByRole('button', { name: 'Join', exact: true }).click();
		const answer = await join.locator('textarea[readonly]').inputValue();
		await page.evaluate(async (code) => {
			await (
				window as unknown as { visibilityHost: { acceptAnswer(code: string): Promise<void> } }
			).visibilityHost.acceptAnswer(code);
		}, answer);
		await expect(join.getByTestId('session-connection')).toContainText('Connected');
		await player.keyboard.press('Escape');
		await expect(player.getByTestId('player-stage')).toContainText(NAME);
	} finally {
		await context.close();
	}
});

/**
 * RC-ENG-8.19 (RC-ENG-8.3 finding B3-1) — the Start dialog offered a GM-only screen with "Show … to
 * the table" disabled and gave the reason only as an English hover title, which touch never shows.
 * It now says why where it can be read and offers the share, so the GM can go live with it shown.
 * RC-ENG-8.18 (finding A3-1) on a fresh vault: "Any player" then sees the screen the table sees.
 */
test('the Start dialog says why a GM-only screen cannot be shown and shares it', async ({
	page,
}) => {
	test.setTimeout(120_000);
	const name = 'Lantern vigil';
	await freshVault(page);
	const created = await createScreen(page, name);

	await gotoRoute(page, '/session');
	await page.getByRole('button', { name: 'Start session', exact: true }).first().click();
	const start = page.getByRole('dialog', { name: 'Start a session' });
	await start.getByLabel('Scene', { exact: true }).selectOption(created.id);
	const show = start.getByRole('checkbox', { name: `Show ${name} to the table` });
	await expect(show).toBeDisabled();
	const reason = start.getByText(
		`Only the DM can see ${name}, so it can’t be shown to the table. Share it with players first.`,
	);
	await expect(reason).toBeVisible();
	await expect(show).toHaveAttribute('aria-describedby', (await reason.getAttribute('id'))!);

	await start.getByRole('button', { name: 'Share with players', exact: true }).click();
	await expect.poll(async () => (await sceneOf(page, name))?.visibility).toBe('shared');
	await expect(show).toBeEnabled();
	await expect(show).toBeChecked();
	await expect(reason).toHaveCount(0);
	// The button that had focus is gone: focus moves to the box it enabled, and a status says why.
	await expect(show).toBeFocused();
	await expect(start.getByRole('status')).toHaveText(`${name} is shared with players.`);
	await start.getByRole('button', { name: 'Start session', exact: true }).click();
	await expect(start).toBeHidden();
	await expect(page.getByText(`Players see ${name}`, { exact: true })).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => window.__rt!.state.session.tableView?.target.sceneId))
		.toBe(created.id);

	await previewAnyPlayer(page);
	const stage = page.getByTestId('player-stage');
	await expect(stage).toContainText(name);
	await expect(stage).not.toContainText('has not shown a scene yet');
	await page.keyboard.press('Escape');
	await expect.poll(() => page.evaluate(() => window.__rt!.preview)).toBeNull();
});

test('the home screen offers no "Who can see this screen" choice', async ({ page }) => {
	await freshVault(page);
	await gotoRoute(page, '/');
	const homeId = await page.evaluate(async () => {
		const rt = window.__rt!;
		for (let i = 0; i < 50 && !rt.state.commandCenter.homeSceneId; i++)
			await new Promise((resolve) => setTimeout(resolve, 100));
		return rt.state.commandCenter.homeSceneId;
	});
	expect(homeId).toBeTruthy();
	await gotoRoute(page, `/screen/${homeId}`);
	await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
	await page.getByRole('button', { name: 'Edit scene name, description & tags' }).click();
	const details = page.getByTestId('scene-meta-panel');
	await expect(details.getByRole('button', { name: 'Save details' })).toBeVisible();
	await expect(details.getByLabel('Who can see this screen')).toHaveCount(0);
});
