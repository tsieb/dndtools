import type { SessionBoardPreviewDepth } from '$lib/types/session-board.js';

export const LARGE_NOTE_LINE_THRESHOLD = 200;

export function shouldVirtualizeFullDepthNote(
	depth: SessionBoardPreviewDepth,
	lineCount: number,
): boolean {
	return depth === 'full' && lineCount > LARGE_NOTE_LINE_THRESHOLD;
}
