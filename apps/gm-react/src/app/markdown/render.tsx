import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../ds';
import { T, srOnly } from '../screen-kit';
import type { MessageKey, MessageValues } from '../../i18n';
import { parseBlocks, type ImageSource, type InlineToken, type MdBlock } from './plugins';
import { RollButton, type InlineRollLogger } from './RollButton';
import { renderCallout } from './callouts';

/**
 * RC-KNW-1.1 — THE markdown renderer. Every prose surface (Knowledge, the public wiki reader,
 * player-facing note bodies, widget note bodies) renders through {@link renderMarkdown}, so a table,
 * a callout or a wikilink looks and behaves the same everywhere and there is exactly ONE place where
 * author text meets the DOM.
 *
 * XSS: markdown text becomes React NODES, never HTML. There is no `dangerouslySetInnerHTML` in this
 * file and no token that could feed one — `plugins.ts` emits no HTML and allow-lists every URL. React
 * escapes text children, so `<img src=x onerror=alert(1)>` in a note body renders as that literal
 * sentence. The XSS corpus in `markdown.test.tsx` is the standing evidence.
 *
 * `[!Secret]` callouts: the CORE removes them from every non-DM projection (`stripSecretCallouts`),
 * so a player never receives the bytes. This renderer is the second layer for the one case the core
 * cannot cover — the DM's own screen, which is often on a TV in front of the table. A secret renders
 * blurred behind an explicit "Show" control that the DM operates deliberately. When a secret somehow
 * reaches a non-DM renderer anyway, its body is DROPPED, not blurred: a blur is CSS, and CSS is not a
 * security boundary.
 */

type Translate = (key: MessageKey, values?: MessageValues) => string;

/** How the host surface resolves the pieces the renderer cannot decide for itself. */
export interface MarkdownRenderOptions {
	/** The message catalog lookup, so this module holds no English of its own. */
	t: Translate;
	/**
	 * Turn a raw `[[wikilink]]` into a navigation callback, or `null` when it does not resolve. The
	 * resolver is ACTOR-SCOPED in the core, so "does not resolve" legitimately means "not yours to
	 * see" as well as "no such note" — the rendering is the same broken-link styling either way.
	 */
	resolveWikilink?: (raw: string) => (() => void) | null;
	/**
	 * Render an `asset:<id>` image. Injected rather than imported so this module never touches the
	 * platform asset store directly (PLAT-006) and surfaces without a vault — the public wiki reader —
	 * simply pass nothing and get the honest unavailable state.
	 */
	renderAssetImage?: (assetId: string, alt: string) => ReactNode;
	/**
	 * RC-SES-2.2 — record an inline `[[roll:...]]` press in the session log with `source: 'inline'`.
	 * Surfaces that cannot write (the public wiki reader) pass nothing: the control still rolls and
	 * says the result was not recorded, which is the truth, rather than going dead.
	 */
	logInlineRoll?: InlineRollLogger;
	/** True when the reader holds DM authority. Governs the `[!Secret]` affordance only. */
	isDm?: boolean;
	/** Message key for the "nothing here" line when the body is blank. */
	emptyKey?: MessageKey;
}

/*
 * The prose type scale (RC-POL-1.11), all on the DS tokens. Body text is --text-sm at the relaxed
 * long-form leading; headings step down --text-xl, lg, md, base, sm. Cinzel is kept for the one
 * heading size that reaches --text-xl, the display floor; the smaller headings are Inter semibold,
 * where a 15px Cinzel was hard to read at the table.
 */
const BODY_FONT = `var(--text-sm)/var(--leading-relaxed) ${T.sans}`;
const P_STYLE: CSSProperties = {
	font: BODY_FONT,
	color: T.sub,
	margin: `${T.space.zero} ${T.space.zero} ${T.space.two}`,
};
const headingMargin = (above: string, below: string) =>
	`${above} ${T.space.zero} ${below} ${T.space.zero}`;
const HEADING_STYLE: Record<number, CSSProperties> = {
	1: {
		font: `700 var(--text-xl)/var(--leading-tight) ${T.disp}`,
		color: T.ink,
		margin: headingMargin(T.space.five, T.space.two),
	},
	2: {
		font: `600 var(--text-lg)/var(--leading-snug) ${T.sans}`,
		color: T.ink,
		margin: headingMargin(T.space.four, T.space.two),
	},
	3: {
		font: `600 var(--text-md)/var(--leading-snug) ${T.sans}`,
		color: T.ink,
		margin: headingMargin(T.space.three, T.space.one),
	},
	4: {
		font: `600 var(--text-base)/var(--leading-snug) ${T.sans}`,
		color: T.ink,
		margin: headingMargin(T.space.three, T.space.one),
	},
	5: {
		font: `600 var(--text-sm)/var(--leading-snug) ${T.sans}`,
		color: T.ink,
		margin: headingMargin(T.space.three, T.space.one),
	},
	6: {
		font: `600 var(--text-sm)/var(--leading-snug) ${T.sans}`,
		color: T.sub,
		margin: headingMargin(T.space.three, T.space.one),
	},
};
const BLOCK_MARGIN = `${T.space.three} ${T.space.zero}`;

