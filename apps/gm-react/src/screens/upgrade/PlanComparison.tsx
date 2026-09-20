import { Icon } from '../../ds';
import { T, eb } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import type { EntitlementsValue, PlanCard } from '../../cloud/entitlements';
import { MatrixCell, PLANS } from './PlanDialogs';

export function PlanComparison({
	ent,
	priceStr,
	perStr,
}: {
	ent: EntitlementsValue;
	priceStr: (plan: PlanCard) => string;
	perStr: (plan: PlanCard) => string;
}) {
	const { t } = useI18n();
	const matrix = ent.features;
	const planId = ent.plan;
	return (
		<div
			role="region"
			aria-label={t('upgrade.matrix.region')}
			tabIndex={0}
			style={{
				borderRadius: T.radius.xl,
				border: `1px solid ${T.bd}`,
				background: T.raised,
				overflowX: 'auto',
				marginTop: T.space.two,
			}}
		>
			<div role="table" aria-label={t('upgrade.matrix.region')} style={{ minWidth: 620 }}>
				<div
					role="row"
					style={{
						display: 'grid',
						gridTemplateColumns: '1.7fr 1fr 1fr 1fr',
						alignItems: 'end',
						gap: T.space.zero,
						padding: 'var(--space-4) var(--space-5)',
						borderBottom: `1px solid ${T.bdS}`,
						background: T.surf,
					}}
				>
					<div role="columnheader" style={{ font: `700 var(--text-sm) ${T.sans}`, color: T.ink }}>
						{t('upgrade.matrix.title')}
						{ent.source !== 'server' && (
							<span
								style={{
									display: 'block',
									font: `400 var(--text-sm) ${T.sans}`,
									color: T.ter,
									marginTop: T.space.half,
								}}
							>
								{ent.source === 'cache' ? t('upgrade.matrix.cache') : t('upgrade.matrix.offline')}
							</span>
						)}
					</div>
					{PLANS.map((pl) => (
						<div key={pl.id} role="columnheader" style={{ textAlign: 'center' }}>
							<div
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: T.space.oneHalf,
									font: `700 var(--text-sm) ${T.sans}`,
									color: pl.id === planId ? T.acc : T.ink,
								}}
							>
								{pl.cloud && <Icon name="connection" size={12} color={T.acc} />}
								{pl.name}
							</div>
							<div
								style={{ font: `var(--text-sm) ${T.mono}`, color: T.ter, marginTop: T.space.half }}
							>
								{priceStr(pl)}
								{perStr(pl)}
							</div>
						</div>
					))}
				</div>
				{matrix.map((grp) => (
					<div key={grp.group} role="rowgroup">
						<div
							role="row"
							style={{
								background: T.alt,
								borderBottom: `1px solid ${T.bd}`,
							}}
						>
							<div
								role="columnheader"
								aria-colspan={4}
								style={{
									padding: 'var(--space-3) var(--space-5) var(--space-1-5)',
									...eb,
									color: T.ter,
								}}
							>
								{grp.group}
							</div>
						</div>
						{grp.rows.map((r, i) => (
							<div
								key={r.label}
								role="row"
								style={{
									display: 'grid',
									gridTemplateColumns: '1.7fr 1fr 1fr 1fr',
									alignItems: 'center',
									padding: 'var(--space-3) var(--space-5)',
									borderBottom: i === grp.rows.length - 1 ? 'none' : `1px solid ${T.bd}`,
								}}
							>
								<div
									role="rowheader"
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: T.space.two,
										font: `var(--text-sm) ${T.sans}`,
										color: T.ink,
									}}
								>
									{r.label}
									{r.cloud && (
										<span
											title={t('upgrade.matrix.cloudOnly')}
											style={{
												display: 'inline-flex',
												alignItems: 'center',
												gap: T.space.one,
												font: `600 var(--text-sm) ${T.sans}`,
												letterSpacing: '.04em',
												textTransform: 'uppercase',
												color: T.acc,
												background: T.accSub,
												border: `1px solid ${T.accBd}`,
												borderRadius: T.radius.sm,
												padding: 'var(--space-0-5) var(--space-1)',
											}}
										>
											<Icon name="connection" size={9} />
											{t('upgrade.cloud')}
										</span>
									)}
								</div>
								<div role="cell" style={{ textAlign: 'center' }}>
									<MatrixCell v={r.hearth} />
								</div>
								<div role="cell" style={{ textAlign: 'center' }}>
									<MatrixCell v={r.lantern} accent={r.cloud} />
								</div>
								<div role="cell" style={{ textAlign: 'center' }}>
									<MatrixCell v={r.beacon} accent={r.cloud} />
								</div>
							</div>
						))}
					</div>
				))}
			</div>
		</div>
	);
}
