import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Icon, Input } from '../ds';
import { AppApiError, getPublicWiki, type PublicWiki, type WikiPage } from '../cloud/appApi';

/**
 * WikiReader — the PUBLIC, account-less reader for a published campaign wiki
 * (`#/wiki?id=<wikiId>`). Chrome-less like `/join` and `/play`: whoever opens the link is a reader
 * with no vault and must never land in DM onboarding. It fetches the player-safe page bundle from
 * the UNAUTHENTICATED app-api read route (no account needed, matching the server contract); a
 * password-protected wiki prompts once and re-fetches with the password header.
 *
 * XSS STANCE: hosted markdown is rendered to React NODES (`mdToNodes`), never via innerHTML /
 * dangerouslySetInnerHTML — the same approach Knowledge uses. Markdown text becomes React text
 * children, which React escapes, so a malicious page author cannot script a reader. The server also
 * validates content to strict text-only shapes on publish (defense in depth).
 *
 * The reader renders in the warm "parchment" theme (a data-theme wrapper drives the CSS variables),
 * independent of the DM app's chosen theme.
 */

type ReaderState =
	| { phase: 'loading' }
	| { phase: 'missing' }
	| { phase: 'password'; wrong: boolean }
	| { phase: 'invalid'; message: string }
	| { phase: 'ready'; wiki: PublicWiki };

const WRAP: CSSProperties = {
	minHeight: 'var(--app-viewport-height)',
	background: 'var(--color-bg)',
	color: 'var(--color-text-primary)',
	fontFamily: 'var(--font-sans)',
};

const CENTER: CSSProperties = {
	minHeight: 'var(--app-viewport-height)',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: 24,
};

const CARD: CSSProperties = {
	width: 'min(440px, 100%)',
	display: 'flex',
	flexDirection: 'column',
	gap: 14,
	padding: '28px 28px 24px',
	borderRadius: 16,
	border: '1px solid var(--color-border)',
	background: 'var(--color-surface)',
	boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,.12))',
};

/** Inline emphasis: **bold** and [[wikilink]] rendered as React nodes (text, never HTML). */
function boldify(s: string): ReactNode {
	const parts = s.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g);
	return parts.map((p, i) => {
		if (p.startsWith('**'))
			return (
				<strong key={i} style={{ color: 'var(--color-text-primary)' }}>
					{p.slice(2, -2)}
				</strong>
			);
		if (p.startsWith('[['))
			return (
				<span key={i} style={{ color: 'var(--color-accent)' }}>
					{p.slice(2, -2)}
				</span>
			);
		return p;
	});
}

/** Minimal, XSS-safe markdown → React nodes (headings, quote, list, paragraph). No innerHTML. */
function mdToNodes(md: string): ReactNode {
	if (!md.trim())
		return (
			<p style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
				This page is empty.
			</p>
		);
	return md.split('\n').map((ln, i) => {
		if (ln.startsWith('### '))
			return (
				<h4
					key={i}
					style={{
						font: '700 15px var(--font-display)',
						margin: '16px 0 4px',
						color: 'var(--color-text-primary)',
					}}
				>
					{ln.slice(4)}
				</h4>
			);
		if (ln.startsWith('## '))
			return (
				<h3
					key={i}
					style={{
						font: '700 19px var(--font-display)',
						margin: '18px 0 6px',
						color: 'var(--color-text-primary)',
					}}
				>
					{ln.slice(3)}
				</h3>
			);
		if (ln.startsWith('# '))
			return (
				<h2
					key={i}
					style={{
						font: '700 23px var(--font-display)',
						margin: '20px 0 8px',
						color: 'var(--color-text-primary)',
					}}
				>
					{ln.slice(2)}
				</h2>
			);
		if (ln.startsWith('> '))
			return (
				<blockquote
					key={i}
					style={{
						margin: '10px 0',
						padding: '10px 14px',
						borderLeft: '3px solid var(--color-accent)',
						background: 'var(--color-surface-sunken, var(--color-surface))',
						borderRadius: '0 8px 8px 0',
						font: 'italic 14px/1.6 var(--font-sans)',
						color: 'var(--color-text-secondary)',
					}}
				>
					{boldify(ln.slice(2))}
				</blockquote>
			);
		if (ln.startsWith('- '))
			return (
				<li
					key={i}
					style={{
						font: '14px/1.7 var(--font-sans)',
						color: 'var(--color-text-secondary)',
						marginLeft: 20,
					}}
				>
					{boldify(ln.slice(2))}
				</li>
			);
		if (!ln.trim()) return <div key={i} style={{ height: 8 }} />;
		return (
			<p
				key={i}
				style={{
					font: '14.5px/1.75 var(--font-sans)',
					color: 'var(--color-text-secondary)',
					margin: '0 0 8px',
				}}
			>
				{boldify(ln)}
			</p>
		);
	});
}

