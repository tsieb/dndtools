import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkWikilinks, { type WikilinkOptions } from './plugins/remark-wikilinks.js';
import { rehypeCallouts } from './plugins/rehype-callouts.js';
import { rehypeObjectEmbeds, type ResolvedNoteEmbed } from './plugins/rehype-object-embeds.js';
import type { VaultObject, VaultObjectType } from '$lib/types/object.js';

// Extend sanitize schema to allow wikilink attributes, checkboxes, and callouts
const sanitizeSchema: typeof defaultSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		a: [
			...(defaultSchema.attributes?.['a'] ?? []),
			['className', /^(wikilink|object-embed)/],
			['data-wikilink'],
			['data-object-action'],
			['data-object-id'],
			['data-object-type'],
		],
		input: [
			...(defaultSchema.attributes?.['input'] ?? []),
			['type', 'checkbox'],
			'checked',
			'disabled',
		],
		div: [
			...(defaultSchema.attributes?.['div'] ?? []),
			['className', /^(callout|object-embed)/],
			['data-callout'],
		],
		span: [
			...(defaultSchema.attributes?.['span'] ?? []),
			['className', /^(callout|object-embed)/],
			['data-object-card'],
			['data-object-id'],
			['data-object-type'],
			['hidden'],
		],
		img: [
			...(defaultSchema.attributes?.['img'] ?? []),
			['className', /^object-embed/],
		],
		'*': [
			...(defaultSchema.attributes?.['*'] ?? []),
		],
	},
	tagNames: [...(defaultSchema.tagNames ?? []), 'input'],
};

export interface RenderOptions {
	resolveLink?: WikilinkOptions['resolveLink'];
	resolveObject?: (type: VaultObjectType, id: string) => VaultObject | null | undefined;
	resolveNote?: (input: {
		target: string;
		targetBy: 'id' | 'title';
	}) => ResolvedNoteEmbed | null | undefined;
	currentNoteId?: string;
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
		.use(rehypeCallouts)
		.use(rehypeObjectEmbeds, {
			resolveObject: ({ type, id }: { type: VaultObjectType; id: string }) =>
				options.resolveObject?.(type, id),
			resolveNote: ({ target, targetBy }: { target: string; targetBy: 'id' | 'title' }) =>
				options.resolveNote?.({ target, targetBy }),
			currentNoteId: options.currentNoteId,
		})
		.use(rehypeSanitize, sanitizeSchema)
		.use(rehypeStringify);

	const result = await processor.process(content);
	return String(result);
}
