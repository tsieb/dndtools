import { useState } from 'react';
import { availableSlots, type CharacterResources, type ResourceInstance } from '@dndtools/core';
import { Badge, Button, EmptyState, Icon, SpellSlots } from '../../ds';
import { Panel, T, eb } from '../../app/screen-kit';
import { CharacterResourcesPanel } from '../../app/character/Resources';
import { RestDialog, type RestSubject } from '../../app/character/RestDialog';
import { useI18n } from '../../i18n';
import type { Dispatch } from './shared';

export function PlayerResources({
	charId,
	resources,
	resourceInstances,
	canManageResources,
	actorId,
	compact,
	restSubject,
	dispatch,
}: {
	charId: string;
	resources: CharacterResources | null;
	/** RC-CHR-1.1 — every resource the active system package declares for this character. */
	resourceInstances: ResourceInstance[];
	canManageResources: boolean;
	actorId: string;
	compact: boolean;
	/**
	 * RC-CHR-1.2 — what the rest dialog needs about this character (hit dice, hit points, exhaustion).
	 * Null while no character is resolved, which is also when the rest controls are not offered.
	 */
	restSubject: RestSubject | null;
	dispatch: Dispatch;
}) {
	const { t } = useI18n();
	// RC-CHR-1.2 — resting used to be two buttons that fired immediately and said nothing. The rest
	// they open now asks how many hit dice to spend and states what the answer will do first.
	const [restKind, setRestKind] = useState<'short' | 'long' | null>(null);
	const r = resources;
	const slots = r ? Object.values(r.spellSlots).sort((a, b) => a.level - b.level) : [];
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
	const rest = (choice: {
		rest: 'short' | 'long';
		hitDice?: { spend: number; mode: 'roll' | 'average' };
	}) =>
		dispatch({
			type: 'character.rest',
			actorId,
			payload: { characterId: charId, ...choice },
		});
	const dropConcentration = () =>
		dispatch({
			type: 'character.update-combat-resource',
			actorId,
			payload: { characterId: charId, kind: 'concentration', effect: null },
		});
	// RC-CHR-1.3 — damage taken while concentrating raises a check. The core states the DC; the
	// player rolls it at the table and reports which way it went. Nothing here rolls or decides.
	const concentrationCheck = con?.check ?? null;
	const resolveCheck = (outcome: 'kept' | 'lost') =>
		dispatch({
			type: 'character.update-combat-resource',
			actorId,
			payload: { characterId: charId, kind: 'concentration-check', outcome },
		});

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: compact ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
				gap: 'var(--space-4)',
				alignItems: 'start',
			}}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
				{con && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-3)',
							padding: 'var(--space-3) var(--space-4)',
							borderRadius: 'var(--radius-lg)',
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
						}}
					>
						<Icon name="concentration" size="lg" color={T.acc} />
						<div style={{ flex: 1 }}>
							<div style={{ font: `700 var(--text-sm) ${T.sans}` }}>
								{t('player.vitals.concentrating', { effect: con.effect ?? '' })}
							</div>
							<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t('player.vitals.maintainedEffect')}
							</div>
						</div>
						<Button variant="ghost" size="sm" onClick={dropConcentration}>
							{t('player.vitals.drop')}
						</Button>
					</div>
				)}
				{concentrationCheck && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							flexWrap: 'wrap',
							gap: 'var(--space-3)',
							padding: 'var(--space-3) var(--space-4)',
							borderRadius: 'var(--radius-lg)',
							background: T.accSub,
							border: `1px solid ${T.accBd}`,
						}}
					>
						<div style={{ flex: 1, minWidth: 160 }}>
							<div style={{ font: `700 var(--text-sm) ${T.sans}` }}>
								{t('player.vitals.concCheck', { dc: concentrationCheck.dc })}
							</div>
							<div style={{ font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
								{t('player.vitals.concCheckHelp', { damage: concentrationCheck.damage })}
							</div>
						</div>
						<Button variant="secondary" size="sm" onClick={() => void resolveCheck('kept')}>
							{t('player.vitals.concKept')}
						</Button>
						<Button variant="ghost" size="sm" onClick={() => void resolveCheck('lost')}>
							{t('player.vitals.concLost')}
						</Button>
					</div>
				)}
				<Panel title={t('player.vitals.spellSlots')}>
					{slots.length === 0 ? (
						<EmptyState
							inset
							illustration="spells-empty"
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
				{/* RC-CHR-1.1 — the class-resource economy moved to `app/character/Resources.tsx`, driven
				    by the ACTIVE system package rather than by whatever was copied onto the sheet: a monk's
				    ki and a Generic stress clock are the same rows here, and a level-up moves the maxima. */}
				<CharacterResourcesPanel
					characterId={charId}
					actorId={actorId}
					resources={resourceInstances}
					canManage={canManageResources}
					compact={compact}
					dispatch={dispatch}
				/>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
									style={{ display: 'flex', gap: 'var(--space-1-5)', alignItems: 'center' }}
								>
									{Array.from({ length: 3 }).map((_, i) => (
										<span
											key={i}
											style={{
												width: 18,
												height: 18,
												borderRadius: 'var(--radius-full)',
												background:
													i < death[k] ? (k === 'failures' ? T.err : T.ok) : 'transparent',
												border: `1.5px solid ${k === 'failures' ? T.err : T.ok}`,
											}}
										/>
									))}
									<span
										aria-hidden="true"
										style={{ font: `var(--text-xs) ${T.mono}`, color: T.ter }}
									>
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
						<div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
							<Button
								variant="secondary"
								size="sm"
								icon="recent"
								disabled={!restSubject}
								onClick={() => setRestKind('short')}
							>
								{t('player.vitals.shortRest')}
							</Button>
							<Button
								variant="primary"
								size="sm"
								icon="theme"
								disabled={!restSubject}
								onClick={() => setRestKind('long')}
							>
								{t('player.vitals.longRest')}
							</Button>
						</div>
					}
				>
					<div style={{ font: `var(--text-sm)/1.55 ${T.sans}`, color: T.sub }}>
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
							illustration="spells-empty"
							title={t('player.vitals.noSpellsTitle')}
							description={t('player.vitals.noSpellsBody')}
						/>
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
							{spells.map((s) => (
								<div
									key={s.id}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 'var(--space-2)',
										padding: 'var(--space-2) var(--space-2)',
										borderRadius: 'var(--radius-md)',
										border: `1px solid ${T.bd}`,
										background: T.surf,
									}}
								>
									<span
										style={{
											width: 24,
											height: 24,
											borderRadius: 'var(--radius-md)',
											flex: '0 0 auto',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											font: `700 var(--text-xs) ${T.mono}`,
											background: T.alt,
											color: T.acc,
										}}
									>
										{s.level}
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<span style={{ display: 'block', font: `600 var(--text-sm) ${T.sans}` }}>
											{s.name}
										</span>
										{/* extended PreparedSpell detail fields — shown only when the record carries them */}
										{(s.school || s.castingTime || s.range || s.components || s.duration) && (
											<span
												style={{
													display: 'block',
													font: `var(--text-xs) ${T.sans}`,
													color: T.ter,
													marginTop: 'var(--space-0-5)',
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
											gap: 'var(--space-1)',
											padding: 'var(--space-0-5) var(--space-2)',
											borderRadius: 'var(--radius-lg)',
											cursor: 'pointer',
											font: `var(--text-xs) ${T.sans}`,
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
			<RestDialog
				open={restKind !== null}
				subject={restSubject}
				defaultRest={restKind ?? 'short'}
				onClose={() => setRestKind(null)}
				onConfirm={(choice) => {
					setRestKind(null);
					void rest(choice);
				}}
			/>
		</div>
	);
}
