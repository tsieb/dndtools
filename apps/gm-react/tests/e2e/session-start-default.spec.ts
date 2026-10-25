import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import type { CoreStateSlice } from '@dndtools/core';
import { gotoRoute, installFakeLan, markOnboarded, seedFresh } from './_helpers';

interface Table {
	player: Page;
	playerName: string;
	close: () => Promise<void>;
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

for (const entry of ['dialog', 'top bar'] as const) {
	test(`${entry} starts on a shareable scene after visiting Command Center`, async ({
		page,
		browser,
	}, info) => {
		const peers: Page[] = [];
		await installFakeLan(page, peers);
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		await gotoRoute(page, '/board');
		await expect
			.poll(() => page.evaluate(() => window.__rt!.state.commandCenter.homeSceneId))
			.not.toBeNull();
		const expected = await page.evaluate(() => {
			const state = window.__rt!.state as unknown as CoreStateSlice;
			return Object.values(state.scenes.scenes).find(
				(s) => !s.isTemplate && s.visibility !== 'dm-only',
			)!;
		});
		expect(expected).toBeTruthy();
		const table = await joinPlayer(page, peers, browser, info);
		try {
			if (entry === 'dialog') {
				await gotoRoute(page, '/session');
				await page.getByRole('button', { name: 'Start session', exact: true }).click();
				const dialog = page.getByRole('dialog', { name: 'Start a session' });
				await expect(dialog.getByRole('radiogroup', { name: 'How to start' })).toHaveCount(0);
				await expect(dialog.getByLabel('Scene', { exact: true })).toHaveValue(expected.id);
				await expect(dialog.getByRole('checkbox')).toBeChecked();
				await expect(dialog.getByRole('checkbox')).toBeEnabled();
				await dialog.getByRole('button', { name: 'Start session', exact: true }).click();
			} else {
				// Below 1440px the top bar keeps Start session in its Table controls sheet.
				const tableControls = page.getByRole('button', { name: 'Table controls', exact: true });
				if (await tableControls.isVisible()) await tableControls.click();
				await page.getByRole('button', { name: /^Start session/ }).click();
				await gotoRoute(page, '/session');
			}
			await expect
				.poll(() =>
					page.evaluate(() => {
						const s = window.__rt!.state as unknown as CoreStateSlice;
						return {
							workflow: s.session.workflow,
							active: s.session.activeSceneId,
							table: s.session.tableView?.target.sceneId,
						};
					}),
				)
				.toEqual({ workflow: 'active', active: expected.id, table: expected.id });
			await expect(page.getByText(`Players see ${expected.name}`, { exact: true })).toBeVisible();
			await expect(table.player.getByTestId('player-stage')).toContainText(expected.name);
			await expect(table.player.getByTestId('player-stage')).not.toContainText(
				'has not shown a scene yet',
			);
			// A local player preview must agree with the independently joined device.
			const preview = await page.context().newPage();
			try {
				await preview.goto(new URL('/#/play', page.url()).href);
				await preview.waitForFunction(() => window.__rt?.loaded === true);
				await preview.evaluate(() => {
					const rt = window.__rt!;
					rt.enterPreview({
						role: 'player',
						playerActorId: rt.actors.find((a) => a.role === 'player')!.id,
					});
				});
				await expect(preview.getByTestId('player-stage')).toContainText(expected.name);
			} finally {
				await preview.close();
			}
			const cleared = await page.evaluate(() =>
				window.__rt!.dispatch({
					type: 'session.project-table-view',
					actorId: window.__rt!.defaultActorId,
					payload: { sceneId: null },
				}),
			);
			expect(cleared.status).toBe('accepted');
			await expect(page.getByText('Players see nothing yet', { exact: true })).toBeVisible();
			await expect(table.player.getByTestId('player-stage')).toContainText(
				'has not shown a scene yet',
			);
		} finally {
			await table.close();
		}
	});
}
