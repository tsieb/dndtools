import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Icon, Input } from '../ds';
import { AppApiError, getPublicWiki, type PublicWiki, type WikiPage } from '../cloud/appApi';
import { useViewport } from '../app/useViewport';

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
	/** `failedAttempts` 0 = the first, un-failed prompt. It counts up so a SECOND wrong password
	 *  produces different copy and a re-mounted alert; a plain `wrong: boolean` rendered a
	 *  byte-identical DOM, which reads as "the button did nothing". */
	| { phase: 'password'; failedAttempts: number }
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

/**
 * Split `[[Target#Section|Label]]` into its parts. Obsidian's own syntax, which is what the DM
 * authored the vault in; the section anchor is not addressable in the reader yet, so it only ever
 * affects the label we fall back to.
 */
export function parseWikilink(raw: string): { target: string; label: string } {
	const inner = raw.slice(2, -2);
	const [addr, alias] = inner.split('|');
	const target = (addr ?? '').split('#')[0]?.trim() ?? '';
	const label = (alias ?? inner).trim();
	return { target, label: label || target };
}

/**
 * Inline emphasis: **bold** and [[wikilink]] rendered as React nodes (text, never HTML).
 *
 * `resolve` turns a wikilink target into a navigation callback. A link that resolves becomes a real
 * button (keyboard-reachable, announced as a link); one that does not stays plain text with a
 * tooltip saying so, instead of the old accent-coloured span that LOOKED clickable and was inert.
 */
function boldify(s: string, resolve?: (target: string) => (() => void) | null): ReactNode {
	const parts = s.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g);
	return parts.map((p, i) => {
		if (p.startsWith('**'))
			return (
				<strong key={i} style={{ color: 'var(--color-text-primary)' }}>
					{p.slice(2, -2)}
				</strong>
			);
		if (p.startsWith('[[')) {
			const { target, label } = parseWikilink(p);
			const go = resolve ? resolve(target) : null;
			if (!go)
				return (
					<span
						key={i}
						title={`No page named “${target}” on this wiki`}
						style={{
							color: 'var(--color-text-tertiary)',
							textDecoration: 'underline dotted',
							textDecorationColor: 'var(--color-border-strong)',
						}}
					>
						{label}
					</span>
				);
			return (
				<button
					key={i}
					type="button"
					onClick={go}
					style={{
						font: 'inherit',
						padding: 0,
						border: 'none',
						background: 'none',
						color: 'var(--color-accent)',
						textDecoration: 'underline',
						cursor: 'pointer',
					}}
				>
					{label}
				</button>
			);
		}
		return p;
	});
}

/** Minimal, XSS-safe markdown → React nodes (headings, quote, list, paragraph). No innerHTML. */
function mdToNodes(md: string, resolve?: (target: string) => (() => void) | null): ReactNode {
	if (!md.trim())
		return (
			<p style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
				This page is empty.
			</p>
		);
	// Bare <li> elements used to be returned straight into a <div> — invalid HTML, and a screen
	// reader never announced "list, N items". Group each run of `- ` lines into one <ul>.
	const lines = md.split('\n');
	const out: ReactNode[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		if (lines[i]!.startsWith('- ')) {
			const items: ReactNode[] = [];
			const start = i;
			while (i < lines.length && lines[i]!.startsWith('- ')) {
				items.push(renderLine(lines[i]!, i, resolve));
				i += 1;
			}
			i -= 1;
			out.push(
				<ul key={`ul-${start}`} style={{ margin: '4px 0', paddingLeft: 0, listStylePosition: 'inside' }}>
					{items}
				</ul>,
			);
			continue;
		}
		out.push(renderLine(lines[i]!, i, resolve));
	}
	return out;
}

