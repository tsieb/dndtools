import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-WID-4.3 — the Inspector's Binding section. The DM searches their own entities, binds one,
// picks the binding mode, and reads the resolver's verdict for themselves and for players. The
// acceptance criterion: binding a player-hidden NPC reads `hidden` for players in the Inspector AND
// in the scene's player preview, which draws from the previewed player's own core read.

interface Instance {
	id: string;
	type: string;
	binding: {
		source: { entityType: string; entityId: string };
		mode: string;
		requiredCapability: string;
	} | null;
}

interface Seam {
	defaultActorId: string;
	state: {
		scenes: { scenes: Record<string, { name: string; widgets: Instance[] }> };
		characters: { characters: Record<string, { id: string; name: string; visibility: string }> };
	};
}

/** A player-visible scene holding one unbound, player-visible Character tile, and the demo seed's
 *  first DM-only NPC (Mira the Ferryman or the Hollow King). */
async function seed(page: Page, name: string) {
	const dmId = await page.evaluate(() => window.__rt!.defaultActorId);
	expect(
		(
			await dispatch(page, {
				type: 'scene.create',
				actorId: dmId,
				payload: { name, description: '', visibility: 'player-visible', tags: [] },
			})
		).status,
	).toBe('accepted');
	const { sceneId, npc } = await page.evaluate((sceneName) => {
		const rt = window.__rt as unknown as Seam;
		const scene = Object.entries(rt.state.scenes.scenes).find(([, s]) => s.name === sceneName);
		const hidden = Object.values(rt.state.characters.characters).find(
			(c) => c.visibility === 'dm-only',
		);
		return { sceneId: scene?.[0] ?? null, npc: hidden ?? null };
	}, name);
	if (!sceneId) throw new Error(`scene ${name} was not created`);
	if (!npc) throw new Error('the demo seed has no DM-only NPC to bind');
	expect(
		(
			await dispatch(page, {
				type: 'scene.add-widget',
				actorId: dmId,
				payload: {
					sceneId,
					widget: {
						type: 'character',
						version: '1.0.0',
						layout: { x: 48, y: 48, w: 260, h: 180 },
						configuration: { visibility: 'player-visible', title: 'Ferry contact' },
						localState: {},
						binding: null,
					},
				},
			})
		).status,
	).toBe('accepted');
	const widgetId = await page.evaluate(
		(id) => (window.__rt as unknown as Seam).state.scenes.scenes[id]!.widgets[0]!.id,
		sceneId,
	);
	return { dmId, sceneId, widgetId, npc };
}

function binding(page: Page, sceneId: string, widgetId: string) {
	return page.evaluate(
		({ sceneId, widgetId }) =>
			(window.__rt as unknown as Seam).state.scenes.scenes[sceneId]!.widgets.find(
				(w) => w.id === widgetId,
			)!.binding,
		{ sceneId, widgetId },
	);
}

