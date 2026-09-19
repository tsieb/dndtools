import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterPreview, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-CAN-6.1 — the scene editor's "what player X sees" overlay. It dims the tiles the previewed
// actor would not get and says why, suspends editing without touching the scene, and leaves with
// Escape. The isolation guard below is the story's second acceptance criterion: the overlay must be
// drawn from the PREVIEWED actor's read, never the DM's. It imports the overlay's own model into the
// page — the same `new Function('return import(...)')` seam isolation-guard.spec.ts uses — computes
// both reads, and checks the rendered verdicts equal the actor's and could not have been the DM's.

type Verdicts = Record<string, string>;

interface Fixture {
	sceneId: string;
	dmId: string;
	notice: string;
	ambush: string;
	contact: string;
	/** Map tiles: a player-visible map, a DM-only map, and a map that no longer exists. */
	chart: string;
	crypt: string;
	lost: string;
}

/**
 * A scene with one tile for each case: player-visible, DM-only by setting, DM-only by bound
 * character, and three map tiles whose verdict only the map read can give.
 */
async function seedScene(
	page: Page,
	name: string,
	visibility: 'player-visible' | 'dm-only',
): Promise<Fixture> {
	return page.evaluate(
		async ({ name, visibility }) => {
			const rt = window.__rt!;
			const dmId = rt.defaultActorId;
			const run = async (command: Record<string, unknown>) => {
				const result = await rt.dispatch(command);
				if (result.status !== 'accepted') {
					throw new Error(
						`${String(command.type)} was ${result.status}: ${JSON.stringify(result)}`,
					);
				}
			};
			await run({
				type: 'scene.create',
				actorId: dmId,
				payload: { name, description: '', visibility, tags: [] },
			});
			const scene = Object.values(rt.state.scenes.scenes).find((s) => s.name === name);
			if (!scene) throw new Error(`scene ${name} was not created`);
			const characters = (
				rt.state as unknown as {
					characters: { characters: Record<string, { id: string; visibility: string }> };
				}
			).characters.characters;
			// The demo seed's DM-only NPCs (Mira the Ferryman, the Hollow King).
			const npc = Object.values(characters).find((c) => c.visibility === 'dm-only');
			if (!npc) throw new Error('the demo seed has no DM-only NPC to bind');
			const createMap = async (mapName: string, mapVisibility: string) => {
				await run({
					type: 'map.create',
					actorId: dmId,
					payload: { name: mapName, visibility: mapVisibility },
				});
				const maps = (
					rt.state as unknown as { maps: { maps: Record<string, { id: string; name: string }> } }
				).maps.maps;
				const map = Object.values(maps).find((m) => m.name === mapName);
				if (!map) throw new Error(`map ${mapName} was not created`);
				return map.id;
			};
			const chartMap = await createMap(`${name} chart`, 'player-visible');
			const cryptMap = await createMap(`${name} crypt`, 'dm-only');
			const add = (
				type: string,
				x: number,
				y: number,
				configuration: Record<string, unknown>,
				source: { entityType: string; entityId: string } | null = null,
			) =>
				run({
					type: 'scene.add-widget',
					actorId: dmId,
					payload: {
						sceneId: scene.id,
						widget: {
							type,
							version: '1.0.0',
							layout: { x, y, w: 260, h: 180 },
							configuration,
							localState: {},
							binding: source ? { source, mode: 'read', requiredCapability: 'viewer' } : null,
						},
					},
				});
			await add('note', 48, 48, { visibility: 'player-visible', title: 'Harbor notice' });
			await add('note', 340, 48, { visibility: 'dm-only', title: 'Ambush plan' });
			await add(
				'character',
				48,
				260,
				{ visibility: 'player-visible', title: 'Ferry contact' },
				{ entityType: 'character', entityId: npc.id },
			);
			const mapTile = (x: number, y: number, title: string, entityId: string) =>
				add('map', x, y, { visibility: 'player-visible', title }, { entityType: 'map', entityId });
			await mapTile(340, 260, 'Harbor chart', chartMap);
			await mapTile(632, 48, 'Crypt map', cryptMap);
			await mapTile(632, 260, 'Lost map', 'map-that-was-deleted');
			const [notice, ambush, contact, chart, crypt, lost] = rt.state.scenes.scenes[
				scene.id
			]!.widgets.map((w) => w.id);
			return {
				sceneId: scene.id,
				dmId,
				notice: notice!,
				ambush: ambush!,
				contact: contact!,
				chart: chart!,
				crypt: crypt!,
				lost: lost!,
			};
		},
		{ name, visibility },
	);
}

