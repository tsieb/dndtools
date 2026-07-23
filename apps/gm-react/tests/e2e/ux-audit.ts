import { expect, type Locator, type Page } from '@playwright/test';

const INTERACTIVE_SELECTOR = [
	'button',
	'a[href]',
	'input:not([type="hidden"])',
	'select',
	'textarea',
	'[role="button"]',
	'[role="option"]',
	'[role="menuitem"]',
	'[role="radio"]',
	'[role="checkbox"]',
	'[role="tab"]',
	'[role="switch"]',
].join(', ');

/**
 * Fail with a useful list when controls are painted outside their scroll owner's visible region.
 * Controls below a normal document fold are valid: the helper scrolls each into view first, then
 * checks that it is no longer clipped or covered by fixed chrome. This detects the common flex
 * `min-height: auto` and nested-overflow regressions without treating long content as a defect.
 */
export async function expectInteractiveControlsReachable(
	page: Page,
	root: Locator,
	label: string,
): Promise<void> {
	const controls = root.locator(INTERACTIVE_SELECTOR);
	const count = await controls.count();
	const failures: string[] = [];

	for (let index = 0; index < count; index += 1) {
		const control = controls.nth(index);
		if (!(await control.isVisible())) continue;
		await control.scrollIntoViewIfNeeded();
		const failure = await control.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			if (rect.width < 1 || rect.height < 1 || style.visibility === 'hidden') return null;
			const centerX = Math.min(Math.max(rect.left + rect.width / 2, 1), innerWidth - 1);
			const centerY = Math.min(Math.max(rect.top + rect.height / 2, 1), innerHeight - 1);
			if (
				rect.left < -1 ||
				rect.top < -1 ||
				rect.right > innerWidth + 1 ||
				rect.bottom > innerHeight + 1
			) {
				return 'outside the visual viewport after scrolling';
			}
			const hit = document.elementFromPoint(centerX, centerY);
			if (hit && hit !== element && !element.contains(hit) && !hit.contains(element)) {
				const hitStyle = getComputedStyle(hit);
				if (hitStyle.position === 'fixed' || hitStyle.position === 'sticky') {
					return `covered by fixed/sticky ${hit.tagName.toLowerCase()}`;
				}
			}
			return null;
		});
		if (failure) {
			const name =
				(await control.getAttribute('aria-label')) ??
				(await control.textContent()) ??
				'unnamed control';
			failures.push(`${name.replace(/\s+/g, ' ').trim().slice(0, 80)}: ${failure}`);
		}
	}

	expect(failures, `${label} contains a control that cannot be reached`).toEqual([]);
}

/** Assert that focusing an editable field causes its scroll owner to reveal it above fixed chrome. */
export async function expectFocusedInputVisible(input: Locator, label: string): Promise<void> {
	await input.focus();
	await expect(input, `${label} did not receive keyboard focus`).toBeFocused();
	const failure = await input.evaluate((element) => {
		const rect = element.getBoundingClientRect();
		const point = document.elementFromPoint(
			Math.min(Math.max(rect.left + rect.width / 2, 1), innerWidth - 1),
			Math.min(Math.max(rect.top + rect.height / 2, 1), innerHeight - 1),
		);
		if (rect.top < 0 || rect.bottom > innerHeight) return 'outside visual viewport';
		if (point && point !== element && !element.contains(point) && !point.contains(element)) {
			const style = getComputedStyle(point);
			if (style.position === 'fixed' || style.position === 'sticky')
				return 'covered by fixed/sticky chrome';
		}
		return null;
	});
	expect(failure, `${label} must remain visible when focused`).toBeNull();
}

/**
 * A deliberately scoped touch-target check. Apply it to primary actions/navigation, not dense
 * editor toolbars where target spacing may supply the WCAG 2.2 exception.
 */
export async function expectTouchTarget(
	locator: Locator,
	label: string,
	minimum = 44,
): Promise<void> {
	const box = await locator.boundingBox();
	expect(box, `${label} is not rendered`).not.toBeNull();
	if (!box) return;
	expect(
		Math.min(box.width, box.height),
		`${label} is smaller than ${minimum}px`,
	).toBeGreaterThanOrEqual(minimum);
}
