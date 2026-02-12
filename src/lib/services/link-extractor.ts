export interface ExtractedLink {
	title: string;
	displayText: string;
	position: number;
}

const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/** Extract all wikilinks from markdown content */
export function extractWikilinks(content: string): ExtractedLink[] {
	const links: ExtractedLink[] = [];
	let match;

	WIKILINK_REGEX.lastIndex = 0;
	while ((match = WIKILINK_REGEX.exec(content)) !== null) {
		links.push({
			title: match[1]!.trim(),
			displayText: match[2]?.trim() ?? match[1]!.trim(),
			position: match.index,
		});
	}

	return links;
}
