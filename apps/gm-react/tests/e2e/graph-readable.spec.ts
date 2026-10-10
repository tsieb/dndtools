import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
	dispatch,
	gotoRoute,
	markOnboarded,
	openDemoVault,
	seedFresh,
	waitReady,
} from './_helpers';

// RC-KNW-6.5 — GRAPH LABELS THAT CAN BE READ, AND A PHONE LAYOUT THAT LISTS FIRST. A node's name sits
// below it, wraps at word boundaries, stops at two lines and is nudged clear of its neighbours; on a
// phone the results list is the graph and the canvas waits behind "Show map"; an empty vault shows one
// empty state, and the filter, cluster hulls and dormant arcs wait for the RC-UX-3.5 graph signal.

async function axe(page: Page) {
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(result.violations).toEqual([]);
}

/** The demo vault (the showcase seed, ~19 nodes: the size at which labels used to overprint). */
async function openDemoGraph(page: Page): Promise<void> {
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await openDemoVault(page);
	await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(page.getByRole('status').filter({ hasText: /^Showing \d+ of \d+/ })).toBeVisible();
}

/** Every pair of label boxes that intersects, and every label cut through a word. */
function labelFaults(page: Page) {
	return page.evaluate(() => {
		const labels = [...document.querySelectorAll<HTMLElement>('[data-graph-label]')];
		const boxes = labels.map((label) => ({
			text: label.textContent ?? '',
			r: label.getBoundingClientRect(),
		}));
		const faults: string[] = [];
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const a = boxes[i]!.r;
				const b = boxes[j]!.r;
				const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
				const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
				if (w > 0.5 && h > 0.5) faults.push(`"${boxes[i]!.text}" overlaps "${boxes[j]!.text}"`);
			}
		}
		for (const label of labels) {
			const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
			if (label.getBoundingClientRect().height > 2 * lineHeight + 1)
				faults.push(`"${label.textContent}" runs past two lines`);
			// A word split across two lines draws two client rects; a whole word draws one.
			const text = label.firstChild;
			if (!(text instanceof Text)) continue;
			for (const match of text.data.matchAll(/\S+/g) as IterableIterator<RegExpMatchArray>) {
				const range = document.createRange();
				range.setStart(text, match.index!);
				range.setEnd(text, match.index! + match[0].length);
				const rects = [...range.getClientRects()].filter((r) => r.width > 0);
				const tops = new Set(rects.map((r) => Math.round(r.top)));
				if (tops.size > 1) faults.push(`"${match[0]}" in "${label.textContent}" breaks mid-word`);
			}
		}
		return { count: labels.length, faults };
	});
}

test.describe('graph labels at 1440', () => {
	test.skip(({ isMobile }) => isMobile, 'the desktop canvas; the phone tier is covered below');
	test.use({ viewport: { width: 1440, height: 900 } });

	test('every demo-vault node is named below it, and no two names overlap', async ({ page }) => {
		await openDemoGraph(page);
		const nodes = page.getByTestId('graph-node');
		const total = await nodes.count();
		expect(total).toBeGreaterThanOrEqual(15);
		// Every node is named on a canvas this size, and the name never sits inside the circle.
		await expect(page.locator('[data-graph-label]')).toHaveCount(total);
		// The collision pass settles after layout and the font swap; poll until it has.
		await expect.poll(async () => (await labelFaults(page)).faults).toEqual([]);
		const node = nodes.first();
		const label = page.locator(
			`[data-graph-label="${await node.getAttribute('data-graph-node')}"]`,
		);
		const [nodeBox, labelBox] = [await node.boundingBox(), await label.boundingBox()];
		expect(labelBox!.y + labelBox!.height / 2).not.toBeCloseTo(nodeBox!.y + nodeBox!.height / 2, 0);
		// The full title rides in the tooltip and the accessible name.
		const title = (await label.textContent())!;
		await expect(node).toHaveAttribute(
			'title',
			new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · `),
		);
		await expect(node).toHaveAccessibleName(
			new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `),
		);

		// Selecting a node keeps the labels apart too (the selection is placed first).
		await node.click();
		await expect(node).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(async () => (await labelFaults(page)).faults).toEqual([]);
		await axe(page);
	});

	test('the node diameter follows its connections, not its name', async ({ page }) => {
		await openDemoGraph(page);
		const sizes = await page.getByTestId('graph-node').evaluateAll((buttons) =>
			buttons.map((b) => ({
				degree: Number(/(\d+) connections?$/.exec(b.getAttribute('aria-label') ?? '')?.[1] ?? 0),
				width: b.getBoundingClientRect().width,
			})),
		);
		for (const a of sizes)
			for (const b of sizes) if (a.degree === b.degree) expect(a.width).toBeCloseTo(b.width, 0);
		const widths = sizes.map((s) => s.width);
		expect(Math.min(...widths)).toBeGreaterThanOrEqual(48);
	});
});

