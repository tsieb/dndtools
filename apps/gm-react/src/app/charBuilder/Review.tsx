/**
 * CharBuilder — Step 6 — review: the finished character as it will be created, and any create error.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change. RC-ENG-8.8 — the card states what the sheet will hold: the scores WITH the
 * ancestry bonus, initiative, the class's hit dice and its proficient saving throws.
 */
import { derivedProficiencyBonus } from '@dndtools/core';
import { AbilityScore, Avatar, Badge, Icon, VisibilityChip } from '../../ds';
import { T, eb, mono } from '../screen-kit';
import { BUILDER, KIND_LABEL, KIND_TONE, classSaveIds, modOf } from './data';
import type { AbilityKey } from './data';
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
		clsObj,
		level,
	} = w;
	// The sheet derives the proficiency bonus from the level the same way (5e progression).
	const profBonus = derivedProficiencyBonus(level);
	const saves = classSaveIds(clsObj)
		.map((id) => {
			const k = id.toUpperCase() as AbilityKey;
			const total = Math.floor((effScores[k] - 10) / 2) + profBonus;
			return `${k} ${total >= 0 ? '+' : ''}${total}`;
		})
		.join(', ');
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
				<dl
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						gap: 'var(--space-1) var(--space-4)',
						margin: 'var(--space-0)',
						font: `var(--text-xs) ${T.mono}`,
						color: T.sub,
					}}
				>
					<div style={{ display: 'flex', gap: 'var(--space-1)' }}>
						<dt style={eb}>{t('charBuilder.reviewHitDice')}</dt>
						<dd style={{ margin: 'var(--space-0)' }}>
							{level}
							{clsObj.hd}
						</dd>
					</div>
					<div style={{ display: 'flex', gap: 'var(--space-1)' }}>
						<dt style={eb}>{t('charBuilder.reviewSaves')}</dt>
						<dd style={{ margin: 'var(--space-0)' }}>{saves}</dd>
					</div>
				</dl>
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
