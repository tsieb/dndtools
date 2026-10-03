import { expect, test } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

test('joined companion sees three PCs with private sheets and follows DM HP changes', async ({
	page,
	browser,
}) => {
	test.slow();
	const companionViewport = page.viewportSize();
	await page.setViewportSize({ width: 1440, height: 1000 });
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	const fixture = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			characters: {
				characters: Record<string, { id: string; kind: string; combat: { hp: number } }>;
			};
			permissions: { actors: Record<string, { id: string; role: string }> };
		};
		const pcs = Object.values(state.characters.characters).filter((c) => c.kind === 'pc');
		const players = Object.values(state.permissions.actors).filter((a) => a.role === 'player');
		for (const pc of pcs) {
			const result = await rt.dispatch({
				type: 'character.set-sharing',
				actorId: rt.defaultActorId,
				payload: { characterId: pc.id, visibility: 'shared', sharedWith: [players[1]!.id] },
			});
			if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
		}
		return { pcs, player: players[0]!.id };
	});
	expect(fixture.pcs).toHaveLength(3);
	await page.getByRole('button', { name: 'Host a live table' }).click();
	await page.getByRole('button', { name: 'Host on local network', exact: true }).click();
	await page.getByLabel('Invite participant').selectOption(fixture.player);
	await page.getByRole('button', { name: 'Create invite', exact: true }).click();
	const offer = page.locator('textarea[readonly]');
	await expect(offer).not.toHaveValue('');
	const context = await browser.newContext({ viewport: companionViewport });
	try {
		const companion = await context.newPage();
		await markOnboarded(companion);
		await companion.goto(new URL('/#/play', page.url()).href);
		await companion.getByRole('button', { name: 'Join a table', exact: true }).click();
		await companion.getByLabel('Invite code from your DM').fill(await offer.inputValue());
		await companion.getByRole('button', { name: 'Join', exact: true }).click();
		const answer = companion.locator('textarea[readonly]');
		await expect(answer).not.toHaveValue('');
		await page
			.getByPlaceholder('Paste the reply code from the player…')
			.fill(await answer.inputValue());
		await page.getByRole('button', { name: 'Connect player', exact: true }).click();
		await expect(companion.getByText('You are at the table as', { exact: false })).toBeVisible();
		await companion.getByRole('button', { name: 'Close', exact: true }).click();
		await companion.getByRole('button', { name: 'Party', exact: true }).click();
		await expect(companion.locator('[data-testid^="party-row-"]')).toHaveCount(3);
		const pc = fixture.pcs[0]!;
		const row = companion.getByTestId('party-row-' + pc.id);
		await expect(row).toContainText(pc.combat.hp + '/');
		const changed = await dispatch(page, {
			type: 'character.set-combat',
			actorId: await page.evaluate(() => window.__rt!.defaultActorId),
			payload: { characterId: pc.id, hp: 3 },
		});
		expect(changed.status).toBe('accepted');
		await expect(row).toContainText('3/');
	} finally {
		await context.close();
	}
});

for (const locale of ['en', 'es'] as const) {
	test('sharing explains vitals versus full sheets in ' + locale, async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/characters');
		await seedFresh(page);
		const id = await page.evaluate((language) => {
			localStorage.setItem('dndtools:locale', language);
			const characters = (
				window.__rt!.state.characters as {
					characters: Record<string, { id: string; kind: string }>;
				}
			).characters;
			return Object.values(characters).find((c) => c.kind === 'pc')!.id;
		}, locale);
		await page.goto('/#/characters/' + id);
		await page.reload();
		await expect(
			page.getByText(
				locale === 'en'
					? 'The party always sees vitals; this decides who opens the full sheet.'
					: 'El grupo siempre ve las estadísticas vitales; esto decide quién abre la ficha completa.',
			),
		).toBeVisible();
		await page
			.getByRole('button', { name: locale === 'en' ? 'Change' : 'Cambiar', exact: true })
			.click();
		const audience = page.getByLabel(
			locale === 'en' ? 'Who can open the full sheet' : 'Quién puede abrir la ficha completa',
		);
		await expect(audience).toBeVisible();
		await expect(audience.locator('option')).toHaveCount(3);
	});
}
