import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clearSharedImport,
	getSharedImport,
	offerSharedImport,
	parseSharedJson,
	resetSharedImportForTest,
	subscribeSharedImport,
} from './shareTarget';

afterEach(() => resetSharedImportForTest());

const SHARE = { filename: 'town.dndmodule', mimeType: 'application/json', text: '{}' };

describe('shared import queue', () => {
	it('parks a share for review instead of applying it', () => {
		expect(getSharedImport()).toBeNull();
		offerSharedImport(SHARE);
		expect(getSharedImport()?.share).toEqual(SHARE);
	});

	it('replaces an unanswered share with the newer one and re-announces it', () => {
		const listener = vi.fn();
		const unsubscribe = subscribeSharedImport(listener);
		const first = offerSharedImport(SHARE);
		const second = offerSharedImport({ ...SHARE, filename: 'keep.dndmodule' });

		expect(second.id).not.toBe(first.id);
		expect(getSharedImport()?.share.filename).toBe('keep.dndmodule');
		expect(listener).toHaveBeenCalledTimes(2);
		unsubscribe();
	});

	it('clears once, and stays quiet when there is nothing to clear', () => {
		const listener = vi.fn();
		const unsubscribe = subscribeSharedImport(listener);
		clearSharedImport();
		expect(listener).not.toHaveBeenCalled();

		offerSharedImport(SHARE);
		clearSharedImport();
		expect(getSharedImport()).toBeNull();
		expect(listener).toHaveBeenCalledTimes(2);
		unsubscribe();
	});
});

describe('parseSharedJson', () => {
	it('reports non-JSON rather than guessing at it', () => {
		expect(parseSharedJson('{"format":"dndmodule"}')).toEqual({
			ok: true,
			value: { format: 'dndmodule' },
		});
		expect(parseSharedJson('# A markdown note')).toEqual({ ok: false });
	});
});
