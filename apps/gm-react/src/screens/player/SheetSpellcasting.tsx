import type { CharacterResources } from '@dndtools/core';
import { DefinitionList, SpellSlots } from '../../ds';
import { Panel } from '../../app/screen-kit';
import { useI18n } from '../../i18n';
import type { Dispatch } from './shared';

export function SheetSpellcasting({
	resources,
	charId,
	actorId,
	canManage,
	dispatch,
}: {
	resources: CharacterResources | null;
	charId: string;
	actorId: string;
	canManage: boolean;
	dispatch: Dispatch;
}) {
	const { t } = useI18n();
	const slots = Object.values(resources?.spellSlots ?? {}).sort((a, b) => a.level - b.level);
	const spells = resources?.spells ?? [];
	return (
		<Panel title={t('characters.spellcasting')} pad={18}>
			{slots.length ? (
				<SpellSlots
					readOnly={!canManage}
					levels={slots.map((s) => ({ level: s.level, total: s.max, used: s.expended }))}
					onToggle={
						canManage
							? (level, index) => {
									const slot = slots.find((s) => s.level === level);
									if (slot)
										void dispatch({
											type: 'character.set-spell-slots',
											actorId,
											payload: {
												characterId: charId,
												level,
												max: slot.max,
												expended:
													index < slot.max - slot.expended
														? slot.expended + 1
														: Math.max(0, slot.expended - 1),
											},
										});
								}
							: undefined
					}
				/>
			) : (
				<p>{t('player.vitals.noSlotsBody')}</p>
			)}
			<DefinitionList
				items={spells.map((s) => ({ label: s.name, value: String(s.level), mono: true }))}
			/>
		</Panel>
	);
}
