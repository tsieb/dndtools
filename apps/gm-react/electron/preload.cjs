// @ts-check
'use strict';

// Preload bridge for the DND Tools GM desktop shell.
//
// Exposes ONLY the LAN session-discovery surface (Epic 7.3 mDNS auto-discovery) behind the context
// bridge — the renderer exchanges opaque, already-encrypted offer/answer codes; it never touches sockets
// or Node APIs. Everything else about the renderer stays a self-contained offline web app. On the web
// build (or a packaged app without the discovery module) `window.dndtoolsDiscovery` is simply absent and
// the app degrades to the manual code flow.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dndtoolsDiscovery', {
	available: () => ipcRenderer.invoke('discovery:available'),
	advertise: (sessionId, name) => ipcRenderer.invoke('discovery:advertise', { sessionId, name }),
	stopAdvertise: () => ipcRenderer.invoke('discovery:stopAdvertise'),
	browseStart: () => ipcRenderer.invoke('discovery:browse-start'),
	browseStop: () => ipcRenderer.invoke('discovery:browse-stop'),
	connect: (service) => ipcRenderer.invoke('discovery:connect', { service }),

	// Host side: a joiner needs an offer code; respond with `respondOffer(reqId, offerCode)`.
	onOfferRequest: (cb) => {
		const h = (_e, data) => cb(data.reqId);
		ipcRenderer.on('discovery:offer-request', h);
		return () => ipcRenderer.removeListener('discovery:offer-request', h);
	},
	respondOffer: (reqId, offerCode) => ipcRenderer.invoke('discovery:offer-response', { reqId, offerCode }),
	onAnswer: (cb) => {
		const h = (_e, data) => cb(data.answerCode);
		ipcRenderer.on('discovery:answer', h);
		return () => ipcRenderer.removeListener('discovery:answer', h);
	},

	// Joiner side: an offer arrived; respond with `respondAnswer(reqId, answerCode)`.
	onOffer: (cb) => {
		const h = (_e, data) => cb(data.reqId, data.offerCode);
		ipcRenderer.on('discovery:offer', h);
		return () => ipcRenderer.removeListener('discovery:offer', h);
	},
	respondAnswer: (reqId, answerCode) => ipcRenderer.invoke('discovery:answer-response', { reqId, answerCode }),

	// Joiner side: the discovered-services roster.
	onServices: (cb) => {
		const h = (_e, data) => cb(data);
		ipcRenderer.on('discovery:services', h);
		return () => ipcRenderer.removeListener('discovery:services', h);
	},
});

// OS-encrypted secret store for cloud auth tokens (SEC-004). Absent on the web build, where the app
// keeps tokens in memory only. All async; `available()` reflects whether OS encryption is usable.
contextBridge.exposeInMainWorld('dndtoolsSecureStore', {
	available: () => ipcRenderer.invoke('secure-store:available'),
	get: (key) => ipcRenderer.invoke('secure-store:get', { key }),
	set: (key, value) => ipcRenderer.invoke('secure-store:set', { key, value }),
	remove: (key) => ipcRenderer.invoke('secure-store:remove', { key }),
	keys: () => ipcRenderer.invoke('secure-store:keys'),
});
