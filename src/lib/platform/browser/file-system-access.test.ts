import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	pickImportFilesViaFileSystemAccess,
	saveTextFileViaFileSystemAccess,
	supportsOpenFilePicker,
	supportsSaveFilePicker,
} from './file-system-access.js';

describe('file system access helpers', () => {
	afterEach(() => {
		delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
		delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
		vi.restoreAllMocks();
	});

	it('detects API support by picker availability', () => {
		expect(supportsOpenFilePicker()).toBe(false);
		expect(supportsSaveFilePicker()).toBe(false);

		(window as Window & { showOpenFilePicker?: () => Promise<unknown[]> }).showOpenFilePicker =
			vi.fn(async () => []);
		(window as Window & { showSaveFilePicker?: () => Promise<unknown> }).showSaveFilePicker = vi.fn(
			async () => ({
				createWritable: async () => ({ write: async () => {}, close: async () => {} }),
			}),
		);

		expect(supportsOpenFilePicker()).toBe(true);
		expect(supportsSaveFilePicker()).toBe(true);
	});

	it('returns selected files via open file picker', async () => {
		const fileA = new File(['# Alpha'], 'alpha.md', { type: 'text/markdown' });
		const fileB = new File(['{"notes":[]}'], 'bundle.json', { type: 'application/json' });
		(
			window as Window & {
				showOpenFilePicker?: () => Promise<Array<{ getFile: () => Promise<File> }>>;
			}
		).showOpenFilePicker = vi.fn(async () => [
			{ getFile: async () => fileA },
			{ getFile: async () => fileB },
		]);

		const files = await pickImportFilesViaFileSystemAccess();
		expect(files?.map((file) => file.name)).toEqual(['alpha.md', 'bundle.json']);
	});

	it('writes text content via save file picker', async () => {
		const write = vi.fn(async () => undefined);
		const close = vi.fn(async () => undefined);
		(
			window as Window & {
				showSaveFilePicker?: () => Promise<{
					createWritable: () => Promise<{
						write: (value: string) => Promise<void>;
						close: () => Promise<void>;
					}>;
				}>;
			}
		).showSaveFilePicker = vi.fn(async () => ({
			createWritable: async () => ({ write, close }),
		}));

		const saved = await saveTextFileViaFileSystemAccess({
			suggestedName: 'vault.json',
			content: '{"notes":[]}',
			mimeType: 'application/json',
			description: 'JSON',
			extensions: ['.json'],
		});

		expect(saved).toBe(true);
		expect(write).toHaveBeenCalledWith('{"notes":[]}');
		expect(close).toHaveBeenCalledTimes(1);
	});
});
