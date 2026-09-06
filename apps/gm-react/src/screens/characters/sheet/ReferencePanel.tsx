import { DefinitionList, VisibilityChip } from '../../../ds';
import { Panel } from '../../../app/screen-kit';
import { type CharacterView } from '@dndtools/core';
import { KIND_LABEL, visChip } from '../shared';
import { useI18n } from '../../../i18n';

/** The read-only reference block (kind, visibility, level, owner…). Extracted from Characters.tsx
 * unchanged (RC-STB-2.6). */
export function ReferencePanel({ view }: { view: CharacterView }) {
	const { t } = useI18n();
	return (
		<Panel title={t('characters.reference')}>
			<DefinitionList
				items={[
					{
						label: t('characters.type'),
						value: KIND_LABEL[view.kind] ? t(KIND_LABEL[view.kind]) : view.kind,
					},
					// Builder-authored sheet fields (validated `data.*` writes) — rendered when present.
					...(typeof view.data.race === 'string'
						? [{ label: t('characters.race'), value: String(view.data.race) }]
						: []),
					...(typeof view.data.subclass === 'string'
						? [{ label: t('characters.subclass'), value: String(view.data.subclass) }]
						: []),
					...(typeof view.data.alignment === 'string'
						? [{ label: t('characters.alignment'), value: String(view.data.alignment) }]
						: []),
					...(typeof view.data.speed === 'string'
						? [
								{
									label: t('characters.speed'),
									value: t('characters.feet', { value: String(view.data.speed) }),
									mono: true,
								},
							]
						: []),
					{ label: t('characters.armorClass'), value: String(view.combat.ac), mono: true },
					{
						label: t('characters.hitPoints'),
						value: `${view.combat.hp} / ${view.combat.maxHp}`,
						mono: true,
					},
					...(view.combat.tempHp > 0
						? [{ label: t('characters.tempHp'), value: String(view.combat.tempHp), mono: true }]
						: []),
					{
						label: t('characters.visibleTo'),
						value: <VisibilityChip level={visChip(view.visibility)} compact />,
					},
					...(typeof view.data.dmNotes === 'string'
						? [{ label: t('characters.dmNotes'), value: String(view.data.dmNotes) }]
						: []),
				]}
			/>
		</Panel>
	);
}