/* -------------------------------------------------------------------------------------------- */
/* Inline                                                                                         */
/* -------------------------------------------------------------------------------------------- */

function ImageNode({
	src,
	alt,
	options,
	style,
}: {
	src: ImageSource;
	alt: string;
	options: MarkdownRenderOptions;
	style: CSSProperties;
}) {
	if (src.kind === 'asset') {
		const rendered = options.renderAssetImage?.(src.assetId, alt);
		if (rendered !== undefined && rendered !== null) return <>{rendered}</>;
		// No resolver, or the bytes are gone. Say so instead of showing a broken-image glyph.
		return (
			<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter, fontStyle: 'italic' }}>
				{alt || options.t('markdown.imageUnavailable')}
			</span>
		);
	}
	// `alt` is the author's own text, verbatim — an empty one is a deliberate "decorative".
	return <img src={src.url} alt={alt} loading="lazy" style={style} />;
}

function renderInline(tokens: InlineToken[], options: MarkdownRenderOptions): ReactNode {
	return tokens.map((token, index) => {
		switch (token.type) {
			case 'text':
				return token.text;
			case 'strong':
				return (
					<strong key={index} style={{ color: T.ink }}>
						{token.text}
					</strong>
				);
			case 'em':
				return <em key={index}>{token.text}</em>;
			case 'code':
				return (
					<code
						key={index}
						style={{
							font: `var(--text-xs) ${T.mono}`,
							background: T.alt,
							border: `1px solid ${T.bd}`,
							borderRadius: T.radius.sm,
							padding: `${T.space.zero} ${T.space.one}`,
						}}
					>
						{token.text}
					</code>
				);
			case 'image':
				return (
					<ImageNode
						key={index}
						src={token.src}
						alt={token.alt}
						options={options}
						style={{ maxWidth: '100%', verticalAlign: 'middle', borderRadius: T.radius.sm }}
					/>
				);
			case 'link':
				// External destinations are visibly distinct from wikilinks: an icon and a dotted
				// underline, so a reader knows before clicking that this leaves the app.
				return (
					<a
						key={index}
						href={token.href}
						target="_blank"
						rel="noopener noreferrer"
						style={{
							color: T.acc,
							textDecoration: 'underline',
							textUnderlineOffset: 2,
							whiteSpace: 'nowrap',
						}}
					>
						<span style={{ whiteSpace: 'normal' }}>{token.label}</span>
						<Icon
							name="link"
							size="sm"
							style={{ marginLeft: T.space.half, verticalAlign: '-2px' }}
						/>
						<span style={srOnly}> {options.t('markdown.opensExternally')}</span>
					</a>
				);
			case 'roll':
				return (
					<RollButton
						key={index}
						expression={token.expression}
						{...(token.label ? { label: token.label } : {})}
						t={options.t}
						{...(options.logInlineRoll ? { log: options.logInlineRoll } : {})}
					/>
				);
			case 'wikilink': {
				const go = options.resolveWikilink?.(token.raw) ?? null;
				if (!go) {
					// The honest broken-link state. Not a button: there is nothing to press.
					return (
						<span
							key={index}
							title={options.t('markdown.brokenLink')}
							style={{
								color: T.ter,
								textDecoration: 'underline dotted',
								textDecorationColor: T.bdS,
							}}
						>
							{token.label}
						</span>
					);
				}
				return (
					<button
						key={index}
						type="button"
						onClick={go}
						style={{
							font: 'inherit',
							padding: T.space.zero,
							border: 'none',
							background: 'none',
							color: T.acc,
							textDecoration: 'underline',
							textUnderlineOffset: 2,
							cursor: 'pointer',
						}}
					>
						{token.label}
					</button>
				);
			}
			default:
				return null;
		}
	});
}

/* -------------------------------------------------------------------------------------------- */
/* Blocks                                                                                         */
/* -------------------------------------------------------------------------------------------- */

