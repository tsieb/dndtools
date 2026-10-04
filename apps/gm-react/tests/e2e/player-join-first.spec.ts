import { selectCompanionSection } from './_companion';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, installFakeLan, markOnboarded } from './_helpers';

async function bootPlayer(page: Page) {
	await page.goto('/#/play');
	await page.waitForFunction(() => window.__rt?.loaded);
}

async function axe(page: Page) {
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
		.analyze();
	expect(result.violations).toEqual([]);
}

test('a fresh companion offers one primary and no seeded identity', async ({ page }) => {
	await bootPlayer(page);
	await expect(page.getByRole('heading', { name: 'Join your table' })).toBeVisible();
	await expect(page.getByRole('button')).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Join a table' })).toBeVisible();
	await expect(page.getByText(/Demo Player|Sera Duskwhisper/)).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^(My character|Party|Journal)$/ })).toHaveCount(0);
	await expect(page.getByText(/Ask your DM for an invite/)).toBeVisible();
	await axe(page);
	await page.getByRole('button', { name: 'Join a table' }).click();
	await expect(page.getByText(/Stay on the same network/)).toBeVisible();
	await axe(page);
});

test('the invited PC replaces the join stage after a fake-LAN handshake', async ({
	page,
	browser,
}, testInfo) => {
	const peers: Page[] = [];
	await installFakeLan(page, peers);
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	const invite = await page.evaluate(async () => {
		const rt = window.__rt!;
		const modelsPath = '/src/net/viewModels.ts';
		const { buildPlayerData } = await import(modelsPath);
		const actor = rt.actors.find((entry) => entry.role === 'player')!;
		const pc = buildPlayerData(rt.state, actor.id).pc;
		if (!pc) throw new Error('Host fixture needs a participant PC');
		const renamed = await rt.dispatch({
			type: 'character.edit-field',
			actorId: rt.defaultActorId,
			payload: { characterId: pc.id, path: 'name', value: 'Invited adventurer' },
		});
		if (renamed.status !== 'accepted') throw new Error(JSON.stringify(renamed));
		const hostPath = '/src/net/SessionHost.ts';
		const { SessionHost } = await import(hostPath);
		const host = new SessionHost(rt, 'join-first-lan');
		Object.assign(window, { joinFirstHost: host });
		const invitation = await host.invite(actor.id);
		return invitation.offerCode as string;
	});
	const context = await browser.newContext({
		viewport: page.viewportSize(),
		isMobile: testInfo.project.name === 'mobile-chromium',
		hasTouch: testInfo.project.name === 'mobile-chromium',
	});
	try {
		const player = await context.newPage();
		await installFakeLan(player, peers);
		await player.goto(new URL('/#/play', page.url()).href);
		await expect(player.getByRole('heading', { name: 'Join your table' })).toBeVisible();
		await player.getByRole('button', { name: 'Join a table' }).click();
		const dialog = player.getByRole('dialog', { name: 'Join a table' });
		await dialog.getByLabel('Invite code from your DM').fill(invite);
		await dialog.getByRole('button', { name: 'Join', exact: true }).click();
		const answer = await dialog.getByLabel('Your reply code').inputValue();
		await page.evaluate(async (code) => {
			await (
				window as unknown as { joinFirstHost: { acceptAnswer(code: string): Promise<void> } }
			).joinFirstHost.acceptAnswer(code);
		}, answer);
		await expect(dialog.getByTestId('session-connection')).toContainText('Connected');
		await player.keyboard.press('Escape');
		await selectCompanionSection(player, 'My character');
		await expect(player.getByRole('heading', { name: 'Invited adventurer' })).toBeVisible();
		await expect(player.getByText('Sera Duskwhisper', { exact: true })).toHaveCount(0);
		await axe(player);
		await player.getByRole('button', { name: 'Connected', exact: true }).click();
		await player.getByRole('button', { name: 'Leave table' }).click();
		await expect(player.getByRole('heading', { name: 'Join your table' })).toBeVisible();
		await expect(player.getByRole('button')).toHaveCount(1);
	} finally {
		await context.close();
	}
});

