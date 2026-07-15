// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'dndtools';
const APP_HOST = 'app';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

/** Register before app.ready so Chromium gives the packaged app a normal, persistent origin. */
function registerAppScheme(protocol) {
	protocol.registerSchemesAsPrivileged([
		{
			scheme: APP_SCHEME,
			privileges: {
				standard: true,
				secure: true,
				supportFetchAPI: true,
				corsEnabled: true,
				stream: true,
				codeCache: true,
			},
		},
	]);
}

/**
 * Resolve a custom-scheme URL into the renderer bundle without ever escaping its root. This helper is
 * intentionally independent of Electron so the path boundary can be regression-tested in plain Node.
 */
function resolveAppAssetPath(requestUrl, rendererRoot) {
	let url;
	try {
		url = new URL(requestUrl);
	} catch {
		return null;
	}
	if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST || url.username || url.password)
		return null;

	let pathname;
	try {
		pathname = decodeURIComponent(url.pathname);
	} catch {
		return null;
	}
	if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\'))
		return null;
	const segments = pathname.split('/').slice(1);
	if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0')))
		return null;
	if (segments.length === 1 && segments[0] === '') segments[0] = 'index.html';

	const root = path.resolve(rendererRoot);
	const candidate = path.resolve(root, ...segments);
	const relative = path.relative(root, candidate);
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	)
		return null;
	return candidate;
}

function errorResponse(status, message, extraHeaders = {}) {
	return new Response(message, {
		status,
		headers: {
			'cache-control': 'no-store',
			'content-type': 'text/plain; charset=utf-8',
			'x-content-type-options': 'nosniff',
			...extraHeaders,
		},
	});
}

function createAppProtocolHandler(rendererRoot, fetchFile) {
	return (request) => {
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return errorResponse(405, 'Method not allowed', { allow: 'GET, HEAD' });
		}
		const file = resolveAppAssetPath(request.url, rendererRoot);
		if (!file) return errorResponse(404, 'Not found');
		try {
			if (!fs.statSync(file).isFile()) return errorResponse(404, 'Not found');
		} catch {
			return errorResponse(404, 'Not found');
		}
		return fetchFile(pathToFileURL(file).toString(), { method: request.method });
	};
}

/** Install the handler after app.ready on the same session used by the BrowserWindows. */
function installAppProtocol(protocol, net, rendererRoot) {
	protocol.handle(
		APP_SCHEME,
		createAppProtocolHandler(rendererRoot, (url, options) => net.fetch(url, options)),
	);
}

module.exports = {
	APP_SCHEME,
	APP_HOST,
	APP_ORIGIN,
	APP_ENTRY_URL,
	registerAppScheme,
	resolveAppAssetPath,
	createAppProtocolHandler,
	installAppProtocol,
};
