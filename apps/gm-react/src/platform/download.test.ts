import { describe, expect, it, vi } from 'vitest';
import { exportFileWithDependencies, MAX_ANDROID_EXPORT_BYTES } from './download';

const blob = new Blob(['vault'], { type: 'application/json' });

describe('async file export', () => {
	it('retains the browser/Electron download path', async () => {
		const browserDownload = vi.fn();
		await expect(
			exportFileWithDependencies(
				{ filename: 'vault.json', blob },
				{
					runtimeKind: 'electron',
					browserDownload,
					nativePlugin: { exportFile: vi.fn() },
				},
			),
		).resolves.toEqual({ status: 'exported', method: 'download' });
		expect(browserDownload).toHaveBeenCalledWith('vault.json', blob);
	});

	it('passes base64 bytes to Android and treats dismissal as cancellation', async () => {
		const nativeExport = vi.fn(async () => ({ status: 'cancelled' as const }));
		await expect(
			exportFileWithDependencies(
				{ filename: 'vault.json', blob, title: 'Save vault' },
				{
					runtimeKind: 'android',
					browserDownload: vi.fn(),
					nativePlugin: { exportFile: nativeExport },
				},
			),
		).resolves.toEqual({ status: 'cancelled', method: 'native-share' });
		expect(nativeExport).toHaveBeenCalledWith({
			filename: 'vault.json',
			mimeType: 'application/json',
			base64: 'dmF1bHQ=',
			title: 'Save vault',
		});
	});

	it('turns native failures into an actionable export error', async () => {
		await expect(
			exportFileWithDependencies(
				{ filename: 'vault.json', blob },
				{
					runtimeKind: 'android',
					browserDownload: vi.fn(),
					nativePlugin: {
						exportFile: vi.fn(async () => {
							throw new Error('temporary storage is full');
						}),
					},
				},
			),
		).rejects.toThrow(/share\/save sheet.*storage.*try again/i);
	});

	it('rejects an Android export before allocation when it exceeds the low-memory limit', async () => {
		const nativeExport = vi.fn();
		const oversized = {
			size: MAX_ANDROID_EXPORT_BYTES + 1,
			arrayBuffer: vi.fn(() => {
				throw new Error('must not allocate');
			}),
		} as unknown as Blob;
		await expect(
			exportFileWithDependencies(
				{ filename: 'vault.dndvault', blob: oversized },
				{
					runtimeKind: 'android',
					browserDownload: vi.fn(),
					nativePlugin: { exportFile: nativeExport },
				},
			),
		).rejects.toThrow(/32 MiB.*low-memory.*desktop/i);
		expect(oversized.arrayBuffer).not.toHaveBeenCalled();
		expect(nativeExport).not.toHaveBeenCalled();
	});
});
