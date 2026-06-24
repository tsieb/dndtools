// UI-driven acceptance gate: for each newly-wired screen, click a REAL button (no window.__rt
// dispatch shortcut) and assert the core op-log (window.__rt.state.sync.operations) grew — proving
// the UI fired a real dispatch, not a no-op. This is the bar the FEATURE-GAPS audit demanded:
// "click → core state changed", not just typecheck-green. Needs `pnpm dev` running.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../gm/package.json'));
const { chromium } = require('playwright');
const BASE = process.env.REACT_URL ?? 'http://localhost:5273';

const browser = await chromium.launch();
const results = [];
const ops = (page) => page.evaluate(() => window.__rt?.state?.sync?.operations?.length ?? -1);
const ready = (page) => page.waitForFunction(() => window.__rt && window.__rt.loaded === true, null, { timeout: 15000 });

async function trial(name, route, interact) {
	const page = await browser.newPage();
	const errs = [];
	page.on('pageerror', (e) => errs.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
	try {
		await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
		await ready(page);
		await page.waitForTimeout(400);
		const before = await ops(page);
		await interact(page);
		await page.waitForTimeout(800);
		const after = await ops(page);
		results.push({ name, ok: after > before && errs.length === 0, detail: `ops ${before}→${after}${errs.length ? ' ERR:' + errs[0] : ''}` });
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
		results.push({ name: 'Seed · 3 PCs via draft flow', ok, detail: `${pcs.length} pcs, hp=[${pcs.map((c) => c.hp).join(',')}]` });
	} catch (e) {
		results.push({ name: 'Seed · 3 PCs via draft flow', ok: false, detail: `EX: ${e.message}` });
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
// Characters — New character → dialog → fill name → Create → character.quick-create
await trial('Characters · New character', '/characters', async (p) => {
	await click(p, /new character/i);
	await p.waitForTimeout(300);
	await fillFirst(p, 'UI Gate Hero');
	await click(p, /create|add|save/i);
});
// Atlas — New map → form → fill name → Create → map.create
await trial('Atlas · New map', '/atlas', async (p) => {
	await click(p, /new map/i);
	await p.waitForTimeout(300);
	await fillFirst(p, 'UI Gate Map');
	await click(p, /create|add|save/i);
});
// Session — Go live → session.set-workflow on one click
await trial('Session · Go live', '/session', async (p) => { await click(p, /go live|start session/i); });
// Board — Edit layout captures a safe point (command-center.snapshot-auto-save), which reveals the
// "Restore safe point" button (previously always rejected); clicking it round-trips restore-auto-save.
await trial('Board · safe-point round-trip', '/board', async (p) => {
	await click(p, /edit layout/i);
	await p.waitForTimeout(500);
	await click(p, /restore safe point/i);
});

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(28)} ${r.detail}`);
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass === results.length ? '✓' : '✗'} ${pass}/${results.length} UI-driven dispatch checks passed`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
