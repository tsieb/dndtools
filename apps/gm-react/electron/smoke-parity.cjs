// Real production main/preload smoke. Run write then verify with the same SMOKE_USER_DATA.
'use strict';
const assert = require('node:assert/strict');
const { app, BrowserWindow, Menu, ipcMain, dialog, screen } = require('electron');
const { joinHash, readWindowState } = require('./parity.cjs');
const path = require('node:path');
const fs = require('node:fs');
if (!process.env.SMOKE_USER_DATA) throw new Error('SMOKE_USER_DATA must name a disposable profile');
app.setPath('userData', process.env.SMOKE_USER_DATA);
const handlers = new Map();
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => {
	handlers.set(channel, handler);
	handle(channel, handler);
};
// Observe attempted registration without touching the host's protocol associations.
const protocolClaims = [];
app.setAsDefaultProtocolClient = (...args) => {
	protocolClaims.push(args);
	return true;
};
const verify = process.argv.includes('verify');
process.argv.push('lamplight://join/smoke-token');
const shell = require('./main.cjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Click a real control by its accessible name, the way a DM would. Matches an exact aria-label or
 * button text and refuses soft-disabled buttons (ProjectionControl uses `aria-disabled`, not
 * `disabled`, so its reason stays reachable), so a control that went dead cannot pass as a click.
 */
function clickControl(win, name) {
	return win.webContents.executeJavaScript(`(() => {
		const wanted = ${JSON.stringify(name)};
		const button = [...document.querySelectorAll('button')].find((candidate) => {
			const label = (candidate.getAttribute('aria-label') ?? candidate.textContent ?? '').trim();
			return (
				(label === wanted || label.startsWith(wanted + ' — ')) &&
				candidate.getAttribute('aria-disabled') !== 'true' &&
				!candidate.disabled
			);
		});
		if (!button) return false;
		button.click();
		return true;
	})()`);
}
async function until(check) {
	for (let i = 0; i < 200; i++) {
		if (await check()) return;
		await delay(100);
	}
	throw new Error('Timed out waiting for production shell');
}
const timeout = setTimeout(() => {
	console.error('PARITY_SMOKE timeout');
	app.exit(1);
}, 45000);
app.whenReady().then(async () => {
	try {
		// The OS can only hand `lamplight://` to the app if the PACKAGED bundle declares the scheme;
		// `setAsDefaultProtocolClient` claims a declaration, it cannot create one. Assert both halves
		// of that declaration, because nothing else in CI can: a genuine OS handoff needs an installed
		// package and a real desktop session, so a missing line here would otherwise only surface as a
		// dead invite link in a tester's hands.
		const builder = fs.readFileSync(path.join(__dirname, '..', 'electron-builder.yml'), 'utf8');
		assert.match(builder, /^protocols:\n\s+- name: .+\n\s+schemes:\n\s+- lamplight$/m);
		assert.match(builder, /^\s+MimeType: x-scheme-handler\/lamplight;$/m);
		// ...and that an unpackaged tree does NOT claim the scheme. A checkout moves or disappears;
		// pointing a developer's mime database at this one would break invites for the installed app.
		assert.equal(app.isPackaged, false);
		assert.deepEqual(protocolClaims, []);

		await until(() =>
			BrowserWindow.getAllWindows().some((win) =>
				win.webContents.getURL().includes('#/join?token=smoke-token'),
			),
		);
		const win = BrowserWindow.getAllWindows()[0];
		const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
		await until(() => Menu.getApplicationMenu()?.getMenuItemById('global.palette'));
		assert.equal(joinHash('lamplight://join/abc_123'), '#/join?token=abc_123');
		for (const bad of [
			'https://join/abc',
			'lamplight://join/a/b',
			'lamplight://join/a?x=1',
			'lamplight://join/%2f',
			'lamplight://join/a#b',
		])
			assert.equal(joinHash(bad), null);
		assert.equal(await handlers.get('desktop:live')({ sender: {}, senderFrame: {} }, true), false);
		assert.equal(await handlers.get('desktop:menu')(event, [{ id: 'evil' }]), false);
		assert.equal(await handlers.get('desktop:live')(event, 'yes'), false);
		assert.equal(shell.isLiveSessionBadgeShown(), false);
		assert.equal(
			await win.webContents.executeJavaScript('window.lamplightDesktop.setLiveSession(true)'),
			true,
		);
		assert.equal(shell.isLiveSessionBadgeShown(), true);
		assert.equal(
			await win.webContents.executeJavaScript('window.lamplightDesktop.setLiveSession(false)'),
			true,
		);
		assert.equal(shell.isLiveSessionBadgeShown(), false);
		app.emit('open-url', { preventDefault() {} }, 'lamplight://join/warm-token');
		await until(() => win.webContents.getURL().includes('token=warm-token'));
		app.emit('second-instance', {}, ['lamplight://join/second-token']);
		await until(() => win.webContents.getURL().includes('token=second-token'));
		app.emit('open-url', { preventDefault() {} }, 'lamplight://join/invalid/path');
		await delay(100);
		assert.ok(win.webContents.getURL().includes('token=second-token'));
		await win.webContents.executeJavaScript("location.hash = '#/'");
		await until(() =>
			win.webContents.executeJavaScript("document.body.innerText.includes('Command Center')"),
		);
		win.show();
		win.focus();
		await delay(200);
		// The badge has to follow the app's OWN session lifecycle, not a test-only IPC call — so drive
		// the production Go live control in the real renderer and watch the OS chrome follow it. This
		// is the end-to-end proof that `session.workflow` reaches the dock badge / tray icon.
		assert.equal(shell.isLiveSessionBadgeShown(), false);
		await until(() => clickControl(win, 'Go live'));
		await until(() => shell.isLiveSessionBadgeShown() === true);
		await until(() => clickControl(win, 'End live session'));
		await until(() =>
			win.webContents.executeJavaScript('!!document.querySelector(\'[aria-modal="true"]\')'),
		);
		await until(() => clickControl(win, 'End session'));
		await until(() => shell.isLiveSessionBadgeShown() === false);
		Menu.getApplicationMenu().getMenuItemById('global.palette').click();
		await until(() =>
			win.webContents.executeJavaScript('!!document.querySelector(\'[aria-modal="true"]\')'),
		);
		// Exercise AUD-2.4 through its production handler and real child preload.
		dialog.showMessageBox = async () => ({ response: 0 });
		assert.equal(await handlers.get('scene-display:open')(event), true);
		const child = BrowserWindow.getAllWindows().find((candidate) => candidate !== win);
		assert.ok(child);
		assert.equal(child.isKiosk(), true);
		assert.equal(
			await child.webContents.executeJavaScript('typeof window.lamplightDesktop'),
			'undefined',
		);
		assert.equal(
			await handlers.get('desktop:live')(
				{ sender: child.webContents, senderFrame: child.webContents.mainFrame },
				true,
			),
			false,
		);
		child.webContents.emit(
			'before-input-event',
			{ preventDefault() {} },
			{ type: 'keyDown', key: 'Escape' },
		);
		assert.equal(child.isDestroyed(), true);
		const file = path.join(app.getPath('userData'), 'window-state.json');
		if (verify) {
			assert.equal(win.getNormalBounds().width, 900);
			assert.equal(win.getNormalBounds().height, 600);
		}
		win.setBounds({
			x: screen.getPrimaryDisplay().workArea.x,
			y: screen.getPrimaryDisplay().workArea.y,
			width: 900,
			height: 600,
		});
		// Prevent app quit until persistence assertions finish.
		app.removeAllListeners('window-all-closed');
		win.close();
		assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).width, 900);
		assert.deepEqual(
			readWindowState(file, [{ workArea: { x: 10000, y: 10000, width: 1000, height: 800 } }]),
			{},
		);
		assert.deepEqual(protocolClaims, []);
		clearTimeout(timeout);
		console.log(
			'PARITY_SMOKE_RESULT ' +
				JSON.stringify({
					ok: true,
					mode: verify ? 'verify' : 'write',
					checks: [
						'registry menu action',
						'join cold/warm/second-instance',
						'invalid links',
						'IPC isolation',
						'live badge transitions',
						'Go live drives the OS badge',
						'packaged protocol declaration',
						'projector Escape',
						'window persistence',
					],
				}),
		);
		app.exit(0);
	} catch (error) {
		console.error(error);
		app.exit(1);
	}
});