function Notice({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
	return (
		<div style={CENTER}>
			<div style={CARD} role="main">
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<span
						style={{
							width: 38,
							height: 38,
							borderRadius: 10,
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: 'var(--color-surface-sunken, var(--color-surface))',
							color: 'var(--color-accent)',
						}}
					>
						<Icon name={icon} size="md" />
					</span>
					<div style={{ font: '700 17px var(--font-display)', color: 'var(--color-text-primary)' }}>
						{title}
					</div>
				</div>
				{children}
			</div>
		</div>
	);
}

export function WikiReader() {
	const location = useLocation();
	const wikiId = useMemo(
		() => new URLSearchParams(location.search).get('id') ?? '',
		[location.search],
	);
	const [state, setState] = useState<ReaderState>(
		wikiId ? { phase: 'loading' } : { phase: 'missing' },
	);
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [openSlug, setOpenSlug] = useState<string | null>(null);

	const fetchWiki = (pw?: string) => {
		if (!wikiId) {
			setState({ phase: 'missing' });
			return;
		}
		setBusy(true);
		getPublicWiki(wikiId, pw)
			.then((wiki) => {
				setState({ phase: 'ready', wiki });
				setOpenSlug(wiki.pages[0]?.slug ?? null);
			})
			.catch((e: unknown) => {
				if (e instanceof AppApiError && e.status === 401) {
					setState({ phase: 'password', wrong: pw !== undefined });
				} else {
					const message =
						e instanceof AppApiError ? e.message : 'This wiki could not be loaded — try again.';
					setState({ phase: 'invalid', message });
				}
			})
			.finally(() => setBusy(false));
	};

	// Fetch once per id (a password wiki resolves to the password phase, then re-fetches on submit).
	useEffect(() => {
		fetchWiki();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [wikiId]);

	const submitPassword = () => {
		if (!password.trim()) return;
		fetchWiki(password.trim());
	};

	if (state.phase === 'loading') {
		return (
			<div data-theme="parchment" style={WRAP}>
				<Notice icon="knowledge-book" title="Opening wiki…">
					<div
						style={{ font: '13px var(--font-sans)', color: 'var(--color-text-tertiary)' }}
						role="status"
						aria-live="polite"
					>
						Fetching the published pages…
					</div>
				</Notice>
			</div>
		);
	}

	if (state.phase === 'missing') {
		return (
			<div data-theme="parchment" style={WRAP}>
				<Notice icon="warning" title="No wiki link">
					<div style={{ font: '13px/1.6 var(--font-sans)', color: 'var(--color-text-secondary)' }}>
						This address is missing its wiki id. Ask whoever shared it to copy the full link again.
					</div>
				</Notice>
			</div>
		);
	}

	if (state.phase === 'invalid') {
		return (
			<div data-theme="parchment" style={WRAP}>
				<Notice icon="warning" title="Wiki unavailable">
					<div style={{ font: '13px/1.6 var(--font-sans)', color: 'var(--color-text-secondary)' }}>
						{state.message}
					</div>
				</Notice>
			</div>
		);
	}

	if (state.phase === 'password') {
		return (
			<div data-theme="parchment" style={WRAP}>
				<Notice icon="lock" title="This wiki is protected">
					<div style={{ font: '13px/1.6 var(--font-sans)', color: 'var(--color-text-secondary)' }}>
						Enter the password the wiki owner shared to read it.
					</div>
					<Input
						type="password"
						value={password}
						onChange={(e: { target: { value: string } }) => setPassword(e.target.value)}
						onKeyDown={(e: React.KeyboardEvent) => {
							if (e.key === 'Enter') submitPassword();
						}}
						placeholder="Password"
						aria-label="Wiki password"
						invalid={state.wrong}
						maxLength={100}
					/>
					{state.wrong && (
						<div style={{ font: '12px var(--font-sans)', color: 'var(--color-status-error)' }}>
							That password is not right — try again.
						</div>
					)}
					<Button
						variant="primary"
						icon="unlock"
						disabled={busy || !password.trim()}
						onClick={submitPassword}
					>
						{busy ? 'Checking…' : 'Open wiki'}
					</Button>
				</Notice>
			</div>
		);
	}

	// phase === 'ready'
	const { wiki } = state;
	const page: WikiPage | undefined = wiki.pages.find((p) => p.slug === openSlug) ?? wiki.pages[0];
	return (
		<div data-theme="parchment" style={WRAP}>
			<div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px' }}>
				<header style={{ padding: '28px 0 18px', borderBottom: '1px solid var(--color-border)' }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							font: '11.5px var(--font-sans)',
							letterSpacing: '.08em',
							textTransform: 'uppercase',
							color: 'var(--color-text-tertiary)',
						}}
					>
						<Icon name="knowledge-book" size="sm" /> Campaign wiki
					</div>
					<h1
						style={{
							font: '800 28px var(--font-display)',
							color: 'var(--color-text-primary)',
							margin: '6px 0 0',
						}}
					>
						{wiki.title}
					</h1>
					<div
						style={{
							font: '12px var(--font-sans)',
							color: 'var(--color-text-tertiary)',
							marginTop: 4,
						}}
					>
						{wiki.pageCount} {wiki.pageCount === 1 ? 'page' : 'pages'} · updated{' '}
						{new Date(wiki.updatedAt).toLocaleDateString()}
					</div>
				</header>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'minmax(200px, 260px) 1fr',
						gap: 32,
						alignItems: 'start',
						padding: '22px 0 60px',
					}}
				>
					<nav
						aria-label="Wiki pages"
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 2,
							position: 'sticky',
							top: 22,
						}}
					>
						{wiki.pages.map((p) => {
							const active = p.slug === page?.slug;
							return (
								<button
									key={p.slug}
									type="button"
									onClick={() => setOpenSlug(p.slug)}
									aria-current={active ? 'page' : undefined}
									style={{
										display: 'block',
										width: '100%',
										textAlign: 'left',
										padding: '8px 12px',
										borderRadius: 8,
										cursor: 'pointer',
										border: 'none',
										font: `${active ? 600 : 400} 13.5px var(--font-sans)`,
										color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
										background: active
											? 'var(--color-surface-sunken, var(--color-surface))'
											: 'transparent',
									}}
								>
									{p.title}
								</button>
							);
						})}
						{wiki.pages.length === 0 && (
							<div style={{ font: '13px var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
								This wiki has no pages yet.
							</div>
						)}
					</nav>
					<article style={{ minWidth: 0 }}>
						{page ? (
							<>
								<h2
									style={{
										font: '800 24px var(--font-display)',
										color: 'var(--color-text-primary)',
										margin: '0 0 14px',
									}}
								>
									{page.title}
								</h2>
								<div>{mdToNodes(page.markdown)}</div>
							</>
						) : (
							<div style={{ font: '13.5px var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
								Nothing published on this wiki yet.
							</div>
						)}
					</article>
				</div>
			</div>
		</div>
	);
}
