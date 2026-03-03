export const CONTENT_VISIBILITY_VALUES = ['dm_only', 'shared', 'public'] as const;

export type ContentVisibility = (typeof CONTENT_VISIBILITY_VALUES)[number];

export const DEFAULT_CONTENT_VISIBILITY: ContentVisibility = 'dm_only';

export function isContentVisibility(value: unknown): value is ContentVisibility {
	return (
		typeof value === 'string' && (CONTENT_VISIBILITY_VALUES as readonly string[]).includes(value)
	);
}

export function normalizeContentVisibility(
	value: unknown,
	fallback: ContentVisibility = DEFAULT_CONTENT_VISIBILITY,
): ContentVisibility {
	return isContentVisibility(value) ? value : fallback;
}
