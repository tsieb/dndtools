import { expect, test } from '@playwright/test';
import { dispatch, waitReady } from '../e2e/_helpers';

// RC-KNW-3.2: actual core-backed cards, including their visibility and author controls.
// The pinned image captures all three layout tiers; no demo-only component harness.
test('campaign cards and arc strip', async ({ page }, testInfo) => {
	await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
	await page.addInitScript(() => {
		localStorage.setItem('dndtools:react:onboarded', 'gate');
		localStorage.setItem('dndtools:react:theme', 'tavern');
		let id = 0;
		Object.defineProperty(crypto, 'randomUUID', {
			configurable: true,
			value: () => `00000000-0000-4000-8000-${(++id).toString(16).padStart(12, '0')}`,
		});
	});
	await page.goto('/#/campaign');
	await waitReady(page);
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-object',
		actorId,
		payload: {
			subtype: 'quest',
			title: 'Recover the missing shipment',
			visibility: 'dm-only',
			body: 'Follow the lanterns upriver before the tide turns.',
			fields: {
				title: 'Recover the missing shipment',
				status: 'active',
				objectives: [
					{ id: 'clue', text: 'Speak with the harbour watch', done: true },
					{ id: 'vault', text: 'Find the flooded vault', done: false },
				],
			},
		},
	});
	expect(result.status).toBe('accepted');
	await page.evaluate(() => document.fonts.ready);
	const quest = page.getByRole('article').filter({ hasText: 'Recover the missing shipment' });
	await expect(quest.getByRole('button', { name: 'Speak with the harbour watch' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(quest).toHaveScreenshot('campaign-quest.png');
	await page.getByRole('tab', { name: 'NPCs', exact: true }).click();
	if (testInfo.project.name !== 'visual-rail') {
		await expect(page.getByRole('article').first()).toHaveScreenshot('campaign-npc.png');
	}
	await page.getByRole('tab', { name: 'Factions', exact: true }).click();
	const faction = page
		.getByRole('heading', { name: 'Saltmarsh Watch', exact: true })
		.locator('..')
		.locator('..');
	// The rail shares the phone's card width; keep the baseline budget for distinct layouts.
	if (testInfo.project.name !== 'visual-rail') {
		await expect(faction).toHaveScreenshot('campaign-faction.png');
	}
	await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
	const arc = page.locator('ol[tabindex="0"]');
	await expect(arc).toBeVisible();
	await arc.focus();
	await expect(arc).toBeFocused();
	await expect(arc.locator('[aria-current="step"]')).toHaveCount(1);
	await expect(arc).toHaveScreenshot('campaign-arc.png');
	if (await arc.evaluate((el) => el.scrollWidth > el.clientWidth)) {
		await arc.press('ArrowRight');
		await expect.poll(() => arc.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
	}
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
});