test.describe('scene editor: widget bindings inspector', () => {
	test('binding a player-hidden NPC reads hidden for players, in the Inspector and the player preview', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		const f = await seed(page, 'Binding Wharf');
		await gotoRoute(page, `/scene/${f.sceneId}`);
		await expect(page.getByRole('heading', { name: 'Binding Wharf' })).toBeVisible();
		await page.getByRole('button', { name: 'Edit layout' }).click();

		const tile = page.getByTestId(`widget-${f.widgetId}`);
		await tile.focus();
		await page.keyboard.press('Enter');
		const section = page.getByTestId('widget-inspector').getByTestId('widget-inspector-binding');
		await expect(section).toBeVisible();

		// Unbound: nothing to resolve yet, for anyone.
		await expect(section.getByTestId('binding-current')).toHaveText('Not bound to anything yet.');
		await expect(section.getByTestId('binding-state-dm')).toHaveAttribute('data-state', 'unbound');
		await expect(section.getByTestId('binding-state-players')).toHaveAttribute(
			'data-state',
			'unbound',
		);
		// Mode needs a binding to apply to.
		await expect(section.getByLabel('Binding mode')).toBeDisabled();

		// Search the DM's own entities — DM-only NPCs included — and bind the hidden one.
		await section.getByLabel('Find a character to bind').fill(f.npc.name);
		await section.getByRole('button', { name: `Bind to ${f.npc.name}` }).click();
		await expect(section.getByTestId('binding-current')).toHaveText(`Shows ${f.npc.name}`);
		expect(await binding(page, f.sceneId, f.widgetId)).toEqual({
			source: { entityType: 'character', entityId: f.npc.id },
			mode: 'read',
			requiredCapability: 'viewer',
		});

		// The resolver: the DM gets it; players get `hidden`, with the fail-closed copy.
		await expect(section.getByTestId('binding-state-dm')).toHaveAttribute(
			'data-state',
			'available',
		);
		const players = section.getByTestId('binding-state-players');
		await expect(players).toHaveAttribute('data-state', 'hidden');
		await expect(players).toContainText('Hidden');
		await expect(players).toContainText('It is DM only.');
		await expect(players).toContainText('never told whether it still exists or has a conflict');

		// Mode: a change rewrites the binding's mode and the capability it asks for.
		await section.getByLabel('Binding mode').selectOption('operate');
		await expect
			.poll(() => binding(page, f.sceneId, f.widgetId))
			.toEqual({
				source: { entityType: 'character', entityId: f.npc.id },
				mode: 'operate',
				requiredCapability: 'operator',
			});
		await expect(players).toHaveAttribute('data-state', 'hidden');

		// The player preview, drawn from the previewed player's own read, agrees.
		await page.getByRole('button', { name: 'Done' }).click();
		await page.getByRole('button', { name: 'Preview this scene as another role' }).click();
		await page.getByRole('menuitemradio', { name: 'Any player' }).click();
		const overlay = page.getByTestId('player-preview-overlay');
		await expect(overlay).toBeVisible();
		const previewed = overlay.getByTestId(`preview-tile-${f.widgetId}`);
		await expect(previewed).toHaveAttribute('data-tone', 'hidden');
		await expect(previewed).toHaveAttribute('data-reason', 'bindingDmOnly');
		await page.keyboard.press('Escape');
		await expect(overlay).toHaveCount(0);
	});

	test('a character shared with one player reads hidden for players in general, and says why', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		const f = await seed(page, 'Binding Quay');
		// The demo seed's PCs are `shared` with their owning player only.
		const pc = await page.evaluate(
			() =>
				Object.values((window.__rt as unknown as Seam).state.characters.characters).find(
					(c) => c.visibility === 'shared',
				) ?? null,
		);
		if (!pc) throw new Error('the demo seed has no shared character');
		await gotoRoute(page, `/scene/${f.sceneId}`);
		await page.getByRole('button', { name: 'Edit layout' }).click();
		await page.getByTestId(`widget-${f.widgetId}`).focus();
		await page.keyboard.press('Enter');
		const section = page.getByTestId('widget-inspector-binding');

		// A search that matches nothing says so rather than showing an empty list.
		const search = section.getByLabel('Find a character to bind');
		await search.fill('zzz-no-such-character');
		await expect(section).toContainText('Nothing matches “zzz-no-such-character”.');

		await search.fill(pc.name);
		await section.getByRole('button', { name: `Bind to ${pc.name}` }).click();
		await expect(section.getByTestId('binding-current')).toHaveText(`Shows ${pc.name}`);
		await expect(section.getByTestId('binding-state-dm')).toHaveAttribute(
			'data-state',
			'available',
		);
		const players = section.getByTestId('binding-state-players');
		await expect(players).toHaveAttribute('data-state', 'hidden');
		await expect(players).toContainText('It is shared only with specific players.');
	});
});
