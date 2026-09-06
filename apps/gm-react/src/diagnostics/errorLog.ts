import type { ErrorTaxonomyCategory, RawErrorRecord } from '@dndtools/core';

/**
 * RC-ENG-6.1 — in-app error taxonomy collection. A small, capped, IN-MEMORY log of uncaught errors
 * and rejections, classified into the core's fixed {@link ErrorTaxonomyCategory} set by a shallow
 * message match. This module owns classification (a platform concern — the core taxonomy stays a
 * closed enum with no knowledge of `window`/`fetch`); `countErrorsByCategory` in `@dndtools/core`
 * owns turning records into safe counts. Records never persist to disk and never leave this module
 * except as input to a diagnostics view/export — the raw `message` is for the record itself, and the
 * core taxonomy counter deliberately drops it (see `packages/core/src/diagnostics/error-taxonomy.ts`).
 */

const MAX_RECORDS = 200;

let records: RawErrorRecord[] = [];

function classify(message: string): ErrorTaxonomyCategory {
	const m = message.toLowerCase();
	if (/network|fetch|offline|timeout/.test(m)) return 'network';
	if (/sync|conflict|op-log/.test(m)) return 'sync';
	if (/storage|quota|indexeddb|disk/.test(m)) return 'storage';
	if (/permission|denied|forbidden|unauthorized/.test(m)) return 'permission';
	if (/invalid|validation|schema|parse/.test(m)) return 'validation';
	if (/render|component|hook/.test(m)) return 'render';
	return 'unknown';
}

/** Record one error observation. Exposed so a React error boundary can feed a render-time failure
 *  through the same taxonomy as the global listeners below. */
export function recordError(message: string, category?: ErrorTaxonomyCategory): void {
	records.push({
		category: category ?? classify(message),
		occurredAt: new Date().toISOString(),
		message,
	});
	if (records.length > MAX_RECORDS) records = records.slice(records.length - MAX_RECORDS);
}

/** The current in-memory error log. A snapshot copy — callers never mutate the live array. */
export function getErrorLog(): RawErrorRecord[] {
	return [...records];
}

/** Test/dev seam: clear the in-memory log. */
export function clearErrorLog(): void {
	records = [];
}

let listenersInstalled = false;

/**
 * Install the window-level `error`/`unhandledrejection` listeners once. Idempotent — a re-render or
 * a second screen mount must not double-count every future error.
 */
export function installErrorLogListeners(): void {
	if (listenersInstalled || typeof window === 'undefined') return;
	listenersInstalled = true;
	window.addEventListener('error', (event) => {
		recordError(event.message || 'unknown error');
	});
	window.addEventListener('unhandledrejection', (event) => {
		const reason = event.reason;
		const message =
			reason instanceof Error
				? reason.message
				: typeof reason === 'string'
					? reason
					: 'unhandled rejection';
		recordError(message);
	});
}
