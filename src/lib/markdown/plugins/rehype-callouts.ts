import { visit } from 'unist-util-visit';

interface HastElement {
	type: 'element';
	tagName: string;
	properties: Record<string, unknown>;
	children: HastNode[];
}

interface HastText {
	type: 'text';
	value: string;
}

type HastNode = HastElement | HastText | { type: string; children?: HastNode[] };

interface HastRoot {
	type: 'root';
	children: HastNode[];
}

const CALLOUT_REGEX = /^\[!(\w+)\][ \t]*([^\n]*)/;

const CALLOUT_ICONS: Record<string, string> = {
	info: '\u2139\uFE0F',
	tip: '\uD83D\uDCA1',
	warning: '\u26A0\uFE0F',
	danger: '\u2620\uFE0F',
	dm: '\uD83C\uDFB2',
	player: '\uD83D\uDDE1\uFE0F',
	lore: '\uD83D\uDCDC',
	quest: '\u2694\uFE0F',
	npc: '\uD83D\uDC64',
	location: '\uD83C\uDFF0',
	item: '\uD83D\uDCA0',
	note: '\uD83D\uDCDD',
	success: '\u2705',
	example: '\uD83D\uDCD6',
};

/** Rehype plugin that transforms blockquotes with [!type] syntax into callout blocks */
export function rehypeCallouts() {
	return (tree: HastRoot): void => {
		visit(tree, 'element', (node: HastNode) => {
			if (node.type !== 'element') return;
			const el = node as HastElement;
			if (el.tagName !== 'blockquote') return;

			// Find the first paragraph
			const firstP = el.children.find(
				(c): c is HastElement => c.type === 'element' && (c as HastElement).tagName === 'p',
			);
			if (!firstP) return;

			// Check if first text starts with [!type]
			const firstText = firstP.children[0];
			if (!firstText || firstText.type !== 'text') return;

			const textNode = firstText as HastText;
			const match = textNode.value.match(CALLOUT_REGEX);
			if (!match || !match[1]) return;

			const type = match[1].toLowerCase();
			const title = match[2]?.trim() || type.charAt(0).toUpperCase() + type.slice(1);
			const icon = CALLOUT_ICONS[type] ?? CALLOUT_ICONS['info'] ?? '\u2139\uFE0F';

			// Transform blockquote into callout div
			el.tagName = 'div';
			el.properties = {
				className: ['callout', `callout-${type}`],
				'data-callout': type,
			};

			// Remove the [!type] line from the first paragraph
			const remaining = textNode.value.replace(CALLOUT_REGEX, '').trim();
			if (remaining) {
				textNode.value = remaining;
			} else {
				// Remove the text node (and any following newline)
				firstP.children.shift();
				if (firstP.children[0]?.type === 'text') {
					const next = firstP.children[0] as HastText;
					next.value = next.value.replace(/^\n/, '');
				}
			}

			// Remove empty first paragraph
			if (
				firstP.children.length === 0 ||
				(firstP.children.length === 1 &&
					firstP.children[0]?.type === 'text' &&
					(firstP.children[0] as HastText).value.trim() === '')
			) {
				el.children = el.children.filter((c) => c !== firstP);
			}

			// Add title element at the beginning
			const titleEl: HastElement = {
				type: 'element',
				tagName: 'div',
				properties: { className: ['callout-title'] },
				children: [
					{
						type: 'element',
						tagName: 'span',
						properties: { className: ['callout-icon'] },
						children: [{ type: 'text', value: icon }],
					},
					{ type: 'text', value: ' ' + title },
				],
			};

			el.children.unshift(titleEl);
		});
	};
}
