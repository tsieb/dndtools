import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { FileSystemAdapter } from '../../mcp/storage.js';
import { createTempVaultDir, launchDesktopApp, closeDesktopApp } from './helpers/desktop-app.js';

function buildNote(
	id: string,
	title: string,
	content: string,
	overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		id,
		title,
		content,
		folder: '/',
		tags: [],
		frontmatter: {},
		createdAt: now,
		updatedAt: now,
		deleted: false,
		deletedAt: null,
		pinned: false,
		pinnedAt: null,
		...overrides,
	};
}

function buildMapObject(id: string, name: string, areaNoteId: string): Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		id,
		type: 'map',
		name,
		summary: 'Map seeded for interaction coverage.',
		tags: ['travel', 'atlas'],
		visibility: 'dm_only',
		relationships: [],
		data: {
			filePath: '.vault/assets/maps/interactive-map.png',
			width: 1200,
			height: 800,
			areaNoteId,
			scale: {
				unitsPerGridSquare: 1,
				unitLabel: 'mi',
			},
			grid: {
				type: 'square',
				visible: true,
				originX: 0,
				originY: 0,
				cellSize: 100,
			},
			layers: [
				{
					id: 'layer-default',
					name: 'Default',
					visible: true,
					playerVisible: true,
					colorTheme: 'amber',
				},
			],
			pois: [],
			routes: [],
		},
		createdAt: now,
		updatedAt: now,
	};
}

async function launchWithSeed(): Promise<Awaited<ReturnType<typeof launchDesktopApp>>> {
	const vaultDir = await createTempVaultDir('dndtools-e2e-interactive-vault-');
	const adapter = new FileSystemAdapter(vaultDir);
	await adapter.initialize();
	try {
		const now = new Date().toISOString();
		await adapter.saveNote(
			buildNote('note-shell-anchor', 'Navigation Anchor', 'ArcaneShellToken [[Route Atlas]]', {
				folder: '/campaign/quests',
				tags: ['quest', 'session'],
				pinned: true,
				pinnedAt: now,
			}) as never,
		);
		await adapter.saveNote(
			buildNote('note-route-atlas', 'Route Atlas', 'Map anchor note', {
				folder: '/campaign/locations',
				tags: ['location', 'travel'],
				frontmatter: {
					mapId: 'map-shell',
					type: 'location',
				},
			}) as never,
		);
		await adapter.saveNote(
			buildNote('note-campaign-npc', 'Captain Varyn', 'Campaign NPC anchor', {
				folder: '/campaign/npcs',
				tags: ['npc'],
				frontmatter: {
					dndtools: {
						object: {
							kind: 'npc',
							summary: 'Campaign anchor NPC',
							data: { disposition: 'active' },
						},
					},
				},
			}) as never,
		);
		await adapter.saveNote(
			buildNote('note-character-facet', 'Character Dossier', 'ArcaneShellToken facet helper', {
				folder: '/campaign/party',
				tags: ['party'],
				frontmatter: {
					type: 'character',
				},
			}) as never,
		);
		await adapter.resolveAndIndexLinks(
			'note-shell-anchor' as never,
			'ArcaneShellToken [[Route Atlas]]',
		);
		await adapter.saveObject(
			buildMapObject('map-shell', 'Shell Atlas', 'note-route-atlas') as never,
		);
		await adapter.saveSessionBoard({
			id: 'board-interactive' as never,
			name: 'Interactive Board',
			description: 'Board for interaction coverage',
			tiles: [
				{
					id: 'tile-note-anchor',
					type: 'note',
					noteId: 'note-shell-anchor',
					x: 0,
					y: 0,
					w: 5,
					h: 3,
				},
				{
					id: 'tile-note-map',
					type: 'note',
					noteId: 'note-route-atlas',
					x: 5,
					y: 0,
					w: 5,
					h: 3,
				},
				{
					id: 'tile-combat-anchor',
					type: 'combat',
					x: 0,
					y: 4,
					w: 10,
					h: 5,
					combat: {
						encounterName: 'Interactive Tie Reorder',
						systemId: 'dnd5e',
						round: 1,
						activeCombatantId: 'combatant-alpha',
						combatants: [
							{
								id: 'combatant-alpha',
								name: 'Alpha',
								initiative: 15,
								tieRank: 0,
								initiativeModifier: 0,
								ready: false,
								delayed: false,
								isPlayerCharacter: false,
								currentHp: 12,
								maxHp: 12,
								armorClass: 13,
								conditions: [],
								concentration: false,
								deathSaves: { successes: 0, failures: 0 },
								outcome: 'active',
								damageDealt: 0,
							},
							{
								id: 'combatant-beta',
								name: 'Beta',
								initiative: 15,
								tieRank: 1,
								initiativeModifier: 0,
								ready: false,
								delayed: false,
								isPlayerCharacter: false,
								currentHp: 10,
								maxHp: 10,
								armorClass: 12,
								conditions: [],
								concentration: false,
								deathSaves: { successes: 0, failures: 0 },
								outcome: 'active',
								damageDealt: 0,
							},
						],
						notes: '',
						loot: '',
						outcome: '',
						startedAt: now,
						endedAt: null,
						lastLogNoteId: null,
					},
				},
			],
			createdAt: now,
			updatedAt: now,
		} as never);
	} finally {
		await adapter.close();
	}
	return launchDesktopApp(vaultDir);
}

