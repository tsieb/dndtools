// Run from repository root: pnpm exec tsx state/RC-CAN-7.5/capture-refresh.ts
// Requires isolated, cloud-disabled Vite at PARITY_URL (default below).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { markOnboarded, gotoRoute } from '../../apps/gm-react/tests/e2e/_helpers';
const require = createRequire(new URL('../../apps/gm-react/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const browser = await chromium.launch({ headless: true });
const baseURL = process.env.PARITY_URL ?? 'http://127.0.0.1:15751';
try {
	for (const [tier, width, height] of [
		['desktop', 1440, 900],
		['rail', 900, 800],
		['phone', 390, 844],
	] as const) {
		for (const theme of ['tavern', 'parchment', 'high-contrast']) {
			const context = await browser.newContext({ baseURL, viewport: { width, height } });
			const page = await context.newPage();
			await markOnboarded(page);
			await page.addInitScript(
				(theme: string) => localStorage.setItem('dndtools:react:theme', theme),
				theme,
			);
			const capture = async (state: string, scope = page.locator('#main-content')) => {
				const name = `refresh-${state}-${tier}-${theme}`;
				writeFileSync(`state/RC-CAN-7.5/aria/${name}.yaml`, (await scope.ariaSnapshot()) + '\n');
				const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
				execFileSync(
					'magick',
					['png:-', '-define', 'webp:lossless=true', `state/RC-CAN-7.5/screens/${name}.webp`],
					{ input: png },
				);
				console.log(name);
			};
			await gotoRoute(page, '/');
			await expect(page.getByRole('button', { name: 'Open scene', exact: true })).toBeVisible();
			await capture('home');
			await gotoRoute(page, '/board');
			await expect(page.getByRole('button', { name: 'Edit layout', exact: true })).toBeVisible();
			await capture('board');
			await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
			await page.getByRole('button', { name: 'Add', exact: true }).click();
			const gallery = page.getByTestId('add-widget-gallery');
			await expect(gallery.getByRole('searchbox', { name: 'Search widgets' })).toBeVisible();
			await capture('board-gallery', gallery);
			await gallery.getByRole('searchbox').fill('zzzz-no-widget');
			await capture('board-gallery-empty', gallery);
			await page.keyboard.press('Escape');
			await gotoRoute(page, '/session');
			await expect(page.getByRole('radiogroup', { name: 'Session phase' })).toBeVisible();
			await capture('session');
			const result = await page.evaluate(async () => {
				const rt = window.__rt!;
				return rt.dispatch({
					type: 'session.set-workflow',
					actorId: rt.defaultActorId,
					payload: { workflow: 'active', activeSceneId: rt.state.commandCenter.homeSceneId },
				});
			});
			if (result.status !== 'accepted') throw new Error(JSON.stringify(result));
			await expect(
				page.getByRole('button', { name: 'Roll for initiative', exact: true }),
			).toBeVisible();
			await capture('session-active');
			await page.getByRole('button', { name: 'Roll for initiative', exact: true }).click();
			await expect(page.getByRole('button', { name: 'Start round 1', exact: true })).toBeVisible();
			await capture('session-call');
			const names = await page.evaluate(() =>
				Object.values(
					(
						window.__rt!.state.characters as {
							characters: Record<string, { kind: string; name: string }>;
						}
					).characters,
				)
					.filter((c) => c.kind === 'pc')
					.map((c) => c.name),
			);
			await page.getByRole('button', { name: names[0], exact: true }).first().click();
			await expect(
				page.getByRole('spinbutton', { name: `Initiative for ${names[0]}` }),
			).toBeVisible();
			await capture('session-adjust');
			await context.close();
		}
	}
} finally {
	await browser.close();
}
