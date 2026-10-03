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
			margin: 4,
			scale: 4,
		});
	} catch {
		return null;
	}
}

interface QrDetector {
	detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}
interface QrDetectorConstructor {
	new (options: { formats: string[] }): QrDetector;
	getSupportedFormats(): Promise<string[]>;
}

function detectorConstructor(): QrDetectorConstructor | undefined {
	return (globalThis as typeof globalThis & { BarcodeDetector?: QrDetectorConstructor })
		.BarcodeDetector;
}

/** Probe without requesting permission. The camera opens only after Scan is pressed. */
export async function canScanQr(): Promise<boolean> {
	const Detector = detectorConstructor();
	if (!Detector || !navigator.mediaDevices?.getUserMedia) return false;
	try {
		const formats = await Detector.getSupportedFormats();
		const devices = await navigator.mediaDevices.enumerateDevices();
		return formats.includes('qr_code') && devices.some((device) => device.kind === 'videoinput');
	} catch {
		return false;
	}
}

/** The caller owns the stream and stops it on success, cancellation, failure and unmount. */
export function createQrDetector(): QrDetector {
	const Detector = detectorConstructor();
	if (!Detector) throw new Error('QR scanning is unavailable. Paste the invite code instead.');
	return new Detector({ formats: ['qr_code'] });
}
