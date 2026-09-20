import { Badge, Button, VisibilityChip } from '../../ds';
import { Panel, T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { useNavigate } from 'react-router-dom';
import { BAND_TONE, BAND_LABEL, useGraphHealth } from './presentation';
import type { MessageKey } from '../../i18n';
function HealthRow({ label, count }: { label: string; count: number }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-2)',
				font: `var(--text-base) ${T.sans}`,
				color: T.sub,
			}}
		>
			<span style={{ flex: 1 }}>{label}</span>
			<Badge
				style={{ fontFamily: T.mono }}
				status={count === 0 ? 'success' : count <= 3 ? 'warning' : 'error'}
			>
				{count}
			</Badge>
		</div>
	);
}

export function GraphHealth({ health }: { health: ReturnType<typeof useGraphHealth> }) {
	const { t } = useI18n();
	const navigate = useNavigate();
	return (
		<>
			{health.kind === 'dm' ? (
				<Panel
					title={t('graph.health')}
					style={{
						background: T.sunken,
						boxShadow: 'none',
						borderInlineStart: 'var(--space-1) solid var(--color-dm-only-badge)',
					}}
					action={
						<Badge status={health.report.coverage.overall >= 70 ? 'success' : 'warning'}>
							{t('graph.coveragePercent', { percent: health.report.coverage.overall })}
						</Badge>
					}
				>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
						<HealthRow label={t('graph.staleNotes')} count={health.report.staleNotes.length} />
						<HealthRow label={t('graph.missingLinks')} count={health.report.missingLinks.length} />
						<HealthRow label={t('graph.contentGaps')} count={health.report.contentGaps.length} />
						<HealthRow label={t('graph.openThreads')} count={health.report.openThreads.length} />
					</div>
					{/* RC-KNW-4.2 — one-click repair of broken wikilinks lives on its own screen (the
							    preview + fix flow needs room a health-row count can't give it); this is just
							    the entry point, DM-only since repairing is an authoring action. */}
					<div style={{ marginTop: 'var(--space-3)' }}>
						<Button
							variant="ghost"
							size="sm"
							icon="chevron-right"
							onClick={() => navigate('/graph/repair')}
						>
							{t('graph.repair.entry')}
						</Button>
					</div>
				</Panel>
			) : (
				<Panel title={t('graph.health')} action={<VisibilityChip level="players" compact />}>
					<div
						style={{
							font: `var(--text-sm)/1.5 ${T.sans}`,
							color: T.ter,
							marginBottom: 'var(--space-2)',
						}}
					>
						{t('graph.coarseNote')}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
						{(
							[
								['graph.staleNotes', health.summary.staleNotes],
								['graph.missingLinks', health.summary.missingLinks],
								['graph.contentGaps', health.summary.contentGaps],
								['graph.openThreads', health.summary.openThreads],
							] as const satisfies readonly (readonly [MessageKey, string])[]
						).map(([label, band]) => (
							<div
								key={label}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-2)',
									font: `var(--text-base) ${T.sans}`,
									color: T.sub,
								}}
							>
								<span style={{ flex: 1 }}>{t(label)}</span>
								<Badge status={BAND_TONE[band] as 'neutral'}>
									{BAND_LABEL[band] ? t(BAND_LABEL[band]) : band}
								</Badge>
							</div>
						))}
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								font: `var(--text-base) ${T.sans}`,
								color: T.sub,
								marginTop: 'var(--space-0-5)',
							}}
						>
							<span style={{ flex: 1 }}>{t('graph.coverage')}</span>
							<Badge status="neutral">
								{BAND_LABEL[health.summary.coverageBand]
									? t(BAND_LABEL[health.summary.coverageBand])
									: health.summary.coverageBand}
							</Badge>
						</div>
					</div>
				</Panel>
			)}
		</>
	);
}
