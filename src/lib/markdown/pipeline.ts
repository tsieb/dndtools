import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkWikilinks, { type WikilinkOptions } from './plugins/remark-wikilinks.js';

// Extend sanitize schema to allow wikilink attributes and checkboxes
const sanitizeSchema: typeof defaultSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		a: [
			...(defaultSchema.attributes?.['a'] ?? []),
			['className', /^wikilink/],
			['data-wikilink'],
		],
		input: [
			...(defaultSchema.attributes?.['input'] ?? []),
			['type', 'checkbox'],
			'checked',
			'disabled',
		],
		'*': [
			...(defaultSchema.attributes?.['*'] ?? []),
		],
	},
	tagNames: [...(defaultSchema.tagNames ?? []), 'input'],
};

export interface RenderOptions {
	resolveLink?: WikilinkOptions['resolveLink'];
}

/** Render markdown content to sanitized HTML */
export async function renderMarkdown(
	content: string,
	options: RenderOptions = {},
): Promise<string> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const processor = (unified() as any)
		.use(remarkParse)
		.use(remarkFrontmatter, ['yaml'])
		.use(remarkGfm)
		.use(remarkWikilinks, { resolveLink: options.resolveLink })
		.use(remarkRehype, { allowDangerousHtml: false })
		.use(rehypeSlug)
		.use(rehypeSanitize, sanitizeSchema)
		.use(rehypeStringify);

	const result = await processor.process(content);
	return String(result);
}