function renderBlock(block: MdBlock, key: number, options: MarkdownRenderOptions): ReactNode {
	switch (block.type) {
		case 'heading': {
			const level = Math.min(Math.max(block.level, 1), 6);
			// The body sits under the surface's own <h1>/<h2>, so a `#` heading renders one level
			// down and the document outline never skips or duplicates a level.
			const Tag = `h${Math.min(level + 1, 6)}` as 'h2';
			return (
				<Tag key={key} id={block.anchor || undefined} style={HEADING_STYLE[level]}>
					{renderInline(block.inline, options)}
				</Tag>
			);
		}
		case 'paragraph':
			return (
				<p key={key} style={P_STYLE}>
					{renderInline(block.inline, options)}
				</p>
			);
		case 'list': {
			const items = block.items.map((item, index) => (
				<li key={index} style={{ font: BODY_FONT, color: T.sub }}>
					{renderInline(item, options)}
				</li>
			));
			const listStyle: CSSProperties = {
				margin: `${T.space.one} ${T.space.zero} ${T.space.three}`,
				paddingLeft: T.space.six,
			};
			return block.ordered ? (
				<ol key={key} style={listStyle}>
					{items}
				</ol>
			) : (
				<ul key={key} style={listStyle}>
					{items}
				</ul>
			);
		}
		case 'quote':
			return (
				<blockquote
					key={key}
					style={{
						margin: BLOCK_MARGIN,
						padding: `${T.space.three} ${T.space.four}`,
						borderLeft: `3px solid ${T.accBd}`,
						background: T.alt,
						borderRadius: `${T.radius.none} ${T.radius.md} ${T.radius.md} ${T.radius.none}`,
						font: `italic var(--text-sm)/1.6 ${T.sans}`,
						color: T.sub,
					}}
				>
					{block.lines.map((line, index) => (
						<p key={index} style={{ margin: T.space.zero }}>
							{renderInline(line, options)}
						</p>
					))}
				</blockquote>
			);
		case 'callout':
			return renderCallout(block, key, options, (children) =>
				children.map((child, index) => renderBlock(child, index, options)),
			);
		case 'code':
			return (
				<pre
					key={key}
					style={{
						margin: BLOCK_MARGIN,
						padding: T.space.three,
						background: T.sunken,
						border: `1px solid ${T.bd}`,
						borderRadius: T.radius.md,
						overflowX: 'auto',
						font: `var(--text-xs)/1.6 ${T.mono}`,
						color: T.sub,
					}}
				>
					<code>{block.text}</code>
				</pre>
			);
		case 'rule':
			return (
				<hr
					key={key}
					style={{
						border: 'none',
						borderTop: `1px solid ${T.bd}`,
						margin: `${T.space.four} ${T.space.zero}`,
					}}
				/>
			);
		case 'figure':
			return (
				<figure key={key} style={{ margin: BLOCK_MARGIN }}>
					<ImageNode
						src={block.src}
						alt={block.alt}
						options={options}
						style={{
							display: 'block',
							maxWidth: '100%',
							borderRadius: T.radius.md,
							border: `1px solid ${T.bd}`,
						}}
					/>
					{block.caption !== '' && (
						<figcaption
							style={{
								font: `var(--text-xs)/1.5 ${T.sans}`,
								color: T.ter,
								marginTop: T.space.oneHalf,
								fontStyle: 'italic',
							}}
						>
							{block.caption}
						</figcaption>
					)}
				</figure>
			);
		case 'table':
			return (
				// A wide stat table must be scrollable, and a scrollable region needs a keyboard path to
				// it (WCAG 2.2 AA): the group is focusable and named so it can be reached and scrolled
				// with the arrow keys alone.
				<div
					key={key}
					role="group"
					tabIndex={0}
					aria-label={options.t('markdown.tableLabel')}
					style={{
						margin: BLOCK_MARGIN,
						overflowX: 'auto',
						border: `1px solid ${T.bd}`,
						borderRadius: T.radius.md,
					}}
				>
					<table
						style={{ borderCollapse: 'collapse', width: '100%', font: `var(--text-sm) ${T.sans}` }}
					>
						<thead>
							<tr>
								{block.head.map((cell, index) => (
									<th
										key={index}
										scope="col"
										style={{
											// Sticky against the page scroll, so the column names stay readable
											// while a long table scrolls past.
											position: 'sticky',
											top: 0,
											zIndex: T.z.raised,
											textAlign: block.align[index] ?? 'left',
											font: `600 var(--text-sm) ${T.sans}`,
											color: T.ink,
											background: T.raised,
											borderBottom: `1px solid ${T.bdS}`,
											padding: `${T.space.two} ${T.space.three}`,
											whiteSpace: 'nowrap',
										}}
									>
										{renderInline(cell, options)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{block.rows.map((row, rowIndex) => (
								<tr key={rowIndex}>
									{row.map((cell, cellIndex) => (
										<td
											key={cellIndex}
											style={{
												textAlign: block.align[cellIndex] ?? 'left',
												color: T.sub,
												borderTop: rowIndex === 0 ? 'none' : `1px solid ${T.bd}`,
												padding: `${T.space.two} ${T.space.three}`,
												verticalAlign: 'top',
											}}
										>
											{renderInline(cell, options)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			);
		default:
			return null;
	}
}

/**
 * Render a markdown body to React nodes. The ONE entry point every prose surface calls. A blank body
 * renders the surface's empty line rather than nothing at all, so a reader is never left staring at
 * an unexplained gap.
 */
export function renderMarkdown(markdown: string, options: MarkdownRenderOptions): ReactNode {
	if (!markdown.trim()) {
		return (
			<p style={{ font: BODY_FONT, color: T.ter, fontStyle: 'italic', margin: T.space.zero }}>
				{options.t(options.emptyKey ?? 'markdown.empty')}
			</p>
		);
	}
	return parseBlocks(markdown).map((block, index) => renderBlock(block, index, options));
}
