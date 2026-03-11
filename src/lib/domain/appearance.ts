import type {
	HighContrastMode,
	NoteReadingWidthMode,
	ReduceMotionMode,
	UiDensityMode,
} from '$lib/types/settings.js';

const UI_DENSITY_VALUES = ['standard', 'compact'] as const;
const NOTE_READING_WIDTH_VALUES = ['comfortable', 'wide', 'full'] as const;
const REDUCE_MOTION_VALUES = ['system', 'reduce', 'no-preference'] as const;
const HIGH_CONTRAST_VALUES = ['system', 'high', 'standard'] as const;

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

export function normalizeReduceMotion(value: unknown): ReduceMotionMode {
	if (typeof value !== 'string') return 'system';
	return REDUCE_MOTION_VALUES.includes(value as ReduceMotionMode)
		? (value as ReduceMotionMode)
		: 'system';
}

export function normalizeHighContrast(value: unknown): HighContrastMode {
	if (typeof value !== 'string') return 'system';
	return HIGH_CONTRAST_VALUES.includes(value as HighContrastMode)
		? (value as HighContrastMode)
		: 'system';
}

export function systemPrefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function systemPrefersHighContrast(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	return window.matchMedia('(prefers-contrast: more)').matches;
}

export function resolveReducedMotion(mode: ReduceMotionMode): boolean {
	if (mode === 'reduce') return true;
	if (mode === 'no-preference') return false;
	return systemPrefersReducedMotion();
}

export function resolveHighContrast(mode: HighContrastMode): boolean {
	if (mode === 'high') return true;
	if (mode === 'standard') return false;
	return systemPrefersHighContrast();
}
