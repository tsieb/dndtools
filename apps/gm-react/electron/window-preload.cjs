// @ts-check
'use strict';

// Least-privilege preload for secondary scene-display windows. It marks the renderer as Electron
// through the same narrow theme bridge used by the primary window, but intentionally exposes no
// discovery, secret-store, or network-policy capability.

const { contextBridge, ipcRenderer } = require('electron');

// Non-capability marker: main.tsx uses this to mount the projector-only receiver instead of the
// vault/auth/session provider tree. Only secondary display windows load this preload.
contextBridge.exposeInMainWorld('dndtoolsSceneDisplay', true);

contextBridge.exposeInMainWorld('dndtoolsWindow', {
	setTheme: (themeName) => {
		if (!['tavern', 'parchment', 'high-contrast'].includes(themeName))
			return Promise.resolve(false);
		return ipcRenderer.invoke('window:set-theme', themeName);
	},
});
