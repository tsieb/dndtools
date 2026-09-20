/**
 * CharBuilder — Step 6 — review: the finished character as it will be created, and any create error.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { AbilityScore, Avatar, Badge, Icon, VisibilityChip } from '../../ds';
import { T, eb, mono } from '../screen-kit';
import { BUILDER, KIND_LABEL, KIND_TONE, modOf } from './data';
import type { Wizard } from './wizard';
import { useI18n } from '../../i18n';

export function ReviewStep({ w }: { w: Wizard }) {
	const { t } = useI18n();
	const {
		isPhone,
		isPc,
		players,
		name,
		kind,
		vis,
		align,
		bgObj,
		ownerId,
		subLine,
		effScores,
		ac,
		hp,
		speed,
		attacks,
		bio,
		error,
	} = w;
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
				gap: 'var(--space-4)',
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
					<Avatar name={name || 'New'} size="xl" ring="turn" />
					<div style={{ minWidth: 0 }}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								flexWrap: 'wrap',
							}}
						>
							<span style={{ font: `700 var(--text-lg) ${T.sans}` }}>{name || 'Unnamed'}</span>
							<Badge status={KIND_TONE[kind]}>{t(KIND_LABEL[kind])}</Badge>
							<VisibilityChip
								level={isPc ? 'shared' : vis === 'players' ? 'players' : 'dm-only'}
								compact
							/>
						</div>
						<div
							style={{
								font: `var(--text-sm) ${T.sans}`,
								color: T.sub,
								marginTop: 'var(--space-0-5)',
							}}
						>
							{subLine}
						</div>
						<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
							{align} · {bgObj.name}
						</div>
						{isPc && (
							<div
								style={{
									font: `var(--text-xs) ${T.sans}`,
									color: T.ter,
									marginTop: 'var(--space-0-5)',
								}}
							>
								{t('charBuilder.ownedBy', {
									name: players.find((p) => p.id === ownerId)?.displayName ?? '—',
								})}
							</div>
						)}
					</div>
				</div>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: isPhone ? 'repeat(3,minmax(0,1fr))' : 'repeat(6,1fr)',
						gap: 'var(--space-2)',
					}}
				>
					{BUILDER.abilityKeys.map((k) => (
						<AbilityScore key={k} label={k} score={effScores[k]} size="sm" />
					))}
				</div>
				{error && (
					<div
						role="alert"
						style={{
							font: `var(--text-sm)/1.5 ${T.sans}`,
							color: T.err,
							padding: 'var(--space-2) var(--space-3)',
							borderRadius: 'var(--radius-lg)',
							border: `1px solid ${T.err}`,
						}}
					>
						{error}
					</div>
				)}
			</div>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-3)',
					padding: 'var(--space-4)',
					borderRadius: 'var(--radius-lg)',
					background: T.surf,
					border: `1px solid ${T.accBd}`,
					boxShadow: T.smd,
				}}
			>
				<div style={{ display: 'flex', gap: 'var(--space-4)' }}>
					{(
						[
							['AC', String(ac), 'shield'],
							['HP', String(hp), 'heart'],
							['Speed', `${speed}ft`, 'travel'],
							['Init', modOf(effScores.DEX), 'session-bolt'],
						] as const
					).map(([l, v, ic]) => (
						<div
							key={l}
							style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}
						>
							<span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', ...eb }}>
								<Icon name={ic} size={12} color={T.acc} />
								{l}
							</span>
							<span style={{ font: `700 var(--text-base) ${T.mono}`, color: T.ink }}>{v}</span>
						</div>
					))}
				</div>
				<div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 'var(--space-2)' }}>
					<div style={{ ...eb, marginBottom: 'var(--space-1-5)' }}>
						{t('charBuilder.attacksCount', {
							count: attacks.filter((a) => a.name.trim()).length,
						})}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
						{attacks
							.filter((a) => a.name.trim())
							.map((a, idx) => (
								<div
									key={idx}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-2)',
										font: `var(--text-sm) ${T.sans}`,
										color: T.sub,
									}}
								>
									<Icon name="sword" size={13} color={T.ter} />
									<span style={{ flex: 1 }}>{a.name}</span>
									<span style={mono}>{a.hit}</span>
									<span style={{ ...mono, color: T.ter }}>{a.dmg}</span>
								</div>
							))}
						{!attacks.filter((a) => a.name.trim()).length && (
							<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter }}>
								{t('charBuilder.noAttacks')}
							</span>
						)}
					</div>
				</div>
				{bio && (
					<div
						style={{
							font: `var(--text-sm)/1.55 ${T.sans}`,
							color: T.sub,
							borderTop: `1px solid ${T.bd}`,
							paddingTop: 'var(--space-2)',
						}}
					>
						{bio}
					</div>
				)}
			</div>
		</div>
	);
}
