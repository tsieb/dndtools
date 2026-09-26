import { expect, test, type Locator, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

/**
 * THE DESIGN-SYSTEM KIT IN THE SANDBOX — RC-WID-5.4.
 *
 * Acceptance: the starter library's custom showcase (Torchlight), restyled with the kit, matches the
 * DS Button, Card and Badge in all three themes. "Matches" is measured. The DS component is rendered
 * by the component gallery (`#/__ds`, the fixtures the DS reference is generated from), and its
 * computed look is snapshotted in every theme and density. The kit element inside the running
 * sandbox frame must then compute to the same values once the host has re-themed the frame live.
 * The reference is read from the DS on every run instead of a stored baseline, so a DS change the
 * kit did not follow fails here rather than passing against a stale file.
 *
 * Width, height of the card and the text itself belong to each specimen, so they are not compared.
 */

const THEMES = ['tavern', 'parchment', 'high-contrast'] as const;
const DENSITIES = ['comfortable', 'compact'] as const;

const BOX = [
	'box-sizing',
	'padding-top',
	'padding-right',
	'padding-bottom',
	'padding-left',
	'border-top-width',
	'border-top-style',
	'border-top-color',
	'border-bottom-color',
	'border-top-left-radius',
	'background-color',
	'color',
	'box-shadow',
];
const TEXT = ['font-family', 'font-size', 'font-weight', 'line-height'];
const FOCUS = ['outline-style', 'outline-width', 'outline-color', 'outline-offset'];

interface Reference {
	component: 'Button' | 'Card' | 'Badge';
	/** Gallery prop controls to set, by option label. */
	props: Record<string, string>;
	/** The DS element inside the gallery specimen. */
	specimen: string;
	/** The kit element inside the Torchlight frame. */
	kit: string;
	properties: string[];
}

const REFERENCES: Reference[] = [
	{
		component: 'Button',
		props: { variant: 'secondary', size: 'md' },
		specimen: '[data-ds-specimen="Button"] > button',
		kit: '[data-pause]',
		properties: [
			...BOX,
			...TEXT,
			'display',
			'align-items',
			'justify-content',
			'column-gap',
			'min-height',
			'min-width',
			'height',
			'opacity',
			'cursor',
			'white-space',
		],
	},
	{
		component: 'Card',
		props: { elevation: 'flat', padding: 'md' },
		specimen: '[data-ds-specimen="Card"] > div',
		kit: '[data-torch]',
		properties: [...BOX, 'cursor'],
	},
	{
		component: 'Badge',
		// Torchlight's reading at its default intensity is the accent badge.
		props: { status: 'accent' },
		specimen: '[data-ds-specimen="Badge"] > span',
		kit: '[data-reading]',
		properties: [
			...BOX,
			...TEXT,
			'display',
			'align-items',
			'justify-content',
			'column-gap',
			'height',
			'text-align',
			'white-space',
		],
	},
];

type Look = Record<string, string>;
type Snapshot = Record<string, Look>;

function readLook(target: Locator, properties: readonly string[]): Promise<Look> {
	return target.evaluate((element, names) => {
		const style = getComputedStyle(element);
		return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
	}, properties);
}

/**
 * Focus and read the ring; `:focus-visible` must match for the ring to count. Chromium grants it to
 * a programmatic focus only when the last interaction was not a pointer, and the gallery's select
 * controls count as one there, so `byKeyboard` reaches the element with Shift+Tab, Tab instead.
 */
async function readFocusRing(target: Locator, byKeyboard?: Page): Promise<Look> {
	await target.focus();
	if (byKeyboard) {
		await byKeyboard.keyboard.press('Shift+Tab');
		await byKeyboard.keyboard.press('Tab');
	}
	const ring = await target.evaluate(
		(element, names) => {
			const style = getComputedStyle(element);
			return {
				visible: String(element.matches(':focus-visible')),
				...Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)])),
			};
		},
		[...FOCUS],
	);
	await target.evaluate((element) => (element as HTMLElement).blur());
	return ring;
}

