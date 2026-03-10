import { test, expect, type Page } from '@playwright/test';
import { FileSystemAdapter } from '../../mcp/storage.js';
import { createTempVaultDir, launchDesktopApp, closeDesktopApp } from './helpers/desktop-app.js';

function buildNote(id: string, title: string, content: string): Record<string, unknown> {
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
	};
}

function buildMapObject(id: string, name: string, areaNoteId: string): Record<string, unknown> {
	const now = new Date().toISOString();
	return {
		id,
		type: 'map',
		name,
		summary: 'Map seeded for desktop critical workflow coverage.',
		tags: ['travel', 'region'],
		visibility: 'dm_only',
		relationships: [],
		data: {
			filePath: '.vault/assets/maps/coverage-map.png',
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

async function launchWithSeed(
	seed?: (adapter: FileSystemAdapter) => Promise<void>,
): Promise<Awaited<ReturnType<typeof launchDesktopApp>>> {
	const vaultDir = await createTempVaultDir('dndtools-e2e-vault-');
	if (seed) {
		const adapter = new FileSystemAdapter(vaultDir);
		await adapter.initialize();
		try {
			await seed(adapter);
		} finally {
			await adapter.close();
		}
	}
	return launchDesktopApp(vaultDir);
}

async function gotoDesktopPath(page: Page, route: string): Promise<void> {
	const origin = new URL(page.url()).origin;
	await page.goto(`${origin}${route}`);
}

async function startNewNote(page: Page): Promise<void> {
	await gotoDesktopPath(page, '/knowledge/notes');
	await page.keyboard.press('Control+N');
	if (/\/notes\/[^/]+\/edit$/.test(page.url())) {
		return;
	}
	const newNoteButtons = page.getByRole('button', { name: 'New Note' });
	const newNoteButtonCount = await newNoteButtons.count();
	if (newNoteButtonCount > 0) {
		const targetIndex = newNoteButtonCount > 1 ? 1 : 0;
		await newNoteButtons.nth(targetIndex).click();
	}
	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const templateDialog = page.getByRole('dialog', { name: 'New from Template' });
		if ((await templateDialog.count()) > 0) {
			await templateDialog.getByRole('button').first().click();
		}
	}
	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const firstRunButton = page.getByRole('button', { name: 'Create Your First Note' });
		if ((await firstRunButton.count()) > 0) {
			await firstRunButton.first().click();
		}
	}
	if (!/\/notes\/[^/]+\/edit$/.test(page.url())) {
		const origin = new URL(page.url()).origin;
		await page.goto(`${origin}/knowledge/notes?create=e2e-note`);
	}
	await expect
		.poll(() => /\/notes\/[^/]+\/edit$/.test(page.url()), {
			timeout: 20_000,
			intervals: [250, 500, 1_000],
		})
		.toBe(true);
}

async function openEndSessionWorkflow(page: Page): Promise<void> {
	const endButtons = page.getByRole('button', { name: 'End Session' });
	const buttonCount = await endButtons.count();
	for (let index = 0; index < buttonCount; index += 1) {
		const button = endButtons.nth(index);
		const visible = await button.isVisible().catch(() => false);
		if (!visible) continue;
		await button.click();
		const captureVisible = await page
			.getByRole('heading', { name: 'Session Capture' })
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		if (captureVisible) return;
		const continueVisible = await page
			.getByRole('button', { name: 'Continue' })
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		if (continueVisible) return;
	}
	throw new Error('Unable to open end-session workflow from any visible entry point.');
}

test.describe('Desktop critical workflows @critical', () => {
	test('vault opens and first-run onboarding is actionable', async () => {
		const app = await launchWithSeed();
		try {
			await expect(app.page.getByRole('heading', { name: 'First-run Checklist' })).toBeVisible();
			const searchStep = app.page.locator('li').filter({ hasText: 'Try global search' });
			await searchStep.getByRole('button', { name: 'Open' }).click();
			await expect(app.page).toHaveURL(/\/search$/);
			await expect(app.page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('note CRUD workflow: create, update, and delete', async () => {
		const app = await launchWithSeed();
		try {
			await startNewNote(app.page);

			await app.page.locator('.cm-content').first().click();
			await app.page.keyboard.type('Critical CRUD body');
			await app.page.getByRole('button', { name: 'Done' }).click();
			await expect(app.page).toHaveURL(/\/notes\/[^/]+$/);
			const createdId = decodeURIComponent(app.page.url().split('/knowledge/notes/')[1] ?? '');

			await app.page.getByRole('button', { name: 'Edit' }).click();
			await expect(app.page).toHaveURL(/\/notes\/[^/]+\/edit$/);
			await app.page.locator('.cm-content').first().click();
			await app.page.keyboard.type('\nAdded via CRUD flow');
			await app.page.getByRole('button', { name: 'Save' }).click();
			await expect(app.page.getByText('Note saved').first()).toBeVisible();
			await app.page.getByRole('button', { name: 'Done' }).click();
			const updatedContent = await app.page.evaluate(async (id) => {
				const note = await window.dndtoolsDesktop?.getNote(id as never);
				return note?.content ?? '';
			}, createdId);
			expect(updatedContent).toContain('Added via CRUD flow');

			await app.page.getByTitle('Delete note').click();
			await expect(app.page.getByText('Are you sure you want to delete')).toBeVisible();
			await app.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			await expect(app.page).toHaveURL(/\/notes$/);
			const deletedState = await app.page.evaluate(async (id) => {
				const note = await window.dndtoolsDesktop?.getNote(id as never);
				return note?.deleted ?? false;
			}, createdId);
			expect(deletedState).toBe(true);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('wikilink navigation and search workflows resolve seeded knowledge', async () => {
		const app = await launchWithSeed(async (adapter) => {
			const beta = buildNote('note-beta', 'Beta Node', 'Contains ArcaneSigilToken.');
			const alpha = buildNote('note-alpha', 'Alpha Hub', 'Reference [[Beta Node]].');
			await adapter.saveNote(beta as never);
			await adapter.saveNote(alpha as never);
			await adapter.resolveAndIndexLinks('note-alpha' as never, 'Reference [[Beta Node]].');
		});
		try {
			await gotoDesktopPath(app.page, '/knowledge/notes/note-alpha');
			await expect(app.page).toHaveURL(/\/notes\/note-alpha$/);
			await app.page.getByRole('link', { name: 'Beta Node' }).click();
			await expect(app.page).toHaveURL(/\/notes\/note-beta$/);
			await expect(app.page.getByRole('heading', { name: 'Beta Node' })).toBeVisible();

			await gotoDesktopPath(app.page, '/knowledge/search');
			await app.page.getByPlaceholder('Search notes...').fill('ArcaneSigilToken');
			await expect(app.page.getByRole('button', { name: 'Beta Node' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('MCP pending review approves staged changes from settings', async () => {
		const app = await launchWithSeed(async (adapter) => {
			const before = buildNote(
				'note-mcp-review',
				'MCP Review Target',
				'Before pending update.',
			) as never;
			await adapter.saveNote(before);
			const persistedBefore = await adapter.getNote('note-mcp-review' as never);
			if (!persistedBefore) {
				throw new Error('Failed to seed MCP review note');
			}
			const after = {
				...persistedBefore,
				content: 'After pending update.',
				updatedAt: new Date(Date.now() + 5_000).toISOString(),
			};
			await adapter.recordMcpChange({
				type: 'update',
				noteId: 'note-mcp-review',
				title: 'MCP Review Target',
				summary: 'Update staged by MCP agent',
				agentId: 'agent-review',
				before: { note: persistedBefore },
				after: { note: after as never },
			});
		});
		try {
			await app.page.getByLabel('Pending MCP changes').click();
			await expect(app.page.getByRole('heading', { name: 'MCP Pending Changes' })).toBeVisible();
			const pendingRow = app.page.locator('li').filter({ hasText: 'Update staged by MCP agent' });
			await expect(pendingRow).toBeVisible();
			await pendingRow.getByRole('button', { name: 'Reject' }).click();
			await expect
				.poll(
					async () => {
						const pending = await app.page.evaluate(async () =>
							window.dndtoolsDesktop?.listMcpPendingChanges(),
						);
						return pending?.length ?? -1;
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toBe(0);

			const updatedContent = await app.page.evaluate(async () => {
				const note = await window.dndtoolsDesktop?.getNote('note-mcp-review' as never);
				return note?.content ?? '';
			});
			expect(updatedContent).toBe('Before pending update.');
			await expect(app.page.getByText('rejected - Update staged by MCP agent')).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('session board management updates an active board and attaches notes', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote(
				buildNote('note-board-anchor', 'Board Anchor', 'Session board seed note.') as never,
			);
			const now = new Date().toISOString();
			await adapter.saveSessionBoard({
				id: 'board-critical' as never,
				name: 'Critical Session Board',
				description: 'Coverage board',
				tiles: [],
				createdAt: now,
				updatedAt: now,
			});
		});
		try {
			await gotoDesktopPath(app.page, '/session/boards?board=board-critical');
			await app.page
				.getByLabel('Select active session board')
				.selectOption({ label: 'Critical Session Board' });

			const boardControls = app.page
				.locator('section')
				.filter({ has: app.page.getByLabel('Select active session board') })
				.first();
			await boardControls.getByRole('button', { name: 'Edit' }).click();

			const addNotesSection = app.page
				.locator('section')
				.filter({ hasText: 'Add Tiles and Notes' });
			await expect(addNotesSection).toBeVisible();
			await addNotesSection
				.getByPlaceholder('Search notes (titles first, tags second)')
				.fill('Board Anchor');
			await addNotesSection
				.getByRole('button', { name: /Board Anchor/ })
				.first()
				.click();
			await expect
				.poll(async () => {
					const board = await app.page.evaluate(async () => {
						const boards = (await window.dndtoolsDesktop?.getSessionBoards()) ?? [];
						return boards.find((entry) => entry.id === 'board-critical') ?? null;
					});
					return board?.tiles.some((tile) => tile.noteId === 'note-board-anchor') ?? false;
				})
				.toBe(true);
			await expect(
				app.page.getByRole('button', { name: 'Session board tile: Board Anchor' }),
			).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('session board templates seed reusable board tiles', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote(
				buildNote('note-template-anchor', 'Template Anchor', 'Template seed content.') as never,
			);
			const now = new Date().toISOString();
			await adapter.saveSessionBoard({
				id: 'board-template-seed' as never,
				name: 'Template Seed Board',
				description: 'Template application baseline',
				tiles: [],
				createdAt: now,
				updatedAt: now,
			});
		});
		try {
			await gotoDesktopPath(app.page, '/session/boards');
			await app.page.getByRole('button', { name: 'Edit' }).first().click();
			await app.page
				.getByRole('button', { name: /Template Seed Board/ })
				.first()
				.click();
			const templatesSection = app.page.locator('section').filter({ hasText: 'Board Templates' });
			await templatesSection.getByLabel('Apply template').selectOption({ label: 'Combat Scene' });
			await templatesSection
				.getByRole('button', { name: 'Apply Template To Current Board' })
				.click();
			await expect(app.page.getByRole('heading', { name: 'Session Board' }).first()).toBeVisible();
			await expect
				.poll(async () => {
					const boards =
						(await app.page.evaluate(async () => window.dndtoolsDesktop?.getSessionBoards())) ?? [];
					return boards.some((entry) => entry.id === 'board-template-seed');
				})
				.toBe(true);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('session mission control supports scene timeline and handout delivery', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote(
				buildNote(
					'note-handout-seed',
					'Town Broadsheet',
					'# Town Broadsheet\n\nA public announcement for all players.',
				) as never,
			);
			const seeded = await adapter.getNote('note-handout-seed' as never);
			if (!seeded) throw new Error('Failed to seed handout note');
			await adapter.saveNote({
				...seeded,
				tags: ['handout', 'player-facing'],
				updatedAt: new Date(Date.now() + 2_000).toISOString(),
			} as never);
			const now = new Date().toISOString();
			await adapter.saveSessionBoard({
				id: 'board-mission' as never,
				name: 'Mission Control Board',
				description: 'Board seeded for mission control coverage',
				tiles: [],
				createdAt: now,
				updatedAt: now,
			});
		});
		try {
			await gotoDesktopPath(app.page, '/session/boards?board=board-mission');
			await app.page
				.getByLabel('Select active session board')
				.selectOption({ label: 'Mission Control Board' });
			await expect(app.page.getByPlaceholder('New scene title')).toBeVisible();

			await app.page.getByPlaceholder('New scene title').fill('Chasing Goras');
			await app.page.getByRole('button', { name: 'Add Scene' }).click();
			await expect(app.page.getByRole('button', { name: 'Chasing Goras' })).toBeVisible();

			await app.page.getByRole('button', { name: 'Deliver Handout to Players' }).click();
			const handoutPicker = app.page.getByRole('dialog', { name: 'Handout Picker' });
			await expect(handoutPicker).toBeVisible();
			await handoutPicker.getByRole('button', { name: 'Town Broadsheet' }).first().click();
			const playerPreview = app.page.getByRole('dialog', { name: 'Player Preview' });
			await expect(playerPreview).toBeVisible();
			await playerPreview.getByRole('button', { name: 'Confirm and Deliver' }).click();
			await expect(playerPreview).toBeHidden({
				timeout: 20_000,
			});
			await expect
				.poll(
					async () => {
						const objects =
							(await app.page.evaluate(async () => window.dndtoolsDesktop?.getAllObjects())) ?? [];
						return objects.some(
							(entry) =>
								entry.type === 'handout' &&
								entry.name === 'Town Broadsheet' &&
								entry.data?.delivered === true,
						);
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toBe(true);

			await gotoDesktopPath(app.page, '/player');
			await expect(app.page).toHaveURL(/\/player$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('session prep and end-session recap workflow captures logs and continuity follow-up', async () => {
		const app = await launchWithSeed(async (adapter) => {
			const now = new Date().toISOString();
			await adapter.saveNote({
				...buildNote('quest-open', 'Recover the Crown', 'Quest tracker'),
				frontmatter: {
					dndtools: {
						object: {
							kind: 'quest',
							data: {
								status: 'in_progress',
								objective: 'Recover the stolen crown',
							},
						},
					},
				},
				tags: ['quest'],
				updatedAt: new Date(Date.now() + 2_000).toISOString(),
			} as never);
			await adapter.saveNote({
				...buildNote('npc-open', 'Captain Aria', 'NPC tracker'),
				frontmatter: {
					dndtools: {
						object: {
							kind: 'npc',
							data: {
								disposition: 'unknown',
							},
						},
					},
				},
				tags: ['npc'],
				updatedAt: new Date(Date.now() + 3_000).toISOString(),
			} as never);
			await adapter.saveNote({
				...buildNote('handout-open', 'Town Charter', 'Handout content'),
				tags: ['handout', 'player-facing'],
				updatedAt: new Date(Date.now() + 4_000).toISOString(),
			} as never);
			await adapter.saveSessionBoard({
				id: 'board-prep' as never,
				name: 'Prep Workflow Board',
				description: 'Board seeded for prep + recap flow coverage',
				tiles: [],
				createdAt: now,
				updatedAt: now,
			});
		});
		try {
			await gotoDesktopPath(app.page, '/session/boards?board=board-prep');
			await app.page
				.getByLabel('Select active session board')
				.selectOption({ label: 'Prep Workflow Board' });
			await expect(app.page.getByRole('heading', { name: 'Session Prep' })).toBeVisible();
			const prepPanel = app.page.getByLabel('Session prep workflow');
			await expect(
				prepPanel.getByRole('button', { name: /Recover the Crown/i }).first(),
			).toBeVisible();
			await expect(prepPanel.getByRole('button', { name: /Captain Aria/i }).first()).toBeVisible();
			await expect(prepPanel.getByRole('button', { name: /Town Charter/i }).first()).toBeVisible();

			const missionActions = app.page.locator('footer').filter({
				has: app.page.getByRole('button', { name: 'Deliver Handout to Players' }),
			});
			await missionActions.getByRole('button', { name: 'Start Session' }).click();
			await expect(missionActions.getByRole('button', { name: 'End Session' })).toBeVisible();
			await openEndSessionWorkflow(app.page);
			const captureHeading = app.page.getByRole('heading', { name: 'Session Capture' });
			const captureAlreadyOpen = await captureHeading
				.isVisible({ timeout: 2_000 })
				.catch(() => false);
			if (!captureAlreadyOpen) {
				await app.page.getByRole('button', { name: 'Continue' }).click();
			}

			await expect(captureHeading).toBeVisible();
			await app.page
				.getByPlaceholder('Captured recap (pre-filled from roll log when available)')
				.fill('The party negotiated with Captain Aria and secured the town gate.');
			await app.page
				.getByPlaceholder('Captain Aria, Innkeeper Doran')
				.fill('Captain Aria, Unlogged Witness');
			await app.page
				.getByPlaceholder('Stonehill Inn, Old Ruins')
				.fill('Stonehill Inn, Hidden Pass');
			await app.page
				.getByPlaceholder('Recover the Crown, Find the Scout')
				.fill('Recover the Crown');
			await app.page
				.getByPlaceholder('Open items and prep notes for next session')
				.fill('Track down the hidden pass entrance.');
			await app.page.getByRole('button', { name: 'Save Capture and End Session' }).click();

			await expect(
				app.page.getByRole('heading', { name: 'Session Continuity Check' }),
			).toBeVisible();
			await expect(
				app.page.getByText('NPCs appeared this session without vault notes'),
			).toBeVisible();
			await app.page.getByRole('button', { name: 'Create Unlogged Witness' }).click();
			await app.page.getByRole('button', { name: 'Done' }).click();

			await expect
				.poll(
					async () => {
						const state = await app.page.evaluate(async () =>
							window.dndtoolsDesktop?.getSessionState(),
						);
						return state?.mode ?? null;
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toBe('idle');

			await expect
				.poll(
					async () => {
						const notes =
							(await app.page.evaluate(async () => window.dndtoolsDesktop?.getAllNotes())) ?? [];
						const sessionLog = notes.find(
							(note) =>
								String(note.folder) === '/sessions' &&
								String(note.title).startsWith('session-') &&
								String(note.content).includes('## What Happened This Session'),
						);
						const createdNpc = notes.find((note) => note.title === 'Unlogged Witness');
						return {
							sessionLogFound: Boolean(sessionLog),
							createdNpcFound: Boolean(createdNpc),
						};
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toEqual({
					sessionLogFound: true,
					createdNpcFound: true,
				});
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('encounter builder canonical route resolves in desktop shell', async () => {
		const app = await launchWithSeed(async (adapter) => {
			const now = new Date().toISOString();
			await adapter.saveSessionBoard({
				id: 'board-encounter' as never,
				name: 'Encounter Coverage Board',
				description: 'Board seeded for encounter route coverage',
				tiles: [],
				createdAt: now,
				updatedAt: now,
			});
		});
		try {
			await gotoDesktopPath(app.page, '/session/encounter/new');
			await expect(app.page).toHaveURL(/\/encounter\/new$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('object creation workflow persists object metadata', async () => {
		const app = await launchWithSeed();
		try {
			await startNewNote(app.page);
			const match = app.page.url().match(/\/notes\/([^/]+)\/edit$/);
			expect(match).toBeTruthy();
			const noteId = decodeURIComponent(match![1]!);

			await app.page.getByPlaceholder('Note title...').fill('Object Workflow Note');
			await app.page.locator('.cm-content').first().click();
			await app.page.keyboard.type('Encounter prep:\n');
			await app.page.getByRole('button', { name: 'Embeds' }).click();
			await app.page.getByPlaceholder('Object name').fill('Captain Aria');
			await app.page.getByRole('button', { name: 'Create + Embed' }).click();
			await app.page.getByRole('button', { name: 'Done' }).click();
			await expect(app.page).toHaveURL(new RegExp(`/knowledge/notes/${noteId}$`));

			await expect
				.poll(
					async () => {
						const objects =
							(await app.page.evaluate(async () => window.dndtoolsDesktop?.getAllObjects())) ?? [];
						return objects.some((entry) => entry.name === 'Captain Aria');
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toBe(true);

			const createdObjectId = await app.page.evaluate(async () => {
				const objects = (await window.dndtoolsDesktop?.getAllObjects()) ?? [];
				return objects.find((entry) => entry.name === 'Captain Aria')?.id ?? '';
			});
			expect(createdObjectId).not.toBe('');

			await expect
				.poll(
					async () => {
						const note = await app.page.evaluate(
							async (id) => window.dndtoolsDesktop?.getNote(id as never),
							noteId,
						);
						return note?.content ?? '';
					},
					{ timeout: 20_000, intervals: [250, 500, 1_000] },
				)
				.toContain('Encounter prep:');
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('timeline route shows world events and linked session logs with filters', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote({
				...buildNote('npc-scout', 'Scout Captain', 'NPC profile'),
				frontmatter: {
					dndtools: {
						object: {
							kind: 'npc',
							data: {
								disposition: 'active',
							},
						},
					},
				},
			} as never);
			await adapter.saveNote({
				...buildNote('timeline-siege', 'Siege of Blackspire', 'Major timeline event'),
				tags: ['timeline', 'arc:warfront', 'pending-resolution'],
				frontmatter: {
					dndtools: {
						object: {
							kind: 'timeline_event',
							summary: 'The siege begins.',
							data: {
								worldDateOffset: 15,
								summary: 'The siege begins.',
								involvedObjectIds: ['npc-scout'],
								arcTag: 'warfront',
								resolutionStatus: 'pending_resolution',
							},
						},
					},
				},
			} as never);
			await adapter.saveNote({
				...buildNote('session-10', 'Session 10', 'Players scouted the siege perimeter.'),
				tags: ['session'],
				frontmatter: {
					worldDate: 15,
					timelineEventId: 'timeline-siege',
				},
			} as never);
		});

		try {
			await gotoDesktopPath(app.page, '/campaign/timeline');
			await expect(app.page).toHaveURL(/\/timeline$/);
			await expect(app.page.getByRole('heading', { name: 'Campaign Timeline' })).toBeVisible();
			await expect(app.page.getByRole('link', { name: 'Siege of Blackspire' })).toBeVisible();
			await expect(app.page.getByRole('link', { name: 'Session 10' })).toBeVisible();
			await expect(app.page.getByText('Pending', { exact: true })).toBeVisible();

			await app.page.locator('label:has-text("Arc") select').selectOption({ label: 'warfront' });
			await app.page
				.locator('label:has-text("Participant") select')
				.selectOption({ label: 'Scout Captain' });
			await expect(app.page.getByText('No timeline entries match the active filters.')).toHaveCount(
				0,
			);
			await expect(app.page.getByRole('link', { name: 'Siege of Blackspire' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('graph route filters linked notes and opens selected nodes', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote(
				buildNote('graph-hub', 'Graph Hub', 'See [[Graph Target]]. [[Graph Target]].') as never,
			);
			await adapter.saveNote({
				...buildNote('graph-target', 'Graph Target', 'Target content'),
				tags: ['graph-tag'],
			} as never);
			await adapter.saveNote({
				...buildNote('graph-isolated', 'Graph Isolated', 'Unlinked content'),
				tags: ['graph-tag'],
			} as never);
			await adapter.resolveAndIndexLinks(
				'graph-hub' as never,
				'See [[Graph Target]]. [[Graph Target]].',
			);
		});
		try {
			await gotoDesktopPath(app.page, '/knowledge/graph');
			await expect(app.page).toHaveURL(/\/graph$/);
			await expect(app.page.getByRole('heading', { name: 'Link Graph' })).toBeVisible();

			await app.page.getByLabel('Filter graph by tag').selectOption({ label: 'graph-tag' });
			await expect(app.page.locator('[aria-label="Graph Target"]')).toBeVisible();
			await expect(app.page.locator('[aria-label="Graph Isolated"]')).toHaveCount(0);

			await app.page.getByLabel('Hide isolated').uncheck();
			await expect(app.page.locator('[aria-label="Graph Isolated"]')).toBeVisible();

			const graphTargetNode = app.page.locator('[aria-label="Graph Target"]').first();
			await graphTargetNode.focus();
			await graphTargetNode.press('Enter');
			await expect(app.page.getByRole('heading', { name: 'Graph Target' })).toBeVisible();
			await app.page.getByRole('button', { name: 'Open note' }).click();
			await expect(app.page).toHaveURL(/\/notes\/graph-target$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('combat tracker route shows idle-session guidance', async () => {
		test.setTimeout(120_000);
		const app = await launchWithSeed(async (adapter) => {
			const now = new Date().toISOString();
			await adapter.saveSessionBoard({
				id: 'board-combat-route' as never,
				name: 'Combat Route Board',
				description: 'Board seeded for combat route interaction coverage',
				tiles: [],
				layout: {
					columns: 12,
					rowHeight: 120,
					minRows: 12,
					gap: 12,
				},
				style: {
					backgroundPattern: 'none',
				},
				createdAt: now,
				updatedAt: now,
			});
		});
		try {
			await gotoDesktopPath(app.page, '/session/combat');
			await expect(app.page).toHaveURL(/\/combat$/);
			await expect(app.page.getByText('Session mode is idle.')).toBeVisible({
				timeout: 15_000,
			});
			await expect(app.page.getByRole('button', { name: 'Open Session Boards' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('player view shows only shared/public notes and supports exit flow', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote({
				...buildNote('player-shared', 'Shared Briefing', 'Shared visibility token'),
				visibility: 'shared',
			} as never);
			await adapter.saveNote({
				...buildNote('player-public', 'Public Recap', 'Public visibility token'),
				visibility: 'public',
			} as never);
			await adapter.saveNote({
				...buildNote('player-secret', 'DM Secret', 'Should stay hidden from players'),
				visibility: 'dm_only',
			} as never);
		});
		try {
			await gotoDesktopPath(app.page, '/player');
			await expect(app.page).toHaveURL(/\/player$/);
			await expect(app.page.getByRole('heading', { name: 'Player Screen' })).toBeVisible();

			await expect(app.page.getByText('Shared Briefing')).toBeVisible();
			await expect(app.page.getByText('Public Recap')).toBeVisible();
			await expect(app.page.getByText('DM Secret')).toHaveCount(0);

			await app.page.getByPlaceholder('Search visible notes').fill('Public visibility token');
			await expect(app.page.getByText('Public Recap')).toBeVisible();
			await expect(app.page.getByText('Shared Briefing')).toHaveCount(0);

			await app.page.getByRole('button', { name: /^Exit Player Mode$/ }).click();
			await expect(app.page).toHaveURL(/\/notes$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('maps route filters map library and loads map detail controls', async () => {
		const app = await launchWithSeed(async (adapter) => {
			await adapter.saveNote({
				...buildNote('map-area-note', 'Frontier Region', 'Mapped area note'),
				tags: ['location'],
				frontmatter: {
					dndtools: {
						object: {
							kind: 'location',
							summary: 'Frontier location metadata',
						},
					},
				},
			} as never);
			await adapter.saveObject(
				buildMapObject('map-critical-route', 'Frontier Atlas', 'map-area-note') as never,
			);
		});
		try {
			await gotoDesktopPath(app.page, '/atlas/maps');
			await expect(app.page).toHaveURL(/\/maps$/);
			await expect(app.page.getByRole('heading', { name: 'Map Library' })).toBeVisible();

			await app.page.getByLabel('Search maps').fill('Frontier');
			await app.page.getByLabel('Filter maps by tag').selectOption({ label: '#travel' });
			await app.page.getByRole('button', { name: /Frontier Atlas/ }).click();

			await expect(app.page.getByText('Layer System')).toBeVisible();
			await expect(app.page.getByRole('heading', { name: 'Travel Routes' })).toBeVisible();
			await expect(app.page.getByRole('button', { name: 'Edit POIs' })).toBeVisible();
			await expect(app.page.getByRole('button', { name: 'Edit Travel Routes' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});
});
