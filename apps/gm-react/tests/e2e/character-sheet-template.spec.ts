import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/player');
	await seedFresh(page);
	await gotoRoute(page, '/player');
	await expect(page.getByTestId('character-sheet')).toBeVisible();
});

test('template columns, live HP, slots and durable asset-store portrait', async ({ page }) => {
	const sheet = page.getByTestId('character-sheet');
	const columns = sheet.locator(':scope > .character-sheet-column');
	const left = (await columns.nth(0).boundingBox())!;
	const right = (await columns.nth(1).boundingBox())!;
	if (page.viewportSize()!.width < 768) expect(right.y).toBeGreaterThan(left.y + left.height - 1);
	else {
		expect(right.x).toBeGreaterThan(left.x + left.width);
		expect(right.y).toBe(left.y);
	}
	expect(await sheet.locator('.character-sheet-abilities > div').count()).toBe(6);
	const characterId = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			characters: { characters: Record<string, { id: string; kind: string; name: string }> };
			scenes: { scenes: Record<string, { id: string }> };
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
		};
		const character = Object.values(state.characters.characters)
			.filter((c) => c.kind === 'pc')
			.sort((a, b) => a.name.localeCompare(b.name))[0]!;
		for (const command of [
			{
				type: 'session.set-workflow',
				payload: {
					workflow: 'active',
					activeSceneId:
						state.session.activeSceneId ??
						state.commandCenter.homeSceneId ??
						Object.keys(state.scenes.scenes)[0],
				},
			},
			{
				type: 'character.set-spell-slots',
				payload: { characterId: character.id, level: 1, max: 4, expended: 0 },
			},
		]) {
			const result = await rt.dispatch({ ...command, actorId: rt.defaultActorId });
			if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
		}
		return character.id;
	});
	const hpBefore = await page.evaluate(
		(id) =>
			(
				window.__rt!.state.characters as unknown as {
					characters: Record<string, { combat: { hp: number } }>;
				}
			).characters[id].combat.hp,
		characterId,
	);
	await page.getByLabel('Hit point change amount', { exact: true }).fill('1');
	await page.getByRole('button', { name: 'Damage 1', exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(
				(id) =>
					(
						window.__rt!.state.characters as unknown as {
							characters: Record<string, { combat: { hp: number } }>;
						}
					).characters[id].combat.hp,
				characterId,
			),
		)
		.toBe(Math.max(0, hpBefore - 1));
	await page.getByRole('button', { name: 'Level 1 slot 1 available', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Level 1 slot 4 expended', exact: true }),
	).toBeVisible();
	const portrait = await page.evaluate(() => {
		const canvas = document.createElement('canvas');
		canvas.width = 32;
		canvas.height = 32;
		const context = canvas.getContext('2d')!;
		context.fillStyle = '#c09060';
		context.fillRect(0, 0, 32, 32);
		return canvas.toDataURL('image/png').split(',')[1];
	});
	await page.getByLabel('Portrait', { exact: true }).setInputFiles({
		name: 'portrait.png',
		mimeType: 'image/png',
		buffer: Buffer.from(portrait, 'base64'),
	});
	await expect(page.locator('.character-sheet-portrait img')).toBeVisible();
	await page.reload();
	await expect(page.locator('.character-sheet-portrait img')).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Level 1 slot 4 expended', exact: true }),
	).toBeVisible();
});

test('rejects invalid portraits and keeps preview read-only', async ({ page }) => {
	await page.getByLabel('Portrait', { exact: true }).setInputFiles({
		name: 'bad.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not an image'),
	});
	await expect(page.getByRole('alert')).toContainText('Choose a PNG');
	await page.evaluate(async () => {
		const rt = window.__rt!;
		const chars = (rt.state.characters as { characters: Record<string, { id: string }> })
			.characters;
		for (const character of Object.values(chars)) {
			const result = await rt.dispatch({
				type: 'character.set-sharing',
				actorId: rt.defaultActorId,
				payload: { characterId: character.id, visibility: 'player-visible', sharedWith: [] },
			});
			if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
		}
		rt.enterPreview({
			role: 'player',
			playerActorId: rt.actors.find((a) => a.role === 'player')!.id,
		});
	});
	await expect(page.getByTestId('character-sheet')).toBeVisible();
	await expect(page.getByLabel('Portrait', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Short rest', exact: true })).toHaveCount(0);
	// RC-CHR-6.2 — read-only preview draws no write control in the Combat panel (RC-CHR-6.1 rule).
	await expect(page.locator('.character-sheet-combat button')).toHaveCount(0);
});
