/**
 * The single file-download seam for the app. Everything a user "exports" leaves the
 * browser through here (Blob → object URL → anchor click → revoke), so no surface ever
 * computes an export and silently drops the bytes.
 */

export function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.rel = 'noopener';
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	// Revoke on the next tick: revoking synchronously can abort the navigation in
	// some engines before the download handler has claimed the URL.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadTextFile(filename: string, text: string, mime = 'text/plain'): void {
	downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function downloadJsonFile(filename: string, value: unknown): void {
	downloadBlob(
		filename,
		new Blob([JSON.stringify(value, null, '\t')], { type: 'application/json;charset=utf-8' }),
	);
}

/** `2026-07-09` — stable date stamp for export filenames. */
export function fileDateStamp(date = new Date()): string {
	return date.toISOString().slice(0, 10);
}
