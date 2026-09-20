/**
 * CharBuilder — Step 3 — ability scores: standard array, point buy, a 4d6 roll or manual, with the
 * core rule surfaced.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4). RC-CHR-5.2 added the roll
 * method, the class-priority suggestion and slot swapping (`../scores`). The methods offered come
 * from the wizard, not the table: a guided PC has no roll, because the core's CHAR-002 flow refuses
 * scores the point-buy budget does not cover (DEBT-2026-006).
 */
import { Button, IconButton, Select, Toaster } from '../../../ds';
import type { DSChangeEvent } from '../../../ds';
import { Seg, T, eb, srOnly } from '../../screen-kit';
import { BUILDER, modOf, type ScoreMethod } from '../data';
import { slotHolder } from '../scores';
import type { Wizard } from '../wizard';
import { useI18n } from '../../../i18n';

export function AbilitiesStep({ w }: { w: Wizard }) {
	const { t } = useI18n();
	const {
		isPhone,
		isPc,
		clsObj,
		method,
		setMethod,
		methodChoices,
		scores,
		pool,
		rolls,
		assign,
		setSlot,
		rollScores,
		suggestScores,
		pointsLeft,
		scoreMin,
		scoreMax,
		setScore,
		raiseBlocked,
		effScores,
		abilityValidation,
		poolIncomplete,
		setAc,
	} = w;
	const incompleteMessage =
		method === 'roll'
			? t(rolls ? 'charBuilder.rollIncomplete' : 'charBuilder.rollFirst')
			: t('charBuilder.standardIncomplete');
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
			<div
				style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}
			>
				<Seg
					value={method}
					onChange={(v) => setMethod(v as ScoreMethod)}
					options={methodChoices.map((m) => ({ value: m.id, label: t(m.label) }))}
					ariaLabel={t('charBuilder.scoreMethod')}
				/>
				<span style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
					{t(methodChoices.find((m) => m.id === method)?.note ?? 'charBuilder.method.standardNote')}
				</span>
				{method === 'pointbuy' && (
					<span
						role="status"
						style={{
							marginLeft: 'auto',
							font: `var(--text-xs) ${T.mono}`,
							color: pointsLeft < 0 ? T.err : T.acc,
							padding: 'var(--space-1) var(--space-2)',
							borderRadius: 'var(--radius-xl)',
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
						}}
					>
						{t('charBuilder.pointsLeft', { points: pointsLeft })}
					</span>
				)}
				{pool && pool.length > 0 && (
					<Button variant="ghost" size="sm" onClick={suggestScores} style={{ marginLeft: 'auto' }}>
						{t('charBuilder.suggestFor', { class: clsObj.name })}
					</Button>
				)}
			</div>
			{method === 'roll' && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: T.space.three,
						flexWrap: 'wrap',
						padding: `${T.space.three} ${T.space.four}`,
						borderRadius: T.radius.lg,
						background: T.alt,
						border: `1px solid ${T.bd}`,
					}}
				>
					{/* Secondary, not primary: the wizard's footer already owns the one accent-filled
					    primary in this overlay (RC-ENG-8.4's emphasis lint). The dice icon, the
					    highlighted panel and the "roll before continuing" alert carry the affordance. */}
					<Button variant="secondary" size="sm" icon="dice" onClick={rollScores}>
						{t(rolls ? 'charBuilder.reroll' : 'charBuilder.rollScores')}
					</Button>
					{rolls && (
						<ul
							aria-label={t('charBuilder.rolledScores')}
							style={{
								display: 'flex',
								flexWrap: 'wrap',
								gap: T.space.two,
								listStyle: 'none',
								margin: T.space.zero,
								padding: T.space.zero,
							}}
						>
							{rolls.map((r, j) => (
								<li
									key={j}
									style={{
										display: 'flex',
										alignItems: 'baseline',
										gap: T.space.oneHalf,
										padding: `${T.space.one} ${T.space.three}`,
										borderRadius: T.radius.full,
										background: T.surf,
										border: `1px solid ${T.bd}`,
									}}
								>
									<span
										aria-hidden="true"
										style={{ font: `700 var(--text-base) ${T.mono}`, color: T.ink }}
									>
										{r.total}
									</span>
									<span
										aria-hidden="true"
										style={{
											display: 'inline-flex',
											gap: T.space.one,
											font: `var(--text-xs) ${T.mono}`,
											color: T.sub,
										}}
									>
										{r.dice.map((d, n) => (
											<span
												key={n}
												style={
													n === r.dropped
														? { textDecoration: 'line-through', color: T.ter }
														: undefined
												}
											>
												{d}
											</span>
										))}
									</span>
									<span style={srOnly}>
										{t('charBuilder.rollDetail', {
											total: r.total,
											dice: r.dice.join(', '),
											dropped: r.dice[r.dropped] ?? 0,
										})}
									</span>
								</li>
							))}
						</ul>
					)}
					<div role="status" style={srOnly}>
						{rolls
							? t('charBuilder.rollAnnounce', {
									totals: rolls.map((r) => r.total).join(', '),
									class: clsObj.name,
								})
							: ''}
					</div>
				</div>
			)}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? 'repeat(2,minmax(0,1fr))' : 'repeat(6,1fr)',
					gap: 'var(--space-2)',
				}}
			>
				{BUILDER.abilityKeys.map((k) => (
					<div
						key={k}
						style={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: 'var(--space-2)',
							padding: 'var(--space-3) var(--space-2)',
							borderRadius: 'var(--radius-lg)',
							background: T.surf,
							border: `1px solid ${T.bd}`,
						}}
					>
						<span style={{ ...eb }}>{k}</span>
						{pool ? (
							// Every pool value is offered on every ability: one already placed elsewhere is
							// labelled as a swap, so a fully assigned pool can be rearranged in one pick.
							<Select
								value={assign[k]}
								onChange={(e: DSChangeEvent) => setSlot(k, e.target.value)}
								options={[
									{ value: '', label: '—' },
									...pool.map((v, slot) => {
										const holder = slotHolder(assign, String(slot));
										return {
											value: String(slot),
											label:
												holder && holder !== k
													? t('charBuilder.swapWith', { value: v, ability: holder })
													: String(v),
										};
									}),
								]}
								disabled={pool.length === 0}
								aria-label={`${k} score`}
								style={{ width: '100%', textAlign: 'center' }}
							/>
						) : (
							<>
								<span style={{ font: `700 var(--text-lg) ${T.mono}`, color: T.ink }}>
									{scores[k]}
								</span>
								<div style={{ display: 'flex', gap: 'var(--space-1)' }}>
									{/* Both bounds used to be enforced only inside the handler (or by the
														    clamp in `setScore`), so at the point-buy ceiling or at score 8 the
														    button looked and hovered exactly like a live one and silently did
														    nothing — the "points left" pill didn't move either. IconButton's
														    soft disable keeps the label reachable and says why. */}
									<IconButton
										icon="Minus"
										label={
											scores[k] <= scoreMin
												? `Lower ${k} — already at the minimum of ${scoreMin}`
												: `Lower ${k}`
										}
										variant="outline"
										size="sm"
										aria-disabled={scores[k] <= scoreMin || undefined}
										onClick={() => setScore(k, scores[k] - 1)}
									/>
									<IconButton
										icon="add"
										label={
											raiseBlocked(k)
												? `Raise ${k} — not enough points left`
												: scores[k] >= scoreMax
													? `Raise ${k} — already at the maximum of ${scoreMax}`
													: `Raise ${k}`
										}
										variant="outline"
										size="sm"
										aria-disabled={raiseBlocked(k) || scores[k] >= scoreMax || undefined}
										onClick={() => setScore(k, scores[k] + 1)}
									/>
								</div>
							</>
						)}
						<span
							style={{
								font: `var(--text-xs) ${T.mono}`,
								color: T.sub,
								padding: 'var(--space-0-5) var(--space-2)',
								borderRadius: 'var(--radius-xl)',
								background: T.alt,
							}}
						>
							{modOf(effScores[k])}
						</span>
					</div>
				))}
			</div>
			{((abilityValidation && !abilityValidation.valid) || poolIncomplete) && (
				<ul
					role="alert"
					style={{
						margin: 'var(--space-0)',
						paddingLeft: 'var(--space-4)',
						font: `var(--text-sm) ${T.sans}`,
						color: T.warn,
					}}
				>
					{poolIncomplete && <li>{incompleteMessage}</li>}
					{!poolIncomplete &&
						abilityValidation?.valid === false &&
						abilityValidation.issues.map((iss, j) => (
							<li key={`${iss.fieldId ?? 'step'}-${j}`}>{iss.message}</li>
						))}
				</ul>
			)}
			{/* Point buy's own method note already states the rule; every other PC method needs it said,
			    including WHY there is no roll to pick here (the core would refuse it at finalize). */}
			{isPc && method !== 'pointbuy' && (
				<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.ter }}>
					{t('charBuilder.pcUsesPointBuy')}
				</div>
			)}
			<div
				style={{
					display: 'flex',
					gap: 'var(--space-3)',
					padding: 'var(--space-3) var(--space-3)',
					borderRadius: 'var(--radius-lg)',
					background: T.alt,
					border: `1px solid ${T.bd}`,
					flexWrap: 'wrap',
					alignItems: 'center',
				}}
			>
				<span style={{ font: `var(--text-sm) ${T.sans}`, color: T.sub }}>
					{t('charBuilder.derivedSuggestions')}
				</span>
				<span style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}>
					{t('charBuilder.initiative', { value: modOf(effScores.DEX) })}
				</span>
				<span style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}>
					{t('charBuilder.unarmoredAc', { value: 10 + Math.floor((effScores.DEX - 10) / 2) })}
				</span>
				<span style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}>
					{t('charBuilder.conMod', { value: modOf(effScores.CON) })}
				</span>
				{/* Was a bare `padding: 0` text button ~15px tall with no hover or active state —
									    under the 24px WCAG 2.5.8 floor for a control that rewrites the AC. */}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						setAc(10 + Math.floor((effScores.DEX - 10) / 2));
						Toaster.info(t('charBuilder.acFromDex'));
					}}
				>
					{t('charBuilder.applyToKit')}
				</Button>
			</div>
		</div>
	);
}
