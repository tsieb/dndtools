import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// READING WIDTH (RC-KNW-1.4) — Settings › Appearance › "Reading width" sets the measure and the
// leading of a Knowledge note body, and nothing else. The two things worth proving are that the
// preference actually reaches the rendered note (not just localStorage) and that it does NOT take
// the markdown renderer's type hierarchy with it: an earlier attempt reached the renderer's inline
// `font:` shorthands with blanket `!important` font-size rules and flattened every heading, callout
// label and inline code span to one size. The heading assertions below are that regression's fence.

/** The note body used by every case here — headings, a list, code and a quote in one document.
 * The renderer shifts every heading one level down (the surface owns the <h1>), so `#`/`##`/`###`
 * arrive as h2/h3/h4 at the renderer's 22/18/15px scale. */
const BODY = [
	'# Harbor District',
	'',
	'The tide clock in the customs house has not moved since the eclipse, and the dockhands have',
	'started keeping their own time by the bells of the chapel across the water.',
	'',
	'## Standing orders',
	'',
	'- Log every hull that ties up after the second bell.',
	'- Refuse the salt-runners unless the harbourmaster countersigns.',
	'',
	'### Contacts',
	'',
	'Speak to `Maren Vos` before anyone else.',
	'',
	'> The customs house keeps its own hours now.',
].join('\n');

async function seedNote(page: Page): Promise<string> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId,
		payload: {
			kind: 'note',
			title: `Harbor Ledger ${Date.now()}`,
			body: BODY,
			visibility: 'dm-only',
		},
	});
	expect(result.status).toBe('accepted');
	for (const event of result.events ?? []) {
		if (event.kind === 'content.item-changed' && typeof event.itemId === 'string') {
			return event.itemId;
		}
	}
	throw new Error('content.create-item produced no item id');
}

/** Pick a reading width through the real Settings control, the way a reader would. */
async function chooseReadingWidth(page: Page, label: string): Promise<void> {
	await gotoRoute(page, '/settings');
	const group = page.getByRole('radiogroup', { name: 'Reading width' });
	// "Comfortable" is also a Density option on this very page, so the option is always addressed
	// through its own group rather than by label alone.
	await group.getByRole('radio', { name: label }).click();
	await expect(group.getByRole('radio', { name: label })).toBeChecked();
}

/** Computed font sizes of the prose body, in px, keyed by the element they came from. */
function proseTypeScale(page: Page) {
	return page.evaluate(() => {
		const root = document.querySelector('.knowledge-prose')!;
		const px = (selector: string) => {
			const el = root.querySelector(selector);
			return el ? Number.parseFloat(getComputedStyle(el).fontSize) : null;
		};
		return { h2: px('h2'), h3: px('h3'), h4: px('h4'), p: px('p'), code: px('code') };
	});
}

test.describe('knowledge: the reading-width preference', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/knowledge');
		await seedFresh(page);
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('Full widens the note measure past Comfortable, and the choice survives a reload', async ({
		page,
	}) => {
		// A viewport wide enough that the MEASURE is the binding constraint rather than the panel:
		// under ~600px of panel the three settings collapse onto each other and there is nothing to
		// observe. Set explicitly so the case means the same thing in the mobile project.
		await page.setViewportSize({ width: 1280, height: 900 });
		const noteId = await seedNote(page);

		await gotoRoute(page, `/knowledge/${noteId}`);
		const prose = page.locator('.knowledge-prose');
		await expect(prose).toHaveAttribute('data-prose-width', 'comfortable');
		const comfortable = (await prose.boundingBox())!.width;

		await chooseReadingWidth(page, 'Full');
		await gotoRoute(page, `/knowledge/${noteId}`);
		await expect(prose).toHaveAttribute('data-prose-width', 'full');
		const full = (await prose.boundingBox())!.width;
		expect(full).toBeGreaterThan(comfortable);

		// Wide sits between the two, so the control is a real three-step scale and not a toggle.
		await chooseReadingWidth(page, 'Wide');
		await gotoRoute(page, `/knowledge/${noteId}`);
		await expect(prose).toHaveAttribute('data-prose-width', 'wide');
		const wide = (await prose.boundingBox())!.width;
		expect(wide).toBeGreaterThan(comfortable);
		expect(wide).toBeLessThan(full);

		// It is a device preference, so it has to outlive the tab.
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(prose).toHaveAttribute('data-prose-width', 'wide');
		expect(
			await page.evaluate(() => window.localStorage.getItem('dndtools:react:prose-width')),
		).toBe('wide');
	});

	test('opens the leading without touching the note type hierarchy', async ({ page }) => {
		const noteId = await seedNote(page);
		await gotoRoute(page, `/knowledge/${noteId}`);
		await expect(page.locator('.knowledge-prose')).toHaveAttribute(
			'data-prose-width',
			'comfortable',
		);

		const before = await proseTypeScale(page);
		// The fixture really does render each of these, otherwise the comparison below is vacuous.
		for (const [element, size] of Object.entries(before)) {
			expect(size, `${element} is missing from the rendered note`).not.toBeNull();
		}
		// Headings descend, body text sits below the smallest of them, and inline code is its own
		// size — the renderer's scale, which this preference has no business rewriting.
		expect(before.h2!).toBeGreaterThan(before.h3!);
		expect(before.h3!).toBeGreaterThan(before.h4!);
		expect(before.h4!).toBeGreaterThan(before.p!);

		const leadingBefore = await page.evaluate(
			() => getComputedStyle(document.querySelector('.knowledge-prose p')!).lineHeight,
		);

		await chooseReadingWidth(page, 'Full');
		await gotoRoute(page, `/knowledge/${noteId}`);
		await expect(page.locator('.knowledge-prose')).toHaveAttribute('data-prose-width', 'full');

		// Every font size is exactly as it was — this is the assertion the flattening regression fails.
		expect(await proseTypeScale(page)).toEqual(before);
		// And the leading did open, so the preference is doing something to the prose.
		const leadingAfter = await page.evaluate(
			() => getComputedStyle(document.querySelector('.knowledge-prose p')!).lineHeight,
		);
		expect(Number.parseFloat(leadingAfter)).toBeGreaterThan(Number.parseFloat(leadingBefore));
	});
});
