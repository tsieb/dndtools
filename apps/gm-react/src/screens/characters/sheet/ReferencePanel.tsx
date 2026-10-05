import { DefinitionList, VisibilityChip } from '../../../ds';
import { Panel } from '../../../app/screen-kit';
import { type CharacterView } from '@dndtools/core';
import { KIND_LABEL, visChip } from '../shared';
import { useI18n } from '../../../i18n';

/** The read-only reference block: what no other panel of the sheet shows (kind, alignment, who can
 * see the character, DM notes). Race, subclass and speed live in Identity; AC and hit points in
 * Combat (RC-CHR-6.2). */
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
					...(typeof view.data.alignment === 'string'
						? [{ label: t('characters.alignment'), value: String(view.data.alignment) }]
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
