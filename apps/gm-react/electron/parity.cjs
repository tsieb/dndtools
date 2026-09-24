'use strict';
const fs = require('node:fs');

function joinHash(value) {
	if (typeof value !== 'string' || value.length > 2048) return null;
	// Accept a single opaque URL-safe invite token, never a destination URL.
	const match = /^lamplight:\/\/join\/([A-Za-z0-9_-]{1,1024})$/.exec(value);
	return match ? `#/join?token=${match[1]}` : null;
}

function readWindowState(file, displays) {
	try {
		const state = JSON.parse(fs.readFileSync(file, 'utf8'));
		const { x, y, width, height } = state;
		if (![x, y, width, height].every(Number.isSafeInteger)) return {};
		if (width < 720 || height < 520 || width > 16384 || height > 16384) return {};
		// Keep the entire saved window in an available work area; disconnected monitors reset it.
		if (
			!displays.some(
				({ workArea: a }) =>
					x >= a.x && y >= a.y && x + width <= a.x + a.width && y + height <= a.y + a.height,
			)
		)
			return {};
		return { x, y, width, height, maximized: state.maximized === true };
	} catch {
		return {};
	}
}

function persistWindow(win, file) {
	win.on('close', () => {
		try {
			fs.writeFileSync(
				`${file}.tmp`,
				JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }),
			);
			fs.renameSync(`${file}.tmp`, file);
		} catch (error) {
			console.warn('Could not save window state:', error.message);
		}
	});
}

function installMenu(Menu, entries, invoke) {
	const shortcuts = entries.map((entry) => ({
		id: entry.id,
		label: entry.label,
		accelerator: entry.accelerator,
		// Let renderer keydown handlers retain their typing/modal guards and avoid double dispatch.
		acceleratorWorksWhenHidden: false,
		registerAccelerator: false,
		click: () => invoke(entry.id),
	}));
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			...(process.platform === 'darwin'
				? [{ role: 'appMenu' }]
				: [{ label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] }]),
			{ role: 'editMenu' },
			{
				label: 'View',
				submenu: [
					{ role: 'resetZoom' },
					{ role: 'zoomIn' },
					{ role: 'zoomOut' },
					{ type: 'separator' },
					{ role: 'togglefullscreen' },
				],
			},
			{ label: 'Session', submenu: shortcuts },
			{ role: 'windowMenu' },
		]),
	);
}

module.exports = { joinHash, readWindowState, persistWindow, installMenu };
