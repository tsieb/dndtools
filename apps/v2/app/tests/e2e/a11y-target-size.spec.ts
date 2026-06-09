import { expect, test, type Page, type TestInfo } from '@playwright/test';

// A11Y-004 AC1: mobile/touch core controls meet the 44 × 44 CSS px minimum touch target.
// This spec runs ONLY on the mobile-chromium project (compact profile, Pixel 5 viewport).
// The same 44 px floor used by the desktop Electron accessibility sweep (tests/e2e-desktop/
// accessibility.spec.ts) is applied here to the v2 web app under the mobile profile.
//
// Approved WCAG 2.5.8 exceptions NOT swept:
//   - <input>, <select>, <textarea>: platform-UA-controlled form controls.
//   - Plain <a> links without aria-label (inline text links are WCAG 2.5.8 exceptions).
//
// The COMPACT_MAX platform probe breakpoint is 720 px; the Pixel 5 project viewport is
// 393 px, so profile.isCompact === true and the CSS @media(max-width: 720px) rule fires.

const PRIMARY_ROUTES = ['/', '/scenes/', '/settings/', '/atlas/', '/session/', '/characters/'];

/** Selector mirrors the desktop accessibility sweep; excludes native form controls. */
const INTERACTIVE_SELECTOR =
	'button, [role="button"], [role="tab"], [role="radio"], summary, a[aria-label]';

const MIN_SIZE = 44;

async function waitForRoute(page: Page, route: string): Promise<void> {
	await page.goto(route);
	// Wait for the route landmark that is always rendered by the shell layout.
	await page.getByTestId('route-landmark').waitFor({ state: 'visible', timeout: 15_000 });
	// Short settle for any async reactive updates before measuring.
	await page.waitForTimeout(100);
}

async function sweepTargets(page: Page, route: string): Promise<string[]> {
	return page.evaluate(
		({ selector, minSize }) => {
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
				// Skip zero-sized elements (off-screen / not rendered in current layout).
				if (rect.width < 1 || rect.height < 1) continue;
				if (rect.width >= minSize && rect.height >= minSize) continue;

				const descriptor = [
					element.tagName.toLowerCase(),
					element.getAttribute('aria-label')?.trim(),
					element.getAttribute('data-testid')?.trim(),
					element.textContent?.trim().slice(0, 40),
				]
					.filter(Boolean)
					.join(' | ');
				failures.push(
					`${descriptor || '<unnamed>'} (${Math.round(rect.width)}×${Math.round(rect.height)})`,
				);
			}

			return failures.slice(0, 40);
		},
		{ selector: INTERACTIVE_SELECTOR, minSize: MIN_SIZE },
	);
}

test.describe('A11Y-004 AC1: mobile touch-target sweep', () => {
	test.beforeEach(async ({}, testInfo: TestInfo) => {
		test.skip(
			testInfo.project.name !== 'mobile-chromium',
			'touch-target sweep applies to the compact (mobile) profile only',
		);
	});

	for (const route of PRIMARY_ROUTES) {
		test(`all interactive controls meet 44×44 CSS px minimum on ${route}`, async ({ page }) => {
			await waitForRoute(page, route);
			const violations = await sweepTargets(page, route);
			expect(
				violations,
				`Touch-target violations on ${route} (mobile-chromium):\n${violations.join('\n')}`,
			).toEqual([]);
		});
	}
});
