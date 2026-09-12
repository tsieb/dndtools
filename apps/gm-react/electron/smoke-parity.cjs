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
const verify = process.argv.includes('verify');
process.argv.push('lamplight://join/smoke-token');
require('./main.cjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
		assert.equal(
			await win.webContents.executeJavaScript('window.lamplightDesktop.setLiveSession(true)'),
			true,
		);
		assert.equal(
			await win.webContents.executeJavaScript('window.lamplightDesktop.setLiveSession(false)'),
			true,
		);
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
