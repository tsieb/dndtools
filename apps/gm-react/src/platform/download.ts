import {
	DndtoolsFileExport,
	getPlatformCapabilities,
	type NativeFileExportPlugin,
	type RuntimeKind,
} from './capabilities';

export interface ExportFileInput {
	filename: string;
	blob: Blob;
	title?: string;
}

export type ExportResult =
	| { status: 'exported'; method: 'download' | 'native-share' }
	| { status: 'cancelled'; method: 'native-share' };

export class FileExportError extends Error {
	readonly name = 'FileExportError';
}

export const MAX_ANDROID_EXPORT_BYTES = 32 * 1024 * 1024;

interface ExportDependencies {
	runtimeKind: RuntimeKind;
	nativePlugin: NativeFileExportPlugin;
	browserDownload(filename: string, blob: Blob): void;
}

function browserDownload(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.rel = 'noopener';
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	// Revoking synchronously can abort before the download handler claims the URL.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

function bytesToBase64(bytes: Uint8Array): string {
	let encoded = '';
	// Every non-final chunk is a multiple of three, so concatenated base64 chunks do not
	// introduce padding in the middle. This avoids a second export-sized binary string.
	const chunkSize = 3 * 0x2000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		const binary = String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
		encoded += btoa(binary);
	}
	return encoded;
}

function checkedFilename(filename: string): string {
	const trimmed = filename.trim();
	if (trimmed === '' || trimmed === '.' || trimmed === '..' || /[\\/\0]/.test(trimmed)) {
		throw new FileExportError('Choose a valid export filename without folder separators.');
	}
	return trimmed;
}

/** Injectable implementation seam used by platform tests. */
export async function exportFileWithDependencies(
	input: ExportFileInput,
	dependencies: ExportDependencies,
): Promise<ExportResult> {
	const filename = checkedFilename(input.filename);
	if (dependencies.runtimeKind !== 'android') {
		try {
			dependencies.browserDownload(filename, input.blob);
			return { status: 'exported', method: 'download' };
		} catch (error) {
			throw new FileExportError(
				error instanceof Error
					? `Could not download ${filename}: ${error.message}`
					: `Could not download ${filename}. Check browser download permissions and try again.`,
			);
		}
	}

	try {
		if (input.blob.size > MAX_ANDROID_EXPORT_BYTES) {
			throw new FileExportError(
				'Android share exports are limited to 32 MiB to protect vault data on low-memory devices. Remove large media or export from the desktop app.',
			);
		}
		const bytes = new Uint8Array(await input.blob.arrayBuffer());
		const result = await dependencies.nativePlugin.exportFile({
			filename,
			mimeType: input.blob.type || 'application/octet-stream',
			base64: bytesToBase64(bytes),
			title: input.title?.trim() || `Export ${filename}`,
		});
		return result.status === 'cancelled'
			? { status: 'cancelled', method: 'native-share' }
			: { status: 'exported', method: 'native-share' };
	} catch (error) {
		if (error instanceof FileExportError) throw error;
		const detail = error instanceof Error && error.message.trim() ? ` ${error.message}` : '';
		throw new FileExportError(
			`Could not open the Android share/save sheet for ${filename}.${detail} Check available storage and try again.`,
		);
	}
}

/**
 * Export through the browser/Electron download path or Android's native share/save sheet.
 * Dismissing the Android sheet is a normal `cancelled` result, never an exception.
 */
export function exportFile(input: ExportFileInput): Promise<ExportResult> {
	const capabilities = getPlatformCapabilities();
	return exportFileWithDependencies(input, {
		runtimeKind: capabilities.nativeBridgeAvailable ? capabilities.runtimeKind : 'web',
		nativePlugin: DndtoolsFileExport,
		browserDownload,
	});
}

/** Compatibility wrappers while callers migrate to the one async export contract. */
export function downloadBlob(filename: string, blob: Blob, title?: string): Promise<ExportResult> {
	return exportFile({ filename, blob, title });
}

export function downloadTextFile(
	filename: string,
	text: string,
	mime = 'text/plain',
	title?: string,
): Promise<ExportResult> {
	return exportFile({
		filename,
		blob: new Blob([text], { type: `${mime};charset=utf-8` }),
		title,
	});
}

export function downloadJsonFile(
	filename: string,
	value: unknown,
	title?: string,
): Promise<ExportResult> {
	return exportFile({
		filename,
		blob: new Blob([JSON.stringify(value, null, '\t')], {
			type: 'application/json;charset=utf-8',
		}),
		title,
	});
}

/** `2026-07-09` — stable date stamp for export filenames. */
export function fileDateStamp(date = new Date()): string {
	return date.toISOString().slice(0, 10);
}
