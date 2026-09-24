import type { AudioState, PermissionState, SessionAudioState } from '@dndtools/core';
import { getSessionAudioView } from '../../../../packages/core/src/queries/session-audio-query';
import { listAudioAssetsForActor } from '../../../../packages/core/src/queries/audio-library-query';
import { listAudioAssociationsForActor } from '../../../../packages/core/src/queries/audio-association-query';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, gotoRoute, markOnboarded, ops } from './_helpers';

async function axe(page: Page) {
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(result.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await markOnboarded(page);
	await gotoRoute(page, '/audio');
	await expect(page.getByRole('tab', { name: 'Playback', exact: true })).toBeVisible();
});

for (const theme of ['tavern']) {
	test(`Audio tabs and named delete overlay are axe clean; keyboard cancel preserves the package — ${theme}`, async ({
		page,
	}) => {
		await page.evaluate((value) => {
			document.documentElement.dataset.theme = value;
		}, theme);
		await axe(page);
		// Keyboard-only primary task: declare a local source, with immediate persisted feedback.
		const name = page.getByLabel('Track name', { exact: true });
		await name.focus();
		await page.keyboard.type('Quiet room');
		await page.keyboard.press('Tab');
		await page.keyboard.press('b');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Enter');
		await expect(page.getByRole('status').filter({ hasText: '“Quiet room” added' })).toBeVisible();
		await page.getByRole('tab', { name: 'Automation', exact: true }).click();
		await axe(page);
		await page.getByRole('tab', { name: 'Presets', exact: true }).click();
		await axe(page);
		// A stopped session cannot be captured: configure a bounded source through the real core.
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const result = await dispatch(page, {
			type: 'audio.configure-source',
			actorId,
			payload: {
				type: 'web-stream',
				displayName: 'Polish stream',
				url: 'https://example.test/audio.mp3',
				cacheBehavior: 'cache-required',
			},
		});
		expect(result.status).toBe('accepted');
		const sourceId = result.events?.find(
			(event) => event.kind === 'audio.source-configured',
		)?.sourceId;
		expect(
			(
				await dispatch(page, {
					type: 'session.audio.play',
					actorId,
					payload: { sourceId, online: true },
				})
			).status,
		).toBe('accepted');
		await page.getByLabel('Package name').fill('Quiet evening');
		await page.getByRole('button', { name: 'Save current audio', exact: true }).click();
		await expect(page.getByLabel('Package name')).toHaveValue('');
		const remove = page.getByRole('button', { name: 'Delete Quiet evening', exact: true });
		await remove.focus();
		await page.keyboard.press('Enter');
		const dialog = page.getByRole('dialog', { name: 'Delete “Quiet evening”?' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
		await axe(page);
		const before = await ops(page);
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(remove).toBeFocused();
		expect(await ops(page)).toBe(before);
		// Player projection is read by the core; no DM library/configuration is exposed to an actor read.
		const projection = await page.evaluate(() => ({
			audio: window.__rt!.state.audio,
			permissions: window.__rt!.state.permissions,
			playback: window.__rt!.state.session.audioPlayback,
		}));
		expect(
			listAudioAssetsForActor(
				projection.audio as AudioState,
				projection.permissions as PermissionState,
				'actor-player',
			),
		).toEqual([]);
		expect(
			listAudioAssociationsForActor(
				projection.audio as AudioState,
				projection.permissions as PermissionState,
				'actor-player',
			),
		).toEqual([]);
		const player = getSessionAudioView(
			projection.audio as AudioState,
			projection.playback as SessionAudioState,
			projection.permissions as PermissionState,
			'actor-player',
		);
		expect(player.role).toBe('participant');
		expect(player).not.toHaveProperty('outputDevice');
		expect(player).not.toHaveProperty('participantDelivery');
		// Preview is a separate read-only UI contract and remains actionable via the shell.
		await enterPreview(page, 'player');
		await expect(page.getByRole('button', { name: 'Save current audio', exact: true })).toHaveCount(
			0,
		);
	});
}

test('starter loading and failure are announced; large text keeps actions reachable', async ({
	page,
}) => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route('**/audio/starter/manifest.json', async (route) => {
		await held;
		await route.fulfill({ status: 503, body: 'Unavailable' });
	});
	const install = page.getByRole('button', { name: 'Add starter pack', exact: true }).first();
	await install.click();
	await expect(page.getByRole('button', { name: 'Adding…', exact: true }).first()).toBeDisabled();
	await expect(page.getByRole('status').filter({ hasText: 'Adding…' })).toBeVisible();
	await axe(page);
	release();
	await expect(page.getByRole('alert').first()).toBeVisible();
	await axe(page);
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await page.getByLabel('Track name', { exact: true }).fill('Try again');
	const add = page.getByRole('button', { name: 'Add track', exact: true });
	await add.scrollIntoViewIfNeeded();
	await expect(add).toBeInViewport();
	await add.click();
	await expect(page.getByRole('alert').filter({ hasText: /URL/ })).toBeVisible();
});
