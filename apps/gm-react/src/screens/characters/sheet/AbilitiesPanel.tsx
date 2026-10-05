import { AbilityScore, DefinitionList } from '../../../ds';
import { ABILITY_IDS, SKILLS } from '../../../app/charImport/skills';
import { Panel } from '../../../app/screen-kit';
import { ABIL_ORDER, abilMod, sgn } from '../../../app/character/abilities';
import { useI18n } from '../../../i18n';
import { ABIL_FULL, ABIL_LABEL } from '../../player/shared';
import type { SheetSubject } from './subject';

/**
 * Ability scores with proficiency, passive perception and hit dice, then saving throws and skills —
 * the structured `proficiencies` slice of the (redacted, player-safe) view. Bonuses derive from the
 * pure core reads on the subject; nothing here is stored, so it can never drift. Everyone sees it.
 */
export function AbilitiesPanel({ subject }: { subject: SheetSubject }) {
	const { t } = useI18n();
	const { view, profBonus, passive } = subject;
	const prof = view.proficiencies;
	const hasProficiencyData =
		Object.keys(prof.skills).length > 0 ||
		prof.saves.length > 0 ||
		prof.proficiencyBonus !== null ||
		prof.hitDice.total > 0;
	const scores = view.abilityScores as Record<string, number | undefined>;
	const score = (id: string) => scores[id] ?? 10;
	return (
		<>
			<Panel title={t('characters.abilityScores')} pad={18}>
				<div className="character-sheet-abilities">
					{ABIL_ORDER.map((key) => (
						<AbilityScore
							key={key}
							label={ABIL_LABEL[key]}
							score={scores[key] ?? null}
							aria-label={ABIL_FULL[ABIL_LABEL[key]!]}
						/>
					))}
				</div>
				<dl className="character-sheet-summary">
					<div>
						<dt>{t('player.sheet.proficiency')}</dt>
						<dd>{profBonus === null ? '—' : sgn(profBonus)}</dd>
					</div>
					<div>
						<dt>{t('player.sheet.passivePerception')}</dt>
						<dd>{passive ?? '—'}</dd>
					</div>
					<div>
						<dt>{t('player.sheet.hitDice')}</dt>
						<dd>
							{prof.hitDice.total - prof.hitDice.spent}/{prof.hitDice.total} {prof.hitDice.die}
						</dd>
					</div>
				</dl>
			</Panel>
			<Panel title={t('player.sheet.savingThrows')} pad={18}>
				<DefinitionList
					items={ABILITY_IDS.map((a) => ({
						label: ABIL_FULL[a.toUpperCase()]!,
						value:
							view.abilityScores[a] == null
								? '—'
								: sgn(abilMod(score(a)) + (prof.saves.includes(a) ? (profBonus ?? 0) : 0)),
						mono: true,
					}))}
				/>
			</Panel>
			<Panel title={t('player.sheet.skills')} pad={18}>
				{hasProficiencyData ? (
					<DefinitionList
						items={SKILLS.map((skill) => {
							const rank = prof.skills[skill.id] ?? 'none';
							return {
								label: `${skill.label}${rank === 'expertise' ? ' ★' : rank === 'proficient' ? ' •' : ''}`,
								value:
									view.abilityScores[skill.ability] == null
										? '—'
										: sgn(
												abilMod(score(skill.ability)) +
													(rank === 'expertise' ? 2 : rank === 'proficient' ? 1 : 0) *
														(profBonus ?? 0),
											),
								mono: true,
							};
						})}
					/>
				) : (
					<p>{t('player.sheet.noProficiencies')}</p>
				)}
				<p className="character-sheet-hint">{t('player.sheet.proficiencyLegend')}</p>
			</Panel>
		</>
	);
}
