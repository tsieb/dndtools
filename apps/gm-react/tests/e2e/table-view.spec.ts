import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { gotoRoute, installFakeLan, markOnboarded } from './_helpers';

// RC-SES-7.2 — a default for what players see. Start session used to record an active scene the
// players never received: each joined player's stage stayed empty until the GM assigned a view to
// that one player in the Stage panel. Starting on a shared scene now shows it to the whole table
// (the core applies "Show <scene> to the table"'s default to the start itself), a per-player choice
// in the Stage panel still wins for that player, a DM-only scene is never shown to the table, and a
// live session with nothing shown says so on the companion.
//
// Both sides run over the fake LAN (real signaling, encryption and host filtering), so the stage
// asserted here is the view-model the host actually sent to the player's device.

const TABLE_SCENE = 'The Gilded Tankard';
const OVERRIDE_SCENE = 'Whispering Cellar';

interface Table {
	player: Page;
	playerName: string;
	close: () => Promise<void>;
}

/** A shared scene for the table, a DM-only one for the exception, and the GM on `/session`. */
async function arrangeScenes(page: Page): Promise<void> {
	const created = await page.evaluate(
		async ({ tableScene, overrideScene }) => {
			const rt = window.__rt!;
			const results = [];
			for (const [name, visibility] of [
				[tableScene, 'shared'],
				[overrideScene, 'dm-only'],
			] as const) {
				results.push(
					await rt.dispatch({
						type: 'scene.create',
						actorId: rt.defaultActorId,
						payload: { name, description: '', visibility, tags: [] },
					}),
				);
			}
			return results.map((result) => result.status);
		},
		{ tableScene: TABLE_SCENE, overrideScene: OVERRIDE_SCENE },
	);
	expect(created).toEqual(['accepted', 'accepted']);
}

/** Invite the first registered player and complete the handshake from a second browser context. */
async function joinPlayer(
	page: Page,
	peers: Page[],
	browser: Browser,
	testInfo: TestInfo,
): Promise<Table> {
	const { invite, playerName } = await page.evaluate(async () => {
		const rt = window.__rt!;
		const actor = rt.actors.find((entry) => entry.role === 'player')!;
		const hostPath = '/src/net/SessionHost.ts';
		const { SessionHost } = await import(hostPath);
		const host = new SessionHost(rt, 'table-view-lan');
		Object.assign(window, { tableViewHost: host });
		const invitation = await host.invite(actor.id);
		return { invite: invitation.offerCode as string, playerName: actor.displayName };
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
			window as unknown as { tableViewHost: { acceptAnswer(code: string): Promise<void> } }
		).tableViewHost.acceptAnswer(code);
	}, answer);
	await expect(dialog.getByTestId('session-connection')).toContainText('Connected');
	await player.keyboard.press('Escape');
	return { player, playerName, close: () => context.close() };
}

async function openTable(page: Page, browser: Browser, testInfo: TestInfo): Promise<Table> {
	const peers: Page[] = [];
	await installFakeLan(page, peers);
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await arrangeScenes(page);
	const table = await joinPlayer(page, peers, browser, testInfo);
	// Before the session starts the joined stage is empty, and says nothing about the GM's choice.
	await expect(table.player.getByTestId('player-stage')).toContainText(
		'Nothing is being shown yet.',
	);
	return table;
}

/** Start session from the Session screen's own dialog, on the named scene. */
async function startSession(page: Page, sceneName: string, showToTable = true): Promise<void> {
	await page.getByRole('button', { name: 'Start session', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Start a session' });
	const mode = dialog.getByRole('radio', { name: 'New session' });
	if (await mode.isVisible()) await mode.click();
	await dialog.getByRole('combobox').first().selectOption({ label: sceneName });
	const sharing = dialog.getByRole('checkbox', { name: `Show ${sceneName} to the table` });
	if (sceneName === TABLE_SCENE) {
		await expect(sharing).toBeChecked();
		if (!showToTable) await sharing.uncheck();
	} else {
		await expect(sharing).not.toBeChecked();
		await expect(sharing).toBeDisabled();
	}
	await dialog.getByRole('button', { name: 'Start session', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect.poll(() => page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
}

test('Start session with the shared scene puts it on the joined stage; a per-player choice still wins', async ({
	page,
	browser,
}, testInfo) => {
	const table = await openTable(page, browser, testInfo);
	try {
		// Never touched before this point: the Stage panel plays no part in the table getting the scene.
		await startSession(page, TABLE_SCENE);
		const stage = table.player.getByTestId('player-stage');
		await expect(stage).toContainText(TABLE_SCENE);
		await expect(stage).not.toContainText('has not shown a scene yet');

		// The GM sees the table view in the Stage panel's Everyone row.
		await expect(page.getByLabel('Scene shown to everyone', { exact: true })).toHaveValue(
			await page.evaluate(
				(name) =>
					Object.values(window.__rt!.state.scenes.scenes).find((scene) => scene.name === name)!.id,
				TABLE_SCENE,
			),
		);

		// The exception: this one player gets a different (even DM-only) scene from their own row.
		await page
			.getByTestId('player-view-assignments')
			.getByLabel(`Scene projected to ${table.playerName}`, { exact: true })
			.selectOption({ label: OVERRIDE_SCENE });
		await expect(stage).toContainText(OVERRIDE_SCENE);
		await expect(stage).not.toContainText(TABLE_SCENE);
		// The table default is unchanged by the exception.
		expect(
			await page.evaluate(() => {
				const rt = window.__rt!;
				const sceneId = rt.state.session.tableView?.target.sceneId;
				return sceneId ? rt.state.scenes.scenes[sceneId]?.name : null;
			}),
		).toBe(TABLE_SCENE);
	} finally {
		await table.close();
	}
});

test('a DM-only start shows the table nothing and the companion says so; Everyone fills the stage', async ({
	page,
	browser,
}, testInfo) => {
	const table = await openTable(page, browser, testInfo);
	try {
		// A DM-only scene is never swept onto the table: the session goes live with nothing shown.
		await startSession(page, OVERRIDE_SCENE);
		const stage = table.player.getByTestId('player-stage');
		await expect(stage).toContainText('has not shown a scene yet.');
		await expect(stage).not.toContainText(OVERRIDE_SCENE);
		await expect(page.getByLabel('Scene shown to everyone', { exact: true })).toHaveValue('');

		await page
			.getByLabel('Scene shown to everyone', { exact: true })
			.selectOption({ label: TABLE_SCENE });
		await expect(stage).toContainText(TABLE_SCENE);
	} finally {
		await table.close();
	}
});

test('unchecking Show to the table starts live with an empty joined stage', async ({
	page,
	browser,
}, testInfo) => {
	const table = await openTable(page, browser, testInfo);
	try {
		await startSession(page, TABLE_SCENE, false);
		const stage = table.player.getByTestId('player-stage');
		await expect(stage).toContainText('has not shown a scene yet.');
		await expect(stage).not.toContainText(TABLE_SCENE);
		await expect(page.getByLabel('Scene shown to everyone', { exact: true })).toHaveValue('');
		expect(
			await page.evaluate(() =>
				Object.keys(window.__rt!.state.session.playerViewAssignments ?? {}),
			),
		).toEqual([]);
	} finally {
		await table.close();
	}
});
