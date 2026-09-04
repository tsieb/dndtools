import { DefinitionList, VisibilityChip } from '../../../ds';
import { Panel } from '../../../app/screen-kit';
import { type CharacterView } from '@dndtools/core';
import { KIND_LABEL, visChip } from '../shared';

/** The read-only reference block (kind, visibility, level, owner…). Extracted from Characters.tsx
 * unchanged (RC-STB-2.6). */
export function ReferencePanel({ view }: { view: CharacterView }) {
	return (
		<Panel title="Reference">
			<DefinitionList
				items={[
					{ label: 'Type', value: KIND_LABEL[view.kind] || view.kind },
					// Builder-authored sheet fields (validated `data.*` writes) — rendered when present.
					...(typeof view.data.race === 'string'
						? [{ label: 'Race', value: String(view.data.race) }]
						: []),
					...(typeof view.data.subclass === 'string'
						? [{ label: 'Subclass', value: String(view.data.subclass) }]
						: []),
					...(typeof view.data.alignment === 'string'
						? [{ label: 'Alignment', value: String(view.data.alignment) }]
						: []),
					...(typeof view.data.speed === 'string'
						? [{ label: 'Speed', value: `${view.data.speed} ft`, mono: true }]
						: []),
					{ label: 'Armor class', value: String(view.combat.ac), mono: true },
					{
						label: 'Hit points',
						value: `${view.combat.hp} / ${view.combat.maxHp}`,
						mono: true,
					},
					...(view.combat.tempHp > 0
						? [{ label: 'Temp HP', value: String(view.combat.tempHp), mono: true }]
						: []),
					{
						label: 'Visible to',
						value: <VisibilityChip level={visChip(view.visibility)} compact />,
					},
					...(typeof view.data.dmNotes === 'string'
						? [{ label: 'DM notes', value: String(view.data.dmNotes) }]
						: []),
				]}
			/>
		</Panel>
	);
}
