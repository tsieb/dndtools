import type { Plugin } from 'unified';
import type { Root, PhrasingContent, Text } from 'mdast';
import { visit } from 'unist-util-visit';

const WIKILINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

export interface WikilinkMeta {
	title: string;
	displayText: string;
}

export interface WikilinkResolveResult {
	href: string;
	exists: boolean;
}

export interface WikilinkOptions {
	resolveLink?: (title: string) => WikilinkResolveResult;
}

const remarkWikilinks: Plugin<[WikilinkOptions?], Root> = (options = {}) => {
	const resolveLink = options.resolveLink ?? ((title: string) => ({
		href: `/notes?create=${encodeURIComponent(title)}`,
		exists: false,
	}));

	return (tree: Root) => {
		visit(tree, 'text', (node: Text, index, parent) => {
			if (!parent || index === undefined) return;

			const value = node.value;
			WIKILINK_REGEX.lastIndex = 0;

			if (!WIKILINK_REGEX.test(value)) return;

			// Reset and split text around wikilinks
			WIKILINK_REGEX.lastIndex = 0;
			const children: PhrasingContent[] = [];
			let lastIndex = 0;
			let match;

			while ((match = WIKILINK_REGEX.exec(value)) !== null) {
				if (match.index > 0 && value[match.index - 1] === '!') {
					continue;
				}

				const title = match[1]!.trim();
				const displayText = match[2]?.trim() ?? title;
				const resolved = resolveLink(title);

				// Text before the wikilink
				if (match.index > lastIndex) {
					children.push({
						type: 'text',
						value: value.slice(lastIndex, match.index),
					});
				}

				// The wikilink as a link node
				children.push({
					type: 'link',
					url: resolved.href,
					data: {
						hProperties: {
							className: resolved.exists
								? 'wikilink wikilink--resolved'
								: 'wikilink wikilink--unresolved',
							'data-wikilink': title,
						},
					},
					children: [{ type: 'text', value: displayText }],
				});

				lastIndex = match.index + match[0].length;
			}

			// Remaining text after the last wikilink
			if (lastIndex < value.length) {
				children.push({
					type: 'text',
					value: value.slice(lastIndex),
				});
			}

			if (children.length > 0) {
				parent.children.splice(index, 1, ...children);
			}
		});
	};
};

export default remarkWikilinks;