/** The overlay model's verdicts for the previewed actor and for the DM, computed in the page. */
function modelReads(page: Page, f: Fixture): Promise<{ actor: Verdicts; dm: Verdicts }> {
	return page.evaluate(
		async ({ sceneId, dmId }) => {
			type Read = { tiles: Record<string, { tone: string; reason: string }> };
			const model = await (new Function(
				'return import("/src/screens/sceneEditor/playerPreview.ts")',
			)() as Promise<{ readPlayerPreview: (state: unknown, actorId: string, id: string) => Read }>);
			const rt = window.__rt!;
			const verdicts = (actorId: string) =>
				Object.fromEntries(
					Object.entries(model.readPlayerPreview(rt.state, actorId, sceneId).tiles).map(
						([id, v]) => [id, `${v.tone}:${v.reason}`],
					),
				);
			return { actor: verdicts(rt.preview!.actorId), dm: verdicts(dmId) };
		},
		{ sceneId: f.sceneId, dmId: f.dmId },
	);
}

/** What the overlay actually rendered, tile id → `tone:reason`. */
function renderedVerdicts(overlay: Locator): Promise<Verdicts> {
	return overlay
		.locator('[data-testid^="preview-tile-"]')
		.evaluateAll((tiles) =>
			Object.fromEntries(
				tiles.map((tile) => [
					tile.getAttribute('data-testid')!.slice('preview-tile-'.length),
					`${tile.getAttribute('data-tone')}:${tile.getAttribute('data-reason')}`,
				]),
			),
		);
}

function sceneSnapshot(page: Page, sceneId: string): Promise<string> {
	return page.evaluate((id) => JSON.stringify(window.__rt!.state.scenes.scenes[id]), sceneId);
}

