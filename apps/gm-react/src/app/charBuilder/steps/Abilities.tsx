/**
 * CharBuilder — Step 3 — ability scores: standard array, point buy or manual, with the core rule surfaced.
 *
 * Split out of the former single-file `app/CharBuilder.tsx` (RC-STB-2.4) — a pure move, no
 * behaviour change.
 */
import { Button, IconButton, Select, Toaster } from '../../../ds';
import { Seg, T, eb } from '../../screen-kit';
import { BUILDER, modOf, type ScoreMethod } from '../data';
import type { Wizard } from '../wizard';

export function AbilitiesStep({ w }: { w: Wizard }) {
	const {
		isPhone,
		isPc,
		method,
		setMethod,
		scores,
		assign,
		setAssign,
		remainingArray,
		pointsLeft,
		scoreMin,
		scoreMax,
		setScore,
		raiseBlocked,
		effScores,
		abilityValidation,
		standardIncomplete,
		setAc,
	} = w;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
				<Seg
					value={method}
					onChange={(v) => setMethod(v as ScoreMethod)}
					options={BUILDER.methods.map((m) => ({ value: m.id, label: m.label }))}
					ariaLabel="Ability score method"
				/>
				<span style={{ font: `12px ${T.sans}`, color: T.ter }}>
					{BUILDER.methods.find((m) => m.id === method)?.note}
				</span>
				{method === 'pointbuy' && (
					<span
						style={{
							marginLeft: 'auto',
							font: `12px ${T.mono}`,
							color: pointsLeft < 0 ? T.err : T.acc,
							padding: '4px 10px',
							borderRadius: 20,
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
						}}
					>
						{pointsLeft} points left
					</span>
				)}
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: isPhone ? 'repeat(2,minmax(0,1fr))' : 'repeat(6,1fr)',
					gap: 10,
				}}
			>
				{BUILDER.abilityKeys.map((k) => (
					<div
						key={k}
						style={{
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							gap: 8,
							padding: '12px 8px',
							borderRadius: 11,
							background: T.surf,
							border: `1px solid ${T.bd}`,
						}}
					>
						<span style={{ ...eb }}>{k}</span>
						{method === 'standard' ? (
							<Select
								value={assign[k]}
								onChange={(e: any) => setAssign((s) => ({ ...s, [k]: e.target.value }))}
								options={[
									{ value: '', label: '—' },
									...remainingArray(k).map((v) => ({
										value: String(v),
										label: String(v),
									})),
								]}
								aria-label={`${k} score`}
								style={{ width: '100%', textAlign: 'center' }}
							/>
						) : (
							<>
								<span style={{ font: `700 22px ${T.mono}`, color: T.ink }}>{scores[k]}</span>
								<div style={{ display: 'flex', gap: 4 }}>
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
								font: `12px ${T.mono}`,
								color: T.sub,
								padding: '2px 9px',
								borderRadius: 20,
								background: T.alt,
							}}
						>
							{modOf(method === 'standard' ? Number(assign[k] || 10) : scores[k])}
						</span>
					</div>
				))}
			</div>
			{((abilityValidation && !abilityValidation.valid) || standardIncomplete) && (
				<ul
					role="alert"
					style={{ margin: 0, paddingLeft: 18, font: `12.5px ${T.sans}`, color: T.warn }}
				>
					{standardIncomplete && (
						<li>
							Assign all six standard-array values before continuing (unassigned abilities would be
							saved as 10).
						</li>
					)}
					{abilityValidation?.valid === false &&
						abilityValidation.issues.map((iss, j) => (
							<li key={`${iss.fieldId ?? 'step'}-${j}`}>{iss.message}</li>
						))}
				</ul>
			)}
			{isPc && method === 'manual' && (
				<div style={{ font: `11.5px ${T.sans}`, color: T.ter }}>
					A guided PC uses standard point buy — each score 8–15, 27 points total.
				</div>
			)}
			<div
				style={{
					display: 'flex',
					gap: 14,
					padding: '12px 14px',
					borderRadius: 11,
					background: T.alt,
					border: `1px solid ${T.bd}`,
					flexWrap: 'wrap',
					alignItems: 'center',
				}}
			>
				<span style={{ font: `12.5px ${T.sans}`, color: T.sub }}>Derived suggestions</span>
				<span style={{ font: `12px ${T.mono}`, color: T.ter }}>
					Initiative {modOf(effScores.DEX)}
				</span>
				<span style={{ font: `12px ${T.mono}`, color: T.ter }}>
					Unarmored AC {10 + Math.floor((effScores.DEX - 10) / 2)}
				</span>
				<span style={{ font: `12px ${T.mono}`, color: T.ter }}>CON mod {modOf(effScores.CON)}</span>
				{/* Was a bare `padding: 0` text button ~15px tall with no hover or active state —
									    under the 24px WCAG 2.5.8 floor for a control that rewrites the AC. */}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						setAc(10 + Math.floor((effScores.DEX - 10) / 2));
						Toaster.info('AC set from DEX');
					}}
				>
					Apply to kit →
				</Button>
			</div>
		</div>
	);
}
