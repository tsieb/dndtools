// Pure policy helpers for the Electron desktop smoke. Kept separate from the Electron entrypoint so
// the preload-channel classification can be regression-tested under ordinary Node/Vitest.
'use strict';

// These are the only privileged calls the renderer needs merely to boot. Everything else exposed by
// the primary preload is a tripwire in the smoke: exercising it without an explicit UI action means
// startup unexpectedly advertised a table, touched durable secrets, or widened network access.
const STARTUP_REQUIRED_IPC = Object.freeze({
	'secure-store:available': false,
	'window:set-theme': true,
});

/** Extract every literal ipcRenderer.invoke channel, rejecting dynamic channels fail-closed. */
function extractInvokeChannels(preloadSource) {
	const invocationCount = [...preloadSource.matchAll(/ipcRenderer\.invoke\s*\(/g)].length;
	const literalChannels = [
		...preloadSource.matchAll(/ipcRenderer\.invoke\s*\(\s*['"]([^'"]+)['"]/g),
	].map((match) => match[1]);
	if (literalChannels.length !== invocationCount) {
		throw new Error(
			'desktop smoke requires every ipcRenderer.invoke channel to be a string literal',
		);
	}
	return [...new Set(literalChannels)];
}

/**
 * Classify the complete primary-preload IPC surface. New literal channels automatically become
 * tripwires; removing a startup-required channel is an error because the smoke policy is stale.
 */
function buildSmokeIpcPolicy(preloadSource) {
	const channels = extractInvokeChannels(preloadSource);
	for (const channel of Object.keys(STARTUP_REQUIRED_IPC)) {
		if (!channels.includes(channel)) {
			throw new Error(`startup-required IPC channel is absent from preload: ${channel}`);
		}
	}
	return channels.map((channel) => ({
		channel,
		startupRequired: Object.hasOwn(STARTUP_REQUIRED_IPC, channel),
		response: STARTUP_REQUIRED_IPC[channel],
	}));
}

/** Derive the process result shared by both write and verify passes. */
function evaluateSmokeOutcome({ consoleErrors, unexpectedPrivilegedCalls }) {
	if (unexpectedPrivilegedCalls.length > 0) {
		return {
			ok: false,
			error: `unexpected privileged IPC during smoke: ${unexpectedPrivilegedCalls.join(', ')}`,
		};
	}
	if (consoleErrors.length > 0) {
		return { ok: false, error: 'renderer emitted console errors' };
	}
	return { ok: true };
}

module.exports = {
	STARTUP_REQUIRED_IPC,
	extractInvokeChannels,
	buildSmokeIpcPolicy,
	evaluateSmokeOutcome,
};