test.describe('scene editor: player-view preview overlay', () => {
	test('dims what a player cannot see, from the player’s own read, and Escape returns to editing', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		const f = await seedScene(page, 'Preview Harbor', 'player-visible');
		await gotoRoute(page, `/scene/${f.sceneId}`);

		const overlay = page.getByTestId('player-preview-overlay');
		const stage = page.getByTestId('scene-editor-stage');
		await expect(page.getByRole('heading', { name: 'Preview Harbor' })).toBeVisible();
		await expect(overlay).toHaveCount(0);
		const before = await sceneSnapshot(page, f.sceneId);

		// Enter from the canvas's own switcher.
		await page.getByRole('button', { name: 'Preview this scene as another role' }).click();
		await page.getByRole('menuitemradio', { name: 'Any player' }).click();
		await expect(overlay).toBeVisible();
		await expect(overlay).toContainText('What Player sees');

		// Isolation guard, part 1: the overlay says whose read it drew, and that is the preview actor.
		const previewActor = await page.evaluate(() => window.__rt!.preview!.actorId);
		expect(previewActor).not.toBe(f.dmId);
		await expect(overlay).toHaveAttribute('data-read-actor', previewActor);

		const tile = (id: string) => overlay.getByTestId(`preview-tile-${id}`);
		await expect(tile(f.notice)).toHaveAttribute('data-tone', 'visible');
		await expect(tile(f.ambush)).toHaveAttribute('data-tone', 'hidden');
		await expect(tile(f.ambush)).toContainText('this tile is set to DM only');
		// Only the core's binding resolution, run as the player, can withhold this one: its own
		// setting says players.
		await expect(tile(f.contact)).toHaveAttribute('data-tone', 'hidden');
		await expect(tile(f.contact)).toContainText('it shows DM-only content');
		// Map tiles: the map read, made as the player, decides. A DM-only map is withheld even though
		// the tile says players; a deleted map is an honest placeholder, not a visible tile.
		await expect(tile(f.chart)).toHaveAttribute('data-tone', 'visible');
		await expect(tile(f.crypt)).toHaveAttribute('data-tone', 'hidden');
		await expect(tile(f.crypt)).toHaveAttribute('data-reason', 'bindingDmOnly');
		await expect(tile(f.crypt)).toContainText('it shows DM-only content');
		await expect(tile(f.lost)).toHaveAttribute('data-tone', 'placeholder');
		await expect(tile(f.lost)).toHaveAttribute('data-reason', 'missing');

		// Isolation guard, part 2: rendered verdicts == the actor read, and != the DM read.
		const reads = await modelReads(page, f);
		const rendered = await renderedVerdicts(overlay);
		expect(rendered).toEqual(reads.actor);
		expect(reads.dm[f.ambush]).toBe('visible:visible');
		expect(reads.dm[f.contact]).toBe('visible:visible');
		expect(reads.dm[f.crypt]).toBe('visible:visible');
		expect(rendered).not.toEqual(reads.dm);

		// Editing is suspended: no layout controls, and the canvas is out of reach under the overlay.
		await expect(page.getByRole('button', { name: 'Edit layout' })).toHaveCount(0);
		await expect(stage).toHaveAttribute('inert', '');

		await page.keyboard.press('Escape');
		await expect(overlay).toHaveCount(0);
		expect(await page.evaluate(() => window.__rt!.preview)).toBeNull();
		await expect(page.getByRole('button', { name: 'Edit layout' })).toBeVisible();
		await expect(stage).not.toHaveAttribute('inert');
		// Non-destructive: the scene is byte-identical to before the preview.
		expect(await sceneSnapshot(page, f.sceneId)).toBe(before);
	});

	test('a scene the player cannot open previews as all-hidden, and Exit preview restores the DM view', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/scenes');
		await seedFresh(page);
		const f = await seedScene(page, 'Preview Crypt', 'dm-only');
		await gotoRoute(page, `/scene/${f.sceneId}`);
		await expect(page.getByRole('heading', { name: 'Preview Crypt' })).toBeVisible();

		// Enter from the shell's seam rather than the canvas switcher: the overlay follows the runtime.
		await enterPreview(page, 'player');
		const overlay = page.getByTestId('player-preview-overlay');
		await expect(overlay).toBeVisible();
		// Not the "Scene unavailable" card: the overlay explains why the player gets nothing.
		await expect(page.getByText('Scene unavailable')).toHaveCount(0);
		await expect(overlay.getByRole('note')).toContainText('can’t open this scene');
		for (const id of [f.notice, f.ambush, f.contact, f.chart, f.crypt, f.lost]) {
			await expect(overlay.getByTestId(`preview-tile-${id}`)).toHaveAttribute(
				'data-reason',
				'sceneDmOnly',
			);
		}
		const reads = await modelReads(page, f);
		expect(await renderedVerdicts(overlay)).toEqual(reads.actor);

		await overlay.getByRole('button', { name: 'Exit preview' }).click();
		await expect(overlay).toHaveCount(0);
		expect(await page.evaluate(() => window.__rt!.preview)).toBeNull();
		// Focus lands on the scene's own switcher, not <body>, once the Exit button is gone.
		await expect(
			page.getByRole('button', { name: 'Preview this scene as another role' }),
		).toBeFocused();
	});
});
