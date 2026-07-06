/**
 * Render a connection code to a QR data URL for the DM's host panel (Epic 7.3 S7.3.3). Pure-JS `qrcode`
 * (no CDN, no native module) — the image is a self-contained `data:` URI, so it is safe under the
 * Electron CSP (`img-src 'self' data:`). Returns null if the code exceeds QR capacity (very large SDPs)
 * — the caller then falls back to the copy/paste code, so hosting never breaks on QR alone.
 *
 * `qrcode` is dynamically imported so it splits into its own chunk (loaded only when the DM opens the
 * host panel) rather than weighing down the boot bundle.
 */
export async function qrDataUrl(text: string): Promise<string | null> {
	try {
		const { default: QRCode } = await import('qrcode');
		return await QRCode.toDataURL(text, {
			errorCorrectionLevel: 'L',
			margin: 1,
			scale: 4,
		});
	} catch {
		return null;
	}
}
