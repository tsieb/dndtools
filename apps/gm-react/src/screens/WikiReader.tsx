// Public, account-less reader. Render only the server-projected bundle through sanitized markdown.
import { publicAppBaseUrl } from '../platform/publicAppUrl';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, Input, Select } from '../ds';
import { AppApiError, getPublicWiki, type PublicWiki, type WikiPage } from '../cloud/appApi';
import { useViewport } from '../app/useViewport';
import { useI18n } from '../i18n';
import { renderMarkdown } from '../app/markdown/render';
import { isThemePreset } from '../platform/theme';
import { parseWikilinkToken } from '../app/markdown/plugins';
type ReaderState =
	| { phase: 'loading' }
	| { phase: 'missing' }
	| { phase: 'password'; failedAttempts: number }
	| { phase: 'invalid'; message: string }
	| { phase: 'ready'; wiki: PublicWiki };
const WRAP: CSSProperties = {
	minHeight: 'var(--app-viewport-height)',
	background: 'var(--color-bg)',
	color: 'var(--color-text-primary)',
	fontFamily: 'var(--font-sans)',
	overflowWrap: 'anywhere',
};
const BODY: CSSProperties = {
	font: 'var(--text-base)/var(--leading-body) var(--font-sans)',
	color: 'var(--color-text-secondary)',
};
const EMPTY_STYLE = { '--color-text-tertiary': 'var(--color-text-secondary)' } as CSSProperties;
const DOCUMENT_LINK: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	minHeight: 'var(--space-12)',
};
const CENTER: CSSProperties = {
	minHeight: 'var(--app-viewport-height)',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: 'var(--space-6)',
};
export function parseWikilink(raw: string): { target: string; label: string } {
	const { target, label } = parseWikilinkToken(raw);
	return { target, label };
}
export function wikiDocumentUrl(wikiId: string, document: 'reader' | 'rss.xml'): string | null {
	const base = publicAppBaseUrl();
	if (!base) return null;
	try {
		return new URL(`/wikis/${encodeURIComponent(wikiId)}/${document}`, base).href;
	} catch {
		return null;
	}
}
function Notice({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
	return (
		<div style={CENTER}>
			<Card
				role="main"
				elevation="raised"
				style={{
					width: 'min(28rem, 100%)',
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-4)',
					padding: 'var(--space-6)',
					boxShadow: 'var(--shadow-md)',
				}}
			>
				<h1 style={{ margin: 'var(--space-0)', font: '700 var(--text-xl) var(--font-display)' }}>
					<Icon name={icon} size="md" /> {title}
				</h1>
				{children}
			</Card>
		</div>
	);
}
export function WikiReader() {
	const { t, formatDate } = useI18n();
	const location = useLocation();
	const isPhone = useViewport() === 'phone';
	const wikiId = useMemo(
		() => new URLSearchParams(location.search).get('id') ?? '',
		[location.search],
	);
	const [state, setState] = useState<ReaderState>(
		wikiId ? { phase: 'loading' } : { phase: 'missing' },
	);
	const [password, setPassword] = useState('');
	const [query, setQuery] = useState('');
	const [theme, setTheme] = useState(() => {
		const current = document.documentElement.dataset.theme;
		return isThemePreset(current) ? current : 'parchment';
	});
	const [busy, setBusy] = useState(false);
	const [openSlug, setOpenSlug] = useState<string | null>(null);
	const headingRef = useRef<HTMLHeadingElement | null>(null);
	const shownSlug = useRef<string | null>(null);
	useEffect(() => {
		// Announce user page changes without stealing focus during the first load.
		const previous = shownSlug.current;
		shownSlug.current = openSlug;
		if (previous === null || previous === openSlug) return;
		headingRef.current?.focus();
		window.scrollTo({ top: 0, behavior: 'auto' });
	}, [openSlug]);
	const fetchWiki = (pw?: string) => {
		if (!wikiId) {
			setState({ phase: 'missing' });
			return;
		}
		setBusy(true);
		getPublicWiki(wikiId, pw)
			.then((wiki) => {
				setState({ phase: 'ready', wiki });
				const requested = new URLSearchParams(location.search).get('page');
				setOpenSlug(
					wiki.pages.find((p) => p.slug === requested)?.slug ?? wiki.pages[0]?.slug ?? null,
				);
			})
			.catch((e: unknown) => {
				if (e instanceof AppApiError && e.status === 401) {
					setState((prev) => ({
						phase: 'password',
						failedAttempts:
							pw === undefined ? 0 : (prev.phase === 'password' ? prev.failedAttempts : 0) + 1,
					}));
				} else {
					const message = t(
						e instanceof AppApiError && e.code === 'not-configured'
							? 'wikiReader.notConfigured'
							: 'wikiReader.loadFailed',
					);
					setState({ phase: 'invalid', message });
				}
			})
			.finally(() => setBusy(false));
	};
	const readyAccess = state.phase === 'ready' ? state.wiki.access : null;
	const readyTitle = state.phase === 'ready' ? state.wiki.title : null;
	useEffect(() => {
		if (!readyTitle) return;
		const previous = document.title;
		document.title = `${readyTitle} — ${t('wikiReader.campaignWiki')}`;
		const description = document.createElement('meta');
		description.name = 'description';
		description.content = t('wikiReader.description', { title: readyTitle });
		const robots = document.createElement('meta');
		robots.name = 'robots';
		robots.content = readyAccess === 'public' ? 'index, follow' : 'noindex, nofollow';
		document.head.append(description, robots);
		return () => {
			document.title = previous;
			description.remove();
			robots.remove();
		};
	}, [readyTitle, readyAccess, t]);
	useEffect(() => {
		fetchWiki();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [wikiId]);
	const submitPassword = () => {
		// Enter must obey the same in-flight guard as the disabled button.
		if (!password.trim() || busy) return;
		fetchWiki(password.trim());
	};
	if (state.phase === 'loading') {
		return (
			<div data-theme={theme} style={WRAP}>
				<Notice icon="knowledge-book" title={t('wikiReader.opening')}>
					<div
						style={{
							font: 'var(--text-base) var(--font-sans)',
							color: 'var(--color-text-secondary)',
						}}
						role="status"
						aria-live="polite"
					>
						{t('wikiReader.fetching')}
					</div>
				</Notice>
			</div>
		);
	}
	if (state.phase === 'missing') {
		return (
			<div data-theme={theme} style={WRAP}>
				<Notice icon="warning" title={t('wikiReader.noLinkTitle')}>
					<div style={BODY}>{t('wikiReader.noLinkBody')}</div>
				</Notice>
			</div>
		);
	}
	if (state.phase === 'invalid') {
		return (
			<div data-theme={theme} style={WRAP}>
				<Notice icon="warning" title={t('wikiReader.unavailableTitle')}>
					<div role="alert" style={BODY}>
						{state.message}
					</div>
					<Button
						variant="primary"
						style={{ minHeight: 'var(--space-12)' }}
						icon="retry"
						disabled={busy}
						onClick={() => {
							setState({ phase: 'loading' });
							fetchWiki();
						}}
					>
						{t('wikiReader.tryAgain')}
					</Button>
				</Notice>
			</div>
		);
	}
	if (state.phase === 'password') {
		return (
			<div data-theme={theme} style={WRAP}>
				<Notice icon="lock" title={t('wikiReader.protectedTitle')}>
					<div style={BODY}>{t('wikiReader.protectedBody')}</div>
					<Input
						type="password"
						value={password}
						onChange={(e: { target: { value: string } }) => setPassword(e.target.value)}
						onKeyDown={(e: React.KeyboardEvent) => {
							if (e.key === 'Enter') submitPassword();
						}}
						placeholder={t('wikiReader.password')}
						aria-label={t('wikiReader.passwordLabel')}
						invalid={state.failedAttempts > 0}
						aria-describedby={state.failedAttempts > 0 ? 'wiki-password-error' : undefined}
						style={{ minHeight: 'var(--space-12)' }}
						maxLength={100}
					/>
					{state.failedAttempts > 0 && (
						<div
							id="wiki-password-error"
							key={state.failedAttempts}
							role="alert"
							style={{
								font: 'var(--text-sm) var(--font-sans)',
								color: 'var(--color-status-error-text)',
							}}
						>
							<Icon name="warning" size="sm" />{' '}
							{state.failedAttempts === 1
								? t('wikiReader.passwordWrong')
								: t('wikiReader.passwordWrongAgain', { count: state.failedAttempts })}
						</div>
					)}
					<Button
						variant="primary"
						style={{ minHeight: 'var(--space-12)' }}
						icon="unlock"
						disabled={busy || !password.trim()}
						onClick={submitPassword}
					>
						{busy ? t('wikiReader.checking') : t('wikiReader.openWiki')}
					</Button>
				</Notice>
			</div>
		);
	}
	const { wiki } = state;
	const page: WikiPage | undefined = wiki.pages.find((p) => p.slug === openSlug) ?? wiki.pages[0];
	const visiblePages = wiki.pages.filter((p) =>
		`${p.title} ${p.markdown}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
	);
	const folders = new Map<string, WikiPage[]>();
	for (const p of visiblePages) {
		const folder = (p as WikiPage & { folder?: string }).folder || t('wikiReader.pagesNav');
		folders.set(folder, [...(folders.get(folder) ?? []), p]);
	}
	const resolveLink = (raw: string): (() => void) | null => {
		const key = parseWikilinkToken(raw).target.toLowerCase();
		if (!key) return null;
		const hit = wiki.pages.find(
			(p) => p.title.trim().toLowerCase() === key || p.slug.toLowerCase() === key,
		);
		if (!hit || hit.slug === page?.slug) return null;
		return () => setOpenSlug(hit.slug);
	};
	return (
		<div data-theme={theme} style={WRAP}>
			<div
				style={{
					maxWidth: 'calc(var(--prose-measure-wide) * 2)',
					margin: '0 auto',
					padding: '0 var(--space-5)',
				}}
			>
				<a
					href="#wiki-content"
					data-skip-link="true"
					onClick={(e) => {
						e.preventDefault();
						document.getElementById('wiki-content')?.focus();
					}}
					style={{
						position: 'fixed',
						left: 'var(--space-2)',
						top: 'calc(-1 * var(--space-16))',
						zIndex: 100,
						padding: 'var(--space-2) var(--space-4)',
						borderRadius: 'var(--radius-md)',
						background: 'var(--color-accent)',
						color: 'var(--color-accent-foreground)',
						font: '600 var(--text-sm) var(--font-sans)',
						textDecoration: 'none',
						transition: 'top var(--duration-fast) var(--easing-standard)',
					}}
					onFocus={(e) => (e.currentTarget.style.top = 'var(--space-2)')}
					onBlur={(e) => (e.currentTarget.style.top = 'calc(-1 * var(--space-16))')}
				>
					{t('wikiReader.skipToContent')}
				</a>
				<header
					style={{
						padding: 'var(--space-6) 0 var(--space-4)',
						borderBottom: '1px solid var(--color-border)',
					}}
				>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							font: 'var(--text-sm) var(--font-sans)',
							letterSpacing: 'var(--tracking-wider)',
							textTransform: 'uppercase',
							color: 'var(--color-text-secondary)',
						}}
					>
						<Icon name="knowledge-book" size="sm" /> {t('wikiReader.campaignWiki')}
					</div>
					{wiki.access === 'public' && wikiDocumentUrl(wiki.wikiId, 'reader') && (
						<div>
							<a style={DOCUMENT_LINK} href={wikiDocumentUrl(wiki.wikiId, 'reader')!}>
								{t('wikiReader.webReader')}
							</a>
							{' · '}
							<a style={DOCUMENT_LINK} href={wikiDocumentUrl(wiki.wikiId, 'rss.xml')!}>
								{t('wikiReader.rss')}
							</a>
						</div>
					)}
					<h1
						style={{
							font: '700 var(--text-2xl) var(--font-display)',
							color: 'var(--color-text-primary)',
							margin: 'var(--space-2) 0 0',
						}}
					>
						{wiki.title}
					</h1>
					<div
						style={{
							font: 'var(--text-sm) var(--font-mono)',
							color: 'var(--color-text-secondary)',
							marginTop: 'var(--space-1)',
						}}
					>
						{t('wikiReader.pagesUpdated', {
							count: wiki.pageCount,
							date: formatDate(new Date(wiki.updatedAt)),
						})}
					</div>
				</header>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isPhone ? '1fr' : 'minmax(12rem, 16rem) minmax(0, 1fr)',
						gap: isPhone ? 'var(--space-4)' : 'var(--space-8)',
						alignItems: 'start',
						padding: 'var(--space-6) 0 var(--space-16)',
					}}
				>
					<nav
						aria-label={t('wikiReader.pagesNav')}
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 'var(--space-0-5)',
							position: isPhone ? 'static' : 'sticky',
							top: isPhone ? undefined : 'var(--space-6)',
							maxHeight: isPhone
								? undefined
								: 'calc(var(--app-viewport-height, 100vh) - var(--space-12))',
							overflowY: isPhone ? undefined : 'auto',
						}}
					>
						<Input
							style={{ minHeight: 'var(--space-12)' }}
							aria-label={t('wikiReader.search')}
							placeholder={t('wikiReader.search')}
							value={query}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
						/>
						<Select
							style={{ minHeight: 'var(--space-12)' }}
							aria-label={t('wikiReader.theme')}
							value={theme}
							onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
								if (isThemePreset(e.target.value)) setTheme(e.target.value);
							}}
							options={[
								{ value: 'parchment', label: t('wikiReader.parchment') },
								{ value: 'high-contrast', label: t('wikiReader.light') },
								{ value: 'tavern', label: t('wikiReader.dark') },
								{ value: 'scholar', label: t('settings.appearance.themeScholar') },
								{ value: 'dungeon', label: t('settings.appearance.themeDungeon') },
							]}
						/>
						{visiblePages.length === 0 && wiki.pages.length > 0 && (
							<EmptyState
								style={EMPTY_STYLE}
								inset
								illustration="search-none"
								description={t('wikiReader.noMatches')}
								role="status"
							/>
						)}
						{[...folders].map(([folder, pages]) => (
							<section key={folder}>
								<h2 style={{ font: '600 var(--text-base) var(--font-sans)' }}>{folder}</h2>
								{pages.map((p) => {
									const active = p.slug === page?.slug;
									return (
										<Button
											key={p.slug}
											variant="ghost"
											onClick={() => setOpenSlug(p.slug)}
											aria-current={active ? 'page' : undefined}
											style={{
												display: 'block',
												width: '100%',
												minHeight: 'var(--space-12)',
												whiteSpace: 'normal',
												overflowWrap: 'anywhere',
												textAlign: 'left',
												font: `${active ? 600 : 400} var(--text-base) var(--font-sans)`,
												color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
												background: active
													? 'var(--color-surface-sunken, var(--color-surface))'
													: 'transparent',
											}}
										>
											{p.title}
										</Button>
									);
								})}
							</section>
						))}
					</nav>
					<main id="wiki-content" tabIndex={-1} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
						{page ? (
							<article className="knowledge-prose">
								<h2
									ref={headingRef}
									tabIndex={-1}
									style={{
										font: '700 var(--text-xl) var(--font-display)',
										color: 'var(--color-text-primary)',
										margin: '0 0 var(--space-4)',
										outlineOffset: 'var(--space-1)',
									}}
								>
									{page.title}
								</h2>
								<div>
									{page.markdown.trim() ? (
										renderMarkdown(page.markdown, {
											t,
											emptyKey: 'wikiReader.pageEmpty',
											resolveWikilink: resolveLink,
										})
									) : (
										<EmptyState
											style={EMPTY_STYLE}
											illustration="knowledge-empty"
											description={t('wikiReader.pageEmpty')}
										/>
									)}
								</div>
							</article>
						) : (
							<EmptyState
								style={EMPTY_STYLE}
								illustration="publish-empty"
								description={t('wikiReader.nothingPublished')}
							/>
						)}
					</main>
				</div>
			</div>
		</div>
	);
}
