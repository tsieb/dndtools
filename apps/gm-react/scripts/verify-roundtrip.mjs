// Foundation gate (Task #5): drive the REAL React prototype in a headless browser and prove the
// load → dispatch → persistFullState → reload round-trip end-to-end against real IndexedDB. Also
// proves (a) the op-log idempotencyKey Set survives the round-trip as a real Set rebuilt from stored
// ops, and (b) preview mode rejects every mutation read-only. Run against `vite dev` (so the DEV-only
// `window.__rt` seam is present). Exits non-zero on any failed assertion.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const gmPkg = path.resolve(here, '../package.json');
const require = createRequire(gmPkg);
const { chromium } = require('playwright');

const URL = process.env.REACT_URL ?? 'http://localhost:5273/';
const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok: !!ok, detail });
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
// Skip the first-run onboarding overlay (it would cover the surfaces this gate drives).
await page.addInitScript(() => {
	try {
		window.localStorage.setItem('dndtools:react:onboarded', 'gate');
	} catch {}
});
page.on('console', (m) => {
	if (m.type() === 'error') console.log('  [page error]', m.text());
});
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

try {
	// Clean slate: drop the IndexedDB so the run is deterministic.
	await page.goto(URL, { waitUntil: 'domcontentloaded' });
	await page.evaluate(
		() => new Promise((res) => {
			const req = indexedDB.deleteDatabase('dndtools-v2');
			req.onsuccess = req.onerror = req.onblocked = () => res(true);
		}),
	);
	await page.reload({ waitUntil: 'domcontentloaded' });

	const waitForRuntime = () =>
		page.waitForFunction(() => window.__rt && window.__rt.loaded === true, null, { timeout: 15000 });
	await waitForRuntime();
	check('app boots and Core loads', true);

	// Command Center renders (the hero is present).
	const heroText = await page.textContent('body');
	check('Command Center hero renders', /Command Center|Your campaign|Session live/.test(heroText));

	// --- Round-trip: create a scene through the real UI form. ---
	const SCENE_NAME = `Crypt ${Date.now()}`;
	await page.goto(`${URL}#/scenes`, { waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	await page.fill('#scene-name', SCENE_NAME);
	await page.click('button[type="submit"]');
	await page.waitForFunction(
		(name) =>
			Object.values(window.__rt.state.scenes.scenes).some((s) => s?.name === name),
		SCENE_NAME,
		{ timeout: 10000 },
	);
	check('scene.create dispatched + applied to Core state', true, SCENE_NAME);

	// Reload the actual tab — the scene must come back from IndexedDB.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	const persisted = await page.evaluate(
		(name) => Object.values(window.__rt.state.scenes.scenes).some((s) => s?.name === name),
		SCENE_NAME,
	);
	check('scene SURVIVES reload (persistFullState round-trip)', persisted, SCENE_NAME);

	// And it's visible in the rendered scenes list after reload.
	await page.goto(`${URL}#/scenes`, { waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	const inDom = (await page.textContent('body')).includes(SCENE_NAME);
	check('persisted scene renders in the DOM after reload', inDom);

	// --- A second command type through the full path + op-log persistence across the round-trip. ---
	// The op-log's idempotencyKey Set is REBUILT from individually-stored operation records on load
	// (coreStore: createOperationLog(records)), never serialized as a Set — so the "flattened to {}"
	// risk is caught by asserting it is a real `Set` after a reload, and the ops themselves persist.
	const rollResult = await page.evaluate(async () => {
		const rt = window.__rt;
		// dice.roll requires an active Session workflow, which itself requires an active scene.
		const sceneId = Object.keys(rt.state.scenes.scenes)[0];
		const wf = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		const res = await rt.dispatch({
			type: 'dice.roll',
			actorId: rt.defaultActorId,
			payload: { expression: '1d20', visibility: 'session-visible' },
		});
		return {
			status: res.status,
			message: res.rejection?.message ?? wf.rejection?.message ?? '',
			ops: rt.state.sync.operations.length,
		};
	});
	check('second command type (dice.roll) accepted through dispatch+persist', rollResult.status === 'accepted', rollResult.message || `${rollResult.ops} ops`);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	const opLog = await page.evaluate(() => {
		const log = window.__rt.state.sync;
		return { isSet: log.idempotencyKeys instanceof Set, ops: log.operations.length };
	});
	check('sync.idempotencyKeys is a real Set after reload (not flattened to {})', opLog.isSet);
	check('op-log operations persisted + rebuilt across reload', opLog.ops > 0 && opLog.ops >= rollResult.ops, `${opLog.ops} ops`);

	// --- Preview read-only: every mutation is rejected before reaching the Core. ---
	const preview = await page.evaluate(async () => {
		const rt = window.__rt;
		const before = Object.keys(rt.state.scenes.scenes).length;
		rt.enterPreview({ role: 'player' });
		const res = await rt.dispatch({
			type: 'scene.create',
			actorId: rt.defaultActorId,
			payload: { name: 'Should Not Persist', visibility: 'dm-only' },
		});
		const after = Object.keys(rt.state.scenes.scenes).length;
		rt.exitPreview();
		return { status: res.status, message: res.rejection?.message ?? '', before, after };
	});
	check('preview mode REJECTS a mutation', preview.status === 'rejected', preview.message);
	check('preview rejection did not change scene count', preview.before === preview.after, `${preview.before} → ${preview.after}`);

	// Confirm preview did not persist anything: reload and ensure the rejected scene is absent.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	const ghost = await page.evaluate(() =>
		Object.values(window.__rt.state.scenes.scenes).some((s) => s?.name === 'Should Not Persist'),
	);
	check('rejected preview mutation never persisted', !ghost);
} catch (err) {
	check('verification script completed without throwing', false, String(err?.stack ?? err));
} finally {
	await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
	console.error('FAILED:', failed.map((r) => r.name).join('; '));
	process.exit(1);
}
console.log('Foundation round-trip gate: PASS');
