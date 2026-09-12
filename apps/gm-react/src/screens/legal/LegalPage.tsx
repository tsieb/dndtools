import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { PLACEHOLDER_PATTERN, type LegalBlock, type LegalDocument } from './legalContent';

/**
 * LegalPage — the shared long-form layout for `/legal/privacy` and `/legal/terms`. Chrome-less like
 * `/join`: the reader is a person (or a Stripe reviewer) with no vault and no account, so there is
 * no shell, no nav and no onboarding — just the document, a way back to the app, and a link to the
 * sibling document. The measure is capped at ~72ch so the text stays readable at every width.
 *
 * Unfilled `[PLACEHOLDERS]` render visibly marked so the operator cannot miss one on a live page.
 */

const WRAP: CSSProperties = {
	minHeight: 'var(--app-viewport-height)',
	background: 'var(--color-bg)',
	color: T.ink,
	padding: 'clamp(20px, 5vw, 48px) 16px 72px',
};

const ARTICLE: CSSProperties = {
	width: '100%',
	maxWidth: '72ch',
	margin: '0 auto',
	minWidth: 0,
};

const NAV_LINK: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: T.space.one,
	minHeight: 32,
	padding: `${T.space.one} ${T.space.two} ${T.space.one} ${T.space.one}`,
	borderRadius: T.radius.md,
	font: `13px ${T.sans}`,
	color: T.sub,
	textDecoration: 'none',
};

const PARAGRAPH: CSSProperties = {
	margin: `0 0 ${T.space.three}`,
	font: `15px/1.65 ${T.sans}`,
	color: T.ink,
	overflowWrap: 'anywhere',
};

const PLACEHOLDER: CSSProperties = {
	padding: `0 ${T.space.oneHalf}`,
	borderRadius: T.radius.sm,
	border: `1px dashed ${T.accBd}`,
	background: T.accSub,
	color: T.acc,
	font: `0.9em ${T.mono}`,
	whiteSpace: 'nowrap',
};

/** Render text with each `[BRACKETED PLACEHOLDER]` visibly marked for the operator. */
function withPlaceholders(text: string): ReactNode {
	const parts: ReactNode[] = [];
	let last = 0;
	for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
		const at = match.index ?? 0;
		if (at > last) parts.push(text.slice(last, at));
		parts.push(
			<mark key={at} style={PLACEHOLDER} data-legal-placeholder>
				{match[0]}
			</mark>,
		);
		last = at + match[0].length;
	}
	if (last < text.length) parts.push(text.slice(last));
	return parts.length === 1 ? parts[0] : parts;
}

function slug(heading: string): string {
	return heading
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function Block({ block }: { block: LegalBlock }) {
	if (typeof block === 'string') return <p style={PARAGRAPH}>{withPlaceholders(block)}</p>;
	return (
		<ul style={{ ...PARAGRAPH, paddingLeft: T.space.six }}>
			{block.list.map((item, i) => (
				<li key={i} style={{ marginBottom: T.space.oneHalf }}>
					{withPlaceholders(item)}
				</li>
			))}
		</ul>
	);
}

export function LegalPage({ doc, title }: { doc: LegalDocument; title: string }) {
	const { t } = useI18n();
	const sibling =
		doc.id === 'privacy'
			? { to: '/legal/terms', label: t('legal.terms.title') }
			: { to: '/legal/privacy', label: t('legal.privacy.title') };

	// Like `/wiki`: the browser tab is this page's only chrome, so name it; restore on unmount so an
	// in-session visit does not leave the app's own tab renamed.
	useEffect(() => {
		const previous = document.title;
		document.title = `${title} — Lamplight`;
		return () => {
			document.title = previous;
		};
	}, [title]);

	return (
		<div style={WRAP}>
			<article style={ARTICLE}>
				<nav
					aria-label={t('legal.docNav')}
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						justifyContent: 'space-between',
						gap: T.space.two,
						margin: `0 0 ${T.space.five} calc(-1 * ${T.space.one})`,
					}}
				>
					<Link to="/" style={NAV_LINK}>
						<Icon name="chevron-left" size={16} />
						{t('legal.backToApp')}
					</Link>
					<Link to={sibling.to} style={{ ...NAV_LINK, color: T.acc, paddingLeft: T.space.two }}>
						{sibling.label}
					</Link>
				</nav>

				<header style={{ marginBottom: T.space.six }}>
					<h1
						style={{
							margin: `0 0 ${T.space.two}`,
							font: `700 clamp(24px, 5vw, 30px)/1.2 ${T.disp}`,
							color: T.ink,
						}}
					>
						{title}
					</h1>
					<p style={{ margin: T.space.zero, font: `13px ${T.sans}`, color: T.ter }}>
						{withPlaceholders(t('legal.lastUpdated', { date: doc.lastUpdated }))}
					</p>
				</header>

				<main id="legal-content">
					{doc.sections.map((section) => {
						const id = slug(section.heading);
						return (
							<section key={id} aria-labelledby={id} style={{ marginBottom: T.space.six }}>
								<h2
									id={id}
									style={{
										margin: `0 0 ${T.space.two}`,
										font: `600 18px/1.3 ${T.disp}`,
										color: T.ink,
									}}
								>
									{section.heading}
								</h2>
								{section.blocks.map((block, i) => (
									<Block key={i} block={block} />
								))}
							</section>
						);
					})}
				</main>

				<footer
					style={{
						marginTop: T.space.eight,
						paddingTop: T.space.four,
						borderTop: `1px solid ${T.bd}`,
						display: 'flex',
						flexWrap: 'wrap',
						gap: T.space.four,
						font: `13px ${T.sans}`,
					}}
				>
					<Link to="/" style={{ color: T.sub }}>
						{t('legal.backToApp')}
					</Link>
					<Link to={sibling.to} style={{ color: T.acc }}>
						{sibling.label}
					</Link>
				</footer>
			</article>
		</div>
	);
}
