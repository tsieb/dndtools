import { Badge, Button } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { type WikiAccess, type WikiPage } from '../../cloud/appApi';
import { publicAppHashUrl } from '../../platform/publicAppUrl';
import { useAuth } from '../../cloud/AuthContext';
import { isAccountApiConfigured } from '../../cloud/config';
import { useI18n, type MessageKey } from '../../i18n';

/* The Community tabs' shared helpers: error text, the wiki access modes, the note→wiki-page
 * projection, and the signed-out / unconfigured marketplace gate. Extracted from Community.tsx
 * unchanged (RC-STB-2.6). */

/** The caller supplies the fallback so it comes out of the catalog: a thrown error's own message
 * is already the server's words, but the generic sentence has to be translatable. */
export const errText = (e: unknown, fallback: string) =>
	e instanceof Error && e.message ? e.message : fallback;

/** ARIA radio-group contract (mirrors Onboarding's): arrows move selection (selection follows
 * focus, wrapping), Tab skips the group as one stop. */

// Wiki access vocabulary shown in the publish settings. `value` matches the server's WikiAccess enum.
export const WIKI_ACCESS_MODES: { value: WikiAccess; label: MessageKey; note: MessageKey }[] = [
	{
		value: 'public',
		label: 'community.wiki.accessPublic',
		note: 'community.wiki.accessPublicNote',
	},
	{
		value: 'unlisted',
		label: 'community.wiki.accessUnlisted',
		note: 'community.wiki.accessUnlistedNote',
	},
	{
		value: 'password',
		label: 'community.wiki.accessPassword',
		note: 'community.wiki.accessPasswordNote',
	},
];

/** Lowercase kebab-case slug matching the server's WIKI_SLUG_RE (`[a-z0-9][a-z0-9-]{0,119}`). */
export function slugify(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 120);
}

export interface EligibleNote {
	id: string;
	title: string;
	body: string;
	updatedAt: string;
}

/** Build the player-safe page bundle the server persists: one page per player-visible note, with a
 *  stable, de-duplicated slug. Only text fields cross the wire — the reader renders the markdown as
 *  React nodes (never innerHTML), so hosted content can't script a reader. */
export function buildWikiPages(notes: EligibleNote[]): WikiPage[] {
	const seen = new Set<string>();
	return notes.map((n) => {
		const root = slugify(n.title) || 'page';
		let slug = root;
		for (let i = 2; seen.has(slug); i++) slug = `${root}-${i}`.slice(0, 120);
		seen.add(slug);
		return { slug, title: n.title, markdown: n.body, updatedAt: n.updatedAt };
	});
}

/** The public reader URL for a published wiki (chrome-less `#/wiki?id=…` route, HashRouter-safe). */
export const wikiPublicUrl = (wikiId: string) => publicAppHashUrl('/wiki', { id: wikiId });

/** Fail-closed marketplace gate: local-only build, or signed out. */
export function MarketplaceGate({ signInPrompt }: { signInPrompt: MessageKey }) {
	const { t } = useI18n();
	const auth = useAuth();
	if (!isAccountApiConfigured) {
		return (
			<Panel
				title={t('community.market.title')}
				action={<Badge status="neutral">{t('community.market.localOnly')}</Badge>}
			>
				<div style={{ font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t('community.market.unavailable')}
				</div>
			</Panel>
		);
	}
	return (
		<Panel
			title={t('community.market.title')}
			action={<Badge status="neutral">{t('community.market.signedOut')}</Badge>}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<div style={{ flex: '1 1 240px', font: `12.5px/1.6 ${T.sans}`, color: T.sub }}>
					{t(signInPrompt)}
				</div>
				<Button variant="primary" size="sm" icon="UserCircle" onClick={() => auth.openAuthModal()}>
					{t('community.market.signIn')}
				</Button>
			</div>
		</Panel>
	);
}

export const kb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
