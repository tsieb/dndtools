import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { dispatch, gotoRoute, installFakeLan, markOnboarded } from './_helpers';

// RC-SES-7.3 — "What players see" on the Session screen. The GM's Table roster listed who was at
// the table but not what any of them was being shown. The default Session screen now carries the
// `player-views` widget: the shared link-list template over the public `player-projections` query
// source, one row per participant (role, connection, stage, map, handouts, full sheets), each row
// the declared `preview-participant` intent, which opens that participant's companion. The same
// definition is what a GM's builder copy draws.
//
// The player joins over the fake LAN (real signaling, encryption and host filtering), so each row
// is compared with the view-model the host actually sent to the player's device.

const TABLE_SCENE = 'The Gilded Tankard';
const SECRET_SCENE = 'Whispering Cellar';
const HANDOUT = 'Letter from the innkeeper';
const SECRET_NOTE = 'The innkeeper is the cult leader';

interface Table {
	player: Page;
	playerId: string;
	playerName: string;
	close: () => Promise<void>;
}

async function joinPlayer(
	page: Page,
	peers: Page[],
	browser: Browser,
	testInfo: TestInfo,
): Promise<Table> {
	const { invite, playerId, playerName } = await page.evaluate(async () => {
		const rt = window.__rt!;
		const actor = rt.actors.find((entry) => entry.role === 'player')!;
		const hostPath = '/src/net/SessionHost.ts';
		const { SessionHost } = await import(hostPath);
		const host = new SessionHost(rt, 'player-summary-lan');
		Object.assign(window, { playerSummaryHost: host });
		const invitation = await host.invite(actor.id);
		return {
			invite: invitation.offerCode as string,
			playerId: actor.id,
			playerName: actor.displayName,
		};
	});
	const context = await browser.newContext({
		viewport: page.viewportSize(),
		isMobile: testInfo.project.name === 'mobile-chromium',
		hasTouch: testInfo.project.name === 'mobile-chromium',
	});
	const player = await context.newPage();
	await installFakeLan(player, peers);
	await player.goto(new URL('/#/play', page.url()).href);
	await player.getByRole('button', { name: 'Join a table' }).click();
	const dialog = player.getByRole('dialog', { name: 'Join a table' });
	await dialog.getByLabel('Invite code from your DM').fill(invite);
	await dialog.getByRole('button', { name: 'Join', exact: true }).click();
	const answer = await dialog.getByLabel('Your reply code').inputValue();
	await page.evaluate(async (code) => {
		await (
			window as unknown as { playerSummaryHost: { acceptAnswer(code: string): Promise<void> } }
		).playerSummaryHost.acceptAnswer(code);
	}, answer);
	await expect(dialog.getByTestId('session-connection')).toContainText('Connected');
	await player.keyboard.press('Escape');
	return { player, playerId, playerName, close: () => context.close() };
}

/** The companion's handout count, as its own Handouts page reports it. */
async function companionHandouts(player: Page): Promise<number> {
	const handouts = player.getByRole('button', { name: 'Handouts', exact: true });
	if (!(await handouts.isVisible()))
		await player.getByRole('button', { name: 'More', exact: true }).click();
	await handouts.click();
	const badge = player.locator('#player-main').getByText(/^\d+ shared$/);
	await expect(badge).toBeVisible();
	return Number((await badge.textContent())!.match(/\d+/)![0]);
}

