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

	// A fresh profile: onboarding opens over an empty vault; Escape leaves it.
	await page.goto('/#/');
	await waitReady(page);
	const onboarding = page.locator('[data-fullscreen-overlay="onboarding"]');
	await expect(onboarding).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(onboarding).toBeHidden();

	// New screen from a template, as the first-session guide's row opens it.
	await gotoRoute(page, '/screens');
	await page.getByRole('button', { name: 'New screen', exact: true }).first().click();
	const dialog = page.getByRole('dialog', { name: 'New screen' });
	await dialog.getByRole('radio', { name: 'Combat scene', exact: true }).click();
	await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(NAME);
	await dialog.getByRole('button', { name: 'Create screen', exact: true }).click();
	await page.waitForURL((url) => url.hash.startsWith('#/screen/'), { timeout: 10_000 });
	const created = await sceneOf(page, NAME);
	expect(created?.visibility, 'a new screen starts GM-only').toBe('dm-only');

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
