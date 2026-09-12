import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_TOTAL_BYTES } from '../security/payload-limits';
import type { FolderEntry } from './markdown-folder';

export const FOLDER_MAX_BYTES = 180 * 1024 * 1024;
export const FOLDER_MAX_FILES = 500;

export function safeFolderPath(path: string): boolean {
	return (
		path.length <= 240 &&
		!/[\\:]/.test(path) &&
		![...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
		path.split('/').every((part) => !!part && !part.startsWith('.'))
	);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return (crc ^ 0xffffffff) >>> 0;
}
export function validateFolderEntries(entries: readonly FolderEntry[]): void {
	const paths = new Set<string>();
	let total = 0;
	let textBytes = 0;
	if (entries.length > FOLDER_MAX_FILES) throw new Error('Folder has too many files.');
	for (const entry of entries) {
		if (!safeFolderPath(entry.path) || paths.has(entry.path.toLowerCase()))
			throw new Error('Unsafe or duplicate folder path.');
		paths.add(entry.path.toLowerCase());
		if (/\.(md|markdown|json)$/i.test(entry.path)) {
			textBytes += entry.bytes.byteLength;
			if (entry.bytes.byteLength > MAX_IMPORT_FILE_BYTES || textBytes > MAX_IMPORT_TOTAL_BYTES)
				throw new Error('Folder text exceeds the import size limit.');
		}
		total += entry.bytes.byteLength;
		if (total > FOLDER_MAX_BYTES) throw new Error('Folder exceeds the export size limit.');
	}
}

/** Standard ZIP32, UTF-8 names, stored entries. No clock, compression dependency or ZIP64. */
export function encodeFolderZip(entries: readonly FolderEntry[]): Uint8Array<ArrayBuffer> {
	validateFolderEntries(entries);
	const ordered = [...entries].sort((a, b) => a.path.localeCompare(b.path));
	const names = ordered.map((entry) => encoder.encode(entry.path));
	const localSize = ordered.reduce(
		(sum, entry, i) => sum + 30 + names[i]!.length + entry.bytes.length,
		0,
	);
	const centralSize = names.reduce((sum, name) => sum + 46 + name.length, 0);
	const bytes = new Uint8Array(localSize + centralSize + 22);
	const view = new DataView(bytes.buffer);
	let local = 0;
	let central = localSize;
	for (let i = 0; i < ordered.length; i++) {
		const entry = ordered[i]!;
		const name = names[i]!;
		const crc = crc32(entry.bytes);
		view.setUint32(local, 0x04034b50, true);
		view.setUint16(local + 4, 20, true);
		view.setUint16(local + 6, 0x800, true);
		view.setUint16(local + 12, 33, true); // 1980-01-01
		view.setUint32(local + 14, crc, true);
		view.setUint32(local + 18, entry.bytes.length, true);
		view.setUint32(local + 22, entry.bytes.length, true);
		view.setUint16(local + 26, name.length, true);
		bytes.set(name, local + 30);
		bytes.set(entry.bytes, local + 30 + name.length);
		view.setUint32(central, 0x02014b50, true);
		view.setUint16(central + 4, 20, true);
		view.setUint16(central + 6, 20, true);
		view.setUint16(central + 8, 0x800, true);
		view.setUint16(central + 14, 33, true);
		view.setUint32(central + 16, crc, true);
		view.setUint32(central + 20, entry.bytes.length, true);
		view.setUint32(central + 24, entry.bytes.length, true);
		view.setUint16(central + 28, name.length, true);
		view.setUint32(central + 42, local, true);
		bytes.set(name, central + 46);
		local += 30 + name.length + entry.bytes.length;
		central += 46 + name.length;
	}
	view.setUint32(central, 0x06054b50, true);
	view.setUint16(central + 8, ordered.length, true);
	view.setUint16(central + 10, ordered.length, true);
	view.setUint32(central + 12, centralSize, true);
	view.setUint32(central + 16, localSize, true);
	return bytes;
}

/** Only the stored ZIP format we export is accepted. Bounds and CRC checked before returning bytes. */
export function decodeFolderZip(bytes: Uint8Array): FolderEntry[] {
	const fail = (): never => {
		throw new Error('Invalid markdown folder ZIP (expected an uncompressed Lamplight export).');
	};
	if (bytes.length < 22 || bytes.length > FOLDER_MAX_BYTES + 512_000) fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = bytes.length - 22;
	if (
		view.getUint32(end, true) !== 0x06054b50 ||
		view.getUint32(end + 4, true) !== 0 ||
		view.getUint16(end + 20, true) !== 0
	)
		fail();
	const count = view.getUint16(end + 10, true);
	const start = view.getUint32(end + 16, true);
	if (
		count > FOLDER_MAX_FILES ||
		count !== view.getUint16(end + 8, true) ||
		start + view.getUint32(end + 12, true) !== end
	)
		fail();
	let central = start;
	let expectedLocal = 0;
	const entries: FolderEntry[] = [];
	for (let i = 0; i < count; i++) {
		if (central + 46 > end || view.getUint32(central, true) !== 0x02014b50) fail();
		const size = view.getUint32(central + 24, true);
		const nameLength = view.getUint16(central + 28, true);
		const local = view.getUint32(central + 42, true);
		if (
			view.getUint16(central + 8, true) !== 0x800 ||
			view.getUint16(central + 10, true) !== 0 ||
			view.getUint32(central + 20, true) !== size ||
			view.getUint16(central + 30, true) !== 0 ||
			view.getUint16(central + 32, true) !== 0 ||
			central + 46 + nameLength > end ||
			local !== expectedLocal ||
			local + 30 + nameLength + size > start
		)
			fail();
		const nameBytes = bytes.subarray(central + 46, central + 46 + nameLength);
		if (
			view.getUint32(local, true) !== 0x04034b50 ||
			view.getUint16(local + 6, true) !== 0x800 ||
			view.getUint16(local + 8, true) !== 0 ||
			view.getUint16(local + 26, true) !== nameLength ||
			view.getUint16(local + 28, true) !== 0 ||
			view.getUint32(local + 18, true) !== size ||
			view.getUint32(local + 22, true) !== size ||
			nameBytes.some((byte, n) => byte !== bytes[local + 30 + n])
		)
			fail();
		const data = bytes.slice(local + 30 + nameLength, local + 30 + nameLength + size);
		const crc = crc32(data);
		if (crc !== view.getUint32(central + 16, true) || crc !== view.getUint32(local + 14, true))
			fail();
		entries.push({ path: decoder.decode(nameBytes), bytes: data });
		expectedLocal = local + 30 + nameLength + size;
		central += 46 + nameLength;
	}
	if (central !== end || expectedLocal !== start) fail();
	validateFolderEntries(entries);
	return entries;
}
