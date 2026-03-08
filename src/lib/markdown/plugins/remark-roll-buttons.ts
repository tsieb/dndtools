import { visit } from 'unist-util-visit';

interface MdastTextNode {
	type: 'text';
	value: string;
}

interface MdastRollButtonNode {
	type: 'rollButton';
	value: string;
	data: {
		hName: 'roll-button';
		hProperties: {
			'data-roll-expression': string;
		};
	};
}

type MdastNode = MdastTextNode | MdastRollButtonNode | { type: string; children?: MdastNode[] };

interface MdastRoot {
	type: 'root';
	children: MdastNode[];
}

const INLINE_ROLL_PATTERN = /\[\[\s*roll\s*:\s*([^[\]]+?)\s*\]\]/gi;

function textNode(value: string): MdastTextNode {
	return { type: 'text', value };
}

function rollButtonNode(expression: string): MdastRollButtonNode {
	return {
		type: 'rollButton',
		value: expression,
		data: {
			hName: 'roll-button',
			hProperties: {
				'data-roll-expression': expression,
			},
		},
	};
}

function hasChildren(
	node: MdastNode | MdastRoot | undefined,
): node is { type: string; children: MdastNode[] } | MdastRoot {
	if (!node || typeof node !== 'object') return false;
	return Array.isArray((node as { children?: MdastNode[] }).children);
}

/** Remark plugin that transforms [[roll:EXPR]] tokens into <roll-button data-roll-expression="..."> nodes. */
export function remarkRollButtons() {
	return (tree: MdastRoot): void => {
		visit(
			tree,
			'text',
			(node: MdastNode, index: number | undefined, parent: MdastNode | MdastRoot | undefined) => {
				if (node.type !== 'text') return;
				if (!hasChildren(parent) || index === undefined) return;
				const value = (node as MdastTextNode).value;
				if (!value || !INLINE_ROLL_PATTERN.test(value)) return;

				INLINE_ROLL_PATTERN.lastIndex = 0;
				const nextChildren: MdastNode[] = [];
				let cursor = 0;
				for (const match of value.matchAll(INLINE_ROLL_PATTERN)) {
					const raw = match[0] ?? '';
					const expression = (match[1] ?? '').trim();
					const at = match.index ?? -1;
					if (at < 0) continue;
					if (at > cursor) {
						nextChildren.push(textNode(value.slice(cursor, at)));
					}
					if (expression) {
						nextChildren.push(rollButtonNode(expression));
					} else {
						nextChildren.push(textNode(raw));
					}
					cursor = at + raw.length;
				}
				if (cursor < value.length) {
					nextChildren.push(textNode(value.slice(cursor)));
				}
				if (nextChildren.length === 0) return;
				parent.children.splice(index, 1, ...nextChildren);
				return index + nextChildren.length;
			},
		);
	};
}