test('the demo vault keeps an explicitly labelled participant preview', async ({ page }) => {
	await bootPlayer(page);
	await page.evaluate(async () => {
		const path = '/src/platform/storage/coreStore.ts';
		const store = await import(path);
		const vault = store.createLocalVault('Companion demo', 'demo');
		store.selectLocalVaultForNextLoad(vault.id);
	});
	await page.reload();
	await page.waitForFunction(() => window.__rt?.loaded);
	await expect(page.getByText('Preview · Demo Player', { exact: true })).toBeVisible();
	await selectCompanionSection(page, 'My character');
	await expect(page.getByRole('heading', { name: 'Sera Duskwhisper' })).toBeVisible();
	await page.getByRole('button', { name: 'Party', exact: true }).click();
	await expect(page.getByText('You', { exact: true })).toHaveCount(0);
	const rolled = await page.evaluate(() =>
		window.__rt!.dispatch({
			type: 'dice.roll',
			actorId: 'actor-player',
			payload: { expression: '1d20', label: 'Preview roll' },
		}),
	);
	expect(rolled.status).toBe('accepted');
	await page.getByRole('button', { name: 'Dice', exact: true }).click();
	await expect(
		page.getByRole('main').getByText('Demo Player · Preview roll', { exact: true }),
	).toBeVisible();
	await expect(page.getByRole('main').getByText('You · Preview roll', { exact: true })).toHaveCount(
		0,
	);
});

for (const outcome of ['read', 'denied', 'cancelled'] as const) {
	test(`QR camera: ${outcome}, with a usable paste fallback`, async ({ page }) => {
		await page.addInitScript((outcome) => {
			Object.assign(window, { cameraOpened: 0, cameraStopped: 0 });
			Object.defineProperty(navigator, 'mediaDevices', {
				configurable: true,
				value: {
					enumerateDevices: async () => [{ kind: 'videoinput' }],
					getUserMedia: async () => {
						const state = window as unknown as { cameraOpened: number; cameraStopped: number };
						state.cameraOpened++;
						if (outcome === 'denied') throw new DOMException('Denied', 'NotAllowedError');
						const canvas = document.createElement('canvas');
						const stream = canvas.captureStream();
						for (const track of stream.getTracks()) {
							const stop = track.stop.bind(track);
							track.stop = () => {
								if (track.readyState !== 'ended') state.cameraStopped++;
								stop();
							};
						}
						return stream;
					},
				},
			});
			HTMLMediaElement.prototype.play = async () => {};
			Object.assign(window, {
				BarcodeDetector: class {
					static async getSupportedFormats() {
						return ['qr_code'];
					}
					async detect() {
						return outcome === 'read' ? [{ rawValue: 'scanned-invite-code' }] : [];
					}
				},
			});
		}, outcome);
		await bootPlayer(page);
		await page.getByRole('button', { name: 'Join a table' }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('button', { name: 'Scan a QR code' })).toBeVisible();
		expect(
			await page.evaluate(() => (window as unknown as { cameraOpened: number }).cameraOpened),
		).toBe(0);
		await dialog.getByRole('button', { name: 'Scan a QR code' }).click();
		if (outcome === 'read') {
			await expect(dialog.getByLabel('Invite code from your DM')).toHaveValue(
				'scanned-invite-code',
			);
			await expect(dialog.getByText('QR code read. Choose Join to use this invite.')).toBeVisible();
		} else if (outcome === 'denied') {
			await expect(dialog.getByRole('status').filter({ hasText: 'Could not read' })).toBeVisible();
			await dialog.getByLabel('Invite code from your DM').fill('pasted-invite-code');
			await expect(dialog.getByRole('button', { name: 'Join', exact: true })).toBeEnabled();
		} else {
			await expect(dialog.getByRole('button', { name: 'Stop scanning' })).toBeVisible();
			await page.keyboard.press('Escape');
		}
		if (outcome !== 'denied') {
			await expect
				.poll(() =>
					page.evaluate(() => (window as unknown as { cameraStopped: number }).cameraStopped),
				)
				.toBe(1);
		}
	});
}

test('the host shares a QR beside its code without unavailable online guidance', async ({
	page,
}) => {
	await installFakeLan(page, []);
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	const controls = page.getByRole('button', { name: 'Table controls' });
	if (await controls.isVisible()) await controls.click();
	await page.getByRole('button', { name: 'Host a live table' }).click();
	const dialog = page.getByRole('dialog', { name: 'Host a live table' });
	await dialog.getByRole('button', { name: 'Host on local network' }).click();
	await expect(dialog).not.toContainText('online join code');
	await expect(dialog).not.toContainText('sign in for internet play');
	await dialog.getByLabel('Invite participant').selectOption('actor-player');
	await dialog.getByRole('button', { name: 'Create invite' }).click();
	await expect(dialog.getByRole('img', { name: 'Session invite QR code' })).toBeVisible();
	await expect(dialog.getByLabel('Invite code — send to the player')).not.toHaveValue('');
	await expect(dialog.getByLabel('Paste the player’s reply code')).toBeVisible();
	await axe(page);
});
