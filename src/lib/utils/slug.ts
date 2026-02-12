/**
 * Convert a string to a URL-safe slug.
 * Used for generating file-safe names from note titles.
 */
export function slugify(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
}
