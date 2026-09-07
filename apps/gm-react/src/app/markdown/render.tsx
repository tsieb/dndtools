import { useState, type CSSProperties, type ReactNode } from 'react';
import type { CalloutKind } from '@dndtools/core';
import { Icon } from '../../ds';
import { T, srOnly } from '../screen-kit';
import type { MessageKey, MessageValues } from '../../i18n';
import { parseBlocks, type ImageSource, type InlineToken, type MdBlock } from './plugins';

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
	/** True when the reader holds DM authority. Governs the `[!Secret]` affordance only. */
	isDm?: boolean;
	/** Message key for the "nothing here" line when the body is blank. */
	emptyKey?: MessageKey;
}

const CALLOUT_ICON: Record<CalloutKind, string> = {
	lore: 'scroll',
	warning: 'warning',
	tip: 'sparkle',
	secret: 'dm-only',
};

const CALLOUT_ACCENT: Record<CalloutKind, string> = {
	lore: T.acc,
	warning: T.warn,
	tip: T.info,
	secret: T.dm,
};

const CALLOUT_LABEL: Record<CalloutKind, MessageKey> = {
	lore: 'markdown.calloutLore',
	warning: 'markdown.calloutWarning',
	tip: 'markdown.calloutTip',
	secret: 'markdown.calloutSecret',
};

const P_STYLE: CSSProperties = { font: `13.5px/1.7 ${T.sans}`, color: T.sub, margin: '0 0 8px' };
const HEADING_STYLE: Record<number, CSSProperties> = {
	1: { font: `700 22px ${T.disp}`, color: T.ink, margin: '18px 0 8px' },
	2: { font: `700 18px ${T.disp}`, color: T.ink, margin: '16px 0 8px' },
	3: { font: `700 15px ${T.disp}`, color: T.ink, margin: '14px 0 4px' },
	4: { font: `700 14px ${T.disp}`, color: T.ink, margin: '12px 0 4px' },
	5: { font: `700 13px ${T.disp}`, color: T.ink, margin: '12px 0 4px' },
	6: { font: `700 12px ${T.disp}`, color: T.sub, margin: '12px 0 4px' },
};

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
			<span style={{ font: `12px ${T.sans}`, color: T.ter, fontStyle: 'italic' }}>
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
							font: `12.5px ${T.mono}`,
							background: T.alt,
							border: `1px solid ${T.bd}`,
							borderRadius: 4,
							padding: '1px 4px',
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
						style={{ maxWidth: '100%', verticalAlign: 'middle', borderRadius: 4 }}
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
						<Icon name="link" size="sm" style={{ marginLeft: 3, verticalAlign: '-2px' }} />
						<span style={srOnly}> {options.t('markdown.opensExternally')}</span>
					</a>
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
							padding: 0,
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

/**
 * A `[!Secret]` block on the DM's screen. Blurred until the DM presses "Show", because the DM's
 * screen is regularly mirrored to a TV at the table. The control is a real button, so the keyboard
 * path and the pointer path are identical (WCAG 2.2 AA).
 */
function SecretCallout({ title, body, t }: { title: string; body: ReactNode; t: Translate }) {
	const [shown, setShown] = useState(false);
	return (
		<>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
				<span style={{ color: T.dm, display: 'inline-flex' }}>
					<Icon name={CALLOUT_ICON.secret} size="sm" />
				</span>
				<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>
					{title || t('markdown.calloutSecret')}
				</span>
				<span style={{ font: `11px ${T.sans}`, color: T.ter }}>{t('markdown.dmOnly')}</span>
				<button
					type="button"
					onClick={() => setShown((value) => !value)}
					aria-expanded={shown}
					style={{
						marginLeft: 'auto',
						font: `600 11.5px ${T.sans}`,
						color: T.acc,
						background: 'none',
						border: 'none',
						padding: '2px 4px',
						cursor: 'pointer',
					}}
				>
					{shown ? t('markdown.hideSecret') : t('markdown.showSecret')}
				</button>
			</div>
			<div
				data-secret={shown ? 'shown' : 'blurred'}
				style={{
					filter: shown ? 'none' : 'blur(5px)',
					userSelect: shown ? 'auto' : 'none',
					transition: 'filter var(--duration-fast) var(--easing-standard)',
				}}
				aria-hidden={!shown}
			>
				{body}
			</div>
		</>
	);
}

