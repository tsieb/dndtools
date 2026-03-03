import { describe, expect, it } from 'vitest';
import {
	filterPlayerVisibleNotes,
	isNoteVisibleInPlayerMode,
	isObjectVisibleInPlayerMode,
	isPlayerVisibleVisibility,
} from './visibility.js';

describe('visibility helpers', () => {
	it('treats shared and public as player-visible', () => {
		expect(isPlayerVisibleVisibility('shared')).toBe(true);
		expect(isPlayerVisibleVisibility('public')).toBe(true);
		expect(isPlayerVisibleVisibility('dm_only')).toBe(false);
	});

	it('filters notes for player mode boundary', () => {
		const notes = [
			{ id: 'a', visibility: 'dm_only' as const },
			{ id: 'b', visibility: 'shared' as const },
			{ id: 'c', visibility: 'public' as const },
		];
		expect(filterPlayerVisibleNotes(notes).map((note) => note.id)).toEqual(['b', 'c']);
		expect(isNoteVisibleInPlayerMode({ visibility: 'shared' })).toBe(true);
		expect(isNoteVisibleInPlayerMode({ visibility: 'dm_only' })).toBe(false);
		expect(isObjectVisibleInPlayerMode({ visibility: 'public' })).toBe(true);
	});
});
