/**
 * The single file-import seam for the app (hidden `<input type=file>`; works everywhere,
 * no File System Access API requirement — the FSA-based folder connection lives in
 * fsSource.ts). Resolves null when the user cancels; never throws for a cancel.
 */

export interface PickedFile {
	name: string;
	mime: string;
	byteLength: number;
	file: File;
}

export class PickedFileSizeError extends Error {
	constructor(
		readonly byteLength: number,
		readonly maxBytes: number,
	) {
		super(`Selected file is ${byteLength} bytes; the safe import limit is ${maxBytes} bytes.`);
		this.name = 'PickedFileSizeError';
	}
}

function pick(accept: string, multiple: boolean): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = accept;
		input.multiple = multiple;
		input.style.display = 'none';
		document.body.appendChild(input);
		const done = (files: File[]) => {
			input.remove();
			resolve(files);
		};
		input.addEventListener('change', () => done(Array.from(input.files ?? [])), { once: true });
		// `cancel` fires in modern engines when the dialog is dismissed; the window-focus
		// fallback would be racy, so a cancel in engines without the event simply leaves
		// the promise unresolved until the input is GC'd with the page — acceptable for a
		// user-initiated dialog, and the UI never awaits this promise in a blocking path.
		input.addEventListener('cancel', () => done([]), { once: true });
		input.click();
	});
}

async function toPicked(file: File): Promise<PickedFile> {
	return { name: file.name, mime: file.type, byteLength: file.size, file };
}

/** Pick one file and read it as text. Null when cancelled. */
export async function pickTextFile(
	accept: string,
	maxBytes?: number,
): Promise<(PickedFile & { text: string }) | null> {
	const [file] = await pick(accept, false);
	if (!file) return null;
	if (maxBytes !== undefined && file.size > maxBytes) {
		throw new PickedFileSizeError(file.size, maxBytes);
	}
	return { ...(await toPicked(file)), text: await file.text() };
}

/** Pick one file and read it as bytes. Null when cancelled. */
export async function pickBinaryFile(
	accept: string,
): Promise<(PickedFile & { bytes: Uint8Array }) | null> {
	const [file] = await pick(accept, false);
	if (!file) return null;
	return { ...(await toPicked(file)), bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Pick many files and read them as text (multi-file markdown import). */
export async function pickTextFiles(accept: string): Promise<Array<PickedFile & { text: string }>> {
	const files = await pick(accept, true);
	return Promise.all(
		files.map(async (file) => ({ ...(await toPicked(file)), text: await file.text() })),
	);
}
