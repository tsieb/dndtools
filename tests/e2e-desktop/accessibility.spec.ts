import AxeBuilder from '@axe-core/playwright';
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

async function launchWithSeed(): Promise<Awaited<ReturnType<typeof launchDesktopApp>>> {
	const vaultDir = await createTempVaultDir('dndtools-a11y-vault-');
	const adapter = new FileSystemAdapter(vaultDir);
	await adapter.initialize();
	try {
		await adapter.saveNote(
			buildNote(
				'a11y-note',
				'Accessibility Anchor',
				'# Accessibility Anchor\n\nSee [[Accessibility Link Target]].\n\nAccessibilityToken',
			) as never,
		);
		await adapter.saveNote(
			buildNote(
				'a11y-link-target',
				'Accessibility Link Target',
				'# Accessibility Link Target',
			) as never,
		);
		await adapter.saveNote(
			buildNote('a11y-entity', 'Accessibility NPC', 'Entity content.', {
				tags: ['npc'],
				frontmatter: {
					dndtools: {
						object: {
							kind: 'npc',
							summary: 'Accessibility validation NPC',
							data: {
								ac: 14,
								hp: 22,
							},
						},
					},
				},
			}) as never,
		);

		const now = new Date().toISOString();
		await adapter.saveSessionBoard({
			id: 'a11y-board' as never,
			name: 'Accessibility Session Board',
			description: 'Board for keyboard workflow validation',
			tiles: [],
			createdAt: now,
			updatedAt: now,
		});
	} finally {
		await adapter.close();
	}
	return launchDesktopApp(vaultDir);
}

async function gotoPath(page: Page, path: string): Promise<void> {
	const origin = new URL(page.url()).origin;
	await page.goto(`${origin}${path}`);
	await expect(page.locator('main')).toBeVisible();
	await page.waitForTimeout(150);
}

async function expectNoSeriousOrCriticalAxeViolations(page: Page): Promise<void> {
	const results = await new AxeBuilder({ page })
		.setLegacyMode(true)
		.options({
			resultTypes: ['violations'],
		})
		.analyze();
	const violations = results.violations.filter((violation) =>
		['critical', 'serious'].includes(violation.impact ?? ''),
	);
	expect(
		violations,
		violations
			.map(
				(violation) =>
					`${violation.impact ?? 'unknown'}: ${violation.id} (${violation.nodes.length})`,
			)
			.join('\n'),
	).toEqual([]);
}

async function expectNoHeadingOrderViolations(page: Page): Promise<void> {
	const results = await new AxeBuilder({ page })
		.setLegacyMode(true)
		.withRules(['heading-order'])
		.options({
			resultTypes: ['violations'],
		})
		.analyze();
	const headingOrderViolations = results.violations.filter(
		(violation) => violation.id === 'heading-order',
	);
	expect(
		headingOrderViolations,
		headingOrderViolations
			.map((violation) => `${violation.id} (${violation.nodes.length})`)
			.join('\n'),
	).toEqual([]);
}

const PRIMARY_ROUTES: string[] = [
	'/',
	'/knowledge/notes',
	'/knowledge/notes/a11y-note',
	'/knowledge/notes/a11y-note/edit',
	'/knowledge/search',
	'/knowledge/graph',
	'/campaign/timeline',
	'/session/boards',
	'/session/encounter/new',
	'/session/combat',
	'/settings',
	'/player',
];