const key = (theme: string, density: string, component: string) =>
	`${theme}/${density}/${component}`;

async function accept(page: Page, command: Record<string, unknown>) {
	const result = await dispatch(page, command);
	expect(result.status, `${command.type}: ${JSON.stringify(result.rejection)}`).toBe('accepted');
}

/** Install, trust, enable and place the Torchlight starter; returns the scene it is on. */
async function placeTorchlight(page: Page): Promise<string> {
	await markOnboarded(page);
	await gotoRoute(page, '/extensions');
	await seedFresh(page);
	await gotoRoute(page, '/extensions');
	await waitReady(page);
	await page.getByRole('button', { name: 'Install Torchlight' }).click();
	await expect(page.getByTestId('package-card-starter.torchlight')).toBeVisible();

	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	await accept(page, {
		type: 'widget.package.review',
		actorId,
		payload: { packageId: 'starter.torchlight', trustState: 'trusted' },
	});
	await accept(page, {
		type: 'widget.package.enable',
		actorId,
		payload: { packageId: 'starter.torchlight' },
	});
	await accept(page, {
		type: 'scene.create',
		actorId,
		payload: { name: 'Kit shelf', description: '', visibility: 'dm-only', tags: [] },
	});
	const sceneId = await page.evaluate(
		() =>
			Object.values(window.__rt!.state.scenes.scenes).find((scene) => scene.name === 'Kit shelf')
				?.id ?? null,
	);
	expect(sceneId).toBeTruthy();
	await accept(page, {
		type: 'scene.add-widget',
		actorId,
		payload: {
			sceneId,
			widget: {
				type: 'torchlight',
				version: '1.0.0',
				layout: { x: 40, y: 40, w: 320, h: 260 },
				configuration: {},
				localState: {},
				binding: null,
			},
		},
	});
	return sceneId!;
}

/**
 * Take the pointer off the specimen before reading it. DS Button paints its hover look from
 * `onMouseEnter`, and a theme or density switch reflows the gallery under the stationary pointer;
 * Chromium then fires a synthetic mouseenter, so the reference was sometimes the HOVER background
 * (`--color-surface-overlay`) while the kit frame showed the resting one. It failed about half the
 * mobile runs, on the base too.
 */
async function unhover(page: Page, specimen: Locator): Promise<void> {
	const box = await specimen.boundingBox();
	const viewport = page.viewportSize();
	// A corner the specimen does not cover: below it if there is room, otherwise the top-left pixel.
	const y = box && viewport && box.y + box.height + 8 < viewport.height ? viewport.height - 2 : 1;
	await page.mouse.move(1, y);
	await expect
		.poll(() => specimen.evaluate((element) => (element as HTMLElement).style.background))
		.not.toBe('var(--color-surface-overlay)');
}

/** Snapshot the DS Button, Card and Badge in every theme and density, from the gallery. */
async function snapshotDesignSystem(page: Page): Promise<{ looks: Snapshot; rings: Snapshot }> {
	await page.goto('/#/__ds', { waitUntil: 'domcontentloaded' });
	await page.locator('[data-ds-gallery]').waitFor();
	// The shipped colour transitions would otherwise be measured mid-flight after a theme switch.
	await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'none'));

	const looks: Snapshot = {};
	const rings: Snapshot = {};
	for (const reference of REFERENCES) {
		await page.getByLabel('Component', { exact: true }).selectOption(reference.component);
		for (const [prop, value] of Object.entries(reference.props)) {
			await page.getByLabel(`Prop ${prop}`, { exact: true }).selectOption({ label: value });
		}
		const specimen = page.locator(reference.specimen).first();
		await expect(specimen).toBeVisible();
		for (const theme of THEMES) {
			await page.getByLabel('Theme', { exact: true }).selectOption(theme);
			for (const density of DENSITIES) {
				await page.getByLabel('Density', { exact: true }).selectOption(density);
				await expect(page.locator('html')).toHaveAttribute('data-density', density);
				await unhover(page, specimen);
				looks[key(theme, density, reference.component)] = await readLook(
					specimen,
					reference.properties,
				);
				if (reference.component === 'Button') {
					rings[key(theme, density, 'Button')] = await readFocusRing(specimen, page);
				}
			}
		}
	}
	return { looks, rings };
}