test('after Start session each row matches the joined companion; Preview opens that companion', async ({
	page,
	browser,
}, testInfo) => {
	const peers: Page[] = [];
	await installFakeLan(page, peers);
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	for (const [name, visibility] of [
		[TABLE_SCENE, 'shared'],
		[SECRET_SCENE, 'dm-only'],
	] as const) {
		const created = await dispatch(page, {
			type: 'scene.create',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { name, description: '', visibility, tags: [] },
		});
		expect(created.status).toBe('accepted');
	}
	const table = await joinPlayer(page, peers, browser, testInfo);
	try {
		const list = page
			.getByTestId('widget-template-link-list')
			.filter({ has: page.getByRole('heading', { name: 'What players see', exact: true }) });
		// The row is a Preview control named by everything it reports; a later seat's longer name
		// ("Demo Player 2") does not match this one's exact prefix.
		const escaped = table.playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const row = list.getByRole('button', { name: new RegExp(`^${escaped} Player · `) });
		// Before the session starts nothing is on their stage, and the row says so.
		await expect(row).toBeVisible();
		await expect(row).toContainText('Stage: Nothing projected');
		await expect(row).toContainText('Online');
		await expect(row).toContainText('Preview');

		await page.getByRole('button', { name: 'Start session', exact: true }).click();
		const start = page.getByRole('dialog', { name: 'Start a session' });
		const mode = start.getByRole('radio', { name: 'New session' });
		if (await mode.isVisible()) await mode.click();
		await start.getByRole('combobox').first().selectOption({ label: TABLE_SCENE });
		await expect(
			start.getByRole('checkbox', { name: `Show ${TABLE_SCENE} to the table` }),
		).toBeChecked();
		await start.getByRole('button', { name: 'Start session', exact: true }).click();
		await expect(start).toBeHidden();

		// The companion's own stage and handout count are what the GM's row reports.
		await expect(table.player.getByTestId('player-stage')).toContainText(TABLE_SCENE);
		await expect(row).toContainText(`Stage: ${TABLE_SCENE}`);
		const before = await companionHandouts(table.player);
		await expect(row).toContainText(`Handouts: ${before} ·`);

		// Reveal one note to this seat, and keep one for the GM: the row follows the companion.
		const dm = await page.evaluate(() => window.__rt!.defaultActorId);
		for (const [title, visibility, sharedWith] of [
			[HANDOUT, 'shared', [table.playerId]],
			[SECRET_NOTE, 'dm-only', []],
		] as const) {
			const created = await dispatch(page, {
				type: 'content.create-item',
				actorId: dm,
				payload: { kind: 'note', title, body: '', visibility, sharedWith },
			});
			expect(created.status).toBe('accepted');
		}
		await expect.poll(() => companionHandouts(table.player)).toBe(before + 1);
		await expect(table.player.getByRole('button', { name: new RegExp(HANDOUT) })).toBeVisible();
		await expect(row).toContainText(`Handouts: ${before + 1} ·`);
		await expect(row).not.toContainText('Map:');
		// Nothing the GM keeps private is named anywhere in the list.
		await expect(list).not.toContainText(SECRET_SCENE);
		await expect(list).not.toContainText(SECRET_NOTE);

		// Preview opens the companion as this participant, and Escape returns to the Session screen.
		await row.click();
		await expect(page).toHaveURL(/#\/play/);
		await expect(
			page.getByRole('region', { name: `Previewing as ${table.playerName} (Player)` }),
		).toBeVisible();
		await expect(page.getByTestId('player-stage')).toContainText(TABLE_SCENE);
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL(/#\/session/);
		await expect(row).toContainText(`Stage: ${TABLE_SCENE}`);

		// An observer row previews that observer's seat, so it shows the stage the row reports.
		const observer = await page.evaluate(
			() => window.__rt!.actors.find((entry) => entry.role === 'observer')!.displayName,
		);
		const observerRow = list.getByRole('button', {
			name: new RegExp(`^${observer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Observer · `),
		});
		await expect(observerRow).toContainText(`Stage: ${TABLE_SCENE}`);
		await observerRow.click();
		await expect(
			page.getByRole('region', { name: `Previewing as ${observer} (Observer)` }),
		).toBeVisible();
		await expect(page.getByTestId('player-stage')).toContainText(TABLE_SCENE);
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL(/#\/session/);
	} finally {
		await table.close();
	}
});
