import { describe, expect, it } from 'vitest';
import {
	LARGE_NOTE_LINE_THRESHOLD,
	shouldVirtualizeFullDepthNote,
} from './session-board-note-virtualization.js';

describe('session board note virtualization', () => {
	it('virtualizes only full-depth notes above the line threshold', () => {
		expect(shouldVirtualizeFullDepthNote('title', LARGE_NOTE_LINE_THRESHOLD + 80)).toBe(false);
		expect(shouldVirtualizeFullDepthNote('summary', LARGE_NOTE_LINE_THRESHOLD + 80)).toBe(false);
		expect(shouldVirtualizeFullDepthNote('full', LARGE_NOTE_LINE_THRESHOLD)).toBe(false);
		expect(shouldVirtualizeFullDepthNote('full', LARGE_NOTE_LINE_THRESHOLD + 1)).toBe(true);
	});
});
