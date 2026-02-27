import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const EMPTY_FRONTMATTER_REGEX = /^---\r?\n---/;
const INLINE_TAG_REGEX = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)/g;

export interface FrontmatterResult {
	frontmatter: Record<string, unknown>;
	body: string;
}

export function stringifyFrontmatter(frontmatter: Record<string, unknown>): string {
	const cleaned = Object.fromEntries(
		Object.entries(frontmatter).filter(([, value]) => {
			if (value === undefined || value === null) return false;
			if (typeof value === 'string') return value.trim().length > 0;
			if (Array.isArray(value)) return value.length > 0;
			return true;
		}),
	);
	if (Object.keys(cleaned).length === 0) return '';
	return `---\n${stringifyYaml(cleaned).trimEnd()}\n---\n\n`;
}

export function upsertFrontmatter(content: string, updates: Record<string, unknown>): string {
	const parsed = extractFrontmatter(content);
	const next = { ...parsed.frontmatter, ...updates };
	const frontmatterBlock = stringifyFrontmatter(next);
	if (!frontmatterBlock) return parsed.body;
	return `${frontmatterBlock}${parsed.body}`;
}

/** Extract YAML frontmatter and body from markdown content */
export function extractFrontmatter(content: string): FrontmatterResult {
	// Handle empty frontmatter
	const emptyMatch = content.match(EMPTY_FRONTMATTER_REGEX);
	if (
		emptyMatch &&
		(!content.match(FRONTMATTER_REGEX) || content.match(FRONTMATTER_REGEX)?.[1]?.trim() === '')
	) {
		const body = content.slice(emptyMatch[0].length).replace(/^\r?\n+/, '');
		return { frontmatter: {}, body };
	}

	const match = content.match(FRONTMATTER_REGEX);
	if (!match) {
		return { frontmatter: {}, body: content };
	}

	try {
		const parsed = parseYaml(match[1]!) as unknown;
		const frontmatter =
			typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
		const body = content.slice(match[0].length).replace(/^\r?\n+/, '');
		return { frontmatter, body };
	} catch {
		return { frontmatter: {}, body: content };
	}
}

/** Extract tags from both frontmatter and inline #tag syntax */
export function extractTags(frontmatter: Record<string, unknown>, content: string): string[] {
	const tags = new Set<string>();

	// Frontmatter tags
	const fmTags = frontmatter['tags'];
	if (Array.isArray(fmTags)) {
		for (const tag of fmTags) {
			if (typeof tag === 'string' && tag.trim()) {
				tags.add(tag.trim().toLowerCase());
			}
		}
	}

	// Inline #tags (skip code blocks)
	const lines = content.split('\n');
	let inCodeBlock = false;
	for (const line of lines) {
		if (line.trim().startsWith('```')) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		let match;
		INLINE_TAG_REGEX.lastIndex = 0;
		while ((match = INLINE_TAG_REGEX.exec(line)) !== null) {
			tags.add(match[1]!.toLowerCase());
		}
	}

	return Array.from(tags).sort();
}

/** Extract title from frontmatter or first heading */
export function extractTitle(frontmatter: Record<string, unknown>, content: string): string {
	// Frontmatter title takes precedence
	if (typeof frontmatter['title'] === 'string' && frontmatter['title'].trim()) {
		return frontmatter['title'].trim();
	}

	// Fall back to first heading
	const headingMatch = content.match(/^#\s+(.+)$/m);
	if (headingMatch) {
		return headingMatch[1]!.trim();
	}

	return 'Untitled';
}
