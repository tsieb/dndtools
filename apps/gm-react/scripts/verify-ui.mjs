// UI-driven acceptance gate: for each newly-wired screen, click a REAL button (no window.__rt
// dispatch shortcut) and assert the core op-log (window.__rt.state.sync.operations) grew — proving
// the UI fired a real dispatch, not a no-op. This is the bar the FEATURE-GAPS audit demanded:
// "click → core state changed", not just typecheck-green. Needs `pnpm dev` running.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../package.json'));
const { chromium } = require('playwright');
const BASE = process.env.REACT_URL ?? 'http://localhost:5273';

const browser = await chromium.launch();
const results = [];
const ops = (page) => page.evaluate(() => window.__rt?.state?.sync?.operations?.length ?? -1);
const ready = (page) =>
	page.waitForFunction(() => window.__rt && window.__rt.loaded === true, null, { timeout: 15000 });

// The first-run onboarding overlay covers every surface on a fresh profile — mark the device as
// already onboarded so the trials drive the app itself. The dedicated onboarding case below runs
// WITHOUT this flag to prove the overlay's own flow.
const markOnboarded = (page) =>
	page.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {}
	});

async function trial(name, route, interact) {
	const page = await browser.newPage();
	await markOnboarded(page);
	const errs = [];
	page.on('pageerror', (e) => errs.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
	try {
		// HashRouter: navigate under the `#` fragment (`route` already starts with `/`).
		await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle', timeout: 20000 });
		await ready(page);
		await page.waitForTimeout(400);
		const before = await ops(page);
		await interact(page);
		await page.waitForTimeout(800);
		const after = await ops(page);
		results.push({
			name,
			ok: after > before && errs.length === 0,
			detail: `ops ${before}→${after}${errs.length ? ' ERR:' + errs[0] : ''}`,
		});
	} catch (e) {
		results.push({ name, ok: false, detail: `EX: ${e.message}` });
	}
	await page.close();
}

const click = (page, re) => page.getByRole('button', { name: re }).first().click({ timeout: 5000 });
const fillFirst = (page, val) => page.getByRole('textbox').first().fill(val, { timeout: 4000 });

// Seed result check (fresh headless DB): the demo-seed must materialize 3 real PCs via the guided draft
// flow (quick-create can't make a `pc`), each with real combat stats. Typecheck/build can't prove this.
{
	const page = await browser.newPage();
	await markOnboarded(page);
	try {
		await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
		await ready(page);
		await page.waitForTimeout(400);
		const pcs = await page.evaluate(() =>
			Object.values(window.__rt.state.characters.characters)
				.filter((c) => c.kind === 'pc')
				.map((c) => ({ name: c.name, hp: c.combat.hp })),
		);
		const ok = pcs.length >= 3 && pcs.every((c) => c.hp > 0);
		results.push({
			name: 'Seed · 3 PCs via draft flow',
			ok,
			detail: `${pcs.length} pcs, hp=[${pcs.map((c) => c.hp).join(',')}]`,
		});
	} catch (e) {
		results.push({ name: 'Seed · 3 PCs via draft flow', ok: false, detail: `EX: ${e.message}` });
	}
	await page.close();
}

// Onboarding — the one case that runs WITHOUT the onboarded flag: a fresh device must get the
// first-run overlay, walk all six steps (keeping the sample vault; deciding the ADR-026 forced
// privacy step with its typed acknowledgment), land in the app with the flag recorded, and NOT
// see the overlay again after reload.
{
	const page = await browser.newPage();
	// Clear the flag ONCE (sessionStorage marker guards it) — the init script re-runs on the
	// post-finish reload, and re-clearing there would falsely re-open the overlay.
	await page.addInitScript(() => {
		try {
			if (!window.sessionStorage.getItem('onboarding-case-armed')) {
				window.sessionStorage.setItem('onboarding-case-armed', '1');
				window.localStorage.removeItem('dndtools:react:onboarded');
			}
		} catch {}
	});
	try {
		await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
		await ready(page);
		const overlay = page.getByRole('dialog', { name: /first-run setup/i });
		await overlay.waitFor({ timeout: 5000 });
		await page.getByRole('button', { name: /get started/i }).click({ timeout: 5000 });
		await page.getByRole('button', { name: /continue/i }).click({ timeout: 5000 }); // vault
		// ADR-026 forced privacy step: pick Private, type the acknowledgment, then continue.
		await page.getByRole('radio', { name: /private vault/i }).click({ timeout: 5000 });
		await page
			.getByLabel(/type "i hold the keys" to confirm/i)
			.fill('i hold the keys', { timeout: 5000 });
		for (let s = 0; s < 3; s++)
			await page.getByRole('button', { name: /continue/i }).click({ timeout: 5000 });
		await page.getByRole('button', { name: /enter command center/i }).click({ timeout: 5000 });
		await overlay.waitFor({ state: 'detached', timeout: 5000 });
		const flag = await page.evaluate(() => window.localStorage.getItem('dndtools:react:onboarded'));
		await page.reload({ waitUntil: 'networkidle' });
		await ready(page);
		const again = await page.getByRole('dialog', { name: /first-run setup/i }).count();
		results.push({
			name: 'Onboarding · 6-step first run',
			ok: flag === 'done' && again === 0,
			detail: `flag=${flag}, re-shown=${again}`,
		});
	} catch (e) {
		results.push({ name: 'Onboarding · 6-step first run', ok: false, detail: `EX: ${e.message}` });
	}
	await page.close();
}

// Knowledge — New note: open composer, type a title, Enter-to-submit → content.create-item
await trial('Knowledge · New note', '/knowledge', async (p) => {
	await click(p, /new note/i);
	await p.waitForTimeout(300);
	const tb = p.getByPlaceholder(/new note title/i);
	await tb.fill('UI Gate Note');
	await tb.press('Enter');
});
// Characters — New character → guided CharBuilder wizard (entry choice → 6 steps) → the real core
// draft flow. Strict: requires the finalize-draft op, not just any op growth.
await trial('Characters · New character', '/characters', async (p) => {
	await click(p, /new character/i);
	await p.waitForTimeout(300);
	await click(p, /start building/i);
	await p.waitForTimeout(300);
	await fillFirst(p, 'UI Gate Hero');
	for (let s = 0; s < 5; s++) {
		await click(p, /^continue$/i);
		await p.waitForTimeout(200);
	}
	await click(p, /create character/i);
	await p.waitForFunction(
		() => window.__rt.state.sync.operations.some((o) => o.opType === 'character.finalize-draft'),
		null,
		{ timeout: 8000 },
	);
});
// Atlas — Map editor overlay: open the Foundry-style Notes group, pick the Point-of-interest tool,
// then click the canvas → a real map.create-poi op at the clicked position (strict op-type assert —
// opening the overlay and switching tools alone dispatches nothing).
await trial('Atlas · builder POI place', '/atlas', async (p) => {
	await click(p, /open in builder/i);
	await p.waitForTimeout(600);
	// The rail is layer GROUPS that reveal a sub-tool flyout; open "Notes", then arm "Point of interest".
	await p.getByRole('button', { name: 'Notes', exact: true }).click({ timeout: 5000 });
	await p.getByRole('button', { name: /point of interest/i }).click({ timeout: 5000 });
	await p
		.locator('[role="dialog"] [data-testid="map-canvas-well"]')
		.click({ position: { x: 220, y: 160 }, timeout: 5000 });
	// The map.create-poi command logs its durable op as 'map.poi.create'.
	await p.waitForFunction(
		() => window.__rt.state.sync.operations.some((o) => o.opType === 'map.poi.create'),
		null,
		{ timeout: 5000 },
	);
});
// Atlas — New map → form → fill name → Create → map.create
await trial('Atlas · New map', '/atlas', async (p) => {
	await click(p, /new map/i);
	await p.waitForTimeout(300);
	await fillFirst(p, 'UI Gate Map');
	await click(p, /create|add|save/i);
});
// Session — Go live → session.set-workflow on one click
await trial('Session · Go live', '/session', async (p) => {
	await click(p, /go live|start session/i);
});
// Session — Build encounter → pick a real roster member → Roll initiative → encounter.build + combat.start.
// NOTE each trial's page is an ISOLATED browser context (fresh vault), so the trial goes live itself —
// Build encounter is core-gated to the active workflow.
await trial('Session · Build encounter', '/session', async (p) => {
	await click(p, /go live|start session/i);
	await p.waitForTimeout(500);
	await click(p, /build encounter/i);
	await p.waitForTimeout(400);
	await p.locator('[role="dialog"] button[aria-pressed="false"]').first().click({ timeout: 5000 });
	// The footer LAUNCH button exactly — the per-row d20 pre-fills are "Roll initiative for <name>".
	await p.getByRole('button', { name: 'Roll initiative', exact: true }).click({ timeout: 5000 });
	// Op-count growth alone would false-pass on the go-live op — require the real combat.start.
	await p.waitForFunction(
		() => window.__rt.state.sync.operations.some((o) => o.opType === 'combat.start'),
		null,
		{ timeout: 5000 },
	);
});
// Board — canvas keyboard a11y: Edit layout → focus a widget frame → Enter selects → ArrowRight must
// commit exactly a scene.move-widget op (asserted BY TYPE — Edit layout itself logs a safe-point op,
// so a raw count check would false-pass).
{
	const page = await browser.newPage();
	await markOnboarded(page);
	const errs = [];
	page.on('pageerror', (e) => errs.push(e.message));
	try {
		await page.goto(`${BASE}/#/board`, { waitUntil: 'networkidle', timeout: 20000 });
		await ready(page);
		await page.waitForTimeout(400);
		await click(page, /edit layout/i);
		await page.waitForTimeout(400);
		const moveOps = () =>
			page.evaluate(
				() =>
					window.__rt.state.sync.operations.filter((o) => o.opType === 'scene.move-widget').length,
			);
		const before = await moveOps();
		const frame = page.locator('[data-testid^="widget-"]').first();
		await frame.focus();
		await frame.press('Enter');
		await frame.press('ArrowRight');
		await page.waitForTimeout(600);
		const after = await moveOps();
		results.push({
			name: 'Board · keyboard move commits',
			ok: after > before && errs.length === 0,
			detail: `move ops ${before}→${after}${errs.length ? ' ERR:' + errs[0] : ''}`,
		});
	} catch (e) {
		results.push({ name: 'Board · keyboard move commits', ok: false, detail: `EX: ${e.message}` });
	}
	await page.close();
}
// Board — Edit layout captures a safe point (command-center.snapshot-auto-save), which reveals the
// "Restore safe point" button (previously always rejected); clicking it round-trips restore-auto-save.
await trial('Board · safe-point round-trip', '/board', async (p) => {
	await click(p, /edit layout/i);
	await p.waitForTimeout(500);
	await click(p, /restore safe point/i);
});

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(28)} ${r.detail}`);
const pass = results.filter((r) => r.ok).length;
console.log(
	`\n${pass === results.length ? '✓' : '✗'} ${pass}/${results.length} UI-driven dispatch checks passed`,
);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
