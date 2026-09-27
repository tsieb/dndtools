import { HPBar, Chip, ConditionBadge, IconButton, Input, Stat } from '../../ds';
import { T } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import { condKey } from './shared';

export function PlayerCombat({
	hp,
	maxHp,
	ac,
	speed,
	initiative,
	conditions,
	readOnly,
	hpAmount,
	setHpAmount,
	hpStep,
	stepHp,
}: {
	hp: number;
	maxHp: number;
	ac: number;
	speed: string | null;
	initiative: string | null;
	conditions: string[];
	readOnly: boolean;
	hpAmount: string;
	setHpAmount: (value: string) => void;
	hpStep: () => number;
	stepHp: (sign: 1 | -1) => Promise<void>;
}) {
	const { t } = useI18n();
	return (
		<section className="character-sheet-combat" aria-label={t('mapInspector.combat')}>
			<h2>{t('mapInspector.combat')}</h2>
			<div className="character-sheet-combat-stats">
				<Stat label={t('player.stat.ac')} value={String(ac)} icon="shield" />
				{/* speed / initiative — `data.*` sheet strings (edited on the Sheet tab); '—' until authored */}
				<Stat
					label={t('player.stat.speed')}
					value={speed ? t('player.stat.speedValue', { feet: speed ?? '' }) : '—'}
					icon="travel"
				/>
				<Stat label={t('player.stat.init')} value={initiative ?? '—'} icon="session-bolt" />
			</div>
			<div className="character-sheet-combat-controls">
				{/* HP stepper — real combat-resource write */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 'var(--space-2)',
						padding: 'var(--space-1-5) var(--space-3)',
						borderRadius: 'var(--radius-lg)',
						background: T.alt,
						border: `1px solid ${T.bd}`,
					}}
				>
					<IconButton
						icon="chevron-down"
						label={
							readOnly ? t('player.blockedPreview') : t('player.hp.damageBy', { amount: hpStep() })
						}
						variant="ghost"
						size="sm"
						aria-disabled={readOnly}
						onClick={readOnly ? undefined : () => void stepHp(-1)}
					/>
					<div style={{ textAlign: 'center', minWidth: 74 }}>
						<div
							style={{
								font: `700 var(--text-lg) ${T.mono}`,
								color: maxHp > 0 && hp / maxHp < 0.3 ? T.err : T.ink,
								lineHeight: 1,
							}}
						>
							{hp}
							<span style={{ font: `var(--text-sm) ${T.mono}`, color: T.ter }}> / {maxHp}</span>
						</div>
						<div style={{ font: `var(--text-xs) ${T.sans}`, letterSpacing: '.08em', color: T.ter }}>
							{t('player.hp.label')}
						</div>
					</div>
					<IconButton
						icon="chevron-up"
						label={
							readOnly ? t('player.blockedPreview') : t('player.hp.healBy', { amount: hpStep() })
						}
						variant="ghost"
						size="sm"
						aria-disabled={readOnly}
						onClick={readOnly ? undefined : () => void stepHp(1)}
					/>
					<Input
						type="text"
						inputMode="numeric"
						aria-label={t('player.hp.amountLabel')}
						value={hpAmount}
						onChange={(e) => setHpAmount(e.target.value)}
						onBlur={() => setHpAmount(String(hpStep()))}
						style={{
							width: 'var(--space-12)',
							textAlign: 'center',
							font: `600 var(--text-sm) ${T.mono}`,
							color: T.ink,
							background: T.surf,
							border: `1px solid ${T.bd}`,
							borderRadius: 'var(--radius-md)',
							padding: 'var(--space-1) var(--space-0-5)',
						}}
					/>
				</div>

				<div style={{ display: 'flex', gap: 'var(--space-1-5)', flexWrap: 'wrap' }}>
					{conditions.map((c: string) => {
						const k = condKey(c);
						return k ? (
							<ConditionBadge key={c} condition={k} compact />
						) : (
							<Chip key={c} tone="accent">
								{c}
							</Chip>
						);
					})}
				</div>
			</div>
			<HPBar current={hp} max={maxHp} size="lg" />
		</section>
	);
}
