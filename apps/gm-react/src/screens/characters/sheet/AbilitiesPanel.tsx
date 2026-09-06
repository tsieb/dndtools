import { AbilityScore, abilityModifier, Stat } from '../../../ds';
import { type CharacterView } from '@dndtools/core';
import { ABILITY_IDS, SKILLS } from '../../../app/charImport/skills';
import { Panel, T, eb, mono } from '../../../app/screen-kit';
import { sgn } from '../shared';
import { useI18n } from '../../../i18n';

/** Ability scores + the structured skills / saves / hit dice / passive perception panel. Extracted
 * from Characters.tsx unchanged (RC-STB-2.6). */
export function AbilitiesPanel({
	view,
	prof,
	profBonus,
	passivePer,
	hasProficiencyData,
	abilityCells,
	isPhone,
}: {
	view: CharacterView;
	prof: NonNullable<CharacterView['proficiencies']> | null;
	profBonus: number | null;
	passivePer: number | null;
	hasProficiencyData: boolean;
	abilityCells: { key: string; val: number }[];
	isPhone: boolean;
}) {
	const { t } = useI18n();
	return (
		<>
			{abilityCells.length > 0 ? (
				<Panel title={t('characters.abilityScores')}>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: isPhone ? 'repeat(3,minmax(0,1fr))' : 'repeat(6,1fr)',
							gap: 8,
						}}
					>
						{abilityCells.map((a) => (
							<AbilityScore
								key={a.key}
								label={a.key}
								score={a.val}
								modifier={abilityModifier(a.val)}
							/>
						))}
					</div>
				</Panel>
			) : null}

			{/* Skills / saves / hit dice / passive perception — the structured `proficiencies` slice.
					    Bonuses derive from the pure core queries (effectiveProficiencyBonus / passivePerception)
					    plus the shared skill registry; nothing here is stored, so it can never drift. */}
			<Panel title={t('characters.skillsSaves')}>
				{hasProficiencyData && prof && profBonus !== null ? (
					<>
						<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
							<Stat label={t('characters.proficiency')} value={sgn(profBonus)} />
							{passivePer !== null && (
								<Stat
									label={t('characters.passivePerception')}
									value={String(passivePer)}
									icon="visibility-players"
								/>
							)}
							{prof.hitDice.total > 0 && (
								<Stat
									label={t('characters.hitDice')}
									value={`${prof.hitDice.total - prof.hitDice.spent}/${prof.hitDice.total} ${prof.hitDice.die}`}
								/>
							)}
						</div>
						<div style={{ ...eb, marginBottom: 6 }}>{t('characters.savingThrows')}</div>
						<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
							{ABILITY_IDS.map((a) => {
								const proficient = prof.saves.includes(a);
								const bonus =
									abilityModifier(view.abilityScores[a] ?? 10) + (proficient ? profBonus : 0);
								return (
									<span
										key={a}
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 6,
											padding: '4px 10px',
											borderRadius: 16,
											font: `12px ${T.sans}`,
											border: `1px solid ${proficient ? T.accBd : T.bd}`,
											background: proficient ? T.accSub : T.surf,
											color: proficient ? T.acc : T.ter,
										}}
									>
										{a.toUpperCase()}
										<span style={mono}>{sgn(bonus)}</span>
									</span>
								);
							})}
						</div>
						<div style={{ ...eb, marginBottom: 6 }}>{t('characters.skills')}</div>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: isPhone ? 'minmax(0,1fr)' : '1fr 1fr',
								gap: '4px 18px',
							}}
						>
							{SKILLS.map((s) => {
								const level = prof.skills[s.id] ?? 'none';
								const bonus =
									abilityModifier(view.abilityScores[s.ability] ?? 10) +
									(level === 'expertise' ? profBonus * 2 : level === 'proficient' ? profBonus : 0);
								return (
									<div
										key={s.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											gap: 8,
											font: `12.5px ${T.sans}`,
											color: level === 'none' ? T.ter : T.ink,
										}}
									>
										<span
											aria-hidden
											style={{
												width: 8,
												height: 8,
												borderRadius: '50%',
												flex: '0 0 auto',
												background: level === 'none' ? 'transparent' : T.acc,
												border: `1.5px solid ${level === 'none' ? T.bdS : T.acc}`,
											}}
										/>
										<span style={{ flex: 1, minWidth: 0 }}>
											{s.label}
											{level === 'expertise' ? ' ★' : ''}
										</span>
										<span style={mono}>{sgn(bonus)}</span>
									</div>
								);
							})}
						</div>
						<div style={{ font: `11px ${T.sans}`, color: T.ter, marginTop: 8 }}>
							{t('characters.proficiencyLegend')}
						</div>
					</>
				) : (
					// Honest empty state — no fabricated skill sheet when the character carries no
					// proficiency data (older records, bare quick-creates).
					<div style={{ font: `13px ${T.sans}`, color: T.ter }}>
						{t('characters.noProficiencyData')}
					</div>
				)}
			</Panel>
		</>
	);
}
