import { Badge, EmptyState, Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { moodTheme } from '../../app/sceneCardMood';
import { useI18n } from '../../i18n';
import { Panel, PvPage, SectionHead, type LiveData } from './shared';
import { PrivateJournal } from './PrivateJournal';

// 6 · JOURNAL — the entries the DM has shared with this player, and (RC-CHR-4.1) the player's own
// private notes, which live in a separate device-local database and never reach the table.
export function JournalSection({ data }: { data: LiveData }) {
	const { t } = useI18n();
	return (
		<PvPage max={1080}>
			<SectionHead title={t('play.journal.title')} sub={t('play.journal.sub')} />
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: T.space.two,
					padding: `${T.space.two} ${T.space.three}`,
					borderRadius: T.radius.lg,
					background: 'var(--color-dm-only-subtle)',
					border: `1px solid var(--color-dm-only-badge)`,
					marginBottom: T.space.four,
				}}
			>
				<Icon name="hidden" size={16} color="var(--color-dm-only-badge)" />
				<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					{t('play.journal.privateNote')}
				</span>
			</div>
			<Panel title={t('play.journal.sharedEntries', { count: data.journal.length })}>
				{data.journal.length === 0 ? (
					<EmptyState inset illustration="journal-empty" description={t('play.journal.empty')} />
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{data.journal.map((e, i) => (
							<div
								key={e.id}
								style={{
									padding: `${T.space.two} ${T.space.zero}`,
									borderTop: i ? `1px solid ${T.bd}` : 'none',
								}}
							>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: T.space.two,
										marginBottom: T.space.one,
									}}
								>
									<span style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{e.title}</span>
									<Badge status="neutral">{e.kind}</Badge>
								</div>
								{e.body && <div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>{e.body}</div>}
							</div>
						))}
					</div>
				)}
			</Panel>
			{/* I11 S11.2.4 — the reviewable SCENE HISTORY: player-visible scene cards the DM has pushed. */}
			<div style={{ marginTop: T.space.four }} />
			<Panel title={t('play.journal.sceneHistory', { count: data.sceneHistory.length })}>
				{data.sceneHistory.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>{t('play.journal.noScenes')}</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{[...data.sceneHistory].reverse().map((row, i) => {
							const theme = moodTheme(row.card.mood);
							return (
								<div
									key={row.id}
									style={{
										display: 'flex',
										alignItems: 'flex-start',
										gap: T.space.two,
										padding: `${T.space.two} ${T.space.zero}`,
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<span
										style={{
											width: 10,
											height: 10,
											marginTop: T.space.one,
											borderRadius: T.radius.full,
											flex: '0 0 auto',
											background: theme.accent,
										}}
									/>
									<div style={{ minWidth: 0, flex: 1 }}>
										<div style={{ font: `600 13px ${T.sans}`, color: T.ink }}>{row.card.title}</div>
										{row.card.flavorText && (
											<div style={{ font: `12px/1.5 ${T.sans}`, color: T.sub }}>
												{row.card.flavorText}
											</div>
										)}
									</div>
									<span style={{ flex: '0 0 auto' }}>
										<Badge status="neutral">{theme.label}</Badge>
									</span>
								</div>
							);
						})}
					</div>
				)}
			</Panel>
			<PrivateJournal data={data} />
		</PvPage>
	);
}
