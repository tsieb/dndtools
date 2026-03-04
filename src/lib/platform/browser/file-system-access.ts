interface FileSystemFileHandleLike {
	getFile(): Promise<File>;
}

interface FileSystemWritableFileStreamLike {
	write(data: string | Blob): Promise<void>;
	close(): Promise<void>;
}

interface FileSystemSaveFileHandleLike {
	createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

interface PickerAcceptType {
	description?: string;
	accept: Record<string, string[]>;
}

interface FilePickerWindow extends Window {
	showOpenFilePicker?: (options?: {
		multiple?: boolean;
		excludeAcceptAllOption?: boolean;
		types?: PickerAcceptType[];
	}) => Promise<FileSystemFileHandleLike[]>;
	showSaveFilePicker?: (options?: {
		suggestedName?: string;
		excludeAcceptAllOption?: boolean;
		types?: PickerAcceptType[];
	}) => Promise<FileSystemSaveFileHandleLike>;
}

export interface SaveTextFileRequest {
	suggestedName: string;
	content: string;
	mimeType: string;
	description: string;
	extensions: string[];
}

function getFilePickerWindow(): FilePickerWindow | null {
	if (typeof window === 'undefined') {
		return null;
	}
	return window as FilePickerWindow;
}

function isAbortError(error: unknown): boolean {
	return (
		(error instanceof DOMException && error.name === 'AbortError') ||
		(error instanceof Error && error.name === 'AbortError')
	);
}

export function supportsOpenFilePicker(): boolean {
	const pickerWindow = getFilePickerWindow();
	return typeof pickerWindow?.showOpenFilePicker === 'function';
}

export function supportsSaveFilePicker(): boolean {
	const pickerWindow = getFilePickerWindow();
	return typeof pickerWindow?.showSaveFilePicker === 'function';
}

export async function pickImportFilesViaFileSystemAccess(): Promise<File[] | null> {
	const pickerWindow = getFilePickerWindow();
	if (!pickerWindow?.showOpenFilePicker) {
		return null;
	}

	try {
		const handles = await pickerWindow.showOpenFilePicker({
			multiple: true,
			excludeAcceptAllOption: false,
			types: [
				{
					description: 'DND Tools import files',
					accept: {
						'text/markdown': ['.md', '.markdown'],
						'application/json': ['.json'],
					},
				},
			],
		});
		return Promise.all(handles.map((handle) => handle.getFile()));
	} catch (error) {
		if (isAbortError(error)) {
			return null;
		}
		throw error;
	}
}

export async function saveTextFileViaFileSystemAccess(
	request: SaveTextFileRequest,
): Promise<boolean> {
	const pickerWindow = getFilePickerWindow();
	if (!pickerWindow?.showSaveFilePicker) {
		return false;
	}

	try {
		const handle = await pickerWindow.showSaveFilePicker({
			suggestedName: request.suggestedName,
			excludeAcceptAllOption: false,
			types: [
				{
					description: request.description,
					accept: { [request.mimeType]: request.extensions },
				},
			],
		});
		const writable = await handle.createWritable();
		await writable.write(request.content);
		await writable.close();
		return true;
	} catch (error) {
		if (isAbortError(error)) {
			return false;
		}
		throw error;
	}
}