async function gotoDesktopPath(page: Page, route: string): Promise<void> {
	const origin = new URL(page.url()).origin;
	await page.goto(`${origin}${route}`);
}

async function ensureSidebarOpen(page: Page): Promise<void> {
	if ((await page.locator('aside:visible').count()) > 0) return;
	await page.getByRole('button', { name: 'Toggle local navigation' }).first().click();
	await expect(page.locator('aside:visible').first()).toBeVisible();
}

async function ensureDmMode(page: Page): Promise<void> {
	const exitPlayerModeButton = page.getByRole('button', { name: /Exit player mode/i }).first();
	if (await exitPlayerModeButton.isVisible().catch(() => false)) {
		await exitPlayerModeButton.click();
		await expect(page.getByRole('button', { name: /Enter player mode/i }).first()).toBeVisible();
	}
}

async function createNoteFromTopBar(page: Page): Promise<void> {
	await page.keyboard.press('Control+N');

	if (/\/notes\/[^/]+\/edit$/.test(page.url())) {
		return;
	}

	const templateDialog = page.getByRole('dialog', { name: 'New from Template' });
	if (await templateDialog.isVisible().catch(() => false)) {
		await templateDialog.locator('.grid button').first().click();
	}

	if (/\/notes\/[^/]+\/edit$/.test(page.url())) {
		return;
	}

	const firstRunButton = page.getByRole('button', { name: 'Create Your First Note' });
	if (await firstRunButton.isVisible().catch(() => false)) {
		await firstRunButton.click();
	}

	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const origin = new URL(page.url()).origin;
		await page.goto(`${origin}/notes?create=e2e-topbar-note`);
	}

	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const templateDialog = page.getByRole('dialog', { name: 'New from Template' });
		if (await templateDialog.isVisible().catch(() => false)) {
			await templateDialog.locator('.grid button').first().click();
		}
	}

	await expect(page).toHaveURL(/\/notes\/[^/]+\/edit$/);
}

