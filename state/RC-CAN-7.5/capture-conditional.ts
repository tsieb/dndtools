// Run from repository root: pnpm exec tsx state/RC-CAN-7.5/capture-conditional.ts
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
			await page.addInitScript('window.__name = (fn) => fn;');
			await page.addInitScript(
				(theme: string) => localStorage.setItem('dndtools:react:theme', theme),
				theme,
			);
			const capture = async (state: string, scope = page.locator('#main-content')) => {
				const name = `refresh-${state}-${tier}-${theme}`;
				writeFileSync(`state/RC-CAN-7.5/aria/${name}.yaml`, (await scope.ariaSnapshot()) + '\n');
				const png = await scope.screenshot({ animations: 'disabled' });
				execFileSync(
					'magick',
					['png:-', '-define', 'webp:lossless=true', `state/RC-CAN-7.5/screens/${name}.webp`],
					{ input: png },
				);
				console.log(name);
			};
			await gotoRoute(page, '/session');
			await expect(page.getByRole('radiogroup', { name: 'Session phase' })).toBeVisible();
			await page.evaluate(async () => {
				const rt = window.__rt!;
				const actorId = rt.defaultActorId;
				const send = async (type: string, payload: unknown) => {
					const r = await rt.dispatch({ type, actorId, payload } as never);
					if (r.status !== 'accepted') throw new Error(JSON.stringify(r.rejection));
				};
				for (let n = 0; n < 2; n++) {
					for (const workflow of ['idle', 'prep', 'active', 'recap'])
						await send('session.set-workflow', {
							workflow,
							activeSceneId:
								rt.state.commandCenter.homeSceneId ?? Object.values(rt.state.scenes.scenes)[0].id,
						});
				}
				for (let n = 0; n < 16; n++)
					await send('content.create-item', {
						kind: 'note',
						title: `Capture fixture ${n}`,
						body: '',
						visibility: 'dm-only',
					});
			});
			const panel = page
				.locator('section')
				.filter({
					has: page.getByRole('heading', { name: 'End-of-session capture', exact: true }),
				});
			await expect(panel.getByRole('combobox', { name: 'Archived session' })).toBeVisible();
			const filter = panel.getByRole('textbox', { name: 'Filter', exact: true });
			await expect(filter).toBeVisible();
			await filter.fill('Capture fixture');
			await panel.getByRole('checkbox').first().click();
			await filter.fill('zzzz-no-match');
			await expect(panel.getByRole('checkbox')).toHaveCount(1);
			await capture('capture-filter', panel);
			await panel
				.getByRole('textbox', { name: 'What happened', exact: true })
				.fill('The party met a stranger named Thornwick at the docks.');
			await panel.getByRole('button', { name: 'Save session log' }).click();
			const check = panel.getByRole('group', { name: '1 name mentioned without notes' });
			await expect(check).toBeVisible();
			await capture('capture-continuity', panel);
			await check.getByRole('button', { name: 'Create', exact: true }).click();
			await expect(check).toHaveCount(0);
			const created = await page.evaluate(() =>
				Object.values((window.__rt!.state.characters as any).characters).some(
					(c: any) => c.name === 'Thornwick' && c.kind === 'npc',
				),
			);
			if (!created) throw new Error('Continuity NPC not created');
			await context.close();
		}
	}
} finally {
	await browser.close();
}
