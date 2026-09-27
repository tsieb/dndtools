import type { JournalEntryView } from '@dndtools/core';
import { Badge, EmptyState, Icon } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';

export function JournalHighlights({
	quests,
	highlights,
	downtimeEntries,
}: {
	quests: JournalEntryView[];
	highlights: JournalEntryView[];
	downtimeEntries: JournalEntryView[];
}) {
	const { t, formatDate } = useI18n();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			{/* Real projections of the journal's `personal-quest` / `session-highlight` entry kinds. */}
			<Panel title={t('player.journal.quests', { count: quests.length })}>
				{quests.length === 0 ? (
					<EmptyState
						inset
						illustration="quests-empty"
						title={t('player.journal.noQuestsTitle')}
						description={t('player.journal.noQuestsBody')}
					/>
				) : (
					quests.map((q, i) => (
						<div
							key={q.id}
							style={{
								display: 'flex',
								gap: 'var(--space-2)',
								padding: 'var(--space-2) 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
							}}
						>
							<Icon name="flag" size={15} color={T.acc} />
							<div style={{ flex: 1 }}>
								<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ink }}>{q.title}</div>
								{q.body && (
									<div
										style={{
											font: `var(--text-xs) ${T.sans}`,
											color: T.ter,
											marginTop: 'var(--space-0-5)',
										}}
									>
										{q.body}
									</div>
								)}
							</div>
						</div>
					))
				)}
			</Panel>
			<Panel title={t('player.journal.highlights', { count: highlights.length })}>
				{highlights.length === 0 ? (
					<EmptyState
						inset
						icon="sparkle"
						title={t('player.journal.noHighlightsTitle')}
						description={t('player.journal.noHighlightsBody')}
					/>
				) : (
					highlights.map((h, i) => (
						<div
							key={h.id}
							style={{
								padding: 'var(--space-2) 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
							}}
						>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									marginBottom: 'var(--space-0-5)',
								}}
							>
								<Badge status="accent">{t('player.journal.highlightBadge')}</Badge>
								<span
									style={{ marginLeft: 'auto', font: `var(--text-xs) ${T.mono}`, color: T.ter }}
								>
									{formatDate(new Date(h.updatedAt))}
								</span>
							</div>
							<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>{h.title}</div>
							{h.body && (
								<div style={{ font: `var(--text-sm)/1.5 ${T.sans}`, color: T.sub }}>{h.body}</div>
							)}
						</div>
					))
				)}
			</Panel>
			{/* RC-CHR-2.2 — the `downtime` entry kind's structured activity/days/cost/outcome fields. */}
			<Panel title={t('player.journal.downtime.section', { count: downtimeEntries.length })}>
				{downtimeEntries.length === 0 ? (
					<EmptyState
						inset
						icon="session-bolt"
						title={t('player.journal.downtime.noEntriesTitle')}
						description={t('player.journal.downtime.noEntriesBody')}
					/>
				) : (
					downtimeEntries.map((d, i) => (
						<div
							key={d.id}
							style={{
								padding: 'var(--space-2) 0',
								borderTop: i ? `1px solid ${T.bd}` : 'none',
							}}
						>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									marginBottom: 'var(--space-0-5)',
								}}
							>
								<Badge status="neutral">{d.downtime?.activityType ?? '—'}</Badge>
								<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
									{t('player.journal.downtime.daysValue', { days: d.downtime?.days ?? 0 })}
								</span>
								{d.downtime?.cost !== undefined && (
									<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
										{t('player.journal.downtime.costValue', { cost: d.downtime.cost })}
									</span>
								)}
							</div>
							<div style={{ font: `600 var(--text-sm) ${T.sans}` }}>{d.title}</div>
							{d.downtime?.outcome && (
								<div style={{ font: `var(--text-xs)/1.5 ${T.sans}`, color: T.sub }}>
									{d.downtime.outcome}
								</div>
							)}
						</div>
					))
				)}
			</Panel>
		</div>
	);
}