function renderCallout(
	block: Extract<MdBlock, { type: 'callout' }>,
	key: number,
	options: MarkdownRenderOptions,
): ReactNode {
	const accent = CALLOUT_ACCENT[block.kind];
	const wrapper: CSSProperties = {
		margin: '12px 0',
		padding: '10px 14px',
		borderLeft: `3px solid ${accent}`,
		background: T.alt,
		borderRadius: '0 8px 8px 0',
	};
	if (block.kind === 'secret') {
		// A non-DM must not receive the secret's text at all. The core already stripped it upstream;
		// if one arrives here anyway, drop the body and say plainly that something is withheld.
		if (options.isDm !== true) {
			return (
				<aside key={key} style={wrapper}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<span style={{ color: T.dm, display: 'inline-flex' }}>
							<Icon name={CALLOUT_ICON.secret} size="sm" />
						</span>
						<span style={{ font: `13px ${T.sans}`, color: T.ter }}>
							{options.t('markdown.secretWithheld')}
						</span>
					</div>
				</aside>
			);
		}
		return (
			<aside key={key} style={wrapper}>
				<SecretCallout
					title={block.title}
					t={options.t}
					body={block.blocks.map((child, index) => renderBlock(child, index, options))}
				/>
			</aside>
		);
	}
	return (
		<aside key={key} style={wrapper}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
				<span style={{ color: accent, display: 'inline-flex' }}>
					<Icon name={CALLOUT_ICON[block.kind]} size="sm" />
				</span>
				<span style={{ font: `600 12.5px ${T.sans}`, color: T.ink }}>
					{block.title || options.t(CALLOUT_LABEL[block.kind])}
				</span>
			</div>
			{block.blocks.map((child, index) => renderBlock(child, index, options))}
		</aside>
	);
}

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
				<li key={index} style={{ font: `13.5px/1.7 ${T.sans}`, color: T.sub }}>
					{renderInline(item, options)}
				</li>
			));
			const listStyle: CSSProperties = { margin: '4px 0 10px', paddingLeft: 22 };
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
						margin: '10px 0',
						padding: '10px 14px',
						borderLeft: `3px solid ${T.accBd}`,
						background: T.alt,
						borderRadius: '0 8px 8px 0',
						font: `italic 13.5px/1.6 ${T.sans}`,
						color: T.sub,
					}}
				>
					{block.lines.map((line, index) => (
						<p key={index} style={{ margin: 0 }}>
							{renderInline(line, options)}
						</p>
					))}
				</blockquote>
			);
		case 'callout':
			return renderCallout(block, key, options);
		case 'code':
			return (
				<pre
					key={key}
					style={{
						margin: '10px 0',
						padding: '10px 12px',
						background: T.sunken,
						border: `1px solid ${T.bd}`,
						borderRadius: 8,
						overflowX: 'auto',
						font: `12.5px/1.6 ${T.mono}`,
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
					style={{ border: 'none', borderTop: `1px solid ${T.bd}`, margin: '16px 0' }}
				/>
			);
		case 'figure':
			return (
				<figure key={key} style={{ margin: '12px 0' }}>
					<ImageNode
						src={block.src}
						alt={block.alt}
						options={options}
						style={{
							display: 'block',
							maxWidth: '100%',
							borderRadius: 8,
							border: `1px solid ${T.bd}`,
						}}
					/>
					{block.caption !== '' && (
						<figcaption
							style={{
								font: `12px/1.5 ${T.sans}`,
								color: T.ter,
								marginTop: 6,
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
						margin: '12px 0',
						overflowX: 'auto',
						border: `1px solid ${T.bd}`,
						borderRadius: 8,
					}}
				>
					<table style={{ borderCollapse: 'collapse', width: '100%', font: `13px ${T.sans}` }}>
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
											zIndex: 1,
											textAlign: block.align[index] ?? 'left',
											font: `600 12.5px ${T.sans}`,
											color: T.ink,
											background: T.raised,
											borderBottom: `1px solid ${T.bdS}`,
											padding: '8px 10px',
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
												padding: '7px 10px',
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
			<p style={{ font: `13.5px/1.7 ${T.sans}`, color: T.ter, fontStyle: 'italic' }}>
				{options.t(options.emptyKey ?? 'markdown.empty')}
			</p>
		);
	}
	return parseBlocks(markdown).map((block, index) => renderBlock(block, index, options));
}
