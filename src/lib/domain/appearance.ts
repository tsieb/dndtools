import type { NoteReadingWidthMode, UiDensityMode } from '$lib/types/settings.js';

const UI_DENSITY_VALUES = ['standard', 'compact'] as const;
const NOTE_READING_WIDTH_VALUES = ['comfortable', 'wide', 'full'] as const;

export function normalizeUiDensity(value: unknown): UiDensityMode {
	if (typeof value !== 'string') return 'standard';
	return UI_DENSITY_VALUES.includes(value as UiDensityMode) ? (value as UiDensityMode) : 'standard';
}

export function normalizeNoteReadingWidth(value: unknown): NoteReadingWidthMode {
	if (typeof value !== 'string') return 'comfortable';
	return NOTE_READING_WIDTH_VALUES.includes(value as NoteReadingWidthMode)
		? (value as NoteReadingWidthMode)
		: 'comfortable';
}