function renderLine(
	ln: string,
	i: number,
	resolve?: (target: string) => (() => void) | null,
): ReactNode {
	{
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
					{boldify(ln.slice(2), resolve)}
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
					{boldify(ln.slice(2), resolve)}
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
				{boldify(ln, resolve)}
			</p>
		);
	}
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
	const isPhone = useViewport() === 'phone';
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
	const headingRef = useRef<HTMLHeadingElement | null>(null);
	const shownSlug = useRef<string | null>(null);

	// Switching pages swaps the whole article in place. Without this the keyboard user stays parked on
	// the nav button they just pressed with no announcement that anything changed, and a reader who
	// had scrolled to the bottom of a long page lands mid-way down the new one.
	useEffect(() => {
		const previous = shownSlug.current;
		shownSlug.current = openSlug;
		// The first assignment is the initial load resolving, not a user-initiated page switch.
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
				setOpenSlug(wiki.pages[0]?.slug ?? null);
			})
			.catch((e: unknown) => {
				if (e instanceof AppApiError && e.status === 401) {
					setState((prev) => ({
						phase: 'password',
						failedAttempts:
							pw === undefined
								? 0
								: (prev.phase === 'password' ? prev.failedAttempts : 0) + 1,
					}));
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
		// The Button is `disabled={busy}` but Enter was not, so repeat presses fired overlapping
		// fetches whose handlers raced to set `state` and double-counted the failed attempts.
		if (!password.trim() || busy) return;
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
						This link is incomplete. Ask whoever shared it to copy the full link again.
					</div>
				</Notice>
			</div>
		);
	}

	if (state.phase === 'invalid') {
		return (
			<div data-theme="parchment" style={WRAP}>
				<Notice icon="warning" title="Wiki unavailable">
					{/* The loading phase announced itself in a polite live region, and this replaces that
					    subtree — without a live region of its own the failure is silent to a screen
					    reader, which is left on "Fetching the published pages…". */}
					<div
						role="alert"
						style={{ font: '13px/1.6 var(--font-sans)', color: 'var(--color-text-secondary)' }}
					>
						{state.message}
					</div>
					{/* This is the ONE surface whose audience is a non-user following a shared link: no nav,
					    no app chrome, nothing to go back to. The commonest cause is a transient network
					    failure, and until now the reader's only recourse was to guess that a reload works. */}
					<Button
						variant="primary"
						icon="retry"
						disabled={busy}
						onClick={() => {
							setState({ phase: 'loading' });
							fetchWiki();
						}}
					>
						Try again
					</Button>
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
						invalid={state.failedAttempts > 0}
						maxLength={100}
					/>
					{state.failedAttempts > 0 && (
						// Keyed on the attempt count so a repeat failure RE-MOUNTS the alert (an unchanged
						// role="alert" node announces nothing), and the copy differs from the first attempt
						// so a sighted user can also see that the retry was processed.
						<div
							key={state.failedAttempts}
							role="alert"
							style={{ font: '12px var(--font-sans)', color: 'var(--color-status-error)' }}
						>
							{state.failedAttempts === 1
								? 'That password is not right — try again.'
								: `Still not right after ${state.failedAttempts} attempts — check for typos, or ask the wiki owner for the current password.`}
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
	// Wikilink resolution needs no API call: `wiki.pages` is already the full published set, so a
	// [[Target]] resolves against page titles (and slugs, for links authored slug-style).
	const resolveLink = (target: string): (() => void) | null => {
		const key = target.trim().toLowerCase();
		if (!key) return null;
		const hit = wiki.pages.find(
			(p) => p.title.trim().toLowerCase() === key || p.slug.toLowerCase() === key,
		);
		if (!hit || hit.slug === page?.slug) return null;
		return () => setOpenSlug(hit.slug);
	};
	return (
		<div data-theme="parchment" style={WRAP}>
			<div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px' }}>
				{/* The page nav emits one button per published page AHEAD of the article, so a keyboard
				    reader tabs through the whole table of contents before reaching the prose. Same
				    marker + move-focus-ourselves shape as the shell's and /play's skip links. */}
				<a
					href="#wiki-content"
					data-skip-link="true"
					onClick={(e) => {
						e.preventDefault();
						document.getElementById('wiki-content')?.focus();
					}}
					style={{
						position: 'fixed',
						left: 8,
						top: -48,
						zIndex: 100,
						padding: '8px 14px',
						borderRadius: 8,
						background: 'var(--color-accent)',
						color: 'var(--color-accent-foreground)',
						font: '600 13px var(--font-sans)',
						textDecoration: 'none',
						transition: 'top var(--duration-fast) var(--easing-standard)',
					}}
					onFocus={(e) => (e.currentTarget.style.top = '8px')}
					onBlur={(e) => (e.currentTarget.style.top = '-48px')}
				>
					Skip to page content
				</a>
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
				{/* On phone widths the 200px nav floor would squeeze the article to ~120px, so the
				    split stacks: page nav first, article below. */}
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isPhone ? '1fr' : 'minmax(200px, 260px) 1fr',
						gap: isPhone ? 18 : 32,
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
							// Every property below is desktop-only, because on phone this grid is a single
							// column and the nav is the FIRST row. Sticky + a near-full-viewport maxHeight
							// there turned the page list into a scroll-trapped panel filling the screen with
							// the article pushed entirely below it.
							position: isPhone ? 'static' : 'sticky',
							top: isPhone ? undefined : 22,
							// A sticky column taller than the viewport pins at 22px and its bottom entries
							// can never be scrolled to — a long wiki loses its last pages entirely.
							maxHeight: isPhone ? undefined : 'calc(var(--app-viewport-height, 100vh) - 44px)',
							overflowY: isPhone ? undefined : 'auto',
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
					{/* The ready phase had NO main landmark at all (only the notice phases did, via
					    `Notice`'s role="main"), so assistive tech had no way to jump past the nav. */}
					<main id="wiki-content" tabIndex={-1} style={{ minWidth: 0 }}>
						{page ? (
							<article>
								<h2
									ref={headingRef}
									tabIndex={-1}
									style={{
										font: '800 24px var(--font-display)',
										color: 'var(--color-text-primary)',
										margin: '0 0 14px',
										outlineOffset: 4,
									}}
								>
									{page.title}
								</h2>
								<div>{mdToNodes(page.markdown, resolveLink)}</div>
							</article>
						) : (
							<div style={{ font: '13.5px var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
								Nothing published on this wiki yet.
							</div>
						)}
					</main>
				</div>
			</div>
		</div>
	);
}
