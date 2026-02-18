export interface ExtractedLink {
	title: string;
	displayText: string;
	position: number;
	targetIdHint?: string;
}

const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

interface ExtractWikilinksOptions {
	includeEmbeds?: boolean;
}

/** Extract all wikilinks from markdown content */
export function extractWikilinks(content: string, options: ExtractWikilinksOptions = {}): ExtractedLink[] {
	const includeEmbeds = options.includeEmbeds ?? true;
	const links: ExtractedLink[] = [];
	let match;

	WIKILINK_REGEX.lastIndex = 0;
	while ((match = WIKILINK_REGEX.exec(content)) !== null) {
		const isEmbed = match.index > 0 && content[match.index - 1] === '!';
		if (isEmbed && !includeEmbeds) {
			continue;
		}

		const rawTarget = match[1]!.trim();
		const rawDisplay = match[2]?.trim();
		const displayText = rawDisplay ? rawDisplay.split('|')[0]!.trim() : rawTarget;
		if (rawTarget.startsWith('obj:')) continue;

		if (rawTarget.startsWith('note:') || rawTarget.startsWith('id:')) {
			const targetIdHint = rawTarget.slice(rawTarget.indexOf(':') + 1).trim();
			if (!targetIdHint) continue;
			links.push({
				title: displayText,
				displayText,
				position: match.index,
				targetIdHint,
			});
			continue;
		}

		links.push({
			title: rawTarget,
			displayText,
			position: match.index,
		});
	}

	return links;
}