async function setHostLook(page: Page, theme: string, density: string, motion: string) {
	await page.evaluate(
		(look) => {
			const html = document.documentElement;
			html.setAttribute('data-theme', look.theme);
			html.setAttribute('data-density', look.density);
			html.setAttribute('data-motion', look.motion);
		},
		{ theme, density, motion },
	);
}

test.describe('design-system kit in the sandbox', () => {
	test('Torchlight, restyled with the kit, matches the DS Button, Card and Badge in every theme', async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const sceneId = await placeTorchlight(page);
		const reference = await snapshotDesignSystem(page);

		await gotoRoute(page, `/scene/${sceneId}`);
		const frame = page.locator('iframe[data-widget-sandbox="torchlight"]');
		await expect(frame).toBeVisible();
		// The kit changed nothing about the frame's isolation.
		await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
		const inside = page.frameLocator('iframe[data-widget-sandbox="torchlight"]');
		await expect(inside.locator('[data-reading]')).toContainText('of 10');
		// The kit arrived as text in `init`, not as a request the frame made.
		await expect(inside.locator('style[data-widget-kit="1"]')).toHaveCount(1);
		await expect(inside.locator('link')).toHaveCount(0);

		const html = inside.locator('html');
		for (const theme of THEMES) {
			for (const density of DENSITIES) {
				await setHostLook(page, theme, density, 'full');
				// Re-themed live, without a reload: the host mirrors its look into the running frame.
				await expect(html).toHaveAttribute('data-theme', theme);
				await expect(html).toHaveAttribute('data-density', density);
				for (const entry of REFERENCES) {
					const expected = reference.looks[key(theme, density, entry.component)];
					await expect
						.poll(() => readLook(inside.locator(entry.kit), entry.properties), {
							message: `kit ${entry.component} in ${theme}/${density}`,
						})
						.toEqual(expected);
				}
				expect(
					await readFocusRing(inside.locator('[data-pause]')),
					`kit focus ring in ${theme}/${density}`,
				).toEqual(reference.rings[key(theme, density, 'Button')]);
			}
		}
	});

	test('the in-app motion setting reaches the frame, and the flicker can be paused', async ({
		page,
	}) => {
		const sceneId = await placeTorchlight(page);
		await gotoRoute(page, `/scene/${sceneId}`);
		const inside = page.frameLocator('iframe[data-widget-sandbox="torchlight"]');
		const pause = inside.locator('[data-pause]');
		const flame = inside.locator('[data-flame]');
		await setHostLook(page, 'tavern', 'comfortable', 'full');
		await expect(pause).toBeVisible();

		// WCAG 2.2.2: the flicker never ends on its own, so it can be stopped.
		await pause.click();
		await expect(pause).toHaveAttribute('aria-pressed', 'true');
		await expect
			.poll(() => flame.evaluate((element) => getComputedStyle(element).animationPlayState))
			.toBe('paused');
		await pause.click();
		await expect(pause).toHaveAttribute('aria-pressed', 'false');

		// Settings › Reduce motion is an attribute on the host, which the frame does not inherit. The
		// host mirrors it: the flame stops on its resting frame and the pause control goes away.
		await setHostLook(page, 'tavern', 'comfortable', 'none');
		await expect(inside.locator('html')).toHaveAttribute('data-motion', 'none');
		await expect(pause).toBeHidden();
		await expect
			.poll(() => flame.evaluate((element) => getComputedStyle(element).animationIterationCount))
			.toBe('1');

		await setHostLook(page, 'tavern', 'comfortable', 'full');
		await expect(inside.locator('html')).toHaveAttribute('data-motion', 'full');
		await expect(pause).toBeVisible();
	});
});
