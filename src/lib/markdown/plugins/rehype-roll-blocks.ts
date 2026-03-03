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

const ROLL_BLOCK_PATTERN = /\{\{\s*roll\s*:\s*([^}]+?)\s*\}\}/gi;

function hasChildren(
	node: HastNode | HastRoot | undefined,
): node is HastElement | HastRoot | { type: string; children: HastNode[] } {
	if (!node || typeof node !== 'object') return false;
	return Array.isArray((node as { children?: HastNode[] }).children);
}

function text(value: string): HastText {
	return { type: 'text', value };
}

function rollBlockElement(tableName: string, index: number): HastElement {
	return {
		type: 'element',
		tagName: 'span',
		properties: {
			className: ['roll-block'],
			'data-roll-table': tableName,
			'data-roll-index': String(index),
		},
		children: [
			{
				type: 'element',
				tagName: 'button',
				properties: {
					className: ['roll-block__trigger'],
					type: 'button',
					'data-roll-action': 'roll',
					'data-roll-table': tableName,
					'data-roll-index': String(index),
					'aria-label': `Roll table ${tableName}`,
				},
				children: [text('🎲')],
			},
			{
				type: 'element',
				tagName: 'span',
				properties: { className: ['roll-block__label'] },
				children: [text(tableName)],
			},
			{
				type: 'element',
				tagName: 'button',
				properties: {
					className: ['roll-block__accept'],
					type: 'button',
					'data-roll-action': 'accept',
					'data-roll-index': String(index),
					hidden: true,
				},
				children: [text('Accept')],
			},
			{
				type: 'element',
				tagName: 'ul',
				properties: {
					className: ['roll-block__history'],
					'data-roll-history': 'true',
					hidden: true,
				},
				children: [],
			},
		],
	};
}

/** Rehype plugin that transforms {{roll: Table Name}} tokens into interactive roll blocks. */
export function rehypeRollBlocks() {
	return (tree: HastRoot): void => {
		let blockIndex = 0;

		visit(
			tree,
			'text',
			(node: HastNode, index: number | undefined, parent: HastNode | HastRoot | undefined) => {
				if (node.type !== 'text') return;
				if (!hasChildren(parent) || index === undefined) return;
				const value = (node as HastText).value;
				if (!value || !ROLL_BLOCK_PATTERN.test(value)) return;

				ROLL_BLOCK_PATTERN.lastIndex = 0;
				const nextChildren: HastNode[] = [];
				let cursor = 0;
				for (const match of value.matchAll(ROLL_BLOCK_PATTERN)) {
					const full = match[0] ?? '';
					const tableName = (match[1] ?? '').trim();
					const at = match.index ?? -1;
					if (at < 0) continue;
					if (at > cursor) {
						nextChildren.push(text(value.slice(cursor, at)));
					}
					if (tableName) {
						nextChildren.push(rollBlockElement(tableName, blockIndex));
						blockIndex += 1;
					} else {
						nextChildren.push(text(full));
					}
					cursor = at + full.length;
				}
				if (cursor < value.length) {
					nextChildren.push(text(value.slice(cursor)));
				}

				if (nextChildren.length === 0) return;
				parent.children.splice(index, 1, ...nextChildren);
				return index + nextChildren.length;
			},
		);
	};
}
