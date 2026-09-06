import { availableSlots, type CharacterResources } from '@dndtools/core';
import { Badge, Button, EmptyState, Icon, SpellSlots } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import type { Dispatch } from './shared';

export function PlayerResources({
	charId,
	resources,
	actorId,
	compact,
	dispatch,
}: {
	charId: string;
	resources: CharacterResources | null;
	actorId: string;
	compact: boolean;
	dispatch: Dispatch;
}) {
	const { t } = useI18n();
	const r = resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
	const classResources = r ? Object.values(r.classResources) : [];
	const spells = r?.spells ?? [];
	const con = r?.concentration?.effect ? r.concentration : null;
	const death = r?.deathSaves ?? { successes: 0, failures: 0, stable: false };

	// Real spell-slot toggle: set the level's `expended` directly (manage path, not session-gated).
	const toggleSlot = (level: number, max: number, expended: number, idx: number) => {
		const avail = max - expended;
		const isFilled = idx < avail; // clicking a filled diamond expends it; an empty one recovers it
		const nextExpended = isFilled ? expended + 1 : Math.max(0, expended - 1);
		return dispatch({
			type: 'character.set-spell-slots',
			actorId,
			payload: { characterId: charId, level, max, expended: nextExpended },
		});
	};
	// Real class-resource toggle: set `expended` directly.
	const toggleResource = (res: CharacterResources['classResources'][string], idx: number) => {
		const cur = res.max - res.expended;
		const isFilled = idx < cur;
		const nextExpended = isFilled ? res.expended + 1 : Math.max(0, res.expended - 1);
		return dispatch({
			type: 'character.set-class-resource',
			actorId,
			payload: {
				characterId: charId,
				id: res.id,
				name: res.name,
				max: res.max,
				recharge: res.recharge,
				expended: nextExpended,
			},
		});
	};
	// Real prepared toggle: `character.set-spell` upserts the spell with the flipped flag (CHAR-008).
	const togglePrepared = (s: { id: string; name: string; level: number; prepared: boolean }) =>
		dispatch({
			type: 'character.set-spell',
			actorId,
			payload: {
				characterId: charId,
				id: s.id,
				name: s.name,
				level: s.level,
				prepared: !s.prepared,
			},
		});
	const rest = (kind: 'short' | 'long') =>
		dispatch({ type: 'character.rest', actorId, payload: { characterId: charId, rest: kind } });
	const dropConcentration = () =>
		dispatch({
			type: 'character.update-combat-resource',
			actorId,
			payload: { characterId: charId, kind: 'concentration', effect: null },
		});

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
				gap: 18,
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				{con && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							padding: '13px 16px',
							borderRadius: 12,
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
						}}
					>
						<Icon name="concentration" size="lg" color={T.acc} />
						<div style={{ flex: 1 }}>
							<div style={{ font: `700 14px ${T.disp}` }}>
								{t('player.vitals.concentrating', { effect: con.effect ?? '' })}
							</div>
							<div style={{ font: `12px ${T.sans}`, color: T.sub }}>
								{t('player.vitals.maintainedEffect')}
							</div>
						</div>
						<Button variant="ghost" size="sm" onClick={dropConcentration}>
							{t('player.vitals.drop')}
						</Button>
					</div>
				)}
				<Panel title={t('player.vitals.spellSlots')}>
					{slots.length === 0 ? (
						<EmptyState
							inset
							icon="sparkle"
							title={t('player.vitals.noSlotsTitle')}
							description={t('player.vitals.noSlotsBody')}
						/>
					) : (
						// The DS SpellSlots economy (same component as the roster sheet) — a pip click
						// spends/recovers through the same character.set-spell-slots write as before.
						<SpellSlots
							levels={slots.map((s) => ({
								level: s.level,
								total: s.max,
								used: s.max - availableSlots(s),
							}))}
							onToggle={(level: number, idx: number) => {
								const s = slots.find((x) => x.level === level);
								if (s) void toggleSlot(s.level, s.max, s.expended, idx);
							}}
						/>
					)}
				</Panel>
				<Panel title={t('player.vitals.classResources')}>
					{classResources.length === 0 ? (
						<EmptyState
							inset
							icon="sparkle"
							title={t('player.vitals.noResourcesTitle')}
							description={t('player.vitals.noResourcesBody')}
						/>
					) : (
						// Named resources keep round pips (the DS SpellSlots row is hard-labeled "Lvl N", which
						// misreads for a named resource) — but each pip mirrors SpellSlots' a11y contract.
						classResources.map((res, i) => {
							const cur = res.max - res.expended;
							return (
								<div
									key={res.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 11,
										padding: '9px 0',
										borderTop: i ? `1px solid ${T.bd}` : 'none',
									}}
								>
									<Icon name="sparkle" size={17} color={T.acc} />
									<div style={{ flex: 1 }}>
										<div style={{ font: `600 12.5px ${T.sans}` }}>{res.name}</div>
										<div style={{ font: `10.5px ${T.sans}`, color: T.ter }}>
											{t(
												res.recharge === 'short'
													? 'player.vitals.recoversShort'
													: 'player.vitals.recoversLong',
											)}
										</div>
									</div>
									{/* 13px pips failed WCAG 2.5.8 (24px minimum). Growing them is only safe together
									    with wrapping: `setClassResourceInput.max` is unbounded, the phone budget is
									    ~253px for name + pips, and 24N + 5(N−1) passes that at N=6. These are
									    contentless <button>s, so their min-content width was ~3px and they silently
									    SHRANK INTO SLIVERS instead of overflowing — which is why the responsive
									    clipped-control audit never flagged them. */}
									<div
										style={{
											display: 'flex',
											gap: 5,
											flexWrap: 'wrap',
											justifyContent: 'flex-end',
										}}
									>
										{Array.from({ length: res.max }).map((_, j) => (
											<button
												key={j}
												type="button"
												aria-label={t(
													j < cur ? 'player.vitals.useAvailable' : 'player.vitals.useExpended',
													{ name: res.name, index: j + 1 },
												)}
												aria-pressed={j < cur}
												onClick={() => toggleResource(res, j)}
												style={{
													width: 24,
													height: 24,
													flex: '0 0 auto',
													padding: 0,
													borderRadius: '50%',
													cursor: 'pointer',
													background: j < cur ? T.acc : 'transparent',
													border: `1.5px solid ${j < cur ? T.acc : T.bdS}`,
												}}
											/>
										))}
									</div>
									<span
										style={{ font: `12px ${T.mono}`, color: T.ter, width: 30, textAlign: 'right' }}
									>
										{cur}/{res.max}
									</span>
								</div>
							);
						})
					)}
				</Panel>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Panel
					title={t('player.vitals.deathSaves')}
					action={
						<Badge status={death.stable ? 'success' : 'neutral'}>
							{t(death.stable ? 'player.vitals.stable' : 'player.vitals.conscious')}
						</Badge>
					}
				>
					<div style={{ display: 'flex', gap: 24 }}>
						{(['successes', 'failures'] as const).map((k) => (
							<div key={k}>
								<div style={{ ...eb, color: k === 'failures' ? T.err : T.ok, marginBottom: 6 }}>
									{t(
										k === 'failures'
											? 'player.vitals.deathFailures'
											: 'player.vitals.deathSuccesses',
									)}
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
									style={{ display: 'flex', gap: 7, alignItems: 'center' }}
								>
									{Array.from({ length: 3 }).map((_, i) => (
										<span
											key={i}
											style={{
												width: 18,
												height: 18,
												borderRadius: '50%',
												background:
													i < death[k] ? (k === 'failures' ? T.err : T.ok) : 'transparent',
												border: `1.5px solid ${k === 'failures' ? T.err : T.ok}`,
											}}
										/>
									))}
									<span aria-hidden="true" style={{ font: `12px ${T.mono}`, color: T.ter }}>
										{death[k]}/3
									</span>
								</div>
							</div>
						))}
					</div>
				</Panel>
				<Panel
					title={t('player.vitals.rest')}
					action={
						<div style={{ display: 'flex', gap: 7 }}>
							<Button variant="secondary" size="sm" icon="recent" onClick={() => rest('short')}>
								{t('player.vitals.shortRest')}
							</Button>
							<Button variant="primary" size="sm" icon="theme" onClick={() => rest('long')}>
								{t('player.vitals.longRest')}
							</Button>
						</div>
					}
				>
					<div style={{ font: `12.5px/1.55 ${T.sans}`, color: T.sub }}>
						{t('player.vitals.restHelp')}
					</div>
				</Panel>
				<Panel
					title={t('player.vitals.preparedSpells', {
						count: spells.filter((s) => s.prepared).length,
					})}
				>
					{spells.length === 0 ? (
						<EmptyState
							inset
							icon="knowledge-book"
							title={t('player.vitals.noSpellsTitle')}
							description={t('player.vitals.noSpellsBody')}
						/>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
							{spells.map((s) => (
								<div
									key={s.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 10,
										padding: '8px 10px',
										borderRadius: 9,
										border: `1px solid ${T.bd}`,
										background: T.surf,
									}}
								>
									<span
										style={{
											width: 24,
											height: 24,
											borderRadius: 6,
											flex: '0 0 auto',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											font: `700 12px ${T.mono}`,
											background: T.alt,
											color: T.acc,
										}}
									>
										{s.level}
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<span style={{ display: 'block', font: `600 12.5px ${T.sans}` }}>{s.name}</span>
										{/* extended PreparedSpell detail fields — shown only when the record carries them */}
										{(s.school || s.castingTime || s.range || s.components || s.duration) && (
											<span
												style={{
													display: 'block',
													font: `11px ${T.sans}`,
													color: T.ter,
													marginTop: 1,
												}}
											>
												{[s.school, s.castingTime, s.range, s.components, s.duration]
													.filter(Boolean)
													.join(' · ')}
											</span>
										)}
									</div>
									{/* real prepared toggle → character.set-spell */}
									<button
										type="button"
										aria-pressed={s.prepared}
										onClick={() => togglePrepared(s)}
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 5,
											padding: '3px 9px',
											borderRadius: 14,
											cursor: 'pointer',
											font: `11px ${T.sans}`,
											border: `1px solid ${s.prepared ? T.accBd : T.bd}`,
											background: s.prepared ? T.accSub : T.surf,
											color: s.prepared ? T.acc : T.ter,
										}}
									>
										{s.prepared && <Icon name="check" size={12} />}
										{t(s.prepared ? 'player.vitals.prepared' : 'player.vitals.notPrepared')}
									</button>
								</div>
							))}
						</div>
					)}
				</Panel>
			</div>
		</div>
	);
}
