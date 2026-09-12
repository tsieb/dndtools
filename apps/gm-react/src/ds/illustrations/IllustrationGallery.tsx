import { useI18n, type MessageKey } from '../../i18n';
import { EmptyState } from '..';
import { ILLUSTRATION_KEYS, type IllustrationKey } from './index';

/**
 * The surface each drawing was made for. A `Record`, so a drawing added without a caption fails
 * `pnpm typecheck`. Catalog keys are camelCase because message-key segments cannot hold a hyphen.
 */
const CAPTIONS: Record<IllustrationKey, MessageKey> = {
	'session-board-empty': 'ds.illustrations.caption.sessionBoardEmpty',
	'note-tile-empty': 'ds.illustrations.caption.noteTileEmpty',
	'scenes-empty': 'ds.illustrations.caption.scenesEmpty',
	'combat-idle': 'ds.illustrations.caption.combatIdle',
	'tables-empty': 'ds.illustrations.caption.tablesEmpty',
	'play-waiting': 'ds.illustrations.caption.playWaiting',
	'audio-empty': 'ds.illustrations.caption.audioEmpty',
	'spells-empty': 'ds.illustrations.caption.spellsEmpty',
	'knowledge-empty': 'ds.illustrations.caption.knowledgeEmpty',
	'search-none': 'ds.illustrations.caption.searchNone',
	'journal-empty': 'ds.illustrations.caption.journalEmpty',
	'quests-empty': 'ds.illustrations.caption.questsEmpty',
	'calendar-empty': 'ds.illustrations.caption.calendarEmpty',
	'timeline-empty': 'ds.illustrations.caption.timelineEmpty',
	'graph-empty': 'ds.illustrations.caption.graphEmpty',
	'publish-empty': 'ds.illustrations.caption.publishEmpty',
	'map-library': 'ds.illustrations.caption.mapLibrary',
	'characters-empty': 'ds.illustrations.caption.charactersEmpty',
	'npcs-empty': 'ds.illustrations.caption.npcsEmpty',
	'factions-empty': 'ds.illustrations.caption.factionsEmpty',
	'community-empty': 'ds.illustrations.caption.communityEmpty',
	'invites-empty': 'ds.illustrations.caption.invitesEmpty',
	'inventory-empty': 'ds.illustrations.caption.inventoryEmpty',
	'connection-lost': 'ds.illustrations.caption.connectionLost',
};

/**
 * RC-DSN-3.1 — the illustration gallery (DEV-only route `#/__illustrations`, see `App.tsx`). Every
 * key renders exactly once, through `EmptyState` the way a surface would use it, with the key as the
 * heading and a caption naming the surface the drawing was made for. A story adopting a drawing on
 * its surface picks the key here.
 */
export function IllustrationGallery() {
	const { t } = useI18n();
	return (
		<main
			id="main-content"
			// The page is its own scroll container and holds nothing focusable, so it takes focus
			// itself; otherwise a keyboard user could not scroll past the first row (axe
			// `scrollable-region-focusable`).
			tabIndex={0}
			aria-labelledby="illustration-gallery-title"
			style={{
				boxSizing: 'border-box',
				height: 'var(--app-viewport-height)',
				overflowY: 'auto',
				padding: 'var(--space-8) var(--space-6)',
				background: 'var(--color-bg)',
				color: 'var(--color-text-primary)',
				fontFamily: 'var(--font-sans)',
			}}
		>
			<h1
				id="illustration-gallery-title"
				style={{
					margin: 0,
					fontFamily: 'var(--font-display)',
					fontSize: 'var(--text-2xl)',
					fontWeight: 'var(--font-weight-semibold)',
				}}
			>
				{t('ds.illustrations.title')}
			</h1>
			<p
				style={{
					margin: 'var(--space-2) 0 var(--space-6)',
					maxWidth: '60ch',
					fontSize: 'var(--text-sm)',
					lineHeight: 1.5,
					color: 'var(--color-text-secondary)',
				}}
			>
				{t('ds.illustrations.intro')}
			</p>
			<h2
				style={{
					margin: '0 0 var(--space-3)',
					fontSize: 'var(--text-md)',
					fontWeight: 'var(--font-weight-semibold)',
					color: 'var(--color-text-secondary)',
				}}
			>
				{t('ds.illustrations.listHeading', { count: ILLUSTRATION_KEYS.length })}
			</h2>
			<ul
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
					gap: 'var(--space-4)',
					margin: 0,
					padding: 0,
					listStyle: 'none',
				}}
			>
				{ILLUSTRATION_KEYS.map((key) => (
					<li
						key={key}
						style={{
							background: 'var(--color-surface)',
							border: '1px solid var(--color-border)',
							borderRadius: 'var(--radius-lg)',
						}}
					>
						<EmptyState
							inset
							illustration={key}
							title={
								<code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
									{key}
								</code>
							}
							description={t(CAPTIONS[key])}
						/>
					</li>
				))}
			</ul>
		</main>
	);
}
