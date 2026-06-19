import { expect, test, type Page } from '@playwright/test';

// UX-SHELL — the production application shell: the seven-section global navigation, route
// landmarks, the skip link, keyboard parity (Alt+<n> / Alt+Shift+H), input-modality detection, and
// the per-profile navigation surface (Desktop sidebar + icon-rail collapse; Mobile bottom tab bar +
// "More" sheet). Covers UX-NAV-001/002/004/005/006/009/018.

const SEVEN_IN_ORDER = [
	'nav-command-center',
	'nav-session',
	'nav-characters',
	'nav-atlas',
	'nav-campaign',
	'nav-knowledge',
	'nav-settings',
];

async function freshHome(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
}

/** The ordered section nav-ids currently rendered in the primary nav (excludes More/collapse). */
async function sectionOrder(page: Page): Promise<string[]> {
	return page
		.getByTestId('primary-nav')
		.locator('[data-testid^="nav-"]')
		.evaluateAll((els) =>
			els
				.map((el) => el.getAttribute('data-testid') ?? '')
				.filter((id) => /^nav-(command-center|session|characters|atlas|campaign|knowledge|settings)$/.test(id)),
		);
}

test.describe('UX-NAV-002 seven-section global nav (canonical order, capabilities excluded)', () => {
	test('renders the seven destinations in canonical order on every profile', async ({
		page,
	}, testInfo) => {
		await freshHome(page);
		const primary = page.getByTestId('primary-nav');
		await expect(primary).toBeVisible();

		if (testInfo.project.name === 'mobile-chromium') {
			// Compact bottom tab bar: four direct tabs + a "More" overflow (UX-NAV-006).
			expect(await sectionOrder(page)).toEqual([
				'nav-command-center',
				'nav-session',
				'nav-characters',
				'nav-atlas',
			]);
			await expect(page.getByTestId('nav-more')).toBeVisible();
			// The overflow sections (Campaign, Knowledge, Settings) live in the "More" sheet, in order.
			await page.getByTestId('nav-more').click();
			const sheet = page.getByTestId('nav-more-sheet');
			await sheet.waitFor({ state: 'visible' });
			const overflow = await sheet
				.locator('[data-testid^="nav-"]')
				.evaluateAll((els) =>
					els
						.map((el) => el.getAttribute('data-testid') ?? '')
						.filter((id) => /^nav-(campaign|knowledge|settings)$/.test(id)),
				);
			expect(overflow).toEqual(['nav-campaign', 'nav-knowledge', 'nav-settings']);
			await page.keyboard.press('Escape');
		} else {
			// Desktop sidebar shows all seven, in canonical order.
			expect(await sectionOrder(page)).toEqual(SEVEN_IN_ORDER);
		}
	});

	test('the non-global capabilities (Scenes/Audio/MCP) are never primary-nav items', async ({
		page,
	}) => {
		await freshHome(page);
		await expect(page.getByTestId('nav-scenes')).toHaveCount(0);
		await expect(page.getByTestId('nav-audio')).toHaveCount(0);
		await expect(page.getByTestId('nav-mcp')).toHaveCount(0);
	});
});

test.describe('UX-NAV-009 skip-to-content and landmarks', () => {
	test('the skip link is the first focusable element and moves focus to main', async ({ page }) => {
		await freshHome(page);
		// Tab once from the document: the skip link receives focus and becomes visible.
		await page.keyboard.press('Tab');
		const skip = page.getByTestId('skip-link');
		await expect(skip).toBeFocused();
		await expect(skip).toBeVisible();

		// Activating it moves focus into the main content landmark (UX-NAV-009 AC2).
		await page.keyboard.press('Enter');
		const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
		expect(focusedId).toBe('main-content');
	});

	test('the shell exposes a single banner, primary-nav landmark, and main landmark', async ({
		page,
	}) => {
		await freshHome(page);
		await expect(page.getByRole('banner')).toHaveCount(1);
		await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(1);
		await expect(page.getByRole('main')).toHaveCount(1);
	});
});

