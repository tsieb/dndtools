import { visit } from 'unist-util-visit';

interface HastElement {
	type: 'element';
	tagName: string;
	properties: Record<string, unknown>;
	children: HastNode[];
}

type HastNode = HastElement | { type: string; value?: string; children?: HastNode[] };

interface HastRoot {
	type: 'root';
	children: HastNode[];
}

export function rehypeFigureImages() {
	return (tree: HastRoot): void => {
		visit(tree, 'element', (node: unknown, index: number | undefined, parent: unknown) => {
			const element = node as HastElement;
			const container = parent as HastElement | HastRoot | undefined;
			if (!element || element.type !== 'element' || element.tagName !== 'img') return;
			if (index === undefined || !container || !Array.isArray(container.children)) return;

			const alt =
				typeof element.properties.alt === 'string' ? (element.properties.alt as string).trim() : '';
			if (!alt) return;

			const figure: HastElement = {
				type: 'element',
				tagName: 'figure',
				properties: { className: ['note-figure'] },
				children: [
					element,
					{
						type: 'element',
						tagName: 'figcaption',
						properties: { className: ['note-figcaption'] },
						children: [{ type: 'text', value: alt }],
					},
				],
			};

			container.children[index] = figure;
		});
	};
}
