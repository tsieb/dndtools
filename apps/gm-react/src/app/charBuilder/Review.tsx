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
				gap: 18,
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
					<Avatar name={name || 'New'} size="xl" ring="turn" />
					<div style={{ minWidth: 0 }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
							<span style={{ font: `700 20px ${T.disp}` }}>{name || 'Unnamed'}</span>
							<Badge status={KIND_TONE[kind]}>{t(KIND_LABEL[kind])}</Badge>
							<VisibilityChip
								level={isPc ? 'shared' : vis === 'players' ? 'players' : 'dm-only'}
								compact
							/>
						</div>
						<div style={{ font: `13px ${T.sans}`, color: T.sub, marginTop: 3 }}>{subLine}</div>
						<div style={{ font: `12px ${T.sans}`, color: T.ter }}>
							{align} · {bgObj.name}
						</div>
						{isPc && (
							<div style={{ font: `12px ${T.sans}`, color: T.ter, marginTop: 2 }}>
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
						gap: 8,
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
							font: `12.5px/1.5 ${T.sans}`,
							color: T.err,
							padding: '10px 12px',
							borderRadius: 10,
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
					gap: 12,
					padding: 16,
					borderRadius: 12,
					background: T.surf,
					border: `1px solid ${T.accBd}`,
					boxShadow: T.smd,
				}}
			>
				<div style={{ display: 'flex', gap: 18 }}>
					{(
						[
							['AC', String(ac), 'shield'],
							['HP', String(hp), 'heart'],
							['Speed', `${speed}ft`, 'travel'],
							['Init', modOf(effScores.DEX), 'session-bolt'],
						] as const
					).map(([l, v, ic]) => (
						<div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
							<span style={{ display: 'flex', alignItems: 'center', gap: 5, ...eb }}>
								<Icon name={ic} size={12} color={T.acc} />
								{l}
							</span>
							<span style={{ font: `700 16px ${T.mono}`, color: T.ink }}>{v}</span>
						</div>
					))}
				</div>
				<div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>
					<div style={{ ...eb, marginBottom: 6 }}>
						{t('charBuilder.attacksCount', {
							count: attacks.filter((a) => a.name.trim()).length,
						})}
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
						{attacks
							.filter((a) => a.name.trim())
							.map((a, idx) => (
								<div
									key={idx}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										font: `12.5px ${T.sans}`,
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
							<span style={{ font: `12.5px ${T.sans}`, color: T.ter }}>
								{t('charBuilder.noAttacks')}
							</span>
						)}
					</div>
				</div>
				{bio && (
					<div
						style={{
							font: `12.5px/1.55 ${T.sans}`,
							color: T.sub,
							borderTop: `1px solid ${T.bd}`,
							paddingTop: 10,
						}}
					>
						{bio}
					</div>
				)}
			</div>
		</div>
	);
}
