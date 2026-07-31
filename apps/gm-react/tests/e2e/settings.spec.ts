import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// SETTINGS — the "Experience complexity" picker on /settings. It decides how much of the toolkit the
// whole app reveals, and it was the last hand-rolled chooser in the file with VISUAL-ONLY selection:
// three plain buttons distinguished by border and background alone, each its own tab stop, with
// nothing telling assistive tech which one was active. The rest of the app (this file's own "Tool
// preferences", Onboarding's choice cards, Community's sort) already declares a real radiogroup with
// arrow-key selection and a roving tabindex; this brings the last one in line.

test.describe('settings: the experience-complexity picker is a real radiogroup', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/settings');
		await seedFresh(page);
		await page.goto('/#/settings', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('exposes its three choices as radios with exactly one checked', async ({ page }) => {
		const group = page.getByRole('radiogroup', { name: 'Experience complexity' });
		await expect(group).toBeVisible();

		const radios = group.getByRole('radio');
		await expect(radios).toHaveCount(3);
		await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
	});

	test('is one tab stop, and arrow keys move the selection', async ({ page }) => {
		const group = page.getByRole('radiogroup', { name: 'Experience complexity' });
		const radios = group.getByRole('radio');
		// `evaluateAll` does NOT auto-retry, so without a retrying assertion first it can run before
		// /settings has painted and silently measure an EMPTY list. It passed in isolation and failed
		// only under full-suite load. (Same shape as the `responsive.spec` flake root-caused earlier:
		// a bare `await …evaluate(…)` is not a Playwright assertion and never waits.)
		await expect(radios).toHaveCount(3);

		// Roving tabindex: only the selected card is reachable by Tab, so the group costs one stop
		// rather than three.
		const tabIndexes = await radios.evaluateAll((els) =>
			els.map((el) => el.getAttribute('tabindex')),
		);
		expect(tabIndexes.filter((t) => t === '0')).toHaveLength(1);
		expect(tabIndexes.filter((t) => t === '-1')).toHaveLength(2);

		const checkedBefore = await group.getByRole('radio', { checked: true }).textContent();
		await group.getByRole('radio', { checked: true }).focus();
		await page.keyboard.press('ArrowRight');

		// Selection follows focus, the way an ARIA radiogroup is specified to behave.
		await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
		const checkedAfter = await group.getByRole('radio', { checked: true }).textContent();
		expect(checkedAfter).not.toBe(checkedBefore);

		// And it wraps, so the group can be traversed entirely from the keyboard.
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		expect(await group.getByRole('radio', { checked: true }).textContent()).toBe(checkedBefore);
	});
});

test.describe('settings: appearance preferences survive their own controls', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/settings');
		await seedFresh(page);
		await page.goto('/#/settings', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('reaching high contrast through the Theme picker still restores Parchment', async ({
		page,
	}) => {
		// The Accessibility switch was taught to remember the pre-high-contrast theme, but the Theme
		// segmented control writes `data-theme` directly and never recorded a restore point — so a
		// Parchment reader who tried high contrast through THIS control was silently dropped on
		// Tavern when they turned it back off. Same data loss, through the other door.
		await page.getByRole('radio', { name: 'Parchment' }).click();
		await expect
			.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
			.toBe('parchment');

		await page.getByRole('radio', { name: 'High contrast' }).click();
		await expect
			.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
			.toBe('high-contrast');

		// Now leave via the Accessibility switch, which is the control that reads the restore point.
		// `?tab=` rather than the nav rail: the rail is a button column on desktop and collapses to a
		// different control on a phone, and this behaviour is profile-independent.
		await page.goto('/#/settings?tab=accessibility', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('switch', { name: 'High-contrast theme' }).click();
		await expect
			.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
			.toBe('parchment');
	});

	test('an explicit "Full" motion choice survives a reload under an OS reduce-motion request', async ({
		page,
	}) => {
		// `prepaint.js` resolved `pref === 'reduced' || osReduce`, so a stored 'full' was discarded on
		// every reload: the switch showed ON, you turned it off, and next launch it was back. Settings
		// reads its own state straight off `data-motion`, so the lie was self-reinforcing.
		// prepaint runs BEFORE the bundle, so the media emulation has to precede a navigation.
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/#/settings?tab=accessibility', { waitUntil: 'domcontentloaded' });
		// A hash-only navigation does not reload the document, and `prepaint.js` runs once per
		// document load — so the emulated media only reaches it after a real reload.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const reduce = page.getByRole('switch', { name: 'Reduce motion' });
		await expect(reduce).toHaveAttribute('aria-checked', 'true');
		await reduce.click();
		await expect
			.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-motion')))
			.toBe('full');

		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		expect(await page.evaluate(() => document.documentElement.getAttribute('data-motion'))).toBe(
			'full',
		);

		// With no stored preference the OS still decides, so the motion-sensitive default is intact.
		await page.evaluate(() => window.localStorage.removeItem('dndtools:react:motion'));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		expect(await page.evaluate(() => document.documentElement.getAttribute('data-motion'))).toBe(
			'reduced',
		);
	});
});

// A settings sub-page can be BOTH tier-gated and deep-linked: Command Center → Manage →
// "Permissions" navigates to `/settings?tab=permissions`, which needs the `advanced` tier while the
// default is `core`. The nav filtered the gated entry out, and DS `Select` is a native <select> — a
// native select whose `value` matches no <option> renders the FIRST one. So on a phone the picker
// read "Appearance" while the panel beside it read "Hidden at your experience level", and on the
// desktop rail nothing at all carried `aria-current`.
test.describe('settings: the section picker names the section actually shown', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		// Pin the tier rather than relying on the default, so this stays deterministic if the
		// default ever moves.
		await page.addInitScript(() => {
			window.localStorage.setItem('dndtools:react:tier', 'core');
		});
		await gotoRoute(page, '/settings');
		await seedFresh(page);
	});

	test('keeps a tier-gated active tab in the nav on both profiles', async ({ page }) => {
		await page.goto('/#/settings?tab=permissions', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		// The panel is the gated one — this is the state the picker used to misreport.
		await expect(page.getByText('Hidden at your experience level')).toBeVisible();

		const nav = page.getByRole('navigation', { name: 'Settings navigation' });
		await expect(nav).toContainText('Permissions');

		const picker = nav.getByRole('combobox');
		if ((await picker.count()) > 0) {
			// Phone: the <select> must actually be sitting on the gated entry, not silently
			// displaying whatever option happens to be first.
			expect(await picker.inputValue()).toBe('permissions');
		} else {
			// Desktop / rail: the row exists AND is marked as the current page.
			await expect(nav.getByRole('button', { name: 'Permissions' })).toHaveAttribute(
				'aria-current',
				'page',
			);
		}
	});

	test('still hides gated sections the user is not on', async ({ page }) => {
		// The fix must not become "show every gated tab always" — only the ACTIVE one is re-added.
		await page.goto('/#/settings?tab=appearance', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const nav = page.getByRole('navigation', { name: 'Settings navigation' });
		await expect(nav).toContainText('Appearance');
		await expect(nav).not.toContainText('Permissions');
	});
});
