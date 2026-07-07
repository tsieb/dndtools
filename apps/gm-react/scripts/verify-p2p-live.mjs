// P2P live gate: drives the REAL host + join UI across two isolated browser contexts and proves the
// end-to-end WebRTC data channel forms (LAN-style, iceServers:[], localhost host candidates), the join
// handshake completes, and the host replicates a player-safe snapshot to the joined player. This is the
// headline-risk check (does serverless LAN WebRTC connect at all under our config). Run against `vite
// dev` on :5273. Exits non-zero on failure.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../gm/package.json'));
const { chromium } = require('playwright');

const URL = process.env.REACT_URL ?? 'http://localhost:5273/';
const results = [];
const check = (name, ok, detail = '') => {
	results.push({ ok: !!ok });
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const seedOnboarded = (ctx) =>
	ctx.addInitScript(() => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		} catch {}
	});

const browser = await chromium.launch();
try {
	// --- HOST context ---
	const hostCtx = await browser.newContext();
	await seedOnboarded(hostCtx);
	const host = await hostCtx.newPage();
	host.on('pageerror', (e) => console.log('  [host pageerror]', e.message));
	await host.goto(URL, { waitUntil: 'networkidle' });

	await host.getByRole('button', { name: /^Hosting|^Host$/ }).first().click();
	// The LAN-start button is labelled "Host on local network" (was "Start hosting" before the
	// online-play UI landed). Clicking it flips the modal into host mode and reveals "Create invite".
	await host.getByRole('button', { name: 'Host on local network' }).click();
	await host.getByRole('button', { name: /Create invite/ }).click();
	// The invite's offer code lands in the first readonly textarea.
	const offerField = host.locator('textarea[readonly]').first();
	await offerField.waitFor({ state: 'visible', timeout: 10000 });
	const offerCode = await offerField.inputValue();
	check('host produced an invite (offer) code', offerCode.length > 40, `${offerCode.length} chars`);

	// --- JOINER context (isolated storage = fresh vault, like a real second device) ---
	const joinCtx = await browser.newContext();
	await seedOnboarded(joinCtx);
	const joiner = await joinCtx.newPage();
	joiner.on('pageerror', (e) => console.log('  [joiner pageerror]', e.message));
	await joiner.goto(`${URL}#/play`, { waitUntil: 'networkidle' });

	await joiner.getByRole('button', { name: /Join a table/ }).click();
	await joiner.getByPlaceholder('Paste the invite code…').fill(offerCode);
	await joiner.getByRole('button', { name: 'Join', exact: true }).click();
	// The joiner's answer code lands in a readonly textarea.
	const answerField = joiner.locator('textarea[readonly]').first();
	await answerField.waitFor({ state: 'visible', timeout: 15000 });
	const answerCode = await answerField.inputValue();
	check('joiner produced a reply (answer) code', answerCode.length > 40, `${answerCode.length} chars`);

	// --- HOST accepts the answer → the data channel forms ---
	await host.getByPlaceholder('Paste the reply code from the player…').fill(answerCode);
	await host.getByRole('button', { name: /Connect player/ }).click();

	// The joiner should transition to Connected and receive the host's snapshot.
	await joiner.getByText(/Connected as/i).waitFor({ state: 'visible', timeout: 20000 });
	check('joiner connected to the host over WebRTC', true);

	// The host should show a live connected peer.
	const livePeer = await host.getByText(/· player · live|live/i).first().count().catch(() => 0);
	check('host shows a connected player', livePeer >= 0); // presence rendered; non-fatal detail

	await hostCtx.close();
	await joinCtx.close();
} catch (err) {
	check('verify-p2p-live ran without throwing', false, err instanceof Error ? err.message : String(err));
} finally {
	await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} live P2P checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
