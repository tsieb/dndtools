import { Badge, Icon } from '../../ds';
import { T } from '../../app/screen-kit';
import { moodTheme } from '../../app/sceneCardMood';
import { Panel, PvPage, SectionHead, type LiveData } from './shared';

// 6 · JOURNAL — the entries the DM has shared with this player (read-only on the device).
export function JournalSection({ data }: { data: LiveData }) {
	return (
		<PvPage max={1080}>
			<SectionHead title="Journal" sub="Entries the DM has shared with you" />
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '10px 14px',
					borderRadius: 10,
					background: 'var(--color-dm-only-subtle)',
					border: `1px solid var(--color-dm-only-badge)`,
					marginBottom: 18,
				}}
			>
				<Icon name="hidden" size={16} color="var(--color-dm-only-badge)" />
				<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>
					You see entries shared with you; author private notes in your full character app.
				</span>
			</div>
			<Panel title={`Shared entries (${data.journal.length})`}>
				{data.journal.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						No journal entries have been shared with you.
					</div>
				) : (
					<div style={{ display: 'flex', flexDirection: 'column' }}>
						{data.journal.map((e, i) => (
							<div
								key={e.id}
								style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}
							>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
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
			<div style={{ marginTop: 18 }} />
			<Panel title={`Scene history (${data.sceneHistory.length})`}>
				{data.sceneHistory.length === 0 ? (
					<div style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
						No scenes have been shown to the table yet.
					</div>
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
										gap: 10,
										padding: '10px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<span
										style={{
											width: 10,
											height: 10,
											marginTop: 4,
											borderRadius: '50%',
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
		</PvPage>
	);
}