test.describe('Desktop accessibility compliance @critical @a11y', () => {
	test('shell exposes skip link and required landmark regions', async () => {
		const app = await launchWithSeed();
		try {
			await gotoPath(app.page, '/knowledge/notes');
			const shellLandmarks = await app.page.evaluate(() => ({
				hasSkipLink: !!document.querySelector('a.skip-link[href="#main-content"]'),
				hasBanner: !!document.querySelector('header[role="banner"]'),
				hasPrimaryNav: !!document.querySelector('nav[aria-label="Primary"]'),
				hasKnowledgeNav: !!document.querySelector('nav[aria-label="Knowledge navigation"]'),
				hasMain: !!document.querySelector('main#main-content'),
				hasFooter: !!document.querySelector('footer'),
			}));
			expect(shellLandmarks).toEqual({
				hasSkipLink: true,
				hasBanner: true,
				hasPrimaryNav: true,
				hasKnowledgeNav: true,
				hasMain: true,
				hasFooter: true,
			});

			await gotoPath(app.page, '/knowledge/search');
			await expect(app.page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();

			await gotoPath(app.page, '/session/boards');
			await expect(app.page.getByRole('region', { name: 'Session board' })).toBeVisible();
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('axe scan passes with no serious or critical violations on all primary routes', async () => {
		const app = await launchWithSeed();
		try {
			for (const route of PRIMARY_ROUTES) {
				await gotoPath(app.page, route);
				await expectNoSeriousOrCriticalAxeViolations(app.page);
				await expectNoHeadingOrderViolations(app.page);
			}
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('major workflows remain keyboard-completable', async () => {
		const app = await launchWithSeed();
		try {
			await app.page.keyboard.press('Control+n');
			await expect(app.page).toHaveURL(/\/notes\/[^/]+\/edit$/);
			const titleInput = app.page.getByPlaceholder('Note title...');
			await expect(titleInput).toBeVisible({ timeout: 15_000 });
			await titleInput.focus();
			await app.page.keyboard.type('Keyboard Created Note');
			const editorSurface = app.page.locator('.cm-content').first();
			await expect(editorSurface).toBeVisible({ timeout: 15_000 });
			await editorSurface.focus();
			await app.page.keyboard.type('Keyboard flow body with [[Accessibility Link Target]].');
			await app.page.keyboard.press('Control+s');
			await expect(app.page.getByRole('status').getByText('Note saved')).toBeVisible();
			await app.page.keyboard.press('Control+Enter');
			await expect(app.page).toHaveURL(/\/notes\/[^/]+$/);

			await app.page.getByRole('link', { name: 'Accessibility Link Target' }).focus();
			await app.page.keyboard.press('Enter');
			await expect(app.page).toHaveURL(/\/notes\/a11y-link-target$/);

			await app.page.keyboard.press('Control+Shift+F');
			await expect(app.page).toHaveURL(/\/search$/);
			await app.page.getByPlaceholder('Search notes...').fill('AccessibilityToken');
			await expect(app.page.getByRole('option', { name: 'Accessibility Anchor' })).toBeVisible({
				timeout: 20_000,
			});

			await app.page.getByPlaceholder('Search notes...').fill('Accessibility NPC');
			const entityResult = app.page
				.locator('div.rounded-lg.border button.font-semibold', {
					hasText: 'Accessibility NPC',
				})
				.first();
			await expect(entityResult).toBeVisible();
			await entityResult.focus();
			await app.page.keyboard.press('Enter');
			await expect(app.page).toHaveURL(/\/notes\/a11y-entity$/);

			await app.page.keyboard.press('Control+Shift+S');
			await expect(app.page).toHaveURL(/\/session\/boards$/);
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('screen-reader announcements update for route changes and async operations', async () => {
		const app = await launchWithSeed();
		try {
			await expect(app.page.getByTestId('a11y-live-assertive')).toContainText(
				/(Welcome, Dungeon Master|Your Vault|Player Screen|All Notes) view loaded\./,
			);

			await gotoPath(app.page, '/knowledge/search');
			await expect(app.page.getByTestId('a11y-live-assertive')).toContainText(
				'Search & Discovery view loaded.',
			);

			const politeLiveRegion = app.page.getByTestId('a11y-live-polite');
			await app.page.getByPlaceholder('Search notes...').fill('AccessibilityToken');
			await expect(app.page.getByRole('option', { name: 'Accessibility Anchor' })).toBeVisible({
				timeout: 20_000,
			});
			await expect(politeLiveRegion).toHaveAttribute('aria-live', 'polite');
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('routes expose a semantic page heading hierarchy', async () => {
		const app = await launchWithSeed();
		try {
			const headingChecks: Array<{ path: string; expectedHeading: string | RegExp }> = [
				{ path: '/', expectedHeading: /Your Vault|Welcome|Player Screen/i },
				{ path: '/knowledge/notes', expectedHeading: /All Notes|Notes/i },
				{ path: '/knowledge/notes/a11y-note', expectedHeading: 'Accessibility Anchor' },
				{ path: '/knowledge/notes/a11y-note/edit', expectedHeading: /Edit Accessibility Anchor/i },
				{ path: '/knowledge/search', expectedHeading: 'Search & Discovery' },
				{ path: '/knowledge/graph', expectedHeading: 'Link Graph' },
				{ path: '/campaign/timeline', expectedHeading: 'Campaign Timeline' },
				{ path: '/session/boards', expectedHeading: /Session Board/i },
				{ path: '/session/encounter/new', expectedHeading: 'Encounter Builder' },
				{ path: '/session/combat', expectedHeading: 'Combat Tracker' },
				{ path: '/settings', expectedHeading: 'Settings' },
				{ path: '/player', expectedHeading: /Player/i },
			];

			for (const check of headingChecks) {
				await gotoPath(app.page, check.path);
				const h1 = app.page.getByRole('heading', { level: 1, name: check.expectedHeading }).first();
				await expect(h1).toHaveCount(1);
				const headingText = (await h1.innerText()).trim();
				await expect(headingText.length).toBeGreaterThan(0);
				await expect(app.page).toHaveTitle(`${headingText} | DND Tools`);
			}
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('all control targets satisfy 44x44 minimum touch target policy', async () => {
		const app = await launchWithSeed();
		try {
			for (const route of PRIMARY_ROUTES) {
				await gotoPath(app.page, route);
				const violations = await app.page.evaluate(() => {
					const MIN_SIZE = 44;
					const selector =
						'button, [role="button"], [role="tab"], [role="radio"], summary, a[aria-label]';
					const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
					const failures: string[] = [];

					for (const element of elements) {
						if (
							element.hasAttribute('disabled') ||
							element.getAttribute('aria-disabled') === 'true'
						) {
							continue;
						}
						const style = window.getComputedStyle(element);
						if (
							style.display === 'none' ||
							style.visibility === 'hidden' ||
							style.pointerEvents === 'none'
						) {
							continue;
						}
						const rect = element.getBoundingClientRect();
						if (rect.width < 1 || rect.height < 1) continue;
						if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) continue;
						const descriptor = [
							element.tagName.toLowerCase(),
							element.getAttribute('aria-label')?.trim(),
							element.getAttribute('title')?.trim(),
							element.textContent?.trim(),
						]
							.filter((entry) => !!entry)
							.join(' | ');
						failures.push(
							`${descriptor || '<unnamed>'} (${Math.round(rect.width)}x${Math.round(rect.height)})`,
						);
					}

					return failures.slice(0, 40);
				});

				expect(
					violations,
					`Touch-target violations on ${route}:\n${violations.join('\n')}`,
				).toEqual([]);
			}
		} finally {
			await closeDesktopApp(app);
		}
	});

	test('interactive elements avoid HTML title tooltips and use accessible tooltip semantics', async () => {
		const app = await launchWithSeed();
		try {
			for (const route of PRIMARY_ROUTES) {
				await gotoPath(app.page, route);
				const interactiveTitles = await app.page.evaluate(() => {
					const selector =
						'button[title], input[title], select[title], textarea[title], [role="button"][title], [role="tab"][title]';
					return Array.from(document.querySelectorAll<HTMLElement>(selector))
						.map((element) => {
							const label =
								element.getAttribute('aria-label')?.trim() ||
								element.textContent?.trim() ||
								'<unnamed>';
							return `${element.tagName.toLowerCase()} | ${label} | ${element.getAttribute('title')?.trim() || ''}`;
						})
						.slice(0, 30);
				});
				expect(interactiveTitles, `Interactive title attributes found on ${route}`).toEqual([]);
			}
		} finally {
			await closeDesktopApp(app);
		}
	});
});
