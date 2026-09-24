import { Panel, T } from '../../app/screen-kit';
import { EmptyState } from '../../ds';
import { useI18n } from '../../i18n';
import type { EligibleNote } from './shared';
export function WikiPreview({
	title,
	eligibleNotes,
}: {
	title: string;
	eligibleNotes: EligibleNote[];
}) {
	const { t, formatDate } = useI18n();
	const eligible = eligibleNotes.length;
	return (
		<Panel title={t('community.wiki.previewTitle')}>
			<div
				data-theme="parchment"
				style={{
					borderRadius: T.radius.lg,
					overflow: 'hidden',
					border: `1px solid var(--color-border)`,
					background: 'var(--color-bg)',
					color: 'var(--color-text-primary)',
				}}
			>
				<div
					style={{
						padding: `${T.space.five} ${T.space.five}`,
						borderBottom: `1px solid var(--color-border)`,
						background: 'var(--color-surface)',
					}}
				>
					<div
						style={{
							font: `700 var(--text-lg) var(--font-sans)`,
							color: 'var(--color-text-primary)',
						}}
					>
						{title.trim() || t('community.wiki.previewFallbackTitle')}
					</div>
					<div
						style={{
							font: `var(--text-xs) var(--font-sans)`,
							color: 'var(--color-text-secondary)',
						}}
					>
						{t('community.wiki.previewSubtitle', { count: eligible })}
					</div>
				</div>
				<div
					style={{
						padding: `${T.space.four} ${T.space.five}`,
						display: 'flex',
						flexDirection: 'column',
						gap: T.space.three,
					}}
				>
					<div
						style={{
							font: `600 var(--text-xs) var(--font-sans)`,
							letterSpacing: '.08em',
							textTransform: 'uppercase',
							color: 'var(--color-text-secondary)',
						}}
					>
						{t('community.wiki.previewPages')}
					</div>
					{eligibleNotes.slice(0, 3).map((n) => (
						<div key={n.id} style={{ display: 'flex', alignItems: 'baseline', gap: T.space.three }}>
							<span
								style={{
									flex: 1,
									font: `var(--text-sm) var(--font-sans)`,
									color: 'var(--color-text-primary)',
								}}
							>
								{n.title}
							</span>
							<span
								style={{
									font: `var(--text-xs) var(--font-sans)`,
									color: 'var(--color-text-secondary)',
								}}
							>
								{formatDate(new Date(n.updatedAt))}
							</span>
						</div>
					))}
					{eligible === 0 && (
						<EmptyState
							inset
							illustration="publish-empty"
							title={t('community.wiki.previewEmpty')}
						/>
					)}
					{eligible > 3 && (
						<div
							style={{
								font: `var(--text-xs) var(--font-sans)`,
								color: 'var(--color-text-secondary)',
							}}
						>
							{t('community.wiki.previewMore', { count: eligible - 3 })}
						</div>
					)}
				</div>
			</div>
			<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
				{t('community.wiki.previewNote')}
			</div>
		</Panel>
	);
}
