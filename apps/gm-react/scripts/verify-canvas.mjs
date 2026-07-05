// Wave-3 verification: the canvas surfaces (/board, /scene/:id) wired to the real Processing Core,
// plus the advisor-flagged wave-2 mutation round-trip (Knowledge content.create-item). Drives the
// real React app in a headless browser against real IndexedDB. Exits non-zero on any failure.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../gm/package.json'));
const { chromium } = require('playwright');

const URL = process.env.REACT_URL ?? 'http://localhost:5273/';
const results = [];
const check = (name, ok, detail = '') => {
	results.push({ name, ok: !!ok, detail });
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
// Skip the first-run onboarding overlay (it would cover the canvas this gate drives).
await page.addInitScript(() => {
	try {
		window.localStorage.setItem('dndtools:react:onboarded', 'gate');
	} catch {}
});
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
const waitForRuntime = () =>
	page.waitForFunction(() => window.__rt && window.__rt.loaded === true, null, { timeout: 15000 });

try {
	// clean slate
	await page.goto(URL, { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => new Promise((res) => {
		const r = indexedDB.deleteDatabase('dndtools-v2');
		r.onsuccess = r.onerror = r.onblocked = () => res(true);
	}));

	// ---- /board: ensure-home materializes the home scene with seeded system widgets ----
	errors.length = 0;
	await page.goto(`${URL}board`, { waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	// ensure-home is dispatched in an effect; wait for the home scene id + its widgets.
	await page.waitForFunction(() => {
		const rt = window.__rt;
		const id = rt.state.commandCenter.homeSceneId;
		return id && rt.state.scenes.scenes[id] && rt.state.scenes.scenes[id].widgets.length > 0;
	}, null, { timeout: 10000 }).catch(() => {});
	const board = await page.evaluate(() => {
		const rt = window.__rt;
		const id = rt.state.commandCenter.homeSceneId;
		const scene = id ? rt.state.scenes.scenes[id] : null;
		return { id, count: scene ? scene.widgets.length : 0 };
	});
	check('/board materializes the home scene (command-center.ensure-home)', !!board.id, board.id || 'no homeSceneId');
	check('/board home scene has seeded system widgets', board.count > 0, `${board.count} widgets`);
	await page.waitForTimeout(300);
	await page.screenshot({ path: '/tmp/wave3-board.png', fullPage: true });
	check('/board renders without page errors', errors.filter((e) => !e.includes('favicon')).length === 0, errors.join(' | '));

	// ---- /board: move a widget through scene.move-widget; survives reload ----
	const moved = await page.evaluate(async () => {
		const rt = window.__rt;
		const id = rt.state.commandCenter.homeSceneId;
		const w = rt.state.scenes.scenes[id].widgets[0];
		const targetX = w.layout.x + 120, targetY = w.layout.y + 60;
		const res = await rt.dispatch({
			type: 'scene.move-widget',
			actorId: rt.defaultActorId,
			payload: { sceneId: id, widgetInstanceId: w.id, x: targetX, y: targetY },
		});
		return { status: res.status, wid: w.id, targetX, targetY, message: res.rejection?.message ?? '' };
	});
	check('/board scene.move-widget accepted', moved.status === 'accepted', moved.message);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	const movePersisted = await page.evaluate((m) => {
		const rt = window.__rt;
		const id = rt.state.commandCenter.homeSceneId;
		const w = rt.state.scenes.scenes[id].widgets.find((x) => x.id === m.wid);
		return w ? { x: w.layout.x, y: w.layout.y } : null;
	}, moved);
	check('moved widget position SURVIVES reload', movePersisted && movePersisted.x === moved.targetX && movePersisted.y === moved.targetY,
		movePersisted ? `${movePersisted.x},${movePersisted.y}` : 'gone');

	// ---- /scene/:id: create a scene, add a widget through scene.add-widget ----
	const sceneId = await page.evaluate(async () => {
		const rt = window.__rt;
		const res = await rt.dispatch({
			type: 'scene.create',
			actorId: rt.defaultActorId,
			payload: { name: 'Canvas Test Scene', description: '', visibility: 'dm-only', tags: [] },
		});
		const evt = res.events?.find((e) => e.sceneId) ?? res.events?.[0];
		return evt?.sceneId ?? Object.keys(rt.state.scenes.scenes).find((k) => rt.state.scenes.scenes[k].name === 'Canvas Test Scene');
	});
	check('scene.create returned a scene id for the editor', !!sceneId, sceneId || 'none');
	errors.length = 0;
	await page.goto(`${URL}scene/${sceneId}`, { waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	await page.waitForTimeout(300);
	const editorText = (await page.textContent('body')) ?? '';
	check('/scene/:id editor renders the scene name', editorText.includes('Canvas Test Scene'), `${editorText.length} chars`);
	check('/scene/:id renders without page errors', errors.filter((e) => !e.includes('favicon')).length === 0, errors.join(' | '));

	const added = await page.evaluate(async (sid) => {
		const rt = window.__rt;
		const res = await rt.dispatch({
			type: 'scene.add-widget',
			actorId: rt.defaultActorId,
			payload: {
				sceneId: sid,
				widget: { type: 'note', version: '1.0.0', layout: { x: 48, y: 48, w: 240, h: 160 }, configuration: { visibility: 'dm-only' }, binding: null },
			},
		});
		return { status: res.status, count: rt.state.scenes.scenes[sid].widgets.length, message: res.rejection?.message ?? '' };
	}, sceneId);
	check('/scene/:id scene.add-widget accepted', added.status === 'accepted', added.message || `${added.count} widgets`);
	await page.waitForTimeout(300);
	const widgetInDom = await page.evaluate((sid) => {
		const rt = window.__rt;
		const w = rt.state.scenes.scenes[sid].widgets[0];
		return !!document.querySelector(`[data-testid="widget-${w.id}"]`);
	}, sceneId);
	check('added widget renders on the canvas (data-testid)', widgetInDom);
	await page.screenshot({ path: '/tmp/wave3-scene.png', fullPage: true });

	// add-widget survives reload
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	const addPersisted = await page.evaluate((sid) => window.__rt.state.scenes.scenes[sid]?.widgets.length ?? 0, sceneId);
	check('added widget SURVIVES reload', addPersisted >= 1, `${addPersisted} widgets`);

	// ---- wave-2 gap: Knowledge content.create-item round-trips (advisor flag) ----
	const NOTE = `Lore ${Date.now()}`;
	const note = await page.evaluate(async (title) => {
		const rt = window.__rt;
		const res = await rt.dispatch({
			type: 'content.create-item',
			actorId: rt.defaultActorId,
			payload: { kind: 'note', title, body: '', visibility: 'dm-only' },
		});
		return { status: res.status, message: res.rejection?.message ?? '' };
	}, NOTE);
	check('Knowledge content.create-item accepted', note.status === 'accepted', note.message);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForRuntime();
	const notePersisted = await page.evaluate((title) =>
		Object.values(window.__rt.state.content.items).some((i) => i?.title === title), NOTE);
	check('created note SURVIVES reload (content round-trip)', notePersisted, NOTE);
} catch (err) {
	check('verification completed without throwing', false, String(err?.stack ?? err));
} finally {
	await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) { console.error('FAILED:', failed.map((r) => r.name).join('; ')); process.exit(1); }
console.log('Canvas + wave-2 round-trip gate: PASS');