test.describe('Desktop interactive controls coverage @critical', () => {
	test('top-bar buttons and overlays are fully interactive with visible state changes', async () => {
		const app = await launchWithSeed();
		try {
			await ensureDmMode(app.page);
			await ensureSidebarOpen(app.page);

			await app.page.getByRole('button', { name: 'Toggle local navigation' }).click();
			await expect(app.page.getByRole('button', { name: 'Tree' })).toHaveCount(0);
			await app.page.getByRole('button', { name: 'Toggle local navigation' }).click();
			await expect(app.page.getByRole('button', { name: 'Tree' })).toBeVisible();
			const handoutDialog = app.page.getByRole('dialog', { name: 'Create handout' });
			await app.page.keyboard.press('Control+Shift+H');
			await expect(handoutDialog).toBeVisible();
			await handoutDialog.getByRole('button', { name: 'Close' }).first().click();
			await expect(handoutDialog).toHaveCount(0);

			await createNoteFromTopBar(app.page);
			await expect(app.page.getByPlaceholder('Note title...')).toBeVisible();
			await app.page.getByRole('button', { name: 'Done' }).click();
			await expect(app.page).toHaveURL(/\/(notes\/[^/]+|knowledge\/notes)$/);

			await app.page.getByRole('button', { name: 'Open command palette' }).click();
			const commandPalette = app.page.getByRole('dialog', { name: 'Command palette' });
			await expect(commandPalette).toBeVisible();
			await app.page.keyboard.press('Escape');
			await expect(commandPalette).toHaveCount(0);

			await app.page.keyboard.press('Control+D');
			const diceTray = app.page.getByRole('dialog', { name: 'Dice tray' });
			await expect(diceTray).toBeVisible();
			await diceTray.getByRole('button', { name: 'Close' }).first().click();
			await expect(diceTray).toHaveCount(0);

			const anchorRelativePath = await app.page.evaluate(async () => {
				const note = await window.dndtoolsDesktop?.getNote('note-shell-anchor' as never);
				return note?.filePath ?? null;
			});
			expect(anchorRelativePath).toBeTruthy();
			const watcherToken = `Watcher sync ${Date.now()}`;
			await fs.appendFile(
				path.join(app.vaultDir, String(anchorRelativePath)),
				`\n\n${watcherToken}\n`,
				'utf8',
			);
			await expect
				.poll(async () => {
					const note = await app.page.evaluate(async () =>
						window.dndtoolsDesktop?.getNote('note-shell-anchor' as never),
					);
					return note?.content ?? '';
				})
				.toContain(watcherToken);

			await gotoDesktopPath(app.page, '/player');
			await expect(app.page).toHaveURL(/\/player$/);
			await gotoDesktopPath(app.page, '/knowledge/notes');
			await expect(app.page).toHaveURL(/\/(knowledge\/notes|notes)$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('drag workflows have keyboard and single-pointer alternatives', async () => {
		const app = await launchWithSeed();
		try {
			await app.page.setViewportSize({ width: 1500, height: 950 });
			await ensureDmMode(app.page);
			await ensureSidebarOpen(app.page);

			const resizeButton = app.page.getByRole('button', { name: 'Resize local navigation panel' });
			if ((await resizeButton.count()) > 0) {
				await expect(resizeButton).toBeVisible();
				const sidebar = app.page.locator('aside').first();
				const beforeWidth = Math.round((await sidebar.boundingBox())?.width ?? 0);
				await resizeButton.click();
				await expect
					.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
					.not.toBe(beforeWidth);
			}

			await gotoDesktopPath(app.page, '/session/boards');
			const enterEditButton = app.page.getByRole('button', { name: 'Enter Edit Mode' }).first();
			if (await enterEditButton.isVisible().catch(() => false)) {
				await enterEditButton.click();
			} else {
				await app.page.getByRole('button', { name: 'Edit' }).first().click();
			}
			await expect(
				app.page.getByText('Edit mode: drag, resize, style, and position tiles.'),
			).toBeVisible();
			const interactiveBoardButton = app.page
				.getByRole('button', { name: 'Interactive Board' })
				.first();
			if (await interactiveBoardButton.isVisible().catch(() => false)) {
				await interactiveBoardButton.click();
			}
			const tileOptionsButton = app.page.getByRole('button', { name: /Tile options for/i }).first();
			if ((await tileOptionsButton.count()) > 0) {
				await expect(tileOptionsButton).toBeVisible();
				await tileOptionsButton.click();
				await app.page.getByRole('menuitem', { name: 'Move tile' }).first().click();

				await tileOptionsButton.click();
				await app.page.getByRole('menuitem', { name: 'Resize tile' }).first().click();
				await app.page.keyboard.press('ArrowRight');
				await app.page.keyboard.press('Enter');
			}

			const boardCanvas = app.page.getByRole('application', { name: 'Session board canvas' });
			await boardCanvas.focus();
			await expect(boardCanvas).toBeFocused();

			const fitButton = app.page.getByRole('button', { name: 'Fit', exact: true });
			const comfortableButton = app.page.getByRole('button', {
				name: 'Comfortable',
				exact: true,
			});
			const detailButton = app.page.getByRole('button', { name: 'Detail', exact: true });
			await app.page.keyboard.press('1');
			await expect(comfortableButton).toHaveAttribute('aria-pressed', 'true');
			await app.page.keyboard.press('2');
			await expect(detailButton).toHaveAttribute('aria-pressed', 'true');
			await app.page.keyboard.press('-');
			await expect(comfortableButton).toHaveAttribute('aria-pressed', 'true');
			await app.page.keyboard.press('=');
			await expect(detailButton).toHaveAttribute('aria-pressed', 'true');
			await app.page.keyboard.press('0');
			await expect(fitButton).toHaveAttribute('aria-pressed', 'true');

			const noteAnchorTile = app.page
				.getByRole('button', { name: 'Session board tile: Navigation Anchor' })
				.first();
			const activeTileLabel = async () =>
				app.page.evaluate(
					() => (document.activeElement as HTMLElement | null)?.getAttribute('aria-label') ?? null,
				);
			await app.page.keyboard.press('Tab');
			const firstFocusedTileLabel = await activeTileLabel();
			expect(firstFocusedTileLabel).toContain('tile');
			await app.page.keyboard.press('Tab');
			const secondFocusedTileLabel = await activeTileLabel();
			expect(secondFocusedTileLabel).toContain('tile');
			expect(secondFocusedTileLabel).not.toBe(firstFocusedTileLabel);
			await app.page.keyboard.press('Tab');
			const thirdFocusedTileLabel = await activeTileLabel();
			expect(thirdFocusedTileLabel).toContain('tile');
			expect(thirdFocusedTileLabel).not.toBe(secondFocusedTileLabel);
			await app.page.keyboard.press('Shift+Tab');
			await expect.poll(activeTileLabel).toBe(secondFocusedTileLabel);

			await noteAnchorTile.focus();
			await app.page.keyboard.press('Enter');

			const noteAnchorXBefore = await app.page.evaluate(async () => {
				const boards = (await window.dndtoolsDesktop?.getSessionBoards()) ?? [];
				const board = boards.find((entry) => entry.id === 'board-interactive');
				return board?.tiles.find((tile) => tile.id === 'tile-note-anchor')?.x ?? null;
			});
			expect(noteAnchorXBefore).not.toBeNull();
			await noteAnchorTile.focus();
			await app.page.keyboard.press('Space');
			await app.page.keyboard.press('ArrowRight');
			await app.page.keyboard.press('Enter');
			await expect
				.poll(async () => {
					const boards =
						(await app.page.evaluate(async () => window.dndtoolsDesktop?.getSessionBoards())) ?? [];
					const board = boards.find((entry) => entry.id === 'board-interactive');
					return board?.tiles.find((tile) => tile.id === 'tile-note-anchor')?.x ?? null;
				})
				.toBe((noteAnchorXBefore ?? 0) + 1);

			await noteAnchorTile.focus();
			await app.page.keyboard.press('Space');
			for (let index = 0; index < 18; index += 1) {
				await app.page.keyboard.press('ArrowRight');
			}
			await expect(
				app.page.getByText('Some tiles extend beyond the visible board width.'),
			).toBeVisible();
			await app.page.keyboard.press('Escape');
			const fixLayoutButton = app.page.getByRole('button', { name: 'Fix layout' });
			if (await fixLayoutButton.isVisible().catch(() => false)) {
				await fixLayoutButton.click();
			}

			await noteAnchorTile.focus();
			await app.page.keyboard.press('Delete');
			const removeTileDialog = app.page.getByRole('dialog', { name: 'Remove tile?' });
			await expect(removeTileDialog).toBeVisible();
			await removeTileDialog.getByRole('button', { name: 'Cancel' }).click();
			await expect(removeTileDialog).toHaveCount(0);

			await boardCanvas.focus();
			await app.page.keyboard.press('a');
			const addTileSheet = app.page.getByRole('dialog', { name: 'Add tile' });
			await expect(addTileSheet).toBeVisible();
			await app.page.keyboard.press('Escape');
			await expect(addTileSheet).toHaveCount(0);

			const moveAlphaDownButton = app.page
				.getByRole('button', { name: 'Move Alpha down' })
				.locator(':not([disabled])');
			if ((await moveAlphaDownButton.count()) > 0) {
				const firstCombatantBefore = await app.page
					.locator('li[draggable] input[type="text"]')
					.first()
					.inputValue();
				await moveAlphaDownButton.click();
				await expect
					.poll(async () =>
						app.page.locator('li[draggable] input[type="text"]').first().inputValue(),
					)
					.not.toBe(firstCombatantBefore);
			}
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('sidebar links, mode toggles, and navigation controls update routes and visible sections', async () => {
		const app = await launchWithSeed();
		try {
			await ensureDmMode(app.page);
			await ensureSidebarOpen(app.page);
			const sidebar = app.page.locator('aside:visible').first();
			const primaryNav = app.page.getByRole('navigation', { name: 'Primary' }).first();

			await gotoDesktopPath(app.page, '/knowledge/notes');
			await expect(app.page).toHaveURL(/\/notes$/);
			await expect(
				app.page.getByRole('heading', { name: /All Notes|Player Notes|Notes tagged/i }),
			).toBeVisible();
			await gotoDesktopPath(app.page, '/knowledge/search');
			await expect(app.page).toHaveURL(/\/search$/);
			await expect(app.page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();
			await ensureSidebarOpen(app.page);
			await primaryNav.getByRole('link', { name: 'Atlas' }).first().click();
			await expect(app.page).toHaveURL(/\/atlas\/maps$/);
			await ensureSidebarOpen(app.page);
			await primaryNav.getByRole('link', { name: 'Knowledge' }).first().click();
			await expect(app.page).toHaveURL(/\/knowledge$/);

			const backButton = app.page.getByRole('button', { name: 'Go back' });
			const forwardButton = app.page.getByRole('button', { name: 'Go forward' });
			await expect(backButton).toBeVisible();
			await expect(forwardButton).toBeVisible();
			if (await backButton.isEnabled()) {
				await backButton.click();
				await expect(app.page).toHaveURL(/\/atlas\/maps$/);
				await expect(forwardButton).toBeEnabled();
				await forwardButton.click();
				await expect(app.page).toHaveURL(/\/knowledge$/);
			} else {
				await expect(backButton).toBeDisabled();
			}

			const routeChecks: Array<{ label: string; url: RegExp }> = [
				{ label: 'Atlas', url: /\/atlas\/maps$/ },
				{ label: 'Campaign', url: /\/campaign\/timeline$/ },
				{ label: 'Session', url: /\/session\/boards$/ },
				{ label: 'Settings', url: /\/settings$/ },
				{ label: 'Knowledge', url: /\/knowledge$/ },
			];
			for (const route of routeChecks) {
				await ensureSidebarOpen(app.page);
				await primaryNav.getByRole('link', { name: route.label }).first().click();
				await expect(app.page).toHaveURL(route.url);
			}

			await gotoDesktopPath(app.page, '/knowledge/graph');
			await expect(app.page).toHaveURL(/\/knowledge\/graph$/);
			await gotoDesktopPath(app.page, '/session/encounter/new');
			await expect(app.page).toHaveURL(/\/session\/encounter\/new$/);
			await gotoDesktopPath(app.page, '/session/combat');
			await expect(app.page).toHaveURL(/\/session\/combat$/);
			await gotoDesktopPath(app.page, '/knowledge/notes');
			await expect(app.page).toHaveURL(/\/notes$/);
			await expect(sidebar).toBeVisible();

			await gotoDesktopPath(app.page, '/knowledge');
			await expect(app.page).toHaveURL(/\/knowledge$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('search interactions cover operators, facets, and result navigation', async () => {
		const app = await launchWithSeed();
		try {
			await gotoDesktopPath(app.page, '/knowledge/search');
			await expect(app.page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();

			const input = app.page.getByPlaceholder('Search notes...');
			await input.fill('ArcaneShellToken');
			await expect(
				app.page.getByRole('option', { name: 'Navigation Anchor' }).first(),
			).toBeVisible();

			const operatorsToggle = app.page
				.locator('button[aria-controls="search-operator-cheatsheet"]:visible')
				.first();
			await expect(operatorsToggle).toBeVisible();
			await expect(operatorsToggle).toHaveAttribute('aria-controls', 'search-operator-cheatsheet');

			const facetsPanel = app.page.locator('#search-facets-panel');
			const facetsToggle = app.page.getByRole('button', { name: /Facets/ });
			await expect(facetsPanel).toBeVisible();
			await expect(facetsToggle).toBeVisible();
			const firstFacet = facetsPanel.locator('button').first();
			await expect(firstFacet).toBeVisible();
			await firstFacet.click();
			const clearFacetsButton = app.page.getByRole('button', { name: 'Clear' }).first();
			if (await clearFacetsButton.isEnabled()) {
				await clearFacetsButton.click();
			}

			await input.fill('ArcaneShellToken');
			await app.page
				.locator('section button.font-semibold', { hasText: 'Navigation Anchor' })
				.first()
				.click();
			await expect(app.page).toHaveURL(/\/notes\/note-shell-anchor$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('note view and editor interactions update UI state and persisted content', async () => {
		const app = await launchWithSeed();
		try {
			await gotoDesktopPath(app.page, '/knowledge/notes/note-shell-anchor');
			await expect(app.page.getByRole('heading', { name: 'Navigation Anchor' })).toBeVisible();

			await app.page.getByPlaceholder('Quick add to this note...').fill('Checklist bullet');
			await app.page.getByRole('button', { name: 'Add' }).click();
			await expect
				.poll(async () => {
					const note = await app.page.evaluate(async () =>
						window.dndtoolsDesktop?.getNote('note-shell-anchor' as never),
					);
					return note?.content ?? '';
				})
				.toContain('- Checklist bullet');

			await app.page.getByRole('button', { name: 'Focus Reading' }).click();
			await expect(app.page.getByRole('button', { name: 'Toggle local navigation' })).toHaveCount(
				0,
			);
			await expect(app.page.getByRole('button', { name: 'Exit Focus Reading' })).toBeVisible();
			await app.page.getByRole('button', { name: 'Exit Focus Reading' }).click();
			await expect(app.page.getByRole('button', { name: 'Toggle local navigation' })).toBeVisible();

			await app.page.getByRole('button', { name: 'Edit' }).click();
			await expect(app.page).toHaveURL(/\/notes\/note-shell-anchor\/edit$/);
			await expect(app.page.getByRole('heading', { name: 'Edit Navigation Anchor' })).toBeVisible();

			await app.page.locator('.cm-content').first().click();
			await app.page.keyboard.type('\nEditor interactive coverage line');
			await app.page.getByRole('button', { name: 'Save' }).click();
			await expect(app.page.getByRole('status').getByText('Note saved')).toBeVisible();
			await app.page.getByRole('button', { name: 'Done' }).click();
			await expect(app.page).toHaveURL(/\/notes\/note-shell-anchor$/);
			await expect
				.poll(async () => {
					const note = await app.page.evaluate(async () =>
						window.dndtoolsDesktop?.getNote('note-shell-anchor' as never),
					);
					return note?.content ?? '';
				})
				.toContain('Editor interactive coverage line');
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('settings tabs and tab-panel controls are all actionable', async () => {
		const app = await launchWithSeed();
		try {
			await gotoDesktopPath(app.page, '/settings');
			await expect(app.page.getByRole('heading', { name: 'Settings' })).toBeVisible();

			const tabChecks: Array<{ name: string; assert: () => Promise<void> }> = [
				{
					name: 'General',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'Appearance' }).first()).toBeVisible(),
				},
				{
					name: 'About',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'Updates' }).first()).toBeVisible(),
				},
				{
					name: 'World Calendar',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'In-World Date' }).first()).toBeVisible(),
				},
				{
					name: 'Vault',
					assert: () =>
						expect(
							app.page
								.getByRole('button', { name: /Save Backup Settings|Create Safety Snapshot/ })
								.first(),
						).toBeVisible(),
				},
				{
					name: 'Sync',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'Sync Status' }).first()).toBeVisible(),
				},
				{
					name: 'Handouts',
					assert: () =>
						expect(
							app.page.getByRole('heading', { name: 'Handout Library' }).first(),
						).toBeVisible(),
				},
				{
					name: 'MCP',
					assert: () =>
						expect(app.page.getByRole('heading', { name: 'MCP Sidecar' }).first()).toBeVisible(),
				},
				{
					name: 'System Health',
					assert: () =>
						expect(
							app.page.getByRole('button', { name: /Export Diagnostics Bundle|Refresh/ }).first(),
						).toBeVisible(),
				},
			];

			const ensureTabVisible = async (name: string): Promise<void> => {
				const tab = app.page.getByRole('tab', { name });
				const visible = await tab
					.first()
					.isVisible()
					.catch(() => false);
				if (visible) return;
				const advancedToggle = app.page.getByRole('button', { name: /Advanced/i }).first();
				await expect(advancedToggle).toBeVisible();
				const expanded = await advancedToggle.getAttribute('aria-expanded');
				if (expanded !== 'true') {
					await advancedToggle.click();
				}
				await expect(tab.first()).toBeVisible();
			};

			for (const tab of tabChecks) {
				await ensureTabVisible(tab.name);
				await app.page.getByRole('tab', { name: tab.name }).click();
				await expect(app.page.getByRole('tab', { name: tab.name })).toHaveAttribute(
					'aria-selected',
					'true',
				);
				await tab.assert();
			}

			await gotoDesktopPath(app.page, '/settings?tab=sync');
			await app.page.getByRole('button', { name: 'Save Strategy' }).click();
			await expect(app.page.getByRole('button', { name: 'Save Strategy' })).toBeVisible();

			await gotoDesktopPath(app.page, '/settings?tab=handouts');
			await app.page.getByRole('button', { name: 'Create Handout' }).click();
			const handoutDialog = app.page.getByRole('dialog', { name: 'Create handout' });
			await expect(handoutDialog).toBeVisible();
			await handoutDialog.getByRole('button', { name: 'Close' }).first().click();
			await expect(handoutDialog).toHaveCount(0);
		} finally {
			await closeDesktopApp(app);
		}
	});
});