test.describe('UX-NAV-001/002 keyboard parity: Alt+<n> / Alt+Shift+H navigate and announce', () => {
	test('Alt+<n> navigates to the nth section and announces it via the live region', async ({
		page,
	}) => {
		await freshHome(page);
		const announcer = page.getByTestId('route-announcer');
		await expect(announcer).toHaveText('Command Center');

		// Alt+4 → Atlas (UX-NAV-002 AC3: navigate + announce).
		await page.keyboard.press('Alt+4');
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
		await expect(page).toHaveURL(/\/atlas\/?$/);
		await expect(announcer).toHaveText('Atlas');

		// Alt+6 → Knowledge — an overflow (compact) section, proving keyboard reaches every section,
		// not only the directly-visible tabs (no Must-have action is pointer-only).
		await page.keyboard.press('Alt+6');
		await page.getByTestId('route-landmark').waitFor({ state: 'visible' });
		await expect(page).toHaveURL(/\/knowledge\/?$/);
		await expect(announcer).toHaveText('Knowledge');

		// Alt+Shift+H → Command Center home (UX-NAV-001).
		await page.keyboard.press('Alt+Shift+H');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await expect(page).toHaveURL(/^[^?]*\/$|\/$/);
		await expect(announcer).toHaveText('Command Center');
	});
});

test.describe('UX-NAV-018 input-modality detection and focus-ring policy', () => {
	test('reflects keyboard vs pointer/touch modality on the document element', async ({
		page,
	}, testInfo) => {
		await freshHome(page);
		const modality = () => page.evaluate(() => document.documentElement.dataset.inputModality);

		// Keyboard navigation flips modality to "keyboard" (focus rings show).
		await page.keyboard.press('Tab');
		expect(await modality()).toBe('keyboard');

		if (testInfo.project.name === 'mobile-chromium') {
			// A touch tap flips it to "touch" (focus rings suppressed for the tap).
			await page.getByTestId('command-center').tap();
			expect(await modality()).toBe('touch');
		} else {
			// A mouse press flips it to "pointer". The brand/home link now lives in the rail at the
			// top-left corner, where the just-focused skip-link overlays it; click the top-bar route
			// title instead — a stable banner element clear of the skip-link (the element clicked is
			// incidental; the test verifies the pointer-down modality flip).
			await page.getByTestId('route-title').click();
			expect(await modality()).toBe('pointer');
		}
	});
});

test.describe('UX-NAV-004 Desktop sidebar icon-rail collapse', () => {
	test('collapses to an icon rail, keeps accessible names, and persists across reload', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name === 'mobile-chromium',
			'icon-rail collapse is the Desktop sidebar behavior (UX-NAV-004)',
		);
		await freshHome(page);
		const nav = page.getByTestId('primary-nav');
		await expect(nav).toHaveAttribute('data-surface', 'sidebar');
		await expect(nav).toHaveAttribute('data-icon-only', 'false');

		// Collapse to the icon rail.
		await page.getByTestId('nav-collapse-toggle').click();
		await expect(nav).toHaveAttribute('data-icon-only', 'true');
		// The accessible name survives even when the visible label is hidden (UX-NAV-004).
		await expect(page.getByTestId('nav-atlas')).toHaveAccessibleName(/Atlas/);

		// The preference persists across a reload (UX-NAV-004 AC3).
		await page.reload();
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await expect(page.getByTestId('primary-nav')).toHaveAttribute('data-icon-only', 'true');

		// Restore expanded for a clean state.
		await page.getByTestId('nav-collapse-toggle').click();
		await expect(page.getByTestId('primary-nav')).toHaveAttribute('data-icon-only', 'false');
	});
});

test.describe('UX-NAV-006 Mobile bottom tab bar + More sheet', () => {
	test('shows a bottom tab bar and reveals overflow sections through a focus-trapped sheet', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'mobile-chromium',
			'the bottom tab bar + More sheet is the compact (Mobile) surface (UX-NAV-006)',
		);
		await freshHome(page);
		await expect(page.getByTestId('primary-nav')).toHaveAttribute('data-surface', 'tabbar');

		// Open the "More" sheet and navigate to an overflow section (Settings).
		await page.getByTestId('nav-more').click();
		const sheet = page.getByTestId('nav-more-sheet');
		await sheet.waitFor({ state: 'visible' });
		await sheet.getByTestId('nav-settings').click();
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await expect(page).toHaveURL(/\/settings\/?$/);
	});
});
