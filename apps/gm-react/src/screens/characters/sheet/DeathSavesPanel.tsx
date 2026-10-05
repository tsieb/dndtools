import { Badge } from '../../../ds';
import { Panel, T, eb } from '../../../app/screen-kit';
import { useI18n } from '../../../i18n';
import type { SheetSubject } from './subject';

/** Death saves — a readout for everyone; the core records them from rolls, never from this panel. */
export function DeathSavesPanel({ subject }: { subject: SheetSubject }) {
	const { t } = useI18n();
	const death = subject.resources?.deathSaves ?? { successes: 0, failures: 0, stable: false };
	return (
		<Panel
			title={t('player.vitals.deathSaves')}
			action={
				<Badge status={death.stable ? 'success' : 'neutral'}>
					{t(death.stable ? 'player.vitals.stable' : 'player.vitals.conscious')}
				</Badge>
			}
		>
			<div style={{ display: 'flex', gap: 'var(--space-6)' }}>
				{(['successes', 'failures'] as const).map((k) => (
					<div key={k}>
						<div
							style={{
								...eb,
								color: k === 'failures' ? T.err : T.ok,
								marginBottom: 'var(--space-1-5)',
							}}
						>
							{t(k === 'failures' ? 'player.vitals.deathFailures' : 'player.vitals.deathSuccesses')}
						</div>
						{/* The pips were filled-vs-transparent ONLY: colour as the sole carrier of the
								    state (WCAG 1.4.1), with no text equivalent anywhere (1.1.1), so the count
								    was simply unavailable to assistive tech and invisible under
								    forced-colors, which flattens both tints. One `role="img"` names the whole
								    group; the visible `n/3` gives every reader the number. */}
						<div
							role="img"
							aria-label={t(
								k === 'failures'
									? 'player.vitals.deathFailuresCount'
									: 'player.vitals.deathSuccessesCount',
								{ count: death[k] },
							)}
							style={{ display: 'flex', gap: 'var(--space-1-5)', alignItems: 'center' }}
						>
							{Array.from({ length: 3 }).map((_, i) => (
								<span
									key={i}
									style={{
										width: 18,
										height: 18,
										borderRadius: 'var(--radius-full)',
										background: i < death[k] ? (k === 'failures' ? T.err : T.ok) : 'transparent',
										border: `1.5px solid ${k === 'failures' ? T.err : T.ok}`,
									}}
								/>
							))}
							<span aria-hidden="true" style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}>
								{death[k]}/3
							</span>
						</div>
					</div>
				))}
			</div>
		</Panel>
	);
}