test.describe('graph on a phone lists first', () => {
	test.skip(({ isMobile }) => !isMobile, 'the phone tier');

	test('every node is reachable by name through the list; the map names the selection', async ({
		page,
	}) => {
		// The seeded vault: the demo vault adds a live session, whose phone strip is the shell's
		// business, not this screen's.
		await markOnboarded(page);
		await gotoRoute(page, '/graph');
		await seedFresh(page);
		await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		// The list is the primary view; the canvas waits behind its toggle.
		const showMap = page.getByRole('button', { name: 'Show map', exact: true });
		await expect(showMap).toBeVisible();
		await expect(showMap).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByTestId('graph-node')).toHaveCount(0);
		await axe(page);

		const total = Number(
			/of (\d+)/.exec(
				(await page
					.getByRole('status')
					.filter({ hasText: /^Showing/ })
					.textContent())!,
			)![1],
		);
		const list = page.getByRole('region', { name: 'Graph results' });
		const titles = await list.locator('.graph-result-name').allTextContents();
		expect(titles).toHaveLength(total);
		// Every DM-visible note and story entry in the vault is among them.
		const contentTitles: string[] = await page.evaluate(() =>
			Object.values(
				(
					window.__rt!.state.content as {
						items: Record<string, { title: string; deletedAt: string | null }>;
					}
				).items,
			)
				.filter((item) => item.deletedAt === null)
				.map((item) => item.title),
		);
		for (const title of contentTitles) expect(titles).toContain(title);

		for (const title of titles) {
			const row = list.getByRole('button', { name: title }).first();
			await row.click();
			await expect(row).toHaveAttribute('aria-pressed', 'true');
			await expect(page.getByRole('heading', { name: 'Selected' })).toBeVisible();
			await row.click();
			await expect(row).toHaveAttribute('aria-pressed', 'false');
		}

		// Pick a connected node, then open the map: it names the selection and its neighbours.
		await list.getByRole('button', { name: titles[0]! }).first().click();
		await showMap.click();
		const hideMap = page.getByRole('button', { name: 'Hide map', exact: true });
		await expect(hideMap).toHaveAttribute('aria-expanded', 'true');
		await expect(page.getByTestId('graph-node')).toHaveCount(total);
		const selected = page.locator('[data-testid="graph-node"][aria-pressed="true"]');
		await expect(
			page.locator(`[data-graph-label="${await selected.getAttribute('data-graph-node')}"]`),
		).toHaveText(titles[0]!);
		const neighbours = await page.evaluate(() => {
			const sel = document.querySelector('[data-testid="graph-node"][aria-pressed="true"]');
			return Number(/(\d+) connections?$/.exec(sel?.getAttribute('aria-label') ?? '')?.[1] ?? 0);
		});
		expect(await page.locator('[data-graph-label]').count()).toBeGreaterThanOrEqual(
			Math.min(total, 1 + Math.min(neighbours, 1)),
		);
		await expect.poll(async () => (await labelFaults(page)).faults).toEqual([]);
		await axe(page);

		await hideMap.click();
		await expect(page.getByTestId('graph-node')).toHaveCount(0);
	});
});

test.describe('graph before it has anything to show', () => {
	test('an empty vault shows one empty state with New note and Import', async ({ page }) => {
		await markOnboarded(page);
		await page.addInitScript(() => {
			try {
				window.localStorage.setItem('dndtools:react:vault-choice', 'fresh');
			} catch {
				/* best-effort, like markOnboarded */
			}
		});
		await gotoRoute(page, '/graph');
		await seedFresh(page);
		await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const main = page.locator('#main-content');
		await expect(main.getByRole('button', { name: 'New note', exact: true })).toBeVisible();
		await expect(main.getByRole('button', { name: 'Import notes', exact: true })).toBeVisible();
		// No analytics about a graph that does not exist.
		await expect(page.getByLabel('Search the graph')).toHaveCount(0);
		await expect(page.getByText('Dormant arcs')).toHaveCount(0);
		await expect(page.getByTestId('graph-clusters-toggle')).toHaveCount(0);
		await expect(page.getByText('Graph health')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Show map' })).toHaveCount(0);
		await axe(page);

		await main.getByRole('button', { name: 'New note', exact: true }).click();
		await page.waitForURL((url) => url.hash === '#/knowledge');
		await expect(page.getByTestId('knowledge-composer')).toBeVisible();
	});

	test('below the graph signal the nodes list, but filter, clusters and arcs wait', async ({
		page,
	}) => {
		await markOnboarded(page);
		await page.addInitScript(() => {
			try {
				window.localStorage.setItem('dndtools:react:vault-choice', 'fresh');
			} catch {
				/* best-effort, like markOnboarded */
			}
		});
		await gotoRoute(page, '/graph');
		await seedFresh(page);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		for (const [title, body] of [
			['Harbor Town', 'The docks.'],
			['Smugglers’ Cache', 'Under [[Harbor Town]].'],
		]) {
			const result = await dispatch(page, {
				type: 'content.create-item',
				actorId,
				payload: { kind: 'note', title, body },
			});
			expect(result.status).toBe('accepted');
		}
		await page.goto('/#/graph', { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const list = page.getByRole('region', { name: 'Graph results' });
		await expect(list.getByRole('button', { name: /Harbor Town/ })).toBeVisible();
		await expect(list.getByRole('button', { name: /Smugglers’ Cache/ })).toBeVisible();
		await expect(page.getByLabel('Search the graph')).toHaveCount(0);
		await expect(page.getByText('Dormant arcs')).toHaveCount(0);
		await expect(page.getByTestId('graph-clusters-toggle')).toHaveCount(0);
		await axe(page);
	});
});
